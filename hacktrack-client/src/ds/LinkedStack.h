// Unit 3 — Stack: linked-list stack. HackTrack pushes the *reverse* request of
// every successful admin change here; Undo pops and sends it. O(1) per op.
#pragma once
#include <stdexcept>
#include <utility>

namespace ht {

template <typename T>
class LinkedStack {
    struct Node { T data; Node* next; };
    Node* top_ = nullptr;
    int size_ = 0;
    int limit_;  // oldest entries are dropped beyond this (0 = unbounded)

    void dropBottom() {
        if (!top_) return;
        if (!top_->next) { delete top_; top_ = nullptr; --size_; return; }
        Node* p = top_;
        while (p->next->next) p = p->next;
        delete p->next;
        p->next = nullptr;
        --size_;
    }

public:
    explicit LinkedStack(int limit = 0) : limit_(limit) {}
    LinkedStack(const LinkedStack&) = delete;
    LinkedStack& operator=(const LinkedStack&) = delete;
    ~LinkedStack() { clear(); }

    void push(const T& v) {
        top_ = new Node{v, top_};
        ++size_;
        if (limit_ && size_ > limit_) dropBottom();
    }
    T pop() {
        if (!top_) throw std::out_of_range("LinkedStack::pop on empty");
        Node* n = top_;
        T v = std::move(n->data);
        top_ = n->next;
        delete n;
        --size_;
        return v;
    }
    const T& peek() const { if (!top_) throw std::out_of_range("LinkedStack::peek on empty"); return top_->data; }
    bool empty() const { return !top_; }
    int size() const { return size_; }

    /// Top to bottom.
    template <typename F>
    void forEach(F f) const { for (Node* p = top_; p; p = p->next) f(p->data); }

    void clear() { while (top_) { Node* n = top_->next; delete top_; top_ = n; } size_ = 0; }
};

}  // namespace ht
