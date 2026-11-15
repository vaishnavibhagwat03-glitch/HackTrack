// Console mode: role-based menus (report Section 2.2, Figures 4 and 5).
// Uses exactly the same HackTrack methods as the website does via the bridge.
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <iostream>
#include <string>

#include "../algo/Benchmark.h"
#include "../core/ApiError.h"
#include "../core/Clock.h"
#include "Bridge.h"

namespace ht {

namespace {

std::string ask(const std::string& prompt) {
    std::cout << prompt << std::flush;
    std::string s;
    if (!std::getline(std::cin, s)) throw ApiError(0, "EOF", "input closed");
    return s;
}
int askInt(const std::string& prompt) {
    try { return std::stoi(ask(prompt)); } catch (const std::invalid_argument&) { return -1; } catch (const std::out_of_range&) { return -1; }
}
void line() { std::printf("------------------------------------------------------------------\n"); }
void error(const ApiError& e) { std::printf("  ! %s: %s\n", e.code.c_str(), e.what()); }
std::string s(const json& j, const char* k) { return jstr(j, k); }

void printLeaderboard(HackTrack& app, const std::string& token) {
    json r = app.results(token, "average");
    if (!r["published"].get<bool>() && !r.value("preview", false)) {
        std::printf("  Results are not published yet (expected %s).\n", s(r, "resultsAt").c_str());
        return;
    }
    std::printf("\n  %-5s %-22s %-20s %8s %6s %6s\n", "Rank", "Project", "Team", "Average", "Judges", "Votes");
    line();
    for (const json& row : r["ranking"])
        std::printf("  %-5d %-22.22s %-20.20s %8.2f %6d %6d\n", row["rank"].get<int>(), s(row["project"], "name").c_str(),
                    row["project"].contains("team") ? s(row["project"]["team"], "name").c_str() : "", row["average"].get<double>(),
                    row["judges"].get<int>(), row["votes"].get<int>());
    std::printf("\n  Prizes:\n");
    for (const json& p : r["prizes"])
        std::printf("   - %-28s %s\n", s(p, "name").c_str(), p["winner"].is_object() ? (s(p["winner"], "name") + " (" + s(p["winner"], "teamName") + ")").c_str() : "-");
}

void adminMenu(HackTrack& app, const std::string& token) {
    for (;;) {
        std::printf("\n=== ADMIN MENU ===\n"
                    " 1. Event status            2. List teams\n"
                    " 3. Delete a team           4. Conflicts of interest\n"
                    " 5. Add a conflict          6. Assign judges (round-robin)\n"
                    " 7. Judging progress        8. Leaderboard\n"
                    " 9. Undo last change       10. Open/close judging, voting, results\n"
                    "11. Sort/search benchmark   0. Log out\n");
        int c = askInt("Choice: ");
        try {
            if (c == 0) return;
            if (c == 1) {
                json b = app.bootstrap(token);
                const json& e = b["event"];
                std::printf("  %s - %s\n  Deadline %s | judging %s | voting %s | results %s | %d judges/project\n",
                            s(e, "name").c_str(), s(e, "tagline").c_str(), s(e, "deadline").c_str(), e["judgingOpen"].get<bool>() ? "open" : "closed",
                            e["votingOpen"].get<bool>() ? "open" : "closed", e["resultsPublished"].get<bool>() ? "published" : "hidden",
                            e["judgesPerProject"].get<int>());
                std::printf("  %d teams, %d projects (%d submitted)\n", b["counts"]["teams"].get<int>(), b["counts"]["projects"].get<int>(), b["counts"]["submitted"].get<int>());
            } else if (c == 2) {
                std::printf("  %-5s %-22s %-8s %s\n", "ID", "Team", "Code", "Members");
                for (const json& t : app.listTeams(token)) {
                    std::string m;
                    for (const json& x : t["members"]) m += (m.empty() ? "" : ", ") + s(x, "name");
                    std::printf("  %-5s %-22.22s %-8s %s\n", s(t, "id").c_str(), s(t, "name").c_str(), s(t, "inviteCode").c_str(), m.c_str());
                }
            } else if (c == 3) {
                std::string id = ask("  Team id to delete (e.g. t03): ");
                if (ask("  Type YES to confirm: ") != "YES") continue;
                json r = app.deleteTeam(token, id);
                std::printf("  Deleted %s with %d members. Use Undo (9) to restore.\n", s(r, "name").c_str(), r["members"].get<int>());
            } else if (c == 4) {
                json r = app.conflicts(token);
                for (const json& x : r["conflicts"])
                    std::printf("  %-10s %-16s x %-18s %s\n", s(x, "judgeId").c_str(), s(x, "judgeName").c_str(), s(x, "teamName").c_str(), s(x, "reason").c_str());
                std::printf("  Graph: %d vertices, %d edges, %d components\n", r["graph"]["vertices"].get<int>(), r["graph"]["edges"].get<int>(), r["graph"]["components"].get<int>());
            } else if (c == 5) {
                json b = {{"judgeId", ask("  Judge id (e.g. JUDGE_003): ")}, {"teamId", ask("  Team id (e.g. t05): ")}, {"reason", ask("  Reason: ")}};
                app.addConflict(token, b);
                std::printf("  Conflict recorded.\n");
            } else if (c == 6) {
                std::string mode = ask("  Mode [fill/rebalance] (fill): ");
                json r = app.runAssignment(token, {{"mode", mode.empty() ? "fill" : mode}});
                std::printf("  %d new assignments, %d kept. %lld conflict checks, %lld conflicts avoided, %lld pointer moves.\n",
                            r["created"].get<int>(), r["kept"].get<int>(), r["conflictChecks"].get<long long>(), r["conflictsAvoided"].get<long long>(),
                            r["rotations"].get<long long>());
                for (const json& sh : r["shortages"])
                    std::printf("  SHORTAGE: %s has %d of %d judges (every other judge has a conflict)\n", s(sh, "name").c_str(), sh["assigned"].get<int>(), sh["needed"].get<int>());
                if (r["complete"].get<bool>()) std::printf("  Every project is fully staffed.\n");
            } else if (c == 7) {
                json r = app.judgingOverview(token);
                std::printf("  %-10s %-16s %8s %9s %8s\n", "Judge", "Name", "Assigned", "Completed", "Average");
                for (const json& j : r["judges"])
                    std::printf("  %-10s %-16.16s %8d %9d %8.2f\n", s(j, "id").c_str(), s(j, "name").c_str(), j["assigned"].get<int>(), j["completed"].get<int>(), j["average"].get<double>());
                std::printf("  Projects below %d judges: %d\n", r["perProject"].get<int>(), r["underCovered"].get<int>());
            } else if (c == 8) {
                printLeaderboard(app, token);
            } else if (c == 9) {
                json r = app.undo(token);
                std::printf("  Undone: %s (%d left)\n", s(r, "undone").c_str(), r["remaining"].get<int>());
            } else if (c == 10) {
                const char* keys[] = {"judgingOpen", "votingOpen", "resultsPublished"};
                int k = askInt("  1 judging, 2 voting, 3 results: ");
                if (k < 1 || k > 3) continue;
                json e = app.bootstrap(token)["event"];
                json r = app.updateEvent(token, {{keys[k - 1], !e[keys[k - 1]].get<bool>()}});
                std::printf("  %s is now %s\n", keys[k - 1], r[keys[k - 1]].get<bool>() ? "ON" : "OFF");
            } else if (c == 11) {
                DynArray<int> sizes;
                sizes.push(100); sizes.push(1000); sizes.push(10000);
                printBenchmark(runBenchmark(sizes, 5));
            }
        } catch (const ApiError& e) {
            if (e.code == "EOF") throw;
            error(e);
        }
    }
}

void judgeMenu(HackTrack& app, const std::string& token) {
    for (;;) {
        std::printf("\n=== JUDGE MENU ===\n 1. My assigned projects   2. Score a project\n 3. Leaderboard            0. Log out\n");
        int c = askInt("Choice: ");
        try {
            if (c == 0) return;
            if (c == 1 || c == 2) {
                json q = app.judgeQueue(token);
                std::printf("  %-6s %-22s %-12s %s\n", "ID", "Project", "Status", "Weighted");
                for (const json& a : q["queue"])
                    std::printf("  %-6d %-22.22s %-12s %s\n", a["projectId"].get<int>(), a.contains("project") ? s(a["project"], "name").c_str() : "?",
                                s(a, "status").c_str(), a["weighted"].is_number() ? std::to_string(a["weighted"].get<double>()).substr(0, 4).c_str() : "-");
                if (c == 1) continue;
                int pid = askInt("  Project id to score: ");
                json scores = json::object();
                // Walk the rubric's leaves; re-ask on an invalid score (report test case).
                std::function<void(const json&)> walk = [&](const json& nodes) {
                    for (const json& n : nodes) {
                        if (n.contains("children")) { std::printf("  [%s]\n", s(n, "name").c_str()); walk(n["children"]); continue; }
                        double max = n.value("maxScore", 10.0);
                        for (;;) {
                            std::string v = ask("    " + s(n, "name") + " (0-" + std::to_string((int)max) + "): ");
                            try {
                                double x = std::stod(v);
                                if (x < 0 || x > max) throw ApiError(422, "InvalidScore", "must be between 0 and " + std::to_string((int)max));
                                scores[s(n, "id")] = x;
                                break;
                            } catch (const ApiError& e) { error(e); std::printf("    Please enter it again.\n"); }
                            catch (const std::exception&) { std::printf("  ! InvalidScore: enter a number\n"); }
                        }
                    }
                };
                walk(q["rubric"]);
                std::string notes = ask("  Notes: ");
                std::string act = ask("  Submit as final? [y/N]: ");
                json r = app.saveScore(token, pid, {{"scores", scores}, {"notes", notes}, {"action", act == "y" || act == "Y" ? "submit" : "save"}});
                std::printf("  Saved: status %s, weighted score %.2f\n", s(r, "status").c_str(), r["weighted"].is_number() ? r["weighted"].get<double>() : 0.0);
            } else if (c == 3) {
                printLeaderboard(app, token);
            }
        } catch (const ApiError& e) {
            if (e.code == "EOF") throw;
            error(e);
        }
    }
}

void participantMenu(HackTrack& app, const std::string& token) {
    for (;;) {
        std::printf("\n=== PARTICIPANT MENU ===\n 1. My team              2. Create a team\n 3. Join with invite code 4. Leave team\n"
                    " 5. Edit submission       6. Submit project\n 7. Vote                  8. Results\n 0. Log out\n");
        int c = askInt("Choice: ");
        try {
            if (c == 0) return;
            if (c == 1) {
                json r = app.myTeam(token);
                if (r["team"].is_null()) { std::printf("  You are not in a team yet.\n"); continue; }
                std::printf("  %s  (invite code %s)\n", s(r["team"], "name").c_str(), s(r["team"], "inviteCode").c_str());
                for (const json& m : r["team"]["members"]) std::printf("   - %-22s %s\n", s(m, "name").c_str(), s(m, "role").c_str());
                if (r.contains("project")) std::printf("  Project: %s [%s]\n", s(r["project"], "name").c_str(), s(r["project"], "status").c_str());
            } else if (c == 2) {
                json t = app.createTeam(token, {{"name", ask("  Team name: ")}});
                std::printf("  Created %s. Share invite code %s\n", s(t, "name").c_str(), s(t, "inviteCode").c_str());
            } else if (c == 3) {
                json t = app.joinTeam(token, {{"inviteCode", ask("  Invite code: ")}});
                std::printf("  Joined %s\n", s(t, "name").c_str());
            } else if (c == 4) {
                app.leaveTeam(token);
                std::printf("  You left the team.\n");
            } else if (c == 5) {
                json cur = app.submission(token);
                std::printf("  Deadline: %s%s\n", s(cur, "deadline").c_str(), cur["locked"].get<bool>() ? "  (LOCKED)" : "");
                json p = cur["project"].is_object() ? cur["project"] : json::object();
                auto field = [&](const char* label, const char* key) {
                    std::string v = ask(std::string("  ") + label + " [" + s(p, key) + "]: ");
                    return v.empty() ? s(p, key) : v;
                };
                std::printf("  Tracks:");
                for (const json& t : cur["tracks"]) std::printf(" %s", s(t, "id").c_str());
                std::printf("\n");
                json b = {{"name", field("Project name", "name")}, {"tagline", field("Tagline", "tagline")}, {"description", field("Description", "description")},
                          {"trackId", field("Track id", "trackId")}, {"repo", field("Repository", "repo")}, {"demo", field("Demo link", "demo")},
                          {"stack", p.contains("stack") ? p["stack"] : json::array()}};
                app.saveSubmission(token, b);
                std::printf("  Draft saved.\n");
            } else if (c == 6) {
                json p = app.submitProject(token);
                std::printf("  Submitted %s at %s\n", s(p, "name").c_str(), s(p, "submittedAt").c_str());
            } else if (c == 7) {
                json v = app.voting(token);
                std::printf("  Voting %s - %d vote(s) left\n", v["open"].get<bool>() ? "open" : "closed", v["remaining"].get<int>());
                for (const json& p : v["projects"]) std::printf("   %4d  %s%s\n", p["id"].get<int>(), s(p, "name").c_str(), p["ownTeam"].get<bool>() ? "  (your team)" : "");
                int pid = askInt("  Project id to vote for (0 to skip): ");
                if (pid > 0) { app.castVote(token, pid); std::printf("  Vote recorded.\n"); }
            } else if (c == 8) {
                printLeaderboard(app, token);
            }
        } catch (const ApiError& e) {
            if (e.code == "EOF") throw;
            error(e);
        }
    }
}

}  // namespace

int runConsole(HackTrack& app) {
    std::printf("HackTrack C++ client - console mode (server %s)\n", app.queue().serverAddress().c_str());
    try {
        for (;;) {
            std::printf("\n=== HACKTRACK ===\n 1. Log in   2. Sign up   0. Exit\n");
            int c = askInt("Choice: ");
            if (c == 0) return 0;
            std::string token;
            try {
                json r;
                if (c == 1) r = app.login({{"email", ask("Email: ")}, {"password", ask("Password: ")}});
                else if (c == 2) r = app.signup({{"name", ask("Full name: ")}, {"email", ask("Email: ")}, {"password", ask("Password (6+ chars): ")}});
                else continue;
                token = r["token"].get<std::string>();
                std::printf("Welcome, %s (%s)\n", s(r["user"], "name").c_str(), s(r["user"], "role").c_str());
                std::string role = s(r["user"], "role");
                if (role == "admin") adminMenu(app, token);
                else if (role == "judge") judgeMenu(app, token);
                else participantMenu(app, token);
                app.logout(token);
            } catch (const ApiError& e) {
                if (e.code == "EOF") throw;
                error(e);
            }
        }
    } catch (const ApiError&) {
        return 0;  // stdin closed
    }
}

// ── demo data through the protocol ───────────────────────────

int runDemo(HackTrack& app) {
    std::printf("Populating demo judging through the C++ client...\n");
    try {
        // Deployments give the admin a private password (same variable the server's seed uses).
        const char* envPw = std::getenv("HACKTRACK_ADMIN_PASSWORD");
        std::string adminPw = envPw && *envPw ? envPw : "admin123";
        std::string admin = app.login({{"email", "admin@hacktrack.dev"}, {"password", adminPw}})["token"];
        json a = app.runAssignment(admin, {{"mode", "fill"}});
        std::printf("  Assigned judges: %d new, %d shortages\n", a["created"].get<int>(), (int)a["shortages"].size());

        json users = app.users(admin);
        json rubric = app.bootstrap(admin)["rubric"];
        DynArray<std::string> leaves;
        std::function<void(const json&)> walk = [&](const json& nodes) {
            for (const json& n : nodes) n.contains("children") ? walk(n["children"]) : leaves.push(s(n, "id"));
        };
        walk(rubric);

        int scored = 0;
        for (const json& u : users) {
            if (s(u, "role") != "judge") continue;
            std::string email = s(u, "email");
            std::string pw = email == "judge@hacktrack.dev" ? "judge123" : "hacktrack123";
            std::string tok;
            try { tok = app.login({{"email", email}, {"password", pw}})["token"]; } catch (const ApiError&) { continue; }
            // Each judge has a personal bias; each project a hidden quality.
            unsigned long long jb = hashKey(s(u, "id"));
            double bias = ((double)(jb % 1000) / 1000.0 - 0.5) * 1.6;
            json q = app.judgeQueue(tok);
            int k = 0;
            for (const json& item : q["queue"]) {
                if (s(item, "status") == "submitted") continue;
                int pid = item["projectId"].get<int>();
                unsigned long long ph = hashKey((long long)pid * 7919);
                double quality = 5.8 + (double)(ph % 1000) / 1000.0 * 3.4;
                bool finish = (hashKey(s(u, "id") + std::to_string(pid)) % 100) < 82;
                json scores = json::object();
                for (const std::string& leaf : leaves) {
                    double noise = ((double)(hashKey(leaf + std::to_string(pid) + s(u, "id")) % 1000) / 1000.0 - 0.5) * 1.6;
                    double v = quality + bias + noise;
                    v = v < 2 ? 2 : (v > 10 ? 10 : v);
                    scores[leaf] = (double)(int)(v * 10 + 0.5) / 10.0;
                }
                app.saveScore(tok, pid, {{"scores", scores}, {"notes", "Demo review generated by hacktrack --demo"}, {"confidence", 3 + (int)(ph % 3)},
                                         {"action", finish ? "submit" : "save"}});
                ++scored;
                ++k;
            }
            std::printf("  %-18s scored %d projects\n", s(u, "name").c_str(), k);
            app.logout(tok);
        }
        std::printf("Done: %d reviews submitted through the request queue.\n", scored);
        app.logout(admin);
        return 0;
    } catch (const ApiError& e) {
        std::fprintf(stderr, "Demo failed - %s: %s\n", e.code.c_str(), e.what());
        return 1;
    }
}

}  // namespace ht
