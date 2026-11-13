// Unit 6 — Hashing: separate chaining. Each bucket is a linked chain.
// Caches users, projects and the session token. O(1) average lookup; the
// table doubles when the load factor passes 0.75.
#pragma once
#include <utility>
#include "Hashing.h"

namespace ht {

template <typename K, typename V>
class HashChaining {
    struct Node { K key; V val; Node* next; };
    Node** buckets_ = nullptr;
    int cap_ = 0;
    int size_ = 0;
    long long lookups_ = 0, probes_ = 0;  // chain nodes visited, for stats

    int index(const K& k, int cap) const { return (int)(hashKey(k) % (unsigned long long)cap); }

    void rehash(int newCap) {
        Node** nb = new Node*[newCap]();
        for (int i = 0; i < cap_; ++i) {
            Node* n = buckets_[i];
            while (n) {
                Node* nx = n->next;
                int j = index(n->key, newCap);
                n->next = nb[j];
                nb[j] = n;
                n = nx;
            }
        }
        delete[] buckets_;
        buckets_ = nb;
        cap_ = newCap;
    }

public:
    explicit HashChaining(int capacity = 16) : buckets_(new Node*[capacity]()), cap_(capacity) {}
    HashChaining(const HashChaining&) = delete;
    HashChaining& operator=(const HashChaining&) = delete;
    ~HashChaining() { clear(); delete[] buckets_; }

    /// Insert or overwrite.
    void put(const K& key, const V& val) {
        int i = index(key, cap_);
        for (Node* n = buckets_[i]; n; n = n->next) if (n->key == key) { n->val = val; return; }
        buckets_[i] = new Node{key, val, buckets_[i]};  // insert at chain head, O(1)
        ++size_;
        if (size_ * 4 > cap_ * 3) rehash(cap_ * 2);
    }
    V* get(const K& key) {
        ++lookups_;
        for (Node* n = buckets_[index(key, cap_)]; n; n = n->next) { ++probes_; if (n->key == key) return &n->val; }
        return nullptr;
    }
    const V* get(const K& key) const { return const_cast<HashChaining*>(this)->get(key); }
    bool contains(const K& key) const { return get(key) != nullptr; }
    bool remove(const K& key) {
        Node** link = &buckets_[index(key, cap_)];
        while (*link) {
            if ((*link)->key == key) { Node* d = *link; *link = d->next; delete d; --size_; return true; }
            link = &(*link)->next;
        }
        return false;
    }

    int size() const { return size_; }
    int capacity() const { return cap_; }
    double loadFactor() const { return cap_ ? (double)size_ / cap_ : 0; }
    int chainLength(int b) const { int c = 0; for (Node* n = buckets_[b]; n; n = n->next) ++c; return c; }
    double avgProbes() const { return lookups_ ? (double)probes_ / lookups_ : 0; }

    template <typename F>
    void forEach(F f) const { for (int i = 0; i < cap_; ++i) for (Node* n = buckets_[i]; n; n = n->next) f(n->key, n->val); }

    void clear() {
        for (int i = 0; i < cap_; ++i) { Node* n = buckets_[i]; while (n) { Node* nx = n->next; delete n; n = nx; } buckets_[i] = nullptr; }
        size_ = 0;
    }
};

}  // namespace ht
