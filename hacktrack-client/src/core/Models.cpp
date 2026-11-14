#include "Models.h"

namespace ht {

std::string jstr(const json& j, const char* key) {
    auto it = j.find(key);
    if (it == j.end() || it->is_null()) return "";
    if (it->is_string()) return it->get<std::string>();
    return it->dump();
}
static int jint(const json& j, const char* key, int dflt = 0) {
    auto it = j.find(key);
    return (it == j.end() || !it->is_number()) ? dflt : it->get<int>();
}
static bool jbool(const json& j, const char* key) {
    auto it = j.find(key);
    return it != j.end() && it->is_boolean() && it->get<bool>();
}
static json nullable(const std::string& s) { return s.empty() ? json(nullptr) : json(s); }

User userFrom(const json& j) {
    return User{jstr(j, "id"), jstr(j, "name"), jstr(j, "email"), jstr(j, "role"), jstr(j, "handle"),
                jstr(j, "country"), jstr(j, "teamId"), jstr(j, "judgeId")};
}
json toJson(const User& u) {
    return {{"id", u.id}, {"name", u.name}, {"email", u.email}, {"role", u.role}, {"handle", u.handle},
            {"country", u.country}, {"teamId", nullable(u.teamId)}, {"judgeId", nullable(u.judgeId)}};
}

Team teamFrom(const json& j) {
    Team t;
    t.id = jstr(j, "id");
    t.name = jstr(j, "name");
    t.inviteCode = jstr(j, "inviteCode");
    t.createdAt = jstr(j, "createdAt");
    t.projectId = jint(j, "projectId");
    if (j.contains("members"))
        for (const json& m : j["members"])
            t.members.pushBack(Member{jstr(m, "userId"), jstr(m, "name"), jstr(m, "handle"), jstr(m, "role"), jstr(m, "country"), jstr(m, "initials")});
    return t;
}
json toJson(const Team& t) {
    json members = json::array();
    t.members.forEach([&](const Member& m) {
        members.push_back({{"userId", m.userId}, {"name", m.name}, {"handle", m.handle}, {"role", m.role}, {"country", m.country}, {"initials", m.initials}});
    });
    return {{"id", t.id}, {"name", t.name}, {"inviteCode", t.inviteCode}, {"createdAt", t.createdAt},
            {"projectId", t.projectId ? json(t.projectId) : json(nullptr)}, {"members", members}};
}

Project projectFrom(const json& j) {
    Project p;
    p.id = jint(j, "id");
    p.code = jstr(j, "code");
    p.slug = jstr(j, "slug");
    p.name = jstr(j, "name");
    p.tagline = jstr(j, "tagline");
    p.description = jstr(j, "description");
    p.trackId = jstr(j, "trackId");
    p.teamId = jstr(j, "teamId");
    p.status = jstr(j, "status");
    p.submittedAt = jstr(j, "submittedAt");
    p.updatedAt = jstr(j, "updatedAt");
    p.repo = jstr(j, "repo");
    p.demo = jstr(j, "demo");
    if (j.contains("stack")) for (const json& s : j["stack"]) p.stack.push(s.get<std::string>());
    return p;
}
json toJson(const Project& p) {
    json stack = json::array();
    for (const std::string& s : p.stack) stack.push_back(s);
    return {{"id", p.id}, {"code", p.code}, {"slug", p.slug}, {"name", p.name}, {"tagline", p.tagline},
            {"description", p.description}, {"trackId", nullable(p.trackId)}, {"teamId", p.teamId}, {"stack", stack},
            {"status", p.status}, {"submittedAt", nullable(p.submittedAt)}, {"updatedAt", p.updatedAt},
            {"repo", p.repo}, {"demo", p.demo}};
}

Judge judgeFrom(const json& j) {
    return Judge{jstr(j, "id"), jstr(j, "userId"), jstr(j, "name"), jstr(j, "handle"), jstr(j, "title")};
}
json toJson(const Judge& j) {
    return {{"id", j.id}, {"userId", j.userId}, {"name", j.name}, {"handle", j.handle}, {"title", j.title}};
}

Assignment assignmentFrom(const json& j) {
    Assignment a;
    a.judgeId = jstr(j, "judgeId");
    a.projectId = jint(j, "projectId");
    a.status = jstr(j, "status");
    a.confidence = jint(j, "confidence", 3);
    a.notes = jstr(j, "notes");
    a.submittedAt = jstr(j, "submittedAt");
    a.updatedAt = jstr(j, "updatedAt");
    if (j.contains("scores") && j["scores"].is_object())
        for (auto it = j["scores"].begin(); it != j["scores"].end(); ++it)
            if (it.value().is_number()) a.scores.push(ScoreEntry{it.key(), it.value().get<double>()});
    return a;
}
json toJson(const Assignment& a) {
    json scores = json::object();
    for (const ScoreEntry& s : a.scores) scores[s.criterion] = s.value;
    return {{"judgeId", a.judgeId}, {"projectId", a.projectId}, {"status", a.status}, {"scores", scores},
            {"confidence", a.confidence}, {"notes", a.notes}, {"submittedAt", nullable(a.submittedAt)},
            {"updatedAt", nullable(a.updatedAt)}};
}

Event eventFrom(const json& j) {
    Event e;
    e.name = jstr(j, "name");
    e.tagline = jstr(j, "tagline");
    e.startsAt = jstr(j, "startsAt");
    e.deadline = jstr(j, "deadline");
    e.resultsAt = jstr(j, "resultsAt");
    e.judgingOpen = jbool(j, "judgingOpen");
    e.votingOpen = jbool(j, "votingOpen");
    e.resultsPublished = jbool(j, "resultsPublished");
    e.judgesPerProject = jint(j, "judgesPerProject", 3);
    e.maxTeamSize = jint(j, "maxTeamSize", 4);
    e.votesPerUser = jint(j, "votesPerUser", 3);
    return e;
}
json toJson(const Event& e) {
    return {{"name", e.name}, {"tagline", e.tagline}, {"startsAt", e.startsAt}, {"deadline", e.deadline},
            {"resultsAt", e.resultsAt}, {"judgingOpen", e.judgingOpen}, {"votingOpen", e.votingOpen},
            {"resultsPublished", e.resultsPublished}, {"judgesPerProject", e.judgesPerProject},
            {"maxTeamSize", e.maxTeamSize}, {"votesPerUser", e.votesPerUser}};
}

Conflict conflictFrom(const json& j) { return Conflict{jstr(j, "judgeId"), jstr(j, "teamId"), jstr(j, "reason")}; }
Vote voteFrom(const json& j) { return Vote{jstr(j, "userId"), jint(j, "projectId"), jstr(j, "createdAt")}; }

static void buildRubric(const json& nodes, GNode* parent, GeneralizedList& g) {
    for (const json& n : nodes) {
        double w = n.value("weight", 1.0);
        if (n.contains("children")) {
            GNode* grp = g.addGroup(parent, jstr(n, "name"), w);
            grp->atom.id = jstr(n, "id");  // groups keep their id here
            buildRubric(n["children"], grp, g);
        } else {
            g.addAtom(parent, Criterion{jstr(n, "id"), jstr(n, "name"), w, n.value("maxScore", 10.0)});
        }
    }
}
void rubricFrom(const json& nodes, GeneralizedList& out) {
    out.clear();
    if (nodes.is_array()) buildRubric(nodes, nullptr, out);
}

static void annotate(json& nodes, const GeneralizedList& g) {
    for (json& n : nodes) {
        if (n.contains("children")) { annotate(n["children"], g); continue; }
        std::string id = jstr(n, "id");
        g.forEachLeaf([&](const Criterion& c, double w) { if (c.id == id) n["effectiveWeight"] = w; });
    }
}
json rubricToJson(const json& nodes, const GeneralizedList& g) {
    json out = nodes;
    if (out.is_array()) annotate(out, g);
    return out;
}

}  // namespace ht
