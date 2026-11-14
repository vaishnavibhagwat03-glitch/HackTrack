// Offline tests for judge assignment, ranking and vote tally (no server needed).
#include "../src/algo/Assignment.h"
#include "../src/algo/Ranking.h"
#include "TestFramework.h"

using namespace ht;

namespace {
void ring(CircularList<JudgeRef>& c, int n) {
    for (int i = 0; i < n; ++i) c.insert(JudgeRef{i, "J" + std::to_string(i)});
}
DynArray<ProjectRef> projects(int n) {
    DynArray<ProjectRef> p;
    for (int i = 0; i < n; ++i) p.push(ProjectRef{100 + i, i, "P" + std::to_string(i), 0});
    return p;
}
}  // namespace

TEST("Table 3: assign judges with conflicts - no judge gets a conflicting team") {
    CircularList<JudgeRef> judges;
    ring(judges, 5);
    ConflictGraph g(5, 8);
    g.addConflict(0, 0); g.addConflict(1, 0); g.addConflict(2, 3); g.addConflict(4, 7); g.addConflict(3, 5);
    DynArray<AssignedPair> out;
    DynArray<Shortage> sh;
    AssignStats st;
    bool ok = assignJudges(judges, g, projects(8), 3, out, sh, nullptr, &st);
    CHECK(ok);
    CHECK_EQ(out.size(), 24);
    CHECK(st.conflictsAvoided > 0);
    for (const AssignedPair& a : out) CHECK(!g.hasConflict(a.judgeId[1] - '0', a.projectId - 100));
    // No judge twice on the same project.
    for (int i = 0; i < out.size(); ++i)
        for (int j = i + 1; j < out.size(); ++j)
            CHECK(!(out[i].projectId == out[j].projectId && out[i].judgeId == out[j].judgeId));
}

TEST("Round robin spreads load evenly") {
    CircularList<JudgeRef> judges;
    ring(judges, 4);
    ConflictGraph g(4, 10);
    DynArray<AssignedPair> out;
    DynArray<Shortage> sh;
    assignJudges(judges, g, projects(10), 2, out, sh);
    int load[4] = {0, 0, 0, 0};
    for (const AssignedPair& a : out) load[a.judgeId[1] - '0']++;
    for (int l : load) CHECK_EQ(l, 5);  // 20 assignments / 4 judges
    // Pointer was left where it stopped: the next run continues the rotation.
    CHECK_EQ(judges.head()->data.id, std::string("J0"));
}

TEST("Table 3: team conflicts with every judge - shortage reported, no infinite loop") {
    CircularList<JudgeRef> judges;
    ring(judges, 3);
    ConflictGraph g(3, 2);
    for (int j = 0; j < 3; ++j) g.addConflict(j, 1);  // team 1 conflicts with everyone
    DynArray<AssignedPair> out;
    DynArray<Shortage> sh;
    bool ok = assignJudges(judges, g, projects(2), 2, out, sh);
    CHECK(!ok);
    CHECK_EQ(sh.size(), 1);
    CHECK_EQ(sh[0].projectId, 101);
    CHECK_EQ(sh[0].assigned, 0);
    CHECK_EQ(out.size(), 2);  // project 0 still fully staffed
}

TEST("Fill mode skips judges already on a project") {
    CircularList<JudgeRef> judges;
    ring(judges, 3);
    ConflictGraph g(3, 1);
    DynArray<ProjectRef> p = projects(1);
    p[0].already = 1;
    HashChaining<std::string, bool> existing;
    existing.put(pairKey("J0", 100), true);
    DynArray<AssignedPair> out;
    DynArray<Shortage> sh;
    CHECK(assignJudges(judges, g, p, 3, out, sh, &existing));
    CHECK_EQ(out.size(), 2);
    for (const AssignedPair& a : out) CHECK(a.judgeId != "J0");
}

