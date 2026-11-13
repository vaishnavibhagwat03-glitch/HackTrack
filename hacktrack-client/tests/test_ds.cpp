// Unit tests for every hand-written data structure and algorithm.
#include <random>
#include <string>

#include "../src/algo/Search.h"
#include "../src/algo/Sort.h"
#include "../src/ds/BST.h"
#include "../src/ds/CircularList.h"
#include "../src/ds/DynArray.h"
#include "../src/ds/GeneralizedList.h"
#include "../src/ds/Graph.h"
#include "../src/ds/HashChaining.h"
#include "../src/ds/HashProbing.h"
#include "../src/ds/LinkedQueue.h"
#include "../src/ds/LinkedStack.h"
#include "../src/ds/MaxHeap.h"
#include "../src/ds/SinglyList.h"
#include "../src/ds/SparseMatrix.h"
#include "TestFramework.h"

using namespace ht;

// ── Unit 1: arrays ───────────────────────────────────────────

TEST("DynArray: push, grow, insertAt, removeAt, copy") {
    DynArray<int> a;
    for (int i = 0; i < 100; ++i) a.push(i);
    CHECK_EQ(a.size(), 100);
    CHECK(a.capacity() >= 100);
    a.insertAt(0, -1);
    CHECK_EQ(a[0], -1);
    CHECK_EQ(a[1], 0);
    a.removeAt(0);
    CHECK_EQ(a[0], 0);
    DynArray<int> b = a;
    b[0] = 42;
    CHECK_EQ(a[0], 0);  // deep copy
    CHECK_THROWS(a[100]);
    a.pop();
    CHECK_EQ(a.back(), 98);
}

TEST("SparseMatrix: set/get/overwrite, column averages, fast transpose") {
    SparseMatrix m(4, 5);
    m.set(2, 3, 7.0);
    m.set(0, 3, 9.0);
    m.set(1, 0, 4.0);
    m.set(2, 3, 8.0);  // overwrite, not duplicate
    CHECK_EQ(m.nonZero(), 3);
    double v = 0;
    CHECK(m.get(2, 3, v) && v == 8.0);
    CHECK(!m.get(3, 3, v));
    int c = 0;
    CHECK_NEAR(m.colAverage(3, c), 8.5, 1e-9);
    CHECK_EQ(c, 2);
    // triplets stay sorted by (row, col)
    CHECK_EQ(m.triplets()[0].row, 0);
    CHECK_EQ(m.triplets()[2].row, 2);
    SparseMatrix t = m.transpose();
    CHECK_EQ(t.rows(), 5);
    CHECK(t.get(3, 2, v) && v == 8.0);
    CHECK(t.get(0, 1, v) && v == 4.0);
    CHECK(m.erase(1, 0));
    CHECK_EQ(m.nonZero(), 2);
    CHECK_THROWS(m.set(9, 0, 1.0));
}

TEST("Sorts: all four agree with each other on random data") {
    std::mt19937 rng(7);
    for (int n : {0, 1, 2, 17, 500}) {
        DynArray<int> base(n);
        for (int i = 0; i < n; ++i) base[i] = (int)(rng() % 100);
        auto less = [](int a, int b) { return a < b; };
        DynArray<int> a = base, b = base, c = base, d = base;
        bubbleSort(a, less);
        insertionSort(b, less);
        mergeSort(c, less);
        quickSort(d, less);
        bool sorted = true;
        for (int i = 1; i < n; ++i) if (a[i - 1] > a[i]) sorted = false;
        CHECK(sorted);
        bool same = true;
        for (int i = 0; i < n; ++i) if (a[i] != b[i] || a[i] != c[i] || a[i] != d[i]) same = false;
        CHECK(same);
    }
}

