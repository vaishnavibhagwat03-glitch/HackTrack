// Unit 1 — Searching. Both return the index found (or -1) and count comparisons.
#pragma once

namespace ht {

/// O(n). `match(x)` is true for the element sought.
template <typename T, typename Match>
int linearSearch(const T* a, int n, Match match, long long& comps) {
    comps = 0;
    for (int i = 0; i < n; ++i) { ++comps; if (match(a[i])) return i; }
    return -1;
}

/// O(log n) on sorted data. `cmp(x)` is <0 if x is before the key, 0 if equal, >0 if after.
/// One three-way comparison counts as one comparison.
template <typename T, typename Cmp>
int binarySearch(const T* a, int n, Cmp cmp, long long& comps) {
    comps = 0;
    int lo = 0, hi = n - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        ++comps;
        int c = cmp(a[mid]);
        if (c == 0) return mid;
        if (c < 0) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
}

}  // namespace ht
