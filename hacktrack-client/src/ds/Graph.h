// Unit 5 — Graphs: undirected graph stored BOTH as an adjacency matrix
// (O(1) "is there a conflict?") and as adjacency lists (O(V + E) traversal).
// ConflictGraph places judges at vertices 0..J-1 and teams at J..J+T-1;
// an edge means the judge must never score that team.
#pragma once
#include <stdexcept>
#include "DynArray.h"
#include "LinkedQueue.h"
#include "LinkedStack.h"
#include "SinglyList.h"

namespace ht {

class Graph {
    int v_ = 0;
    int e_ = 0;
    bool* mat_ = nullptr;          // v_ * v_ adjacency matrix
    SinglyList<int>* adj_ = nullptr;  // v_ adjacency lists

    void check(int u) const { if (u < 0 || u >= v_) throw std::out_of_range("Graph vertex"); }

public:
    explicit Graph(int vertices = 0) { reset(vertices); }
    Graph(const Graph&) = delete;
    Graph& operator=(const Graph&) = delete;
    ~Graph() { delete[] mat_; delete[] adj_; }

    void reset(int vertices) {
        delete[] mat_;
        delete[] adj_;
        v_ = vertices;
        e_ = 0;
        mat_ = v_ ? new bool[(size_t)v_ * v_]() : nullptr;
        adj_ = v_ ? new SinglyList<int>[v_] : nullptr;
    }

    int vertices() const { return v_; }
    int edges() const { return e_; }

    bool addEdge(int u, int w) {
        check(u); check(w);
        if (u == w || mat_[(size_t)u * v_ + w]) return false;
        mat_[(size_t)u * v_ + w] = mat_[(size_t)w * v_ + u] = true;
        adj_[u].pushBack(w);
        adj_[w].pushBack(u);
        ++e_;
        return true;
    }
    bool removeEdge(int u, int w) {
        check(u); check(w);
        if (!mat_[(size_t)u * v_ + w]) return false;
        mat_[(size_t)u * v_ + w] = mat_[(size_t)w * v_ + u] = false;
        adj_[u].removeFirst([w](int x) { return x == w; });
        adj_[w].removeFirst([u](int x) { return x == u; });
        --e_;
        return true;
    }
    /// O(1) via the matrix.
    bool hasEdge(int u, int w) const { check(u); check(w); return mat_[(size_t)u * v_ + w]; }
    const SinglyList<int>& neighbours(int u) const { check(u); return adj_[u]; }
    int degree(int u) const { check(u); return adj_[u].size(); }

    /// Breadth-first order from `start` using a queue — O(V + E).
    DynArray<int> bfs(int start) const {
        check(start);
        DynArray<int> order;
        DynArray<bool> seen(v_, false);
        LinkedQueue<int> q;
        seen[start] = true;
        q.enqueue(start);
        while (!q.empty()) {
            int u = q.dequeue();
            order.push(u);
            for (int w : adj_[u]) if (!seen[w]) { seen[w] = true; q.enqueue(w); }
        }
        return order;
    }
    /// Depth-first order from `start` using an explicit stack — O(V + E).
    DynArray<int> dfs(int start) const {
        check(start);
        DynArray<int> order;
        DynArray<bool> seen(v_, false);
        LinkedStack<int> st;
        st.push(start);
        while (!st.empty()) {
            int u = st.pop();
            if (seen[u]) continue;
            seen[u] = true;
            order.push(u);
            // Push in reverse so the first neighbour is visited first.
            DynArray<int> nb;
            for (int w : adj_[u]) nb.push(w);
            for (int i = nb.size() - 1; i >= 0; --i) if (!seen[nb[i]]) st.push(nb[i]);
        }
        return order;
    }
    /// Label connected components with BFS; returns how many there are.
    int components(DynArray<int>& label) const {
        label = DynArray<int>(v_, -1);
        int c = 0;
        for (int s = 0; s < v_; ++s) {
            if (label[s] != -1) continue;
            DynArray<int> part = bfs(s);
            for (int u : part) label[u] = c;
            ++c;
        }
        return c;
    }
};

class ConflictGraph {
    int judges_, teams_;
    Graph g_;

public:
    ConflictGraph(int judges, int teams) : judges_(judges), teams_(teams), g_(judges + teams) {}

    int judges() const { return judges_; }
    int teams() const { return teams_; }
    int judgeVertex(int j) const { return j; }
    int teamVertex(int t) const { return judges_ + t; }

    bool addConflict(int judgeIdx, int teamIdx) { return g_.addEdge(judgeIdx, judges_ + teamIdx); }
    bool removeConflict(int judgeIdx, int teamIdx) { return g_.removeEdge(judgeIdx, judges_ + teamIdx); }
    /// O(1) adjacency-matrix lookup.
    bool hasConflict(int judgeIdx, int teamIdx) const { return g_.hasEdge(judgeIdx, judges_ + teamIdx); }
    int conflictsOfTeam(int teamIdx) const { return g_.degree(judges_ + teamIdx); }
    int conflictsOfJudge(int judgeIdx) const { return g_.degree(judgeIdx); }
    const Graph& graph() const { return g_; }
};

}  // namespace ht