TEST("Ranking: sparse matrix averages, max-heap order, shared ranks") {
    GeneralizedList rubric;
    rubric.addAtom(nullptr, Criterion{"a", "A", 1, 10});
    DynArray<Project> ps;
    for (int i = 1; i <= 4; ++i) { Project p; p.id = i; p.name = "P" + std::to_string(i); ps.push(p); }
    DynArray<Judge> js;
    for (int i = 0; i < 2; ++i) { Judge j; j.id = "J" + std::to_string(i); js.push(j); }
    auto score = [](const char* judge, int pid, double v) {
        Assignment a; a.judgeId = judge; a.projectId = pid; a.status = "submitted"; a.scores.push(ScoreEntry{"a", v}); return a;
    };
    DynArray<Assignment> sub;
    sub.push(score("J0", 1, 6)); sub.push(score("J1", 1, 8));  // avg 7
    sub.push(score("J0", 2, 9)); sub.push(score("J1", 2, 9));  // avg 9
    sub.push(score("J0", 3, 7));                               // avg 7 (one judge)
    RankingResult r = rankProjects(ps, js, sub, rubric, false);
    CHECK_EQ(r.rows.size(), 3);  // project 4 unscored
    CHECK_EQ(r.rows[0].projectId, 2);
    CHECK_EQ(r.rows[0].rank, 1);
    CHECK_EQ(r.rows[1].projectId, 1);  // tie on 7: more judges first
    CHECK_EQ(r.rows[1].rank, 2);
    CHECK_EQ(r.rows[2].rank, 2);       // shared rank
    CHECK_EQ(r.matrix.nonZero(), 5);
    CHECK_NEAR(r.rows[1].average, 7.0, 1e-9);
}

TEST("Normalization removes a harsh judge's bias") {
    GeneralizedList rubric;
    rubric.addAtom(nullptr, Criterion{"a", "A", 1, 10});
    DynArray<Project> ps;
    for (int i = 1; i <= 2; ++i) { Project p; p.id = i; ps.push(p); }
    DynArray<Judge> js;
    for (int i = 0; i < 2; ++i) { Judge j; j.id = "J" + std::to_string(i); js.push(j); }
    auto score = [](const char* judge, int pid, double v) {
        Assignment a; a.judgeId = judge; a.projectId = pid; a.scores.push(ScoreEntry{"a", v}); return a;
    };
    DynArray<Assignment> sub;
    sub.push(score("J0", 1, 4)); sub.push(score("J0", 2, 6));   // harsh
    sub.push(score("J1", 1, 8)); sub.push(score("J1", 2, 10));  // generous
    RankingResult r = rankProjects(ps, js, sub, rubric, true);
    CHECK_EQ(r.rows[0].projectId, 2);
    CHECK(r.rows[0].normalized > r.rows[1].normalized);
}

TEST("Vote tally: hash-table counts ranked by max-heap") {
    DynArray<Vote> v;
    int ids[] = {5, 7, 5, 9, 7, 5};
    for (int id : ids) v.push(Vote{"u", id, ""});
    DynArray<VoteRow> t = tallyVotes(v);
    CHECK_EQ(t.size(), 3);
    CHECK_EQ(t[0].projectId, 5);
    CHECK_EQ(t[0].votes, 3);
    CHECK_EQ(t[1].projectId, 7);
    CHECK_EQ(t[2].rank, 3);
}

TEST("Weighted score walks the generalized-list rubric") {
    GeneralizedList g;
    GNode* grp = g.addGroup(nullptr, "Design", 1);
    g.addAtom(grp, Criterion{"ux", "UX", 3, 10});
    g.addAtom(grp, Criterion{"vis", "Visual", 1, 5});  // out of 5
    Assignment a;
    a.scores.push(ScoreEntry{"ux", 8});
    a.scores.push(ScoreEntry{"vis", 5});
    // 8/10*10*0.75 + 5/5*10*0.25 = 6 + 2.5
    CHECK_NEAR(weightedScore(a, g), 8.5, 1e-9);
}

int main() { return httest::runAll(); }