TEST("Sorts: comparison counts follow theory") {
    const int n = 1000;
    std::mt19937 rng(1);
    DynArray<int> base(n);
    for (int i = 0; i < n; ++i) base[i] = (int)rng();
    auto less = [](int a, int b) { return a < b; };
    DynArray<int> a = base, b = base, c = base;
    long long bubble = bubbleSort(a, less), ins = insertionSort(b, less), merge = mergeSort(c, less);
    CHECK(bubble > n * (n - 1) / 2 * 9 / 10);  // ~n^2/2
    CHECK(ins > n * n / 4 * 8 / 10 && ins < n * n / 4 * 12 / 10);  // ~n^2/4
    CHECK(merge < 10 * n);  // ~n log2 n = 9966
    // Already-sorted input: bubble and insertion finish in one pass.
    CHECK_EQ(bubbleSort(a, less), n - 1);
    CHECK_EQ(insertionSort(a, less), n - 1);
}

TEST("Merge sort is stable") {
    struct P { int key; int order; };
    DynArray<P> v;
    for (int i = 0; i < 50; ++i) v.push(P{i % 5, i});
    mergeSort(v, [](const P& a, const P& b) { return a.key < b.key; });
    bool stable = true;
    for (int i = 1; i < v.size(); ++i) if (v[i - 1].key == v[i].key && v[i - 1].order > v[i].order) stable = false;
    CHECK(stable);
}

TEST("Linear and binary search") {
    DynArray<int> v;
    for (int i = 0; i < 1024; ++i) v.push(i * 2);
    long long c = 0;
    CHECK_EQ(linearSearch(v.raw(), v.size(), [](int x) { return x == 200; }, c), 100);
    CHECK_EQ(c, 101);
    auto cmp = [](int key) { return [key](int x) { return x < key ? -1 : (x > key ? 1 : 0); }; };
    CHECK_EQ(binarySearch(v.raw(), v.size(), cmp(200), c), 100);
    CHECK(c <= 11);  // log2(1024) + 1
    CHECK_EQ(binarySearch(v.raw(), v.size(), cmp(201), c), -1);
    CHECK_EQ(binarySearch(v.raw(), 0, cmp(1), c), -1);
}

// ── Unit 2: linked lists ─────────────────────────────────────

TEST("SinglyList: push both ends, find, remove, reverse, copy") {
    SinglyList<std::string> l;
    l.pushBack("b");
    l.pushBack("c");
    l.pushFront("a");
    CHECK_EQ(l.size(), 3);
    CHECK(l.find([](const std::string& s) { return s == "c"; }) != nullptr);
    CHECK(l.removeFirst([](const std::string& s) { return s == "c"; }));  // removes tail
    l.pushBack("d");  // tail pointer must still be valid
    std::string joined;
    for (auto& s : l) joined += s;
    CHECK_EQ(joined, std::string("abd"));
    SinglyList<std::string> copy = l;
    l.reverse();
    joined.clear();
    l.forEach([&](const std::string& s) { joined += s; });
    CHECK_EQ(joined, std::string("dba"));
    CHECK_EQ(copy.front(), std::string("a"));
    CHECK_EQ(l.popFront(), std::string("d"));
    CHECK(!l.removeFirst([](const std::string& s) { return s == "zz"; }));
}

TEST("CircularList: wraps around, removes head/tail/only node") {
    CircularList<int> c;
    for (int i = 1; i <= 4; ++i) c.insert(i);
    CNode<int>* p = c.head();
    int seen[8];
    for (int i = 0; i < 8; ++i, p = p->next) seen[i] = p->data;
    CHECK_EQ(seen[4], 1);  // wrapped
    CHECK_EQ(seen[7], 4);
    c.rotate();
    CHECK_EQ(c.head()->data, 2);
    CHECK(c.remove([](int x) { return x == 2; }));  // head
    CHECK_EQ(c.head()->data, 3);
    CHECK(c.remove([](int x) { return x == 1; }));  // tail
    c.insert(9);
    int sum = 0;
    c.forEach([&](int x) { sum += x; });
    CHECK_EQ(sum, 3 + 4 + 9);
    CircularList<int> one;
    one.insert(5);
    CHECK(one.remove([](int x) { return x == 5; }));
    CHECK(one.empty() && one.head() == nullptr);
}

