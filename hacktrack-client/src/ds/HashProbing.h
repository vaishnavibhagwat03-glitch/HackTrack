// Unit 6 — Hashing: open addressing with linear probing.
// Maps team invite codes to team IDs. Deleted slots become tombstones so
// later probes keep walking past them. Resizes above load factor 0.6.
#pragma once
#include "Hashing.h"

namespace ht {

template <typename K, typename V>
class HashProbing {
    enum State : unsigned char { EMPTY, FULL, DELETED };
    struct Slot { K key; V val; State state = EMPTY; };
    Slot* slots_ = nullptr;
    int cap_ = 0;
    int size_ = 0;
    int used_ = 0;  // FULL + DELETED
    long long lookups_ = 0, probes_ = 0;

    int home(const K& k) const { return (int)(hashKey(k) % (unsigned long long)cap_); }

    void resize(int newCap) {
        Slot* old = slots_;
        int oldCap = cap_;
        slots_ = new Slot[newCap];
        cap_ = newCap;
        size_ = used_ = 0;
        for (int i = 0; i < oldCap; ++i) if (old[i].state == FULL) put(old[i].key, old[i].val);
        delete[] old;
    }
    /// Index of `key`, or -1.
    int locate(const K& key) {
        ++lookups_;
        int i = home(key);
        for (int step = 0; step < cap_; ++step, i = (i + 1) % cap_) {
            ++probes_;
            if (slots_[i].state == EMPTY) return -1;
            if (slots_[i].state == FULL && slots_[i].key == key) return i;
        }
        return -1;
    }

public:
    explicit HashProbing(int capacity = 16) : slots_(new Slot[capacity]), cap_(capacity) {}
    HashProbing(const HashProbing&) = delete;
    HashProbing& operator=(const HashProbing&) = delete;
    ~HashProbing() { delete[] slots_; }

    void put(const K& key, const V& val) {
        if ((used_ + 1) * 10 > cap_ * 6) resize(cap_ * 2);
        int i = home(key), firstTomb = -1;
        for (int step = 0; step < cap_; ++step, i = (i + 1) % cap_) {
            Slot& s = slots_[i];
            if (s.state == FULL && s.key == key) { s.val = val; return; }
            if (s.state == DELETED && firstTomb < 0) firstTomb = i;
            if (s.state == EMPTY) break;
        }
        int at = firstTomb >= 0 ? firstTomb : i;
        if (slots_[at].state == EMPTY) ++used_;
        slots_[at].key = key;
        slots_[at].val = val;
        slots_[at].state = FULL;
        ++size_;
    }
    V* get(const K& key) { int i = locate(key); return i < 0 ? nullptr : &slots_[i].val; }
    bool contains(const K& key) { return locate(key) >= 0; }
    bool remove(const K& key) {
        int i = locate(key);
        if (i < 0) return false;
        slots_[i].state = DELETED;  // tombstone
        --size_;
        return true;
    }

    int size() const { return size_; }
    int capacity() const { return cap_; }
    double loadFactor() const { return cap_ ? (double)size_ / cap_ : 0; }
    double avgProbes() const { return lookups_ ? (double)probes_ / lookups_ : 0; }
    /// 0 = empty, 1 = full, 2 = tombstone (for the inspector).
    int slotState(int i) const { return slots_[i].state; }

    template <typename F>
    void forEach(F f) const { for (int i = 0; i < cap_; ++i) if (slots_[i].state == FULL) f(slots_[i].key, slots_[i].val); }

    void clear() { for (int i = 0; i < cap_; ++i) slots_[i].state = EMPTY; size_ = used_ = 0; }
};

}  // namespace ht
