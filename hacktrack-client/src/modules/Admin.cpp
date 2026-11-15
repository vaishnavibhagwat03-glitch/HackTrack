// Administration (every change records its reverse for undo), benchmark,
// and the data-structure inspector.
#include "../algo/Benchmark.h"
#include "../core/Clock.h"
#include "HackTrack.h"

namespace ht {

json HackTrack::users(const std::string& token) {
    requireRole(token, "admin");
    json rows = call("GET", "/v1/users", nullptr, token, "Load users");
    for (const json& u : rows) users_.put(jstr(u, "id"), userFrom(u));  // cache in the hash table
    return rows;
}

json HackTrack::setRole(const std::string& token, const std::string& userId, const json& body) {
    Session s = requireRole(token, "admin");
    json b = {{"role", body.value("role", std::string())}, {"title", body.value("title", std::string("Judge"))}};
    json res = call("PUT", "/v1/users/" + userId + "/role", &b, token, "Change role");
    const json& before = res["before"];
    json rev = {{"role", before["role"]}};
    if (before["judgeId"].is_string()) { rev["judgeId"] = before["judgeId"]; rev["title"] = before["title"]; }
    DynArray<Request> reverse;
    reverse.push(Request{"PUT", "/v1/users/" + userId + "/role", rev.dump(), "", ""});
    undo_.record("Change role of " + jstr(res["after"], "name") + " to " + b["role"].get<std::string>(), s.user.handle, reverse);
    forgetUserSessions(userId);  // their cached role is stale now
    dirty_ = true;
    return res["after"];
}

json HackTrack::deleteTeam(const std::string& token, const std::string& teamId) {
    Session s = requireRole(token, "admin");
    json snap = call("DELETE", "/v1/teams/" + teamId, nullptr, token, "Delete team");
    DynArray<Request> reverse;
    reverse.push(Request{"POST", "/v1/teams/restore", snap.dump(), "", ""});
    undo_.record("Delete team " + jstr(snap["team"], "name"), s.user.handle, reverse);
    for (const json& m : snap["members"]) forgetUserSessions(jstr(m, "user_id"));
    dirty_ = true;
    return {{"deleted", teamId}, {"name", jstr(snap["team"], "name")}, {"members", snap["members"].size()}, {"undoable", true}};
}

json HackTrack::removeMember(const std::string& token, const std::string& teamId, const std::string& userId) {
    Session s = requireRole(token, "admin");
    json res = call("DELETE", "/v1/teams/" + teamId + "/members/" + userId, nullptr, token, "Remove team member");
    DynArray<Request> reverse;
    reverse.push(Request{"POST", "/v1/teams/" + teamId + "/members", res["removed"].dump(), "", ""});
    undo_.record("Remove " + userId + " from " + teamId, s.user.handle, reverse);
    forgetUserSessions(userId);
    dirty_ = true;
    return res;
}

json HackTrack::updateEvent(const std::string& token, const json& body) {
    Session s = requireRole(token, "admin");
    json res = call("PUT", "/v1/event", &body, token, "Update event settings");
    json before = res["before"], rev = json::object();
    for (auto it = body.begin(); it != body.end(); ++it) if (before.contains(it.key())) rev[it.key()] = before[it.key()];
    DynArray<Request> reverse;
    reverse.push(Request{"PUT", "/v1/event", rev.dump(), "", ""});
    std::string keys;
    for (auto it = body.begin(); it != body.end(); ++it) keys += (keys.empty() ? "" : ", ") + it.key();
    undo_.record("Update event (" + keys + ")", s.user.handle, reverse);
    event_ = eventFrom(res["after"]);
    dirty_ = true;
    return res["after"];
}

json HackTrack::updateRubric(const std::string& token, const json& body) {
    Session s = requireRole(token, "admin");
    json b = {{"rubric", body.contains("rubric") ? body["rubric"] : body}};
    // Build the generalized list first: rejects malformed input before sending.
    GeneralizedList check;
    rubricFrom(b["rubric"], check);
    if (!check.atomCount()) throw ApiError(422, "InvalidRubric", "The rubric needs at least one criterion");
    json res = call("PUT", "/v1/rubric", &b, token, "Update rubric");
    json prev = {{"rubric", res["before"]}};
    DynArray<Request> reverse;
    reverse.push(Request{"PUT", "/v1/rubric", prev.dump(), "", ""});
    undo_.record("Update rubric (" + std::to_string(check.atomCount()) + " criteria)", s.user.handle, reverse);
    dirty_ = true;
    return {{"rubric", res["after"]}, {"depth", check.depth()}, {"criteria", check.atomCount()}};
}

json HackTrack::audit(const std::string& token) {
    requireRole(token, "admin");
    return {{"events", call("GET", "/v1/audit?limit=400", nullptr, token, "Load audit ledger")}, {"undo", undo_.toJson()}};
}

json HackTrack::undoList(const std::string& token) {
    requireRole(token, "admin");
    return undo_.toJson();
}

json HackTrack::undo(const std::string& token) {
    requireRole(token, "admin");
    UndoEntry e = undo_.undo(token);
    trace_.ds("LinkedStack<UndoEntry>", "pop", "undid: " + e.label);
    dirty_ = true;
    // Undo can restore memberships and roles: forget all cached sessions' team/role data.
    DynArray<std::string> tokens;
    sessions_.forEach([&](const std::string& t, const Session&) { tokens.push(t); });
    for (const std::string& t : tokens) if (t != token) sessions_.remove(t);
    return {{"undone", e.label}, {"remaining", undo_.size()}};
}

json HackTrack::chaos(const std::string& token, double rate) {
    requireRole(token, "admin");
    char q[64];
    std::snprintf(q, sizeof q, "/v1/_chaos?rate=%.2f", rate);
    return call("POST", q, nullptr, token, "Set server failure rate (demo)");
}

json HackTrack::bench(const DynArray<int>& sizes, int runs) {
    BenchmarkReport r = runBenchmark(sizes, runs);
    json sorts = json::array(), searches = json::array();
    for (const SortResult& s : r.sorts)
        sorts.push_back({{"algorithm", s.algorithm}, {"complexity", s.complexity}, {"n", s.n}, {"comparisons", s.comparisons}, {"ms", s.ms}});
    for (const SearchResult& s : r.searches)
        searches.push_back({{"algorithm", s.algorithm}, {"complexity", s.complexity}, {"n", s.n}, {"avgComparisons", s.avgComparisons}, {"searches", s.searches}});
    trace_.ds("Benchmark", "4 sorts + 2 searches", std::to_string(sizes.size()) + " sizes, median of " + std::to_string(runs));
    return {{"seed", r.seed}, {"runs", r.runs}, {"sorts", sorts}, {"searches", searches}};
}

json HackTrack::health() {
    json server;
    try {
        Request r{"GET", "/v1/health", "", "", "Health check"};
        Response res = queue_.send(r);
        server = {{"ok", res.ok()}, {"status", res.status}, {"attempts", res.attempts}, {"ms", res.ms}, {"error", res.error}};
    } catch (...) {
        server = {{"ok", false}};
    }
    return {{"client", {{"ok", true}, {"name", "HackTrack C++17 client"}, {"time", nowIso()}}}, {"server", server}, {"serverAddress", queue_.serverAddress()}};
}

// ── inspector ────────────────────────────────────────────────

namespace {

template <typename K, typename V>
json chainingJson(const HashChaining<K, V>& h, const char* name, const char* use) {
    json chains = json::array();
    int longest = 0, used = 0;
    for (int i = 0; i < h.capacity(); ++i) {
        int c = h.chainLength(i);
        chains.push_back(c);
        if (c) ++used;
        if (c > longest) longest = c;
    }
    return {{"name", name}, {"use", use}, {"kind", "chaining"}, {"size", h.size()}, {"capacity", h.capacity()},
            {"loadFactor", h.loadFactor()}, {"usedBuckets", used}, {"longestChain", longest}, {"avgProbes", h.avgProbes()}, {"chains", chains}};
}

json bstNode(const BST<int, int>::Node* n) {
    if (!n) return nullptr;
    return {{"key", n->key}, {"left", bstNode(n->left)}, {"right", bstNode(n->right)}};
}

json gnodeJson(const GNode* n) {
    json out = json::array();
    for (; n; n = n->next) {
        if (n->isList) out.push_back({{"group", n->label}, {"weight", n->weight}, {"children", gnodeJson(n->down)}});
        else out.push_back({{"atom", n->atom.name}, {"id", n->atom.id}, {"weight", n->atom.weight}, {"max", n->atom.maxScore}});
    }
    return out;
}

}  // namespace

json HackTrack::inspector() {
    json probing = json::array();
    for (int i = 0; i < inviteCodes_.capacity(); ++i) probing.push_back(inviteCodes_.slotState(i));
    json ring = json::array();
    rotation_.forEach([&](const JudgeRef& r) {
        const Judge* j = judgeById(r.id);
        ring.push_back({{"id", r.id}, {"name", j ? j->name : r.id}});
    });
    json members = json::array();
    for (int i = 0; i < teams_.size() && i < 6; ++i) {
        json names = json::array();
        teams_[i].members.forEach([&](const Member& m) { names.push_back(m.name); });
        members.push_back({{"team", teams_[i].name}, {"members", names}});
    }
    return {
        {"hashing", json::array({
            chainingJson(sessions_, "sessions", "token -> session (role check without a server call)"),
            chainingJson(users_, "users", "user id -> user"),
            chainingJson(projectCache_, "projects", "project id -> project"),
            chainingJson(teamIndex_, "teamIndex", "team id -> array index"),
            chainingJson(judgeIndex_, "judgeIndex", "judge id -> array index"),
            chainingJson(loginGuard_, "loginGuard", "address + email -> failed sign-ins (lockout)"),
        })},
        {"probing", {{"name", "inviteCodes"}, {"use", "invite code -> team id"}, {"kind", "linear probing"}, {"size", inviteCodes_.size()},
                     {"capacity", inviteCodes_.capacity()}, {"loadFactor", inviteCodes_.loadFactor()}, {"avgProbes", inviteCodes_.avgProbes()},
                     {"slots", probing}}},
        {"bst", {{"use", "project id -> index; in-order = sorted by id"}, {"size", projectIndex_.size()}, {"height", projectIndex_.height()},
                 {"root", bstNode(projectIndex_.root())}}},
        {"heap", {{"use", "leaderboard (array in level order right after build)"}, {"array", lastHeap_}}},
        {"sparseMatrix", lastMatrix_},
        {"graph", lastGraph_},
        {"circularList", {{"use", "round-robin judge rotation"}, {"order", ring}, {"pointer", rotationHead_}, {"lastRun", lastAssign_}}},
        {"singlyList", {{"use", "team members"}, {"sample", members}}},
        {"generalizedList", {{"use", "rubric with sub-criteria"}, {"depth", rubric_.depth()}, {"atoms", rubric_.atomCount()}, {"tree", gnodeJson(rubric_.head())}}},
        {"dynArray", {{"projects", projects_.size()}, {"projectsCapacity", projects_.capacity()}, {"teams", teams_.size()}, {"judges", judges_.size()}}},
        {"queue", queue_.snapshot()},
        {"stack", {{"use", "undo of admin actions (newest first)"}, {"entries", undo_.toJson()}}},
        {"cache", {{"hits", cacheHits_}, {"misses", cacheMisses_}, {"ageMs", loadedAtMs_ ? nowMs() - loadedAtMs_ : -1}}},
    };
}

}  // namespace ht
