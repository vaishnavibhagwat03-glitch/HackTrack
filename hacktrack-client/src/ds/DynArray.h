// Unit 1 — Arrays: a growable array written from scratch (no std::vector).
// Access O(1), push amortised O(1), insert/remove at position O(n).
#pragma once
#include <stdexcept>
#include <utility>

namespace ht {

template <typename T>
class DynArray {
    T* data_ = nullptr;
    int size_ = 0;
    int cap_ = 0;

    void grow(int newCap) {
        T* nd = new T[newCap];
        for (int i = 0; i < size_; ++i) nd[i] = std::move(data_[i]);
        delete[] data_;
        data_ = nd;
        cap_ = newCap;
    }

public:
    DynArray() = default;
    explicit DynArray(int n, const T& fill = T()) : data_(n ? new T[n] : nullptr), size_(n), cap_(n) {
        for (int i = 0; i < n; ++i) data_[i] = fill;
    }
    DynArray(const DynArray& o) : data_(o.cap_ ? new T[o.cap_] : nullptr), size_(o.size_), cap_(o.cap_) {
        for (int i = 0; i < size_; ++i) data_[i] = o.data_[i];
    }
    DynArray(DynArray&& o) noexcept : data_(o.data_), size_(o.size_), cap_(o.cap_) {
        o.data_ = nullptr; o.size_ = o.cap_ = 0;
    }
    DynArray& operator=(const DynArray& o) {
        if (this != &o) { DynArray tmp(o); swap(tmp); }
        return *this;
    }
    DynArray& operator=(DynArray&& o) noexcept {
        if (this != &o) { delete[] data_; data_ = o.data_; size_ = o.size_; cap_ = o.cap_; o.data_ = nullptr; o.size_ = o.cap_ = 0; }
        return *this;
    }
    ~DynArray() { delete[] data_; }

    void swap(DynArray& o) noexcept {
        std::swap(data_, o.data_); std::swap(size_, o.size_); std::swap(cap_, o.cap_);
    }

    void reserve(int n) { if (n > cap_) grow(n); }
    void push(const T& v) { if (size_ == cap_) grow(cap_ ? cap_ * 2 : 4); data_[size_++] = v; }
    void push(T&& v) { if (size_ == cap_) grow(cap_ ? cap_ * 2 : 4); data_[size_++] = std::move(v); }
    void pop() { if (!size_) throw std::out_of_range("DynArray::pop on empty"); --size_; data_[size_] = T(); }

    /// Shift right and insert — O(n).
    void insertAt(int i, const T& v) {
        if (i < 0 || i > size_) throw std::out_of_range("DynArray::insertAt");
        if (size_ == cap_) grow(cap_ ? cap_ * 2 : 4);
        for (int k = size_; k > i; --k) data_[k] = std::move(data_[k - 1]);
        data_[i] = v;
        ++size_;
    }
    /// Shift left over the removed slot — O(n).
    void removeAt(int i) {
        if (i < 0 || i >= size_) throw std::out_of_range("DynArray::removeAt");
        for (int k = i; k < size_ - 1; ++k) data_[k] = std::move(data_[k + 1]);
        --size_;
        data_[size_] = T();
    }
    void clear() { for (int i = 0; i < size_; ++i) data_[i] = T(); size_ = 0; }

    T& operator[](int i) { if (i < 0 || i >= size_) throw std::out_of_range("DynArray index"); return data_[i]; }
    const T& operator[](int i) const { if (i < 0 || i >= size_) throw std::out_of_range("DynArray index"); return data_[i]; }
    T& back() { return (*this)[size_ - 1]; }

    int size() const { return size_; }
    int capacity() const { return cap_; }
    bool empty() const { return size_ == 0; }
    T* raw() { return data_; }
    const T* raw() const { return data_; }

    T* begin() { return data_; }
    T* end() { return data_ + size_; }
    const T* begin() const { return data_; }
    const T* end() const { return data_ + size_; }
};

}  // namespace ht
