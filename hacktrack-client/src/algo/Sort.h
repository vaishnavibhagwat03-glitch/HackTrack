// Unit 1 — Sorting. Every sort takes a strict-weak "less" and returns the
// number of element comparisons it made, so the benchmark can check theory.
#pragma once
#include <utility>
#include "../ds/DynArray.h"

namespace ht {

/// O(n^2). Stops early when a pass makes no swap.
template <typename T, typename Less>
long long bubbleSort(T* a, int n, Less less) {
    long long comps = 0;
    for (int pass = 0; pass < n - 1; ++pass) {
        bool swapped = false;
        for (int j = 0; j < n - 1 - pass; ++j) {
            ++comps;
            if (less(a[j + 1], a[j])) { std::swap(a[j], a[j + 1]); swapped = true; }
        }
        if (!swapped) break;
    }
    return comps;
}

/// O(n^2) worst, O(n) on sorted input. Stable.
template <typename T, typename Less>
long long insertionSort(T* a, int n, Less less) {
    long long comps = 0;
    for (int i = 1; i < n; ++i) {
        T key = std::move(a[i]);
        int j = i - 1;
        while (j >= 0) {
            ++comps;
            if (!less(key, a[j])) break;
            a[j + 1] = std::move(a[j]);
            --j;
        }
        a[j + 1] = std::move(key);
    }
    return comps;
}

namespace detail {
template <typename T, typename Less>
void mergeRec(T* a, T* tmp, int lo, int hi, Less& less, long long& comps) {
    if (hi - lo < 1) return;
    int mid = lo + (hi - lo) / 2;
    mergeRec(a, tmp, lo, mid, less, comps);
    mergeRec(a, tmp, mid + 1, hi, less, comps);
    int i = lo, j = mid + 1, k = lo;
    while (i <= mid && j <= hi) {
        ++comps;
        if (less(a[j], a[i])) tmp[k++] = a[j++]; else tmp[k++] = a[i++];  // ties take the left: stable
    }
    while (i <= mid) tmp[k++] = a[i++];
    while (j <= hi) tmp[k++] = a[j++];
    for (k = lo; k <= hi; ++k) a[k] = std::move(tmp[k]);
}

template <typename T, typename Less>
void quickRec(T* a, int lo, int hi, Less& less, long long& comps) {
    while (lo < hi) {
        // Median-of-three pivot guards against sorted input.
        int mid = lo + (hi - lo) / 2;
        ++comps; if (less(a[mid], a[lo])) std::swap(a[mid], a[lo]);
        ++comps; if (less(a[hi], a[lo])) std::swap(a[hi], a[lo]);
        ++comps; if (less(a[hi], a[mid])) std::swap(a[hi], a[mid]);
        T pivot = a[mid];
        int i = lo, j = hi;
        while (i <= j) {  // Hoare-style partition
            while (++comps, less(a[i], pivot)) ++i;
            while (++comps, less(pivot, a[j])) --j;
            if (i <= j) { std::swap(a[i], a[j]); ++i; --j; }
        }
        // Recurse into the smaller half, loop on the larger: O(log n) stack.
        if (j - lo < hi - i) { quickRec(a, lo, j, less, comps); lo = i; }
        else { quickRec(a, i, hi, less, comps); hi = j; }
    }
}
}  // namespace detail

/// O(n log n) always. Stable. Uses an O(n) buffer.
template <typename T, typename Less>
long long mergeSort(T* a, int n, Less less) {
    if (n < 2) return 0;
    long long comps = 0;
    T* tmp = new T[n];
    detail::mergeRec(a, tmp, 0, n - 1, less, comps);
    delete[] tmp;
    return comps;
}

/// O(n log n) average, O(n^2) worst. In place.
template <typename T, typename Less>
long long quickSort(T* a, int n, Less less) {
    long long comps = 0;
    detail::quickRec(a, 0, n - 1, less, comps);
    return comps;
}

// DynArray convenience overloads.
template <typename T, typename Less> long long bubbleSort(DynArray<T>& v, Less l) { return bubbleSort(v.raw(), v.size(), l); }
template <typename T, typename Less> long long insertionSort(DynArray<T>& v, Less l) { return insertionSort(v.raw(), v.size(), l); }
template <typename T, typename Less> long long mergeSort(DynArray<T>& v, Less l) { return mergeSort(v.raw(), v.size(), l); }
template <typename T, typename Less> long long quickSort(DynArray<T>& v, Less l) { return quickSort(v.raw(), v.size(), l); }

}  // namespace ht
