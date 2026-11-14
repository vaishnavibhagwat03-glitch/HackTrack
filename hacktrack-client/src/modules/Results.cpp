// Results (sparse matrix + max-heap), community voting, certificates, analytics.
#include <cstdio>
#include <random>

#include "../algo/Sort.h"
#include "../core/Clock.h"
#include "HackTrack.h"

namespace ht {

RankingResult HackTrack::computeRanking(const std::string& token, bool byNormalized) {
    json rows = call("GET", "/v1/scores", nullptr, token, "Load submitted scores");
    DynArray<Assignment> submitted;
    for (const json& r : rows) submitted.push(assignmentFrom(r));
    RankingResult r = rankProjects(projects_, judges_, submitted, rubric_, byNormalized);

    // Keep a picture of the structures for the inspector.
    lastHeap_ = json::array();
    for (const RankRow& x : r.heapArray) lastHeap_.push_back({{"projectId", x.projectId}, {"name", x.name}, {"key", byNormalized ? x.normalized : x.average}});
    json trip = json::array();
    const DynArray<Triplet>& t = r.matrix.triplets();
    for (int i = 0; i < t.size() && i < 60; ++i) trip.push_back({t[i].row, t[i].col, t[i].value});
    long long cells = (long long)r.matrix.rows() * r.matrix.cols();
    lastMatrix_ = {{"rows", r.matrix.rows()}, {"cols", r.matrix.cols()}, {"nonZero", r.matrix.nonZero()},
                   {"density", cells ? (double)r.matrix.nonZero() / cells : 0.0}, {"denseBytes", cells * (long long)sizeof(double)},
                   {"sparseBytes", (long long)r.matrix.nonZero() * (long long)sizeof(Triplet)}, {"triplets", trip}};
    trace_.ds("SparseMatrix", "set x" + std::to_string(r.matrix.nonZero()), std::to_string(r.matrix.rows()) + "x" + std::to_string(r.matrix.cols()) + " judge x project");
    trace_.ds("MaxHeap<RankRow>", "build + extract x" + std::to_string(r.heapOps), "leaderboard of " + std::to_string(r.rows.size()) + " projects");
    return r;
}

static DynArray<Vote> votesFrom(const json& rows) {
    DynArray<Vote> v;
    for (const json& r : rows) v.push(voteFrom(r));
    return v;
}

json HackTrack::prizesFor(const RankingResult& r, const DynArray<VoteRow>& votes) const {
    json out = json::array();
    int grandWinner = r.rows.empty() ? 0 : r.rows[0].projectId;
    for (const json& p : prizes_) {
        std::string id = jstr(p, "id"), track = jstr(p, "trackId");
        int winner = 0;
        double score = 0;
        if (id == "people") {
            if (!votes.empty()) { winner = votes[0].projectId; score = votes[0].votes; }
        } else if (track.empty()) {
            winner = grandWinner;
            if (!r.rows.empty()) score = r.rows[0].average;
        } else {
            for (const RankRow& row : r.rows)  // best in track, excluding the grand prize winner
                if (row.trackId == track && row.projectId != grandWinner) { winner = row.projectId; score = row.average; break; }
        }
        json j = p;
        if (winner) {
            const Project* pr = projectCache_.get(winner);
            const Team* t = pr ? teamById(pr->teamId) : nullptr;
            j["winner"] = {{"projectId", winner}, {"name", pr ? pr->name : ""}, {"teamName", t ? t->name : ""}, {"teamId", pr ? pr->teamId : ""}, {"score", score}};
        } else {
            j["winner"] = nullptr;
        }
        out.push_back(j);
    }
    return out;
}

json HackTrack::results(const std::string& token, const std::string& by) {
    Session s = requireSession(token);
    refresh(token);
    bool staff = s.user.role == "admin";
    if (!staff && !event_.resultsPublished)
        return {{"published", false}, {"resultsAt", event_.resultsAt}, {"ranking", json::array()}, {"prizes", json::array()}};

    bool byNorm = by == "normalized";
    RankingResult r = computeRanking(token, byNorm);
    DynArray<VoteRow> votes = tallyVotes(votesFrom(call("GET", "/v1/votes", nullptr, token, "Load votes for tally")));

    HashChaining<int, int> voteCount;
    for (const VoteRow& v : votes) voteCount.put(v.projectId, v.votes);
    json ranking = json::array();
    for (const RankRow& row : r.rows) {
        const Project* p = projectCache_.get(row.projectId);
        const int* vc = voteCount.get(row.projectId);
        json j = {{"rank", row.rank}, {"projectId", row.projectId}, {"average", row.average}, {"normalized", row.normalized},
                  {"judges", row.count}, {"votes", vc ? *vc : 0}};
        if (p) j["project"] = projectSummary(*p);
        ranking.push_back(j);
    }
    json tally = json::array();
    for (const VoteRow& v : votes) {
        const Project* p = projectCache_.get(v.projectId);
        tally.push_back({{"rank", v.rank}, {"projectId", v.projectId}, {"votes", v.votes}, {"name", p ? p->name : ""}});
    }
    return {{"published", event_.resultsPublished}, {"preview", staff && !event_.resultsPublished}, {"by", byNorm ? "normalized" : "average"},
            {"ranking", ranking}, {"prizes", prizesFor(r, votes)}, {"votes", tally},
            {"algorithm", {{"structure", "SparseMatrix -> MaxHeap"}, {"scored", r.matrix.nonZero()}, {"extracted", r.heapOps}}}};
}

json HackTrack::voting(const std::string& token) {
    Session s = requireSession(token);
    refresh(token);
    json mine = call("GET", "/v1/votes/mine", nullptr, token, "Load my votes");
    DynArray<Project> list;
    for (const Project& p : projects_) if (p.status == "submitted") list.push(p);
    // Fisher-Yates shuffle with a per-voter seed: every voter sees a different,
    // but stable, order so no project benefits from always being listed first.
    std::mt19937 rng((unsigned)hashKey(s.user.id));
    for (int i = list.size() - 1; i > 0; --i) {
        int j = (int)(rng() % (unsigned)(i + 1));
        Project tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
    }
    json projects = json::array();
    for (const Project& p : list) {
        json j = projectSummary(p);
        j["ownTeam"] = !s.user.teamId.empty() && p.teamId == s.user.teamId;
        projects.push_back(j);
    }
    int used = (int)mine.size();
    json out = {{"open", event_.votingOpen}, {"votesPerUser", event_.votesPerUser}, {"remaining", std::max(0, event_.votesPerUser - used)},
                {"myVotes", mine}, {"projects", projects}, {"order", "Fisher-Yates shuffle seeded by your user id"}};
    if (s.user.role == "admin" || event_.resultsPublished) {
        DynArray<Vote> all = votesFrom(call("GET", "/v1/votes", nullptr, token, "Load votes for tally"));
        DynArray<VoteRow> rows = tallyVotes(all);
        json tally = json::array();
        for (const VoteRow& v : rows) {
            const Project* p = projectCache_.get(v.projectId);
            tally.push_back({{"rank", v.rank}, {"projectId", v.projectId}, {"votes", v.votes}, {"name", p ? p->name : ""}});
        }
        // Votes per hour (0-23 UTC) for the integrity monitor.
        DynArray<int> hours(24, 0);
        HashChaining<std::string, int> perVoter;
        for (const Vote& v : all) {
            if (v.createdAt.size() >= 13) hours[std::atoi(v.createdAt.substr(11, 2).c_str()) % 24]++;
            int* c = perVoter.get(v.userId);
            if (c) ++*c; else perVoter.put(v.userId, 1);
        }
        json h = json::array();
        for (int x : hours) h.push_back(x);
        out["tally"] = tally;
        out["totalVotes"] = all.size();
        out["voters"] = perVoter.size();
        out["byHour"] = h;
    }
    return out;
}

json HackTrack::castVote(const std::string& token, int projectId) {
    Session s = requireSession(token);
    refresh(token);
    if (!event_.votingOpen) throw ApiError(422, "VotingClosed", "Voting is closed");
    const Project* p = projectCache_.get(projectId);
    if (p && !s.user.teamId.empty() && p->teamId == s.user.teamId) throw ApiError(422, "OwnProject", "You cannot vote for your own team");
    json b = {{"projectId", projectId}};
    return call("POST", "/v1/votes", &b, token, "Cast vote");
}

json HackTrack::withdrawVote(const std::string& token, int projectId) {
    requireSession(token);
    return call("DELETE", "/v1/votes/" + std::to_string(projectId), nullptr, token, "Withdraw vote");
}

json HackTrack::certificates(const std::string& token) {
    Session s = requireSession(token);
    refresh(token);
    bool staff = s.user.role == "admin";
    json certs = json::array();
    auto certId = [&](const std::string& salt) {
        char buf[20];
        std::snprintf(buf, sizeof buf, "HT-%012llX", hashKey(s.user.id + "|" + salt) & 0xFFFFFFFFFFFFULL);
        return std::string(buf);
    };
    if (!event_.resultsPublished && !staff) return {{"available", false}, {"resultsAt", event_.resultsAt}, {"certificates", certs}};

    if (s.user.role == "participant" && !s.user.teamId.empty()) {
        const Team* t = teamById(s.user.teamId);
        const Project* p = t && t->projectId ? projectById(t->projectId) : nullptr;
        if (p && p->status == "submitted") {
            RankingResult r = computeRanking(token, false);
            DynArray<VoteRow> votes = tallyVotes(votesFrom(call("GET", "/v1/votes", nullptr, token, "Load votes for tally")));
            int rank = 0;
            for (const RankRow& row : r.rows) if (row.projectId == p->id) { rank = row.rank; break; }
            for (const json& pr : prizesFor(r, votes))
                if (pr["winner"].is_object() && pr["winner"]["projectId"] == p->id)
                    certs.push_back({{"id", certId(jstr(pr, "id"))}, {"type", "winner"}, {"title", jstr(pr, "name")}, {"recipient", s.user.name},
                                     {"project", p->name}, {"team", t->name}, {"rank", rank}, {"amount", jstr(pr, "amount")}});
            certs.push_back({{"id", certId("participation")}, {"type", "participation"}, {"title", "Certificate of Participation"},
                             {"recipient", s.user.name}, {"project", p->name}, {"team", t->name}, {"rank", rank}, {"of", r.rows.size()}});
        }
    } else if (s.user.role == "judge") {
        DynArray<Assignment> mine = fetchAssignments(token, "Load my reviews");
        int done = 0;
        for (const Assignment& a : mine) if (a.status == "submitted") ++done;
        if (done) certs.push_back({{"id", certId("judge")}, {"type", "judge"}, {"title", "Certificate of Appreciation"}, {"recipient", s.user.name},
                                   {"reviews", done}});
    } else if (staff) {
        RankingResult r = computeRanking(token, false);
        DynArray<VoteRow> votes = tallyVotes(votesFrom(call("GET", "/v1/votes", nullptr, token, "Load votes for tally")));
        for (const json& pr : prizesFor(r, votes)) {
            if (!pr["winner"].is_object()) continue;
            certs.push_back({{"id", certId(jstr(pr, "id"))}, {"type", "winner"}, {"title", jstr(pr, "name")},
                             {"recipient", pr["winner"]["teamName"]}, {"project", pr["winner"]["name"]}, {"amount", jstr(pr, "amount")}});
        }
    }
    return {{"available", true}, {"event", event_.name}, {"issuedAt", event_.resultsAt}, {"certificates", certs}};
}

json HackTrack::analytics(const std::string& token) {
    requireRole(token, "admin");
    refresh(token);
    DynArray<Assignment> all = fetchAssignments(token, "Load assignments for analytics");
    DynArray<Vote> votes = votesFrom(call("GET", "/v1/votes", nullptr, token, "Load votes for analytics"));

    int submitted = 0, drafts = 0, members = 0;
    for (const Project& p : projects_) (p.status == "submitted" ? submitted : drafts)++;
    for (const Team& t : teams_) members += t.members.size();

    // Submission timeline: sort submission times (merge sort), then bucket every 6 h.
    DynArray<std::string> times;
    for (const Project& p : projects_) if (!p.submittedAt.empty()) times.push(p.submittedAt);
    long long comps = mergeSort(times, [](const std::string& a, const std::string& b) { return a < b; });
    json timeline = json::array();
    if (!times.empty()) {
        int total = 0, k = 0;
        // Parse event start as hours since epoch (ISO string, UTC).
        auto hoursOf = [](const std::string& iso) {
            std::tm t{};
            std::sscanf(iso.c_str(), "%d-%d-%dT%d:%d", &t.tm_year, &t.tm_mon, &t.tm_mday, &t.tm_hour, &t.tm_min);
            long long y = t.tm_year, m = t.tm_mon;
            if (m <= 2) { y--; m += 12; }
            long long days = 365 * y + y / 4 - y / 100 + y / 400 + (153 * (m - 3) + 2) / 5 + t.tm_mday;
            return days * 24 + t.tm_hour;
        };
        long long h0 = hoursOf(event_.startsAt);
        long long last = hoursOf(times.back());
        for (long long b = h0 + 6; b <= last + 6; b += 6) {
            while (k < times.size() && hoursOf(times[k]) < b) { ++total; ++k; }
            timeline.push_back({{"label", "+" + std::to_string(b - h0) + "h"}, {"value", total}});
        }
    }

    HashChaining<std::string, int> byTrack;
    for (const Project& p : projects_) {
        if (p.status != "submitted") continue;
        int* c = byTrack.get(p.trackId);
        if (c) ++*c; else byTrack.put(p.trackId, 1);
    }
    json tracks = json::array();
    for (const json& t : tracks_) {
        const int* c = byTrack.get(jstr(t, "id"));
        tracks.push_back({{"id", jstr(t, "id")}, {"name", jstr(t, "name")}, {"value", c ? *c : 0}});
    }

    int done = 0, progress = 0, notStarted = 0, flagged = 0;
    DynArray<int> hist(10, 0);
    for (const Assignment& a : all) {
        if (a.status == "submitted") {
            ++done;
            int b = (int)weightedScore(a, rubric_);
            hist[b < 0 ? 0 : (b > 9 ? 9 : b)]++;
        } else if (a.status == "in_progress") ++progress;
        else if (a.status == "flagged") ++flagged;
        else ++notStarted;
    }
    json histogram = json::array();
    for (int i = 0; i < 10; ++i) histogram.push_back({{"label", std::to_string(i) + "-" + std::to_string(i + 1)}, {"value", hist[i]}});

    DynArray<int> hours(24, 0);
    for (const Vote& v : votes) if (v.createdAt.size() >= 13) hours[std::atoi(v.createdAt.substr(11, 2).c_str()) % 24]++;
    json byHour = json::array();
    for (int i = 0; i < 24; ++i) byHour.push_back({{"label", (i < 10 ? "0" : "") + std::to_string(i) + ":00"}, {"value", hours[i]}});

    return {{"counts", {{"teams", teams_.size()}, {"participants", members}, {"submitted", submitted}, {"drafts", drafts},
                        {"judges", judges_.size()}, {"assignments", all.size()}, {"votes", votes.size()}}},
            {"judging", {{"submitted", done}, {"inProgress", progress}, {"notStarted", notStarted}, {"flagged", flagged}}},
            {"timeline", timeline}, {"timelineSortComparisons", comps}, {"tracks", tracks}, {"scoreHistogram", histogram}, {"votesByHour", byHour}};
}

}  // namespace ht
