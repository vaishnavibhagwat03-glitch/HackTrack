#include "Ranking.h"

#include <cmath>

#include "../ds/MaxHeap.h"

namespace ht {

double weightedScore(const Assignment& a, const GeneralizedList& rubric) {
    return rubric.weightedScore([&](const std::string& id, double& v) { return a.score(id, v); });
}

namespace {

struct RankLess {
    bool byNormalized;
    bool operator()(const RankRow& a, const RankRow& b) const {
        double ka = byNormalized ? a.normalized : a.average, kb = byNormalized ? b.normalized : b.average;
        if (std::fabs(ka - kb) > 1e-9) return ka < kb;
        if (a.count != b.count) return a.count < b.count;  // more reviews ranks higher on a tie
        return a.projectId > b.projectId;                  // then lower id first (stable, deterministic)
    }
};

struct Stats { double mean = 0, sd = 0; int n = 0; };

}  // namespace

RankingResult rankProjects(const DynArray<Project>& projects, const DynArray<Judge>& judges,
                           const DynArray<Assignment>& submitted, const GeneralizedList& rubric, bool byNormalized) {
    RankingResult res;
    HashChaining<int, int> projIdx;
    HashChaining<std::string, int> judgeIdx;
    for (int i = 0; i < projects.size(); ++i) projIdx.put(projects[i].id, i);
    for (int i = 0; i < judges.size(); ++i) judgeIdx.put(judges[i].id, i);

    // 1. Sparse matrix of weighted scores.
    res.matrix = SparseMatrix(judges.size(), projects.size());
    for (const Assignment& a : submitted) {
        const int* p = projIdx.get(a.projectId);
        const int* j = judgeIdx.get(a.judgeId);
        if (!p || !j) continue;
        res.matrix.set(*j, *p, weightedScore(a, rubric));
    }
    const DynArray<Triplet>& t = res.matrix.triplets();

    // 2. Per-judge (row) and global statistics for z-score normalization.
    DynArray<Stats> row(judges.size(), Stats{});
    Stats global;
    for (const Triplet& x : t) { row[x.row].mean += x.value; row[x.row].n++; global.mean += x.value; global.n++; }
    for (Stats& s : row) if (s.n) s.mean /= s.n;
    if (global.n) global.mean /= global.n;
    for (const Triplet& x : t) {
        row[x.row].sd += (x.value - row[x.row].mean) * (x.value - row[x.row].mean);
        global.sd += (x.value - global.mean) * (x.value - global.mean);
    }
    for (Stats& s : row) if (s.n) s.sd = std::sqrt(s.sd / s.n);
    if (global.n) global.sd = std::sqrt(global.sd / global.n);

    DynArray<double> normSum(projects.size(), 0.0);
    for (const Triplet& x : t) {
        const Stats& s = row[x.row];
        double n = (s.n < 2 || s.sd == 0) ? x.value : global.mean + (x.value - s.mean) / s.sd * global.sd;
        normSum[x.col] += n < 0 ? 0 : (n > 10 ? 10 : n);
    }

    // 3. Column averages -> max-heap (bottom-up build, O(n)).
    DynArray<double> sums;
    DynArray<int> counts;
    res.matrix.colTotals(sums, counts);
    DynArray<RankRow> items;
    for (int c = 0; c < projects.size(); ++c) {
        if (!counts[c]) continue;
        const Project& p = projects[c];
        items.push(RankRow{p.id, p.name, p.trackId, p.teamId, sums[c] / counts[c], normSum[c] / counts[c], counts[c], 0});
    }
    MaxHeap<RankRow, RankLess> heap(RankLess{byNormalized});
    heap.build(items);
    res.heapArray = heap.array();

    // 4. Extract max repeatedly; equal scores share a rank (1, 2, 2, 4).
    while (!heap.empty()) {
        RankRow r = heap.pop();
        ++res.heapOps;
        int pos = res.rows.size() + 1;
        if (!res.rows.empty()) {
            const RankRow& prev = res.rows.back();
            double kp = byNormalized ? prev.normalized : prev.average, kr = byNormalized ? r.normalized : r.average;
            r.rank = std::fabs(kp - kr) < 1e-9 ? prev.rank : pos;
        } else {
            r.rank = 1;
        }
        res.rows.push(r);
    }
    return res;
}

DynArray<VoteRow> tallyVotes(const DynArray<Vote>& votes) {
    HashChaining<int, int> counts;
    DynArray<int> order;  // first-seen order of project ids
    for (const Vote& v : votes) {
        int* c = counts.get(v.projectId);
        if (c) ++*c;
        else { counts.put(v.projectId, 1); order.push(v.projectId); }
    }
    auto less = [](const VoteRow& a, const VoteRow& b) { return a.votes != b.votes ? a.votes < b.votes : a.projectId > b.projectId; };
    MaxHeap<VoteRow, decltype(less)> heap(less);
    for (int id : order) heap.push(VoteRow{id, *counts.get(id), 0});
    DynArray<VoteRow> out;
    while (!heap.empty()) {
        VoteRow r = heap.pop();
        r.rank = (!out.empty() && out.back().votes == r.votes) ? out.back().rank : out.size() + 1;
        out.push(r);
    }
    return out;
}

}  // namespace ht
