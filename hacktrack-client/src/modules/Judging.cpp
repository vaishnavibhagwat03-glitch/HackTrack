// Judging: judge queue, score validation, conflict graph, judge assignment.
#include "../core/Clock.h"
#include "../ds/Graph.h"
#include "HackTrack.h"

namespace ht {

DynArray<Assignment> HackTrack::fetchAssignments(const std::string& token, const char* label) {
    json rows = call("GET", "/v1/assignments", nullptr, token, label);
    DynArray<Assignment> out;
    for (const json& r : rows) out.push(assignmentFrom(r));
    return out;
}

json HackTrack::judgeQueue(const std::string& token) {
    Session s = requireRole(token, "judge");
    refresh(token);
    DynArray<Assignment> mine = fetchAssignments(token, "Load my judging queue");
    json queue = json::array();
    int done = 0;
    double sum = 0;
    for (const Assignment& a : mine) {
        const Project* p = projectCache_.get(a.projectId);  // O(1) hash lookup per row
        json row = toJson(a);
        row["weighted"] = a.scores.empty() ? json(nullptr) : json(weightedScore(a, rubric_));
        if (p) row["project"] = projectSummary(*p);
        if (a.status == "submitted") { ++done; sum += weightedScore(a, rubric_); }
        queue.push_back(row);
    }
    const Judge* me = judgeById(s.user.judgeId);
    return {{"judge", me ? toJson(*me) : json(nullptr)}, {"rubric", rubricToJson(rubricJson_, rubric_)}, {"judgingOpen", event_.judgingOpen},
            {"queue", queue},
            {"stats", {{"assigned", mine.size()}, {"completed", done}, {"remaining", mine.size() - done}, {"average", done ? sum / done : 0.0}}}};
}

json HackTrack::saveScore(const std::string& token, int projectId, const json& body) {
    requireRole(token, "judge");
    refresh(token);
    if (!event_.judgingOpen) throw ApiError(422, "JudgingClosed", "Judging is closed");

    // Validate every value against the rubric's leaf criteria before sending.
    json scores = body.contains("scores") && body["scores"].is_object() ? body["scores"] : json::object();
    for (auto it = scores.begin(); it != scores.end(); ++it) {
        bool found = false;
        double max = 10;
        rubric_.forEachLeaf([&](const Criterion& c, double) { if (c.id == it.key()) { found = true; max = c.maxScore; } });
        if (!found) throw ApiError(400, "UnknownCriterion", "Unknown criterion " + it.key());
        if (!it.value().is_number() || it.value().get<double>() < 0 || it.value().get<double>() > max)
            throw ApiError(422, "InvalidScore", it.key() + " must be between 0 and " + std::to_string((int)max) + "; nothing was sent");
    }
    json b = {{"scores", scores}, {"notes", body.value("notes", std::string())}, {"confidence", body.value("confidence", 3)},
              {"action", body.value("action", std::string("save"))}};
    json res = call("PUT", "/v1/assignments/" + std::to_string(projectId), &b, token,
                    b["action"] == "submit" ? "Submit final score" : "Save score draft");
    Assignment a = assignmentFrom(res);
    res["weighted"] = a.scores.empty() ? json(nullptr) : json(weightedScore(a, rubric_));
    return res;
}

json HackTrack::judgingOverview(const std::string& token) {
    requireRole(token, "admin");
    refresh(token);
    DynArray<Assignment> all = fetchAssignments(token, "Load all assignments");

    // Per-judge stats indexed through the judge hash table.
    struct JStat { int assigned = 0, completed = 0, inProgress = 0, flagged = 0; double sum = 0; };
    DynArray<JStat> js(judges_.size(), JStat{});
    HashChaining<int, int> perProject;  // project id -> judges assigned
    json rows = json::array();
    for (const Assignment& a : all) {
        if (const int* j = judgeIndex_.get(a.judgeId)) {
            JStat& st = js[*j];
            st.assigned++;
            if (a.status == "submitted") { st.completed++; st.sum += weightedScore(a, rubric_); }
            if (a.status == "in_progress") st.inProgress++;
            if (a.status == "flagged") st.flagged++;
        }
        int* c = perProject.get(a.projectId);
        if (c) ++*c; else perProject.put(a.projectId, 1);
        json r = toJson(a);
        r["weighted"] = a.scores.empty() ? json(nullptr) : json(weightedScore(a, rubric_));
        rows.push_back(r);
    }
    json judges = json::array();
    for (int i = 0; i < judges_.size(); ++i) {
        json j = toJson(judges_[i]);
        j["assigned"] = js[i].assigned;
        j["completed"] = js[i].completed;
        j["inProgress"] = js[i].inProgress;
        j["flagged"] = js[i].flagged;
        j["average"] = js[i].completed ? js[i].sum / js[i].completed : 0.0;
        judges.push_back(j);
    }
    json coverage = json::array();
    int under = 0;
    for (const Project& p : projects_) {
        if (p.status != "submitted") continue;
        const int* c = perProject.get(p.id);
        int n = c ? *c : 0;
        if (n < event_.judgesPerProject) ++under;
        coverage.push_back({{"projectId", p.id}, {"name", p.name}, {"teamId", p.teamId}, {"judges", n}});
    }
    json ring = json::array();
    rotation_.forEach([&](const JudgeRef& r) { ring.push_back(r.id); });
    return {{"assignments", rows}, {"judges", judges}, {"coverage", coverage}, {"underCovered", under},
            {"perProject", event_.judgesPerProject}, {"rotation", ring}, {"lastRun", lastAssign_}};
}

json HackTrack::runAssignment(const std::string& token, const json& body) {
    Session s = requireRole(token, "admin");
    refresh(token, true);
    std::string mode = body.value("mode", std::string("fill"));
    int perProject = body.value("perProject", event_.judgesPerProject);
    if (perProject < 1 || perProject > 10) throw ApiError(400, "InvalidField", "Judges per project must be 1 to 10");

    DynArray<Assignment> current = fetchAssignments(token, "Load assignments before assigning");
    json conflictRows = call("GET", "/v1/conflicts", nullptr, token, "Load conflicts of interest");

    // Conflict graph: judges are vertices 0..J-1, teams J..J+T-1.
    ConflictGraph g(judges_.size(), teams_.size());
    for (const json& c : conflictRows) {
        const int* j = judgeIndex_.get(jstr(c, "judgeId"));
        const int* t = teamIndex_.get(jstr(c, "teamId"));
        if (j && t) g.addConflict(*j, *t);
    }

    // Keep: everything (fill) or only work already started (rebalance).
    DynArray<Assignment> kept;
    HashChaining<std::string, bool> existing;
    HashChaining<int, int> already;
    for (const Assignment& a : current) {
        if (mode == "rebalance" && a.status == "not_started") continue;
        kept.push(a);
        existing.put(pairKey(a.judgeId, a.projectId), true);
        int* c = already.get(a.projectId);
        if (c) ++*c; else already.put(a.projectId, 1);
    }

    DynArray<ProjectRef> refs;
    for (const Project& p : projects_) {
        if (p.status != "submitted") continue;
        const int* t = teamIndex_.get(p.teamId);
        if (!t) continue;
        const int* c = already.get(p.id);
        refs.push(ProjectRef{p.id, *t, p.name, c ? *c : 0});
    }

    rebuildRotation();
    DynArray<AssignedPair> created;
    DynArray<Shortage> shortages;
    AssignStats stats;
    assignJudges(rotation_, g, refs, perProject, created, shortages, &existing, &stats);
    rotationHead_ = rotation_.head() ? rotation_.head()->data.id : "";
    trace_.ds("CircularList<Judge>", "round-robin over " + std::to_string(rotation_.size()) + " judges",
              std::to_string(stats.rotations) + " pointer moves, next starts at " + rotationHead_);
    trace_.ds("ConflictGraph", "hasConflict x" + std::to_string(stats.conflictChecks),
              std::to_string(stats.conflictsAvoided) + " conflicts avoided (O(1) matrix lookups)");

    json list = json::array();
    for (const Assignment& a : kept) list.push_back(toJson(a));
    for (const AssignedPair& p : created) list.push_back({{"judgeId", p.judgeId}, {"projectId", p.projectId}});
    json b = {{"assignments", list}};
    json res = call("PUT", "/v1/assignments", &b, token, "Save judge assignments");

    // Undo = put the previous assignment set back (scores included).
    DynArray<Request> reverse;
    json prev = {{"assignments", res["before"]}};
    reverse.push(Request{"PUT", "/v1/assignments", prev.dump(), "", ""});
    undo_.record("Assign judges (" + mode + ", " + std::to_string(created.size()) + " new)", s.user.handle, reverse);

    json sh = json::array();
    for (const Shortage& x : shortages) sh.push_back({{"projectId", x.projectId}, {"name", x.name}, {"needed", x.needed}, {"assigned", x.assigned}});
    json made = json::array();
    for (const AssignedPair& p : created) made.push_back({{"judgeId", p.judgeId}, {"projectId", p.projectId}});
    lastAssign_ = {{"at", nowIso()}, {"mode", mode}, {"perProject", perProject}, {"created", created.size()}, {"kept", kept.size()},
                   {"shortages", sh}, {"conflictChecks", stats.conflictChecks}, {"conflictsAvoided", stats.conflictsAvoided},
                   {"rotations", stats.rotations}, {"nextJudge", rotationHead_}};
    json out = lastAssign_;
    out["pairs"] = made;
    out["complete"] = shortages.empty();
    return out;
}

json HackTrack::conflicts(const std::string& token) {
    requireRole(token, "admin");
    refresh(token);
    json rows = call("GET", "/v1/conflicts", nullptr, token, "Load conflicts of interest");
    ConflictGraph g(judges_.size(), teams_.size());
    json list = json::array();
    for (const json& c : rows) {
        const int* j = judgeIndex_.get(jstr(c, "judgeId"));
        const int* t = teamIndex_.get(jstr(c, "teamId"));
        if (!j || !t) continue;
        g.addConflict(*j, *t);
        list.push_back({{"judgeId", judges_[*j].id}, {"judgeName", judges_[*j].name}, {"teamId", teams_[*t].id},
                        {"teamName", teams_[*t].name}, {"reason", jstr(c, "reason")}});
    }
    // Graph analysis: components (BFS), teams no judge can take, and a BFS/DFS sample.
    DynArray<int> label;
    int comps = g.graph().components(label);
    auto vname = [&](int v) { return v < judges_.size() ? judges_[v].name : teams_[v - judges_.size()].name; };
    json blocked = json::array();
    for (int t = 0; t < teams_.size(); ++t)
        if (judges_.size() && g.conflictsOfTeam(t) >= judges_.size()) blocked.push_back(teams_[t].name);
    json nodes = json::array(), edges = json::array();
    for (int v = 0; v < g.graph().vertices(); ++v) {
        if (!g.graph().degree(v)) continue;
        nodes.push_back({{"id", v}, {"label", vname(v)}, {"kind", v < judges_.size() ? "judge" : "team"}, {"degree", g.graph().degree(v)}, {"component", label[v]}});
        for (int w : g.graph().neighbours(v)) if (v < w) edges.push_back({v, w});
    }
    json bfs = json::array(), dfs = json::array();
    for (int v = 0; v < judges_.size(); ++v) {
        if (!g.graph().degree(v)) continue;
        for (int x : g.graph().bfs(v)) bfs.push_back(vname(x));
        for (int x : g.graph().dfs(v)) dfs.push_back(vname(x));
        break;
    }
    lastGraph_ = {{"vertices", g.graph().vertices()}, {"edges", g.graph().edges()}, {"components", comps},
                  {"matrixCells", (long long)g.graph().vertices() * g.graph().vertices()}, {"nodes", nodes}, {"links", edges},
                  {"bfs", bfs}, {"dfs", dfs}, {"blockedTeams", blocked}};
    trace_.ds("Graph", "build " + std::to_string(g.graph().vertices()) + " vertices", std::to_string(g.graph().edges()) + " edges, " + std::to_string(comps) + " components (BFS)");
    return {{"conflicts", list}, {"graph", lastGraph_}};
}

json HackTrack::addConflict(const std::string& token, const json& body) {
    Session s = requireRole(token, "admin");
    json b = {{"judgeId", body.value("judgeId", std::string())}, {"teamId", body.value("teamId", std::string())},
              {"reason", body.value("reason", std::string())}};
    json res = call("POST", "/v1/conflicts", &b, token, "Add conflict of interest");
    DynArray<Request> reverse;
    reverse.push(Request{"DELETE", "/v1/conflicts/" + b["judgeId"].get<std::string>() + "/" + b["teamId"].get<std::string>(), "", "", ""});
    undo_.record("Add conflict " + b["judgeId"].get<std::string>() + " / " + b["teamId"].get<std::string>(), s.user.handle, reverse);
    return res;
}

json HackTrack::removeConflict(const std::string& token, const std::string& judgeId, const std::string& teamId) {
    Session s = requireRole(token, "admin");
    json res = call("DELETE", "/v1/conflicts/" + judgeId + "/" + teamId, nullptr, token, "Remove conflict of interest");
    DynArray<Request> reverse;
    reverse.push(Request{"POST", "/v1/conflicts", res.dump(), "", ""});
    undo_.record("Remove conflict " + judgeId + " / " + teamId, s.user.handle, reverse);
    return res;
}

}  // namespace ht
