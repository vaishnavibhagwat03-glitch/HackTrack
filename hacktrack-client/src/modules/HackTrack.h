// The HackTrack client: every feature the website (via the bridge) and the
// console menus use. Each method checks the caller's session, does its work
// with the project's own data structures, and talks to the server only
// through the request queue. All methods return JSON for the caller and
// throw ApiError on failure.
#pragma once
#include <string>

#include "../algo/Assignment.h"
#include "../algo/Ranking.h"
#include "../core/ApiError.h"
#include "../core/Models.h"
#include "../ds/BST.h"
#include "../ds/CircularList.h"
#include "../ds/DynArray.h"
#include "../ds/GeneralizedList.h"
#include "../ds/HashChaining.h"
#include "../ds/HashProbing.h"
#include "../protocol/RequestQueue.h"
#include "../protocol/Trace.h"
#include "../protocol/UndoManager.h"

namespace ht {

class HackTrack {
public:
    HackTrack(const std::string& serverHost, int serverPort);

    // ── session & auth ──
    json login(const json& body);
    json signup(const json& body);
    json googleLogin(const json& body);  // forwards Google's ID token; server verifies it
    json logout(const std::string& token);
    json me(const std::string& token);
    Session requireSession(const std::string& token);

    // ── reference data & projects ──
    json bootstrap(const std::string& token);
    json listProjects(const std::string& token, const std::string& sort, const std::string& track, const std::string& q);
    json getProject(const std::string& token, int id);
    json comments(int projectId);
    json addComment(const std::string& token, int projectId, const json& body);

    // ── teams & submission (participant) ──
    json listTeams(const std::string& token);
    json myTeam(const std::string& token);
    json createTeam(const std::string& token, const json& body);
    json joinTeam(const std::string& token, const json& body);
    json leaveTeam(const std::string& token);
    json submission(const std::string& token);
    json saveSubmission(const std::string& token, const json& body);
    json submitProject(const std::string& token);

    // ── judging ──
    json judgeQueue(const std::string& token);
    json saveScore(const std::string& token, int projectId, const json& body);
    json judgingOverview(const std::string& token);
    json runAssignment(const std::string& token, const json& body);
    json conflicts(const std::string& token);
    json addConflict(const std::string& token, const json& body);
    json removeConflict(const std::string& token, const std::string& judgeId, const std::string& teamId);

    // ── results, voting, certificates ──
    json results(const std::string& token, const std::string& by);
    json voting(const std::string& token);
    json castVote(const std::string& token, int projectId);
    json withdrawVote(const std::string& token, int projectId);
    json certificates(const std::string& token);

    // ── administration ──
    json users(const std::string& token);
    json setRole(const std::string& token, const std::string& userId, const json& body);
    json deleteTeam(const std::string& token, const std::string& teamId);
    json removeMember(const std::string& token, const std::string& teamId, const std::string& userId);
    json updateEvent(const std::string& token, const json& body);
    json updateRubric(const std::string& token, const json& body);
    json analytics(const std::string& token);
    json audit(const std::string& token);
    json undoList(const std::string& token);
    json undo(const std::string& token);
    json chaos(const std::string& token, double rate);

    // ── introspection (for the viva / inspector page) ──
    json bench(const DynArray<int>& sizes, int runs);
    json inspector();
    json trace(long long sinceId) const { return trace_.toJson(sinceId); }
    json health();

    RequestQueue& queue() { return queue_; }
    const Event& event() const { return event_; }

private:
    Trace trace_;
    RequestQueue queue_;
    UndoManager undo_;

    // Cached server data.
    Event event_;
    json tracks_ = json::array(), prizes_ = json::array(), rubricJson_ = json::array();
    GeneralizedList rubric_;                          // Unit 2: rubric with sub-criteria
    DynArray<Project> projects_;                      // Unit 1: records, sorted by id
    BST<int, int> projectIndex_;                      // Unit 4: id -> index in projects_
    HashChaining<int, Project> projectCache_;         // Unit 6: id -> project, O(1)
    DynArray<Team> teams_;
    HashChaining<std::string, int> teamIndex_;        // team id -> index in teams_
    HashProbing<std::string, std::string> inviteCodes_;  // Unit 6: invite code -> team id
    DynArray<Judge> judges_;
    HashChaining<std::string, int> judgeIndex_;       // judge id -> index in judges_
    HashChaining<std::string, Session> sessions_;     // token -> session (role)
    HashChaining<std::string, User> users_;           // user id -> user
    CircularList<JudgeRef> rotation_;                 // Unit 2: round-robin ring
    std::string rotationHead_;                        // judge id under the pointer between runs

    long long loadedAtMs_ = 0;
    bool dirty_ = true;
    bool loadedWithAuth_ = false;
    long long cacheHits_ = 0, cacheMisses_ = 0;

    // Last results of the algorithms, kept for the inspector.
    json lastHeap_ = json::array(), lastMatrix_ = json::object(), lastGraph_ = json::object(), lastAssign_ = json::object();

    json call(const std::string& method, const std::string& path, const json* body, const std::string& token, const std::string& label);
    void refresh(const std::string& token, bool force = false);
    Session requireRole(const std::string& token, const char* role, const char* role2 = nullptr);
    void forgetUserSessions(const std::string& userId);
    void rebuildRotation();

    const Project* projectById(int id, long long* comps = nullptr) const;
    const Team* teamById(const std::string& id) const;
    const Judge* judgeById(const std::string& id) const;
    json projectSummary(const Project& p) const;
    json teamPublic(const Team& t, bool showInvite) const;
    void checkDeadline() const;
    DynArray<Assignment> fetchAssignments(const std::string& token, const char* label);
    RankingResult computeRanking(const std::string& token, bool byNormalized);
    json prizesFor(const RankingResult& r, const DynArray<VoteRow>& votes) const;
};

json unwrapResponse(const Response& r);

}  // namespace ht
