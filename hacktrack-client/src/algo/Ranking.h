// Report Section 3.2 — ranking. Weighted scores go into a sparse
// judge x project matrix; each project's average is pushed onto a max-heap;
// popping repeatedly gives the leaderboard in O(n log n).
#pragma once
#include <string>

#include "../core/Models.h"
#include "../ds/DynArray.h"
#include "../ds/GeneralizedList.h"
#include "../ds/HashChaining.h"
#include "../ds/SparseMatrix.h"

namespace ht {

struct RankRow {
    int projectId = 0;
    std::string name, trackId, teamId;
    double average = 0;     // mean of judges' weighted scores (0..10)
    double normalized = 0;  // mean after per-judge z-score normalization
    int count = 0;          // number of judges who scored it
    int rank = 0;
};

struct RankingResult {
    DynArray<RankRow> rows;        // leaderboard, best first
    DynArray<RankRow> heapArray;   // the heap's array right after building (level order)
    SparseMatrix matrix;           // judge x project weighted scores
    long long heapOps = 0;
};

/// `byNormalized` ranks on the bias-corrected score instead of the plain average.
RankingResult rankProjects(const DynArray<Project>& projects, const DynArray<Judge>& judges,
                           const DynArray<Assignment>& submitted, const GeneralizedList& rubric, bool byNormalized);

/// Weighted 0..10 score of one assignment through the rubric's generalized list.
double weightedScore(const Assignment& a, const GeneralizedList& rubric);

struct VoteRow {
    int projectId = 0;
    int votes = 0;
    int rank = 0;
};

/// Count votes per project in a hash table, then rank with a max-heap.
DynArray<VoteRow> tallyVotes(const DynArray<Vote>& votes);

}  // namespace ht
