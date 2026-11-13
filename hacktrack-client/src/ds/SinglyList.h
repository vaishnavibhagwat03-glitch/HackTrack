// Unit 2 — Linked lists: singly linked list with head and tail pointers.
// Used for team members (insert O(1) at either end) and as the bucket chains
// and adjacency lists of other structures.
#pragma once
#include <stdexcept>
#include <utility>

namespace ht {

template <typename T>
struct SNode {
    T data;
    SNode* next;
};

template <typename T>
class SinglyList {
    SNode<T>* head_ = nullptr;
    SNode<T>* tail_ = nullptr;
    int size_ = 0;

public:
    SinglyList() = default;
    SinglyList(const SinglyList& o) { for (SNode<T>* p = o.head_; p; p = p->next) pushBack(p->data); }
    SinglyList(SinglyList&& o) noexcept : head_(o.head_), tail_(o.tail_), size_(o.size_) { o.head_ = o.tail_ = nullptr; o.size_ = 0; }
    SinglyList& operator=(const SinglyList& o) {
        if (this != &o) { SinglyList tmp(o); swap(tmp); }
        return *this;
    }
    SinglyList& operator=(SinglyList&& o) noexcept {
        if (this != &o) { clear(); swap(o); }
        return *this;
    }
    ~SinglyList() { clear(); }

    void swap(SinglyList& o) noexcept { std::swap(head_, o.head_); std::swap(tail_, o.tail_); std::swap(size_, o.size_); }

    void pushFront(const T& v) {
        head_ = new SNode<T>{v, head_};
        if (!tail_) tail_ = head_;
        ++size_;
    }
    void pushBack(const T& v) {
        SNode<T>* n = new SNode<T>{v, nullptr};
        if (tail_) tail_->next = n; else head_ = n;
        tail_ = n;
        ++size_;
    }
    T popFront() {
        if (!head_) throw std::out_of_range("SinglyList::popFront on empty");
        SNode<T>* n = head_;
        T v = std::move(n->data);
        head_ = n->next;
        if (!head_) tail_ = nullptr;
        delete n;
        --size_;
        return v;
    }
    /// Unlink the first node matching pred — O(n).
    template <typename Pred>
    bool removeFirst(Pred pred) {
        SNode<T>* prev = nullptr;
        for (SNode<T>* p = head_; p; prev = p, p = p->next) {
            if (!pred(p->data)) continue;
            if (prev) prev->next = p->next; else head_ = p->next;
            if (p == tail_) tail_ = prev;
            delete p;
            --size_;
            return true;
        }
        return false;
    }
    template <typename Pred>
    T* find(Pred pred) {
        for (SNode<T>* p = head_; p; p = p->next) if (pred(p->data)) return &p->data;
        return nullptr;
    }
    template <typename Pred>
    const T* find(Pred pred) const {
        for (SNode<T>* p = head_; p; p = p->next) if (pred(p->data)) return &p->data;
        return nullptr;
    }
    template <typename F>
    void forEach(F f) const { for (SNode<T>* p = head_; p; p = p->next) f(p->data); }

    /// In-place reversal by pointer flipping — O(n).
    void reverse() {
        SNode<T>* prev = nullptr;
        tail_ = head_;
        while (head_) { SNode<T>* nx = head_->next; head_->next = prev; prev = head_; head_ = nx; }
        head_ = prev;
    }

    void clear() {
        while (head_) { SNode<T>* n = head_->next; delete head_; head_ = n; }
        tail_ = nullptr;
        size_ = 0;
    }

    SNode<T>* head() const { return head_; }
    T& front() { if (!head_) throw std::out_of_range("SinglyList::front"); return head_->data; }
    int size() const { return size_; }
    bool empty() const { return size_ == 0; }

    struct It {
        SNode<T>* p;
        T& operator*() const { return p->data; }
        It& operator++() { p = p->next; return *this; }
        bool operator!=(const It& o) const { return p != o.p; }
    };
    It begin() const { return It{head_}; }
    It end() const { return It{nullptr}; }
};

}  // namespace ht
