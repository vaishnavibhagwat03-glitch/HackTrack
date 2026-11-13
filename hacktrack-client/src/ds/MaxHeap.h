// Unit 4 — Trees: array-backed binary max-heap.
// Average scores go in; extracting the max repeatedly yields the leaderboard
// in O(n log n). push/pop O(log n), top O(1), build from n items O(n).
#pragma once
#include <stdexcept>
#include <utility>
#include "DynArray.h"

namespace ht {

/// Less(a, b) must return true when a ranks strictly below b.
template <typename T, typename Less>
class MaxHeap {
    DynArray<T> a_;
    Less less_;

    void siftUp(int i) {
        while (i > 0) {
            int p = (i - 1) / 2;
            if (!less_(a_[p], a_[i])) break;
            std::swap(a_[p], a_[i]);
            i = p;
        }
    }
    void siftDown(int i) {
        int n = a_.size();
        for (;;) {
            int l = 2 * i + 1, r = l + 1, big = i;
            if (l < n && less_(a_[big], a_[l])) big = l;
            if (r < n && less_(a_[big], a_[r])) big = r;
            if (big == i) return;
            std::swap(a_[i], a_[big]);
            i = big;
        }
    }

public:
    explicit MaxHeap(Less less = Less()) : less_(less) {}

    void push(const T& v) { a_.push(v); siftUp(a_.size() - 1); }
    T pop() {
        if (a_.empty()) throw std::out_of_range("MaxHeap::pop on empty");
        T top = a_[0];
        a_[0] = a_.back();
        a_.pop();
        if (!a_.empty()) siftDown(0);
        return top;
    }
    const T& top() const { if (a_.empty()) throw std::out_of_range("MaxHeap::top on empty"); return a_[0]; }

    /// Bottom-up heapify (Floyd) — O(n).
    void build(const DynArray<T>& items) {
        a_ = items;
        for (int i = a_.size() / 2 - 1; i >= 0; --i) siftDown(i);
    }

    int size() const { return a_.size(); }
    bool empty() const { return a_.empty(); }
    /// Level-order view of the underlying array (for the inspector).
    const DynArray<T>& array() const { return a_; }
    void clear() { a_.clear(); }
};

}  // namespace ht
