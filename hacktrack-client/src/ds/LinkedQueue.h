// Unit 3 — Queue: linked-list FIFO queue with front and rear pointers.
// Every outgoing request is enqueued and sent in order. O(1) per op.
#pragma once
#include <stdexcept>
#include <utility>

namespace ht {

template <typename T>
class LinkedQueue {
    struct Node { T data; Node* next; };
    Node* front_ = nullptr;
    Node* rear_ = nullptr;
    int size_ = 0;

public:
    LinkedQueue() = default;
    LinkedQueue(const LinkedQueue&) = delete;
    LinkedQueue& operator=(const LinkedQueue&) = delete;
    ~LinkedQueue() { clear(); }

    void enqueue(const T& v) {
        Node* n = new Node{v, nullptr};
        if (rear_) rear_->next = n; else front_ = n;
        rear_ = n;
        ++size_;
    }
    T dequeue() {
        if (!front_) throw std::out_of_range("LinkedQueue::dequeue on empty");
        Node* n = front_;
        T v = std::move(n->data);
        front_ = n->next;
        if (!front_) rear_ = nullptr;
        delete n;
        --size_;
        return v;
    }
    T& front() { if (!front_) throw std::out_of_range("LinkedQueue::front on empty"); return front_->data; }
    bool empty() const { return !front_; }
    int size() const { return size_; }

    /// Front to rear.
    template <typename F>
    void forEach(F f) const { for (Node* p = front_; p; p = p->next) f(p->data); }

    void clear() { while (front_) { Node* n = front_->next; delete front_; front_ = n; } rear_ = nullptr; size_ = 0; }
};

}  // namespace ht
