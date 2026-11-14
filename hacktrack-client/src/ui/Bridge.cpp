// Bridge mode: the website (Next.js) sends every request here. The C++ client
// does the work with its own data structures and talks to the server through
// the request queue. The browser never contacts the server directly.
#include "Bridge.h"

#include <cstdio>
#include <functional>
#include <mutex>

#include "../core/ApiError.h"
#include "httplib.h"

namespace ht {

namespace {

std::string bearer(const httplib::Request& req) {
    std::string h = req.get_header_value("Authorization");
    const std::string p = "Bearer ";
    return h.compare(0, p.size(), p) == 0 ? h.substr(p.size()) : "";
}

json body(const httplib::Request& req) {
    if (req.body.empty()) return json::object();
    json j = json::parse(req.body, nullptr, false);
    if (j.is_discarded()) throw ApiError(400, "InvalidJson", "Request body is not valid JSON");
    return j;
}

std::string param(const httplib::Request& req, const char* key, const char* dflt = "") {
    return req.has_param(key) ? req.get_param_value(key) : dflt;
}

}  // namespace

int runBridge(HackTrack& app, int port, const std::string& listenHost, const std::string& allowOrigin) {
    httplib::Server srv;
    std::mutex mu;  // the data structures are not thread-safe: one request at a time

    // Browsers keep up to 6 idle keep-alive connections per tab, and each one
    // occupies a worker thread until it times out. A larger pool and a short
    // keep-alive stop several open tabs from starving the server.
    srv.new_task_queue = [] { return new httplib::ThreadPool(64); };
    srv.set_keep_alive_timeout(1);
    srv.set_keep_alive_max_count(50);

    using Fn = std::function<json(const httplib::Request&, const std::string& token)>;
    auto wrap = [&](Fn fn) {
        return [&, fn](const httplib::Request& req, httplib::Response& res) {
            std::lock_guard<std::mutex> lock(mu);
            try {
                json out = fn(req, bearer(req));
                res.set_content(out.dump(), "application/json");
            } catch (const ApiError& e) {
                res.status = e.status;
                res.set_content(json{{"error", e.code}, {"message", e.what()}}.dump(), "application/json");
            } catch (const std::exception& e) {
                res.status = 500;
                res.set_content(json{{"error", "ClientError"}, {"message", e.what()}}.dump(), "application/json");
            }
        };
    };
    auto id = [](const httplib::Request& r, int i = 1) { return std::stoi(r.matches[i].str()); };
    auto str = [](const httplib::Request& r, int i = 1) { return r.matches[i].str(); };

    srv.set_post_routing_handler([&](const httplib::Request&, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", allowOrigin);
        res.set_header("Access-Control-Allow-Headers", "Authorization, Content-Type");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.set_header("X-Served-By", "HackTrack-Cpp-Client");
    });
    srv.Options(R"(.*)", [](const httplib::Request&, httplib::Response& res) { res.status = 204; });

    // health & introspection
    srv.Get("/api/health", wrap([&](auto&, auto&) { return app.health(); }));
    srv.Get("/api/ds", wrap([&](auto&, auto&) { return app.inspector(); }));
    srv.Get("/api/trace", wrap([&](auto& r, auto&) { return app.trace(std::stoll(param(r, "since", "0"))); }));
    srv.Get("/api/bench", wrap([&](auto& r, auto&) {
        DynArray<int> sizes;
        std::string s = param(r, "sizes", "100,1000,10000");
        size_t start = 0;
        while (start < s.size()) {
            size_t comma = s.find(',', start);
            int n = std::atoi(s.substr(start, comma - start).c_str());
            if (n > 0 && n <= 20000) sizes.push(n);
            if (comma == std::string::npos) break;
            start = comma + 1;
        }
        int runs = std::atoi(param(r, "runs", "5").c_str());
        return app.bench(sizes, runs < 1 || runs > 9 ? 5 : runs);
    }));

    // auth
    srv.Post("/api/auth/login", wrap([&](auto& r, auto&) { return app.login(body(r)); }));
    srv.Post("/api/auth/signup", wrap([&](auto& r, auto&) { return app.signup(body(r)); }));
    srv.Post("/api/auth/logout", wrap([&](auto&, auto& t) { return app.logout(t); }));
    srv.Get("/api/me", wrap([&](auto&, auto& t) { return app.me(t); }));

    // projects
    srv.Get("/api/bootstrap", wrap([&](auto&, auto& t) { return app.bootstrap(t); }));
    srv.Get("/api/projects", wrap([&](auto& r, auto& t) { return app.listProjects(t, param(r, "sort", "recent"), param(r, "track"), param(r, "q")); }));
    srv.Get(R"(/api/projects/(\d+))", wrap([&](auto& r, auto& t) { return app.getProject(t, id(r)); }));
    srv.Get(R"(/api/projects/(\d+)/comments)", wrap([&](auto& r, auto&) { return app.comments(id(r)); }));
    srv.Post(R"(/api/projects/(\d+)/comments)", wrap([&](auto& r, auto& t) { return app.addComment(t, id(r), body(r)); }));

    // teams & submission
    srv.Get("/api/teams", wrap([&](auto&, auto& t) { return app.listTeams(t); }));
    srv.Get("/api/teams/mine", wrap([&](auto&, auto& t) { return app.myTeam(t); }));
    srv.Post("/api/teams", wrap([&](auto& r, auto& t) { return app.createTeam(t, body(r)); }));
    srv.Post("/api/teams/join", wrap([&](auto& r, auto& t) { return app.joinTeam(t, body(r)); }));
    srv.Post("/api/teams/leave", wrap([&](auto&, auto& t) { return app.leaveTeam(t); }));
    srv.Get("/api/submission", wrap([&](auto&, auto& t) { return app.submission(t); }));
    srv.Put("/api/submission", wrap([&](auto& r, auto& t) { return app.saveSubmission(t, body(r)); }));
    srv.Post("/api/submission/submit", wrap([&](auto&, auto& t) { return app.submitProject(t); }));

    // judging
    srv.Get("/api/judging/queue", wrap([&](auto&, auto& t) { return app.judgeQueue(t); }));
    srv.Put(R"(/api/judging/(\d+))", wrap([&](auto& r, auto& t) { return app.saveScore(t, id(r), body(r)); }));

    // results, voting, certificates
    srv.Get("/api/results", wrap([&](auto& r, auto& t) { return app.results(t, param(r, "by", "average")); }));
    srv.Get("/api/voting", wrap([&](auto&, auto& t) { return app.voting(t); }));
    srv.Post(R"(/api/voting/(\d+))", wrap([&](auto& r, auto& t) { return app.castVote(t, id(r)); }));
    srv.Delete(R"(/api/voting/(\d+))", wrap([&](auto& r, auto& t) { return app.withdrawVote(t, id(r)); }));
    srv.Get("/api/certificates", wrap([&](auto&, auto& t) { return app.certificates(t); }));

    // administration
    srv.Get("/api/admin/judging", wrap([&](auto&, auto& t) { return app.judgingOverview(t); }));
    srv.Post("/api/admin/assign", wrap([&](auto& r, auto& t) { return app.runAssignment(t, body(r)); }));
    srv.Get("/api/admin/conflicts", wrap([&](auto&, auto& t) { return app.conflicts(t); }));
    srv.Post("/api/admin/conflicts", wrap([&](auto& r, auto& t) { return app.addConflict(t, body(r)); }));
    srv.Delete(R"(/api/admin/conflicts/([^/]+)/([^/]+))", wrap([&](auto& r, auto& t) { return app.removeConflict(t, str(r, 1), str(r, 2)); }));
    srv.Get("/api/admin/users", wrap([&](auto&, auto& t) { return app.users(t); }));
    srv.Put(R"(/api/admin/users/([^/]+)/role)", wrap([&](auto& r, auto& t) { return app.setRole(t, str(r), body(r)); }));
    srv.Delete(R"(/api/admin/teams/([^/]+))", wrap([&](auto& r, auto& t) { return app.deleteTeam(t, str(r)); }));
    srv.Delete(R"(/api/admin/teams/([^/]+)/members/([^/]+))", wrap([&](auto& r, auto& t) { return app.removeMember(t, str(r, 1), str(r, 2)); }));
    srv.Put("/api/admin/event", wrap([&](auto& r, auto& t) { return app.updateEvent(t, body(r)); }));
    srv.Put("/api/admin/rubric", wrap([&](auto& r, auto& t) { return app.updateRubric(t, body(r)); }));
    srv.Get("/api/admin/analytics", wrap([&](auto&, auto& t) { return app.analytics(t); }));
    srv.Get("/api/admin/audit", wrap([&](auto&, auto& t) { return app.audit(t); }));
    srv.Get("/api/admin/undo", wrap([&](auto&, auto& t) { return app.undoList(t); }));
    srv.Post("/api/admin/undo", wrap([&](auto&, auto& t) { return app.undo(t); }));
    srv.Post("/api/admin/chaos", wrap([&](auto& r, auto& t) { return app.chaos(t, body(r).value("rate", 0.0)); }));

    srv.set_error_handler([](const httplib::Request&, httplib::Response& res) {
        if (res.body.empty()) res.set_content(json{{"error", "NotFound"}, {"message", "Unknown endpoint"}}.dump(), "application/json");
    });

    std::printf("HackTrack C++ client - bridge mode\n");
    std::printf("  website -> http://%s:%d/api  (this program)\n", listenHost.c_str(), port);
    std::printf("  server  -> http://%s       (Node + SQLite)\n", app.queue().serverAddress().c_str());
    json h = app.health();
    std::printf("  server status: %s\n\n", h["server"]["ok"].get<bool>() ? "reachable" : "NOT reachable (start it with: cd server && npm start)");
    std::fflush(stdout);
    if (!srv.listen(listenHost, port)) {
        std::fprintf(stderr, "Could not listen on port %d (already in use?)\n", port);
        return 1;
    }
    return 0;
}

}  // namespace ht
