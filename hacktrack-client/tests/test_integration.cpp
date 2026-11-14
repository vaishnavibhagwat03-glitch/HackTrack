// Report Table 3 test cases, end to end against a real server.
// Run through scripts/integration.mjs, which starts a fresh server on port 4100.
#include <cstdlib>
#include <functional>

#include "../src/core/ApiError.h"
#include "../src/core/Clock.h"
#include "../src/modules/HackTrack.h"
#include "TestFramework.h"

using namespace ht;

static int port() { const char* p = std::getenv("HT_TEST_PORT"); return p ? std::atoi(p) : 4100; }

static std::string expectError(const std::function<void()>& fn) {
    try { fn(); } catch (const ApiError& e) { return e.code; }
    return "no error";
}

static std::string login(HackTrack& app, const char* email, const char* pw) {
    return app.login({{"email", email}, {"password", pw}})["token"];
}

TEST("1. Login with wrong password: 401 shown") {
    HackTrack app("127.0.0.1", port());
    int status = 0;
    try { app.login({{"email", "admin@hacktrack.dev"}, {"password", "wrong"}}); }
    catch (const ApiError& e) { status = e.status; CHECK_EQ(e.code, std::string("InvalidCredentials")); }
    CHECK_EQ(status, 401);
    CHECK_EQ(app.queue().retries(), 0);  // 4xx is final: not retried
}

TEST("2. Server stopped: 3 retries, then network error") {
    HackTrack app("127.0.0.1", 4999);  // nothing listens here
    app.queue().retryDelayMs = 5;
    CHECK_EQ(expectError([&] { app.login({{"email", "x@y.z"}, {"password", "x"}}); }), std::string("NetworkError"));
    CHECK_EQ(app.queue().sent(), 4);     // 1 attempt + 3 retries
    CHECK_EQ(app.queue().retries(), 3);
}

TEST("3. Submit after deadline: DeadlinePassed, nothing sent") {
    HackTrack app("127.0.0.1", port());
    std::string admin = login(app, "admin@hacktrack.dev", "admin123");
    json before = app.updateEvent(admin, {{"deadline", "2001-01-01T00:00:00Z"}});
    std::string p = login(app, "participant@hacktrack.dev", "participant123");
    app.submission(p);  // warm the cache
    long long sent = app.queue().sent();
    CHECK_EQ(expectError([&] { app.submitProject(p); }), std::string("DeadlinePassed"));
    CHECK_EQ(app.queue().sent(), sent);  // the request never left the client
    app.undo(admin);                      // restore the deadline through the undo stack
    CHECK(app.bootstrap(admin)["event"]["deadline"].get<std::string>() > nowIso());
}

TEST("4. Join a second team: rejected") {
    HackTrack app("127.0.0.1", port());
    std::string p = login(app, "participant@hacktrack.dev", "participant123");
    CHECK_EQ(expectError([&] { app.joinTeam(p, {{"inviteCode", "ANYCODE"}}); }), std::string("AlreadyInTeam"));
    CHECK_EQ(expectError([&] { app.createTeam(p, {{"name", "Second Team"}}); }), std::string("AlreadyInTeam"));
}

TEST("5. Assign judges with conflicts: no judge gets a conflicting team") {
    HackTrack app("127.0.0.1", port());
    std::string admin = login(app, "admin@hacktrack.dev", "admin123");
    json r = app.runAssignment(admin, {{"mode", "fill"}});
    CHECK(r["created"].get<int>() > 0);
    CHECK(r["conflictsAvoided"].get<long long>() > 0);
    json conflicts = app.conflicts(admin)["conflicts"];
    json teams = app.listTeams(admin);
    for (const json& a : app.judgingOverview(admin)["assignments"]) {
        std::string teamId;
        for (const json& t : teams) if (t["projectId"] == a["projectId"]) teamId = t["id"];
        for (const json& c : conflicts) CHECK(!(c["judgeId"] == a["judgeId"] && c["teamId"] == teamId));
    }
    app.undo(admin);
}

TEST("6. Team conflicts with every judge: shortage reported") {
    HackTrack app("127.0.0.1", port());
    std::string admin = login(app, "admin@hacktrack.dev", "admin123");
    json judges = app.bootstrap(admin)["judges"];
    int added = 0;
    for (const json& j : judges) {
        try { app.addConflict(admin, {{"judgeId", j["id"]}, {"teamId", "t01"}, {"reason", "test"}}); ++added; } catch (const ApiError&) {}
    }
    json r = app.runAssignment(admin, {{"mode", "fill"}});
    bool found = false;
    for (const json& s : r["shortages"]) if (s["name"] == "Tribunal") found = s["assigned"] == 0;
    CHECK(found);
    CHECK(!r["complete"].get<bool>());
    app.undo(admin);                                // assignment
    for (int i = 0; i < added; ++i) app.undo(admin);  // conflicts
}

TEST("7. Score above maximum: InvalidScore, nothing sent") {
    HackTrack app("127.0.0.1", port());
    std::string admin = login(app, "admin@hacktrack.dev", "admin123");
    app.runAssignment(admin, {{"mode", "fill"}});
    std::string j = login(app, "judge@hacktrack.dev", "judge123");
    json q = app.judgeQueue(j)["queue"];
    CHECK(q.size() > 0);
    int pid = q[0]["projectId"];
    long long sent = app.queue().sent();
    CHECK_EQ(expectError([&] { app.saveScore(j, pid, {{"scores", {{"impact", 11}}}}); }), std::string("InvalidScore"));
    CHECK_EQ(app.queue().sent(), sent);
    json ok = app.saveScore(j, pid, {{"scores", {{"impact", 9}}}});
    CHECK_EQ(ok["status"], std::string("in_progress"));
    app.undo(admin);
}

TEST("8. Undo a team deletion: team restored with its members") {
    HackTrack app("127.0.0.1", port());
    std::string admin = login(app, "admin@hacktrack.dev", "admin123");
    auto members = [&](const char* id) {
        for (const json& t : app.listTeams(admin)) if (t["id"] == id) return (int)t["members"].size();
        return -1;
    };
    int before = members("t05");
    CHECK(before > 0);
    app.deleteTeam(admin, "t05");
    CHECK_EQ(members("t05"), -1);
    app.undo(admin);
    CHECK_EQ(members("t05"), before);
}

TEST("Session role is cached in the hash table (no server call)") {
    HackTrack app("127.0.0.1", port());
    std::string t = login(app, "judge@hacktrack.dev", "judge123");
    long long sent = app.queue().sent();
    CHECK_EQ(app.me(t)["role"], std::string("judge"));
    CHECK_EQ(app.queue().sent(), sent);
    CHECK_EQ(expectError([&] { app.users(t); }), std::string("Forbidden"));  // refused before sending
    CHECK_EQ(app.queue().sent(), sent);
}

int main() { return httest::runAll(); }