TEST("GeneralizedList: rubric depth, leaves and weighted score") {
    GeneralizedList g;
    GNode* inno = g.addGroup(nullptr, "Innovation", 50);
    g.addAtom(inno, Criterion{"orig", "Originality", 1, 10});
    g.addAtom(inno, Criterion{"fit", "Problem fit", 1, 10});
    g.addAtom(nullptr, Criterion{"impact", "Impact", 50, 10});
    CHECK_EQ(g.depth(), 2);
    CHECK_EQ(g.atomCount(), 3);
    double wsum = 0;
    g.forEachLeaf([&](const Criterion&, double w) { wsum += w; });
    CHECK_NEAR(wsum, 1.0, 1e-9);
    // orig=10 (w .25), fit=6 (w .25), impact=8 (w .5) -> 2.5 + 1.5 + 4 = 8
    auto all = [](const std::string& id, double& v) { v = id == "orig" ? 10 : id == "fit" ? 6 : 8; return true; };
    CHECK_NEAR(g.weightedScore(all), 8.0, 1e-9);
    // impact unscored -> re-weighted over the scored half: (10 + 6) / 2 = 8
    auto partial = [](const std::string& id, double& v) { if (id == "impact") return false; v = id == "orig" ? 10 : 6; return true; };
    CHECK_NEAR(g.weightedScore(partial), 8.0, 1e-9);
}

// ── Unit 3: stack & queue ────────────────────────────────────

TEST("LinkedStack: LIFO and bounded history") {
    LinkedStack<int> s(3);
    for (int i = 1; i <= 5; ++i) s.push(i);
    CHECK_EQ(s.size(), 3);  // 1 and 2 dropped
    CHECK_EQ(s.pop(), 5);
    CHECK_EQ(s.pop(), 4);
    CHECK_EQ(s.pop(), 3);
    CHECK(s.empty());
    CHECK_THROWS(s.pop());
}

TEST("LinkedQueue: FIFO and rear reset") {
    LinkedQueue<int> q;
    q.enqueue(1);
    q.enqueue(2);
    CHECK_EQ(q.dequeue(), 1);
    CHECK_EQ(q.dequeue(), 2);
    q.enqueue(3);  // rear must have been reset
    CHECK_EQ(q.front(), 3);
    CHECK_EQ(q.size(), 1);
    q.dequeue();
    CHECK_THROWS(q.dequeue());
}

// ── Unit 4: trees ────────────────────────────────────────────

TEST("BST: insert, find with comparisons, delete all three cases") {
    BST<int, std::string> t;
    int keys[] = {50, 30, 70, 20, 40, 60, 80, 35};
    for (int k : keys) t.insert(k, "p" + std::to_string(k));
    CHECK_EQ(t.size(), 8);
    CHECK_EQ(t.height(), 4);
    long long comps = 0;
    CHECK(t.find(35, &comps) && comps == 4);
    CHECK(t.find(99) == nullptr);
    t.insert(35, "updated");
    CHECK_EQ(*t.find(35), std::string("updated"));
    CHECK(t.remove(20));  // leaf
    CHECK(t.remove(40));  // one child
    CHECK(t.remove(50));  // two children (root)
    CHECK(!t.remove(50));
    CHECK_EQ(t.size(), 5);
    int prev = -1;
    bool inorder = true;
    t.forEachInOrder([&](int k, const std::string&) { if (k < prev) inorder = false; prev = k; });
    CHECK(inorder);
}

TEST("MaxHeap: extracting repeatedly gives descending order") {
    auto less = [](double a, double b) { return a < b; };
    MaxHeap<double, decltype(less)> h(less);
    double xs[] = {3.5, 9.1, 1.0, 7.7, 9.1, 4.2};
    for (double x : xs) h.push(x);
    CHECK_EQ(h.top(), 9.1);
    double last = 1e9;
    bool desc = true;
    while (!h.empty()) { double v = h.pop(); if (v > last) desc = false; last = v; }
    CHECK(desc);
    DynArray<double> items;
    for (double x : xs) items.push(x);
    h.build(items);
    CHECK_EQ(h.size(), 6);
    // heap property on the array
    bool ok = true;
    for (int i = 1; i < h.size(); ++i) if (h.array()[(i - 1) / 2] < h.array()[i]) ok = false;
    CHECK(ok);
    CHECK_EQ(h.pop(), 9.1);
}

