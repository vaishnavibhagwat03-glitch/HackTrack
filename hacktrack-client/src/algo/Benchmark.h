// Sorting & searching benchmark (report Section 5.2, Tables 4 and 5).
#pragma once
#include <string>
#include "../ds/DynArray.h"

namespace ht {

struct SortResult {
    std::string algorithm;
    std::string complexity;
    int n = 0;
    long long comparisons = 0;  // median run
    double ms = 0;              // median run
};

struct SearchResult {
    std::string algorithm;
    std::string complexity;
    int n = 0;
    double avgComparisons = 0;  // over `searches` random lookups
    int searches = 0;
};

struct BenchmarkReport {
    unsigned seed = 0;
    int runs = 0;
    DynArray<SortResult> sorts;
    DynArray<SearchResult> searches;
};

/// Same random data (fixed seed) for every algorithm; each sort runs `runs`
/// times and the median time is kept.
BenchmarkReport runBenchmark(const DynArray<int>& sizes, int runs = 5, unsigned seed = 2026, int searches = 1000);

/// Prints Tables 4 and 5 to stdout.
void printBenchmark(const BenchmarkReport& r);

}  // namespace ht
