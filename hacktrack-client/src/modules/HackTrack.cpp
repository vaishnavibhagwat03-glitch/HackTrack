// Core: server calls, cache refresh, sessions, projects, teams, submission.
#include "HackTrack.h"

#include <cctype>

#include "../algo/Search.h"
#include "../algo/Sort.h"
#include "../core/Clock.h"

namespace ht {

json unwrapResponse(const Response& r) {
    if (r.networkError)
        throw ApiError(503, "NetworkError",
                       "Cannot reach the HackTrack server after " + std::to_string(r.attempts) + " attempts (" + r.error + ")");
    json b = r.parsed();
    if (!r.ok()) throw ApiError(r.status, b.value("error", std::string("ServerError")), b.value("message", std::string("Request failed")));
    return b;
}

HackTrack::HackTrack(const std::string& host, int port) : trace_(250), queue_(host, port, trace_), undo_(queue_, 50) {}

json HackTrack::call(const std::string& method, const std::string& path, const json* body, const std::string& token,
                     const std::string& label) {
    Request r;
    r.method = method;
    r.path = path;
    r.body = body ? body->dump() : "";
    r.token = token;
    r.label = label;
    return unwrapResponse(queue_.send(r));
}

// ── cache ────────────────────────────────────────────────────

namespace {
// Insert the middle element first so ids that arrive sorted still give a
// balanced tree (inserting sorted keys one by one would build a linked list).
void insertBalanced(BST<int, int>& t, const DynArray<Project>& v, int lo, int hi) {
    if (lo > hi) return;
    int mid = lo + (hi - lo) / 2;
    t.insert(v[mid].id, mid);
    insertBalanced(t, v, lo, mid - 1);
    insertBalanced(t, v, mid + 1, hi);
}
std::string lower(std::string s) {
    for (char& c : s) c = (char)std::tolower((unsigned char)c);
    return s;
}
}  // namespace

void HackTrack::refresh(const std::string& token, bool force) {
    bool authed = !token.empty();
    if (!force && !dirty_ && nowMs() - loadedAtMs_ < 5000 && (loadedWithAuth_ || !authed)) {
        ++cacheHits_;
        return;
    }
    ++cacheMisses_;

    // Six (or seven) requests go on the queue and are sent in order.
    Response ev, tr, pz, ru, pj, tm, jd;
    queue_.enqueue(Request{"GET", "/v1/event", "", token, "Refresh cache: event"}, &ev);
    queue_.enqueue(Request{"GET", "/v1/tracks", "", token, "Refresh cache: tracks"}, &tr);
    queue_.enqueue(Request{"GET", "/v1/prizes", "", token, "Refresh cache: prizes"}, &pz);
    queue_.enqueue(Request{"GET", "/v1/rubric", "", token, "Refresh cache: rubric"}, &ru);
    queue_.enqueue(Request{"GET", "/v1/projects", "", token, "Refresh cache: projects"}, &pj);
    queue_.enqueue(Request{"GET", "/v1/teams", "", token, "Refresh cache: teams"}, &tm);
    if (authed) queue_.enqueue(Request{"GET", "/v1/judges", "", token, "Refresh cache: judges"}, &jd);
    queue_.flush();

    event_ = eventFrom(unwrapResponse(ev));
    tracks_ = unwrapResponse(tr);
    prizes_ = unwrapResponse(pz);
    rubricJson_ = unwrapResponse(ru);
    rubricFrom(rubricJson_, rubric_);

    json pjs = unwrapResponse(pj);
    projects_.clear();
    for (const json& p : pjs) projects_.push(projectFrom(p));
    mergeSort(projects_, [](const Project& a, const Project& b) { return a.id < b.id; });
    projectIndex_.clear();
    insertBalanced(projectIndex_, projects_, 0, projects_.size() - 1);
    projectCache_.clear();
    for (const Project& p : projects_) projectCache_.put(p.id, p);

    json tms = unwrapResponse(tm);
    teams_.clear();
    teamIndex_.clear();
    inviteCodes_.clear();
    for (const json& t : tms) {
        teams_.push(teamFrom(t));
        teamIndex_.put(teams_.back().id, teams_.size() - 1);
        inviteCodes_.put(teams_.back().inviteCode, teams_.back().id);
    }

    if (authed) {
        json js = unwrapResponse(jd);
        judges_.clear();
        judgeIndex_.clear();
        for (const json& j : js) {
            judges_.push(judgeFrom(j));
            judgeIndex_.put(judges_.back().id, judges_.size() - 1);
        }
        rebuildRotation();
    }

    loadedAtMs_ = nowMs();
    loadedWithAuth_ = authed;
    dirty_ = false;
    trace_.ds("BST<int,int>", "rebuild project index", std::to_string(projectIndex_.size()) + " nodes, height " + std::to_string(projectIndex_.height()));
    trace_.ds("HashProbing<code,team>", "rebuild invite codes", std::to_string(inviteCodes_.size()) + " codes in " + std::to_string(inviteCodes_.capacity()) + " slots");
}

void HackTrack::rebuildRotation() {
    // Keep the ring in judge-id order; restore the pointer to where the last run stopped.
    rotation_.clear();
    CNode<JudgeRef>* start = nullptr;
    for (int i = 0; i < judges_.size(); ++i) {
        CNode<JudgeRef>* n = rotation_.insert(JudgeRef{i, judges_[i].id});
        if (judges_[i].id == rotationHead_) start = n;
    }
    if (start) rotation_.setHead(start);
}

const Project* HackTrack::projectById(int id, long long* comps) const {
    const int* idx = projectIndex_.find(id, comps);
    return idx ? &projects_[*idx] : nullptr;
}
const Team* HackTrack::teamById(const std::string& id) const {
    const int* idx = teamIndex_.get(id);
    return idx ? &teams_[*idx] : nullptr;
}
const Judge* HackTrack::judgeById(const std::string& id) const {
    const int* idx = judgeIndex_.get(id);
    return idx ? &judges_[*idx] : nullptr;
}

json HackTrack::teamPublic(const Team& t, bool showInvite) const {
    json j = toJson(t);
    if (!showInvite) j.erase("inviteCode");  // the website never sees other teams' codes
    return j;
}

json HackTrack::projectSummary(const Project& p) const {
    json j = toJson(p);
    if (const Team* t = teamById(p.teamId)) {
        json members = json::array();
        t->members.forEach([&](const Member& m) { members.push_back({{"name", m.name}, {"initials", m.initials}, {"role", m.role}, {"country", m.country}, {"handle", m.handle}}); });
        j["team"] = {{"id", t->id}, {"name", t->name}, {"members", members}};
    }
    return j;
}

// ── sessions ─────────────────────────────────────────────────

Session HackTrack::requireSession(const std::string& token) {
    if (token.empty()) throw ApiError(401, "Unauthorized", "Sign in first");
    if (Session* s = sessions_.get(token)) {
        if (nowMs() - s->cachedAtMs < 60000) return *s;  // O(1) role check, no server round-trip
    }
    try {
        json u = call("GET", "/v1/me", nullptr, token, "Verify session (cache miss)");
        Session s{token, userFrom(u), nowMs()};
        sessions_.put(token, s);
        users_.put(s.user.id, s.user);
        trace_.ds("HashChaining<token,Session>", "put", s.user.handle + " as " + s.user.role);
        return s;
    } catch (const ApiError& e) {
        if (e.status == 401) sessions_.remove(token);
        throw;
    }
}

Session HackTrack::requireRole(const std::string& token, const char* role, const char* role2) {
    Session s = requireSession(token);
    if (s.user.role != role && !(role2 && s.user.role == role2)) {
        std::string who = role2 ? std::string(role) + " or " + role2 : std::string(role);
        throw ApiError(403, "Forbidden", "Only " + who + " accounts can do this");
    }
    return s;
}

void HackTrack::forgetUserSessions(const std::string& userId) {
    DynArray<std::string> tokens;
    sessions_.forEach([&](const std::string& tok, const Session& s) { if (s.user.id == userId) tokens.push(tok); });
    for (const std::string& t : tokens) sessions_.remove(t);
}

json HackTrack::login(const json& body) {
    json b = {{"email", body.value("email", std::string())}, {"password", body.value("password", std::string())}};
    json res = call("POST", "/v1/auth/login", &b, "", "Log in " + b["email"].get<std::string>());
    Session s{res["token"].get<std::string>(), userFrom(res["user"]), nowMs()};
    sessions_.put(s.token, s);  // token and role stored in the hash table
    users_.put(s.user.id, s.user);
    trace_.ds("HashChaining<token,Session>", "put", s.user.handle + " as " + s.user.role + " (load " + std::to_string(sessions_.loadFactor()).substr(0, 4) + ")");
    return res;
}

json HackTrack::signup(const json& body) {
    json res = call("POST", "/v1/auth/signup", &body, "", "Sign up");
    Session s{res["token"].get<std::string>(), userFrom(res["user"]), nowMs()};
    sessions_.put(s.token, s);
    users_.put(s.user.id, s.user);
    return res;
}

json HackTrack::logout(const std::string& token) {
    if (!token.empty()) {
        try { call("POST", "/v1/auth/logout", nullptr, token, "Log out"); } catch (const ApiError&) {}
        sessions_.remove(token);
    }
    return {{"ok", true}};
}

json HackTrack::me(const std::string& token) { return toJson(requireSession(token).user); }

// ── reference data & projects ────────────────────────────────

json HackTrack::bootstrap(const std::string& token) {
    if (!token.empty()) requireSession(token);
    refresh(token);
    json judges = json::array();
    if (!token.empty()) for (const Judge& j : judges_) judges.push_back(toJson(j));
    int submitted = 0;
    for (const Project& p : projects_) if (p.status == "submitted") ++submitted;
    return {{"event", toJson(event_)}, {"tracks", tracks_}, {"prizes", prizes_}, {"rubric", rubricToJson(rubricJson_, rubric_)},
            {"rubricDepth", rubric_.depth()}, {"judges", judges}, {"counts", {{"projects", projects_.size()}, {"submitted", submitted}, {"teams", teams_.size()}}},
            {"serverTime", nowIso()}};
}

json HackTrack::listProjects(const std::string& token, const std::string& sort, const std::string& track, const std::string& q) {
    bool authed = !token.empty();
    if (authed) requireSession(token);
    refresh(token);

    // Linear filter into a working array.
    DynArray<Project> list;
    std::string needle = lower(q);
    for (const Project& p : projects_) {
        if (!authed && p.status != "submitted") continue;
        if (!track.empty() && track != "all" && p.trackId != track) continue;
        if (!needle.empty()) {
            const Team* t = teamById(p.teamId);
            std::string hay = lower(p.name + " " + p.tagline + " " + (t ? t->name : ""));
            for (const std::string& s : p.stack) hay += " " + lower(s);
            if (hay.find(needle) == std::string::npos) continue;
        }
        list.push(p);
    }

    long long comps = 0;
    std::string algo;
    if (sort == "name") {
        comps = mergeSort(list, [](const Project& a, const Project& b) { return lower(a.name) < lower(b.name); });
        algo = "merge sort by name";
    } else if (sort == "id") {
        // In-order traversal of the BST is already sorted by id: no sort needed.
        DynArray<Project> ordered;
        projectIndex_.forEachInOrder([&](int, int idx) {
            const Project& p = projects_[idx];
            for (const Project& x : list) if (x.id == p.id) { ordered.push(p); break; }
        });
        list = ordered;
        algo = "BST in-order traversal";
    } else {  // "recent" (default): newest submission first
        comps = quickSort(list, [](const Project& a, const Project& b) {
            const std::string& ka = a.submittedAt.empty() ? a.updatedAt : a.submittedAt;
            const std::string& kb = b.submittedAt.empty() ? b.updatedAt : b.submittedAt;
            return ka > kb;
        });
        algo = "quick sort by submission time";
    }
    trace_.ds(sort == "name" ? "MergeSort" : sort == "id" ? "BST" : "QuickSort", "sort " + std::to_string(list.size()) + " projects",
              std::to_string(comps) + " comparisons");

    json out = json::array();
    for (const Project& p : list) out.push_back(projectSummary(p));
    return {{"projects", out}, {"sort", {{"algorithm", algo}, {"comparisons", comps}, {"n", list.size()}}}};
}

json HackTrack::getProject(const std::string& token, int id) {
    bool authed = !token.empty();
    Session s;
    if (authed) s = requireSession(token);
    refresh(token);

    long long bstComps = 0, binComps = 0, linComps = 0;
    const Project* p = projectById(id, &bstComps);
    // Same lookup by binary and linear search on the id-sorted array, for comparison.
    binarySearch(projects_.raw(), projects_.size(), [id](const Project& x) { return x.id < id ? -1 : (x.id > id ? 1 : 0); }, binComps);
    linearSearch(projects_.raw(), projects_.size(), [id](const Project& x) { return x.id == id; }, linComps);
    trace_.ds("BST<int,int>", "find(" + std::to_string(id) + ")", std::to_string(bstComps) + " comparisons (binary " + std::to_string(binComps) +
              ", linear " + std::to_string(linComps) + ")");
    if (!p || (p->status != "submitted" && !authed)) throw ApiError(404, "NotFound", "Project not found");

    json j = projectSummary(*p);
    const Team* t = teamById(p->teamId);
    bool member = authed && s.user.teamId == p->teamId;
    json out = {{"project", j}, {"team", t ? teamPublic(*t, member || s.user.role == "admin") : json(nullptr)},
                {"lookup", {{"bst", bstComps}, {"bstHeight", projectIndex_.height()}, {"binary", binComps}, {"linear", linComps}, {"n", projects_.size()}}}};
    for (const json& tr : tracks_) if (jstr(tr, "id") == p->trackId) out["track"] = tr;
    return out;
}

json HackTrack::comments(int projectId) {
    return call("GET", "/v1/projects/" + std::to_string(projectId) + "/comments", nullptr, "", "Load comments");
}

json HackTrack::addComment(const std::string& token, int projectId, const json& body) {
    requireSession(token);
    json b = {{"body", body.value("body", std::string())}};
    return call("POST", "/v1/projects/" + std::to_string(projectId) + "/comments", &b, token, "Post comment");
}

// ── teams ────────────────────────────────────────────────────

json HackTrack::listTeams(const std::string& token) {
    Session s = requireSession(token);
    refresh(token);
    DynArray<const Team*> list;
    for (const Team& t : teams_) list.push(&t);
    mergeSort(list, [](const Team* a, const Team* b) { return lower(a->name) < lower(b->name); });
    json out = json::array();
    for (const Team* t : list) {
        json j = teamPublic(*t, s.user.role == "admin" || s.user.teamId == t->id);
        if (const Project* p = t->projectId ? projectById(t->projectId) : nullptr) j["project"] = {{"id", p->id}, {"name", p->name}, {"status", p->status}};
        out.push_back(j);
    }
    return out;
}

json HackTrack::myTeam(const std::string& token) {
    Session s = requireSession(token);
    refresh(token);
    if (s.user.teamId.empty()) return {{"team", nullptr}, {"maxTeamSize", event_.maxTeamSize}};
    const Team* t = teamById(s.user.teamId);
    if (!t) { refresh(token, true); t = teamById(s.user.teamId); }
    if (!t) return {{"team", nullptr}, {"maxTeamSize", event_.maxTeamSize}};
    json out = {{"team", teamPublic(*t, true)}, {"maxTeamSize", event_.maxTeamSize}};
    if (const Project* p = t->projectId ? projectById(t->projectId) : nullptr) out["project"] = toJson(*p);
    return out;
}

json HackTrack::createTeam(const std::string& token, const json& body) {
    requireRole(token, "participant");
    json b = {{"name", body.value("name", std::string())}};
    json res = call("POST", "/v1/teams", &b, token, "Create team");
    dirty_ = true;
    sessions_.remove(token);  // user's team changed
    return res;
}

json HackTrack::joinTeam(const std::string& token, const json& body) {
    Session s = requireRole(token, "participant");
    if (!s.user.teamId.empty()) throw ApiError(409, "AlreadyInTeam", "You are already in a team. Leave it first.");
    std::string code = body.value("inviteCode", std::string());
    for (char& c : code) c = (char)std::toupper((unsigned char)c);
    refresh(token);
    // Unit 6: O(1) average lookup with linear probing.
    std::string* teamId = inviteCodes_.get(code);
    if (!teamId) { refresh(token, true); teamId = inviteCodes_.get(code); }
    trace_.ds("HashProbing<code,team>", "get(" + code + ")", teamId ? "-> " + *teamId : "miss");
    if (!teamId) throw ApiError(404, "InvalidInviteCode", "No team has that invite code");
    json b = {{"inviteCode", code}};
    json res = call("POST", "/v1/teams/" + *teamId + "/join", &b, token, "Join team by invite code");
    dirty_ = true;
    sessions_.remove(token);
    return res;
}

json HackTrack::leaveTeam(const std::string& token) {
    requireRole(token, "participant");
    json res = call("POST", "/v1/teams/leave", nullptr, token, "Leave team");
    dirty_ = true;
    sessions_.remove(token);
    return res;
}

// ── submission ───────────────────────────────────────────────

void HackTrack::checkDeadline() const {
    // Checked on the client first so a late submission is never even sent.
    if (nowIso() > event_.deadline)
        throw ApiError(422, "DeadlinePassed", "The submission deadline (" + event_.deadline + ") has passed; nothing was sent");
}

json HackTrack::submission(const std::string& token) {
    Session s = requireRole(token, "participant");
    refresh(token);
    json out = {{"deadline", event_.deadline}, {"locked", nowIso() > event_.deadline}, {"serverTime", nowIso()}, {"tracks", tracks_},
                {"team", nullptr}, {"project", nullptr}};
    if (const Team* t = s.user.teamId.empty() ? nullptr : teamById(s.user.teamId)) {
        out["team"] = teamPublic(*t, true);
        if (const Project* p = t->projectId ? projectById(t->projectId) : nullptr) out["project"] = toJson(*p);
    }
    return out;
}

json HackTrack::saveSubmission(const std::string& token, const json& body) {
    Session s = requireRole(token, "participant");
    if (s.user.teamId.empty()) throw ApiError(422, "NotInTeam", "Create or join a team first");
    refresh(token);
    checkDeadline();
    json b = {{"name", body.value("name", std::string())}, {"tagline", body.value("tagline", std::string())},
              {"description", body.value("description", std::string())}, {"trackId", body.value("trackId", std::string())},
              {"repo", body.value("repo", std::string())}, {"demo", body.value("demo", std::string())},
              {"stack", body.contains("stack") && body["stack"].is_array() ? body["stack"] : json::array()}};
    json res = call("PUT", "/v1/teams/" + s.user.teamId + "/project", &b, token, "Save submission draft");
    dirty_ = true;
    return res;
}

json HackTrack::submitProject(const std::string& token) {
    Session s = requireRole(token, "participant");
    if (s.user.teamId.empty()) throw ApiError(422, "NotInTeam", "Create or join a team first");
    refresh(token);
    checkDeadline();
    json res = call("POST", "/v1/teams/" + s.user.teamId + "/project/submit", nullptr, token, "Submit project");
    dirty_ = true;
    return res;
}

}  // namespace ht
