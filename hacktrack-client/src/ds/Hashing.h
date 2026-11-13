// Unit 6 — Hashing: hash functions shared by both hash tables.
#pragma once
#include <string>

namespace ht {

/// FNV-1a, 64-bit.
inline unsigned long long hashKey(const std::string& s) {
    unsigned long long h = 1469598103934665603ULL;
    for (unsigned char c : s) { h ^= c; h *= 1099511628211ULL; }
    return h;
}
/// Integer mixer (splitmix64 finaliser) so sequential IDs spread across buckets.
inline unsigned long long hashKey(long long k) {
    unsigned long long x = (unsigned long long)k + 0x9E3779B97F4A7C15ULL;
    x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9ULL;
    x = (x ^ (x >> 27)) * 0x94D049BB133111EBULL;
    return x ^ (x >> 31);
}
inline unsigned long long hashKey(int k) { return hashKey((long long)k); }

}  // namespace ht
