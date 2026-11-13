// Unit 2 — Linked lists: circular singly linked list.
// Judges sit in a ring; the assignment pointer walks it so work is handed
// out round-robin and no judge is favoured. Only a tail pointer is kept:
// tail->next is the head, so append and access-head are both O(1).
#pragma once
#include <utility>

namespace ht {

template <typename T>
struct CNode {
    T data;
    CNode* next;
};

template <typename T>
class CircularList {
    CNode<T>* tail_ = nullptr;
    int size_ = 0;

public:
    CircularList() = default;
    CircularList(const CircularList&) = delete;
    CircularList& operator=(const CircularList&) = delete;
    CircularList(CircularList&& o) noexcept : tail_(o.tail_), size_(o.size_) { o.tail_ = nullptr; o.size_ = 0; }
    ~CircularList() { clear(); }

    CNode<T>* head() const { return tail_ ? tail_->next : nullptr; }
    int size() const { return size_; }
    bool empty() const { return size_ == 0; }

    /// Append after the tail — O(1).
    CNode<T>* insert(const T& v) {
        CNode<T>* n = new CNode<T>{v, nullptr};
        if (!tail_) { n->next = n; tail_ = n; }
        else { n->next = tail_->next; tail_->next = n; tail_ = n; }
        ++size_;
        return n;
    }
    /// Remove the first matching node — O(n).
    template <typename Pred>
    bool remove(Pred pred) {
        if (!tail_) return false;
        CNode<T>* prev = tail_;
        CNode<T>* cur = tail_->next;
        for (int i = 0; i < size_; ++i, prev = cur, cur = cur->next) {
            if (!pred(cur->data)) continue;
            if (cur == prev) tail_ = nullptr;  // only node
            else { prev->next = cur->next; if (cur == tail_) tail_ = prev; }
            delete cur;
            --size_;
            return true;
        }
        return false;
    }
    /// Move the head forward by one — O(1). Next round starts with the next judge.
    void rotate() { if (tail_) tail_ = tail_->next; }
    /// Make `node` the head (it must belong to this list) — O(n).
    void setHead(CNode<T>* node) {
        if (!tail_ || !node) return;
        while (tail_->next != node) tail_ = tail_->next;
    }

    template <typename F>
    void forEach(F f) const {
        CNode<T>* p = head();
        for (int i = 0; i < size_; ++i, p = p->next) f(p->data);
    }

    void clear() {
        if (!tail_) return;
        CNode<T>* p = tail_->next;
        tail_->next = nullptr;  // break the ring
        while (p) { CNode<T>* n = p->next; delete p; p = n; }
        tail_ = nullptr;
        size_ = 0;
    }
};

}  // namespace ht
