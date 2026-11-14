#include "Assignment.h"

namespace ht {

bool assignJudges(CircularList<JudgeRef>& judges, const ConflictGraph& g, const DynArray<ProjectRef>& projects,
                  int perProject, DynArray<AssignedPair>& out, DynArray<Shortage>& shortages,
                  HashChaining<std::string, bool>* existing, AssignStats* stats) {
    AssignStats local;
    AssignStats& st = stats ? *stats : local;
    if (judges.empty()) {
        for (const ProjectRef& p : projects)
            if (p.already < perProject) shortages.push(Shortage{p.id, p.name, perProject, p.already});
        return projects.empty();
    }

    CNode<JudgeRef>* ptr = judges.head();
    for (int p = 0; p < projects.size(); ++p) {
        const ProjectRef& proj = projects[p];
        int assigned = proj.already;
        int tried = 0;
        while (assigned < perProject) {
            if (tried == judges.size()) {  // every judge tried once: shortage, not an infinite loop
                shortages.push(Shortage{proj.id, proj.name, perProject, assigned});
                break;
            }
            bool taken = existing && existing->contains(pairKey(ptr->data.id, proj.id));
            if (!taken) {
                ++st.conflictChecks;
                if (!g.hasConflict(ptr->data.idx, proj.teamIdx)) {
                    out.push(AssignedPair{ptr->data.id, proj.id});
                    ++assigned;
                } else {
                    ++st.conflictsAvoided;
                }
            }
            ptr = ptr->next;  // rotate
            ++st.rotations;
            ++tried;
        }
    }
    judges.setHead(ptr);  // next run starts with the next judge in the ring
    return shortages.empty();
}

}  // namespace ht
