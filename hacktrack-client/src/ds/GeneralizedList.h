// Unit 2 — Linked lists: generalized list.
// The judging rubric is a list whose elements are either atoms (a scored
// criterion) or sub-lists (a criterion group with its own sub-criteria):
//   ( Innovation( Originality, ProblemFit ), Execution( ... ), Impact, Design( ... ) )
#pragma once
#include <string>

namespace ht {

struct Criterion {
    std::string id;
    std::string name;
    double weight = 0;   // relative weight inside its parent
    double maxScore = 10;
};

struct GNode {
    bool isList = false;
    Criterion atom;      // valid when !isList
    std::string label;   // group name when isList
    double weight = 0;   // group weight when isList
    GNode* down = nullptr;  // first child when isList
    GNode* next = nullptr;  // next sibling
};

class GeneralizedList {
    GNode* head_ = nullptr;

    static void destroy(GNode* n) {
        while (n) { GNode* nx = n->next; if (n->isList) destroy(n->down); delete n; n = nx; }
    }
    static GNode* append(GNode*& first, GNode* n) {
        if (!first) { first = n; return n; }
        GNode* p = first;
        while (p->next) p = p->next;
        p->next = n;
        return n;
    }
    static int depthOf(const GNode* n) {
        int best = 0;
        for (; n; n = n->next) if (n->isList) { int d = depthOf(n->down); if (d > best) best = d; }
        return best + 1;
    }
    template <typename F>
    static void walk(const GNode* n, double scale, F& f) {
        double total = 0;
        for (const GNode* p = n; p; p = p->next) total += p->isList ? p->weight : p->atom.weight;
        for (; n; n = n->next) {
            double w = n->isList ? n->weight : n->atom.weight;
            double eff = total > 0 ? scale * w / total : 0;
            if (n->isList) walk(n->down, eff, f); else f(n->atom, eff);
        }
    }

public:
    GeneralizedList() = default;
    GeneralizedList(const GeneralizedList&) = delete;
    GeneralizedList& operator=(const GeneralizedList&) = delete;
    GeneralizedList(GeneralizedList&& o) noexcept : head_(o.head_) { o.head_ = nullptr; }
    GeneralizedList& operator=(GeneralizedList&& o) noexcept { if (this != &o) { destroy(head_); head_ = o.head_; o.head_ = nullptr; } return *this; }
    ~GeneralizedList() { destroy(head_); }

    const GNode* head() const { return head_; }

    /// Add an atom to the top level (parent == nullptr) or under a group.
    GNode* addAtom(GNode* parent, const Criterion& c) {
        GNode* n = new GNode{};
        n->atom = c;
        return append(parent ? parent->down : head_, n);
    }
    /// Add a sub-list (criterion group).
    GNode* addGroup(GNode* parent, const std::string& label, double weight) {
        GNode* n = new GNode{};
        n->isList = true;
        n->label = label;
        n->weight = weight;
        return append(parent ? parent->down : head_, n);
    }

    int depth() const { return head_ ? depthOf(head_) : 0; }
    int atomCount() const { int c = 0; forEachLeaf([&](const Criterion&, double) { ++c; }); return c; }

    /// Visit every leaf criterion with its effective weight (fraction of 1.0).
    template <typename F>
    void forEachLeaf(F f) const { walk(head_, 1.0, f); }

    /// Weighted score on a 0..10 scale. `lookup(id, out)` returns false when a
    /// criterion is unscored; unscored criteria are left out and the rest re-weighted.
    template <typename Lookup>
    double weightedScore(Lookup lookup) const {
        double total = 0, weight = 0;
        forEachLeaf([&](const Criterion& c, double w) {
            double v;
            if (!lookup(c.id, v)) return;
            total += (v / c.maxScore) * 10.0 * w;
            weight += w;
        });
        return weight > 0 ? total / weight : 0.0;
    }

    void clear() { destroy(head_); head_ = nullptr; }
};

}  // namespace ht
