// Report Section 3.1 — conflict-free round-robin judge assignment.
// Judges sit in a circular linked list; conflicts live in a graph whose
// adjacency matrix answers "does judge j conflict with team t?" in O(1).
// Worst case O(P x J).
#pragma once
#include <string>

#include "../ds/CircularList.h"
#include "../ds/DynArray.h"
#include "../ds/Graph.h"
#include "../ds/HashChaining.h"

namespace ht {

struct JudgeRef {
    int idx = 0;       // vertex in the conflict graph
    std::string id;    // "JUDGE_014"
};

struct ProjectRef {
    int id = 0;
    int teamIdx = 0;   // team vertex index in the conflict graph
    std::string name;
    int already = 0;   // judges already on this project (kept from before)
};

struct AssignedPair {
    std::string judgeId;
    int projectId = 0;
};

struct Shortage {
    int projectId = 0;
    std::string name;
    int needed = 0;
    int assigned = 0;
};

struct AssignStats {
    long long conflictChecks = 0;   // O(1) matrix lookups
    long long conflictsAvoided = 0;
    long long rotations = 0;        // pointer moves around the ring
};

/// Listing 1, extended: projects that cannot be fully staffed are recorded
/// as shortages (instead of aborting), and judges already on a project
/// (`existing` holds "judgeId:projectId") are skipped. The ring pointer is
/// left where it stopped so the next run continues fairly.
/// Returns true when every project got `perProject` judges.
bool assignJudges(CircularList<JudgeRef>& judges, const ConflictGraph& g, const DynArray<ProjectRef>& projects,
                  int perProject, DynArray<AssignedPair>& out, DynArray<Shortage>& shortages,
                  HashChaining<std::string, bool>* existing = nullptr, AssignStats* stats = nullptr);

inline std::string pairKey(const std::string& judgeId, int projectId) { return judgeId + ":" + std::to_string(projectId); }

}  // namespace ht