// ── Unit 5: graphs ───────────────────────────────────────────

TEST("Graph: matrix + lists stay consistent; BFS, DFS, components") {
    Graph g(6);
    CHECK(g.addEdge(0, 1));
    CHECK(g.addEdge(0, 2));
    CHECK(g.addEdge(1, 3));
    CHECK(!g.addEdge(1, 0));  // duplicate
    CHECK(g.addEdge(4, 5));
    CHECK_EQ(g.edges(), 4);
    CHECK(g.hasEdge(3, 1));
    DynArray<int> b = g.bfs(0);
    CHECK_EQ(b.size(), 4);
    CHECK_EQ(b[0], 0);
    CHECK_EQ(b[1], 1);
    CHECK_EQ(b[2], 2);
    CHECK_EQ(b[3], 3);
    DynArray<int> d = g.dfs(0);
    CHECK_EQ(d[1], 1);
    CHECK_EQ(d[2], 3);  // goes deep before visiting 2
    DynArray<int> label;
    CHECK_EQ(g.components(label), 2);
    CHECK_EQ(label[5], label[4]);
    CHECK(g.removeEdge(0, 1));
    CHECK(!g.hasEdge(1, 0));
    CHECK_EQ(g.degree(0), 1);
    CHECK_EQ(g.components(label), 3);
}

TEST("ConflictGraph: judge/team vertices are separate") {
    ConflictGraph cg(3, 4);
    cg.addConflict(0, 0);
    cg.addConflict(2, 0);
    CHECK(cg.hasConflict(0, 0));
    CHECK(!cg.hasConflict(1, 0));
    CHECK(!cg.hasConflict(0, 1));
    CHECK_EQ(cg.conflictsOfTeam(0), 2);
    CHECK_EQ(cg.graph().vertices(), 7);
}

// ── Unit 6: hashing ──────────────────────────────────────────

TEST("HashChaining: put/get/overwrite/remove and rehash") {
    HashChaining<std::string, int> h(4);
    for (int i = 0; i < 200; ++i) h.put("user" + std::to_string(i), i);
    CHECK_EQ(h.size(), 200);
    CHECK(h.capacity() >= 256);  // grew past load 0.75
    CHECK(h.loadFactor() <= 0.75);
    CHECK_EQ(*h.get("user123"), 123);
    h.put("user123", -1);
    CHECK_EQ(*h.get("user123"), -1);
    CHECK_EQ(h.size(), 200);
    CHECK(h.remove("user123"));
    CHECK(!h.contains("user123"));
    CHECK(!h.remove("nobody"));
    int count = 0;
    h.forEach([&](const std::string&, int) { ++count; });
    CHECK_EQ(count, 199);
    HashChaining<int, int> byId;
    for (int i = 0; i < 1000; ++i) byId.put(i, i * i);
    CHECK_EQ(*byId.get(999), 999 * 999);
    CHECK(byId.avgProbes() < 3);
}

TEST("HashProbing: tombstones keep probe chains intact") {
    HashProbing<std::string, int> h(8);
    for (int i = 0; i < 50; ++i) h.put("CODE" + std::to_string(i), i);
    CHECK_EQ(h.size(), 50);
    CHECK(h.loadFactor() <= 0.6);
    CHECK(h.remove("CODE10"));
    CHECK(!h.contains("CODE10"));
    for (int i = 0; i < 50; ++i) if (i != 10) CHECK(h.get("CODE" + std::to_string(i)) && *h.get("CODE" + std::to_string(i)) == i);
    h.put("CODE10", 99);  // reuses the tombstone
    CHECK_EQ(*h.get("CODE10"), 99);
    CHECK_EQ(h.size(), 50);
}

int main() { return httest::runAll(); }
