#include "Benchmark.h"

#include <chrono>
#include <cstdio>
#include <random>

#include "Search.h"
#include "Sort.h"

namespace ht {

namespace {

using Clock = std::chrono::steady_clock;
struct IntLess { bool operator()(int a, int b) const { return a < b; } };

// Median of a small array (copies, then insertion-sorts it).
template <typename T>
T median(DynArray<T> v) {
    insertionSort(v, [](const T& a, const T& b) { return a < b; });
    return v[v.size() / 2];
}

enum Algo { BUBBLE, INSERTION, MERGE, QUICK };

long long runSort(Algo a, int* data, int n) {
    switch (a) {
        case BUBBLE: return bubbleSort(data, n, IntLess());
        case INSERTION: return insertionSort(data, n, IntLess());
        case MERGE: return mergeSort(data, n, IntLess());
        default: return quickSort(data, n, IntLess());
    }
}

}  // namespace

BenchmarkReport runBenchmark(const DynArray<int>& sizes, int runs, unsigned seed, int searches) {
    BenchmarkReport rep;
    rep.seed = seed;
    rep.runs = runs;

    const char* names[] = {"Bubble", "Insertion", "Merge", "Quick"};
    const char* bigO[] = {"O(n^2)", "O(n^2)", "O(n log n)", "O(n log n) avg"};

    for (int n : sizes) {
        std::mt19937 rng(seed);
        DynArray<int> base(n);
        for (int i = 0; i < n; ++i) base[i] = (int)(rng() % 1000000);

        for (int a = BUBBLE; a <= QUICK; ++a) {
            DynArray<double> times;
            DynArray<long long> comps;
            for (int r = 0; r < runs; ++r) {
                DynArray<int> work = base;  // identical input every run
                auto t0 = Clock::now();
                long long c = runSort((Algo)a, work.raw(), n);
                auto t1 = Clock::now();
                times.push(std::chrono::duration<double, std::milli>(t1 - t0).count());
                comps.push(c);
            }
            rep.sorts.push(SortResult{names[a], bigO[a], n, median(comps), median(times)});
        }

        // Searching: keys drawn from the data so every search succeeds.
        DynArray<int> sorted = base;
        mergeSort(sorted, IntLess());
        std::mt19937 pick(seed + 1);
        long long linTotal = 0, binTotal = 0;
        for (int s = 0; s < searches; ++s) {
            int key = base[(int)(pick() % (unsigned)n)];
            long long c = 0;
            linearSearch(base.raw(), n, [key](int x) { return x == key; }, c);
            linTotal += c;
            binarySearch(sorted.raw(), n, [key](int x) { return x < key ? -1 : (x > key ? 1 : 0); }, c);
            binTotal += c;
        }
        rep.searches.push(SearchResult{"Linear", "O(n)", n, (double)linTotal / searches, searches});
        rep.searches.push(SearchResult{"Binary", "O(log n)", n, (double)binTotal / searches, searches});
    }
    return rep;
}

void printBenchmark(const BenchmarkReport& r) {
    std::printf("\nTable 4: Sorting - comparisons and time (median of %d runs, seed %u)\n", r.runs, r.seed);
    std::printf("%-26s %8s %16s %12s\n", "Algorithm", "n", "comparisons", "time (ms)");
    std::printf("--------------------------------------------------------------------\n");
    for (const SortResult& s : r.sorts) {
        char label[64];
        std::snprintf(label, sizeof label, "%s  %s", s.algorithm.c_str(), s.complexity.c_str());
        std::printf("%-26s %8d %16lld %12.3f\n", label, s.n, s.comparisons, s.ms);
    }
    std::printf("\nTable 5: Searching - average comparisons over %d searches\n", r.searches.empty() ? 0 : r.searches[0].searches);
    std::printf("%-26s %8s %16s\n", "Search", "n", "avg comparisons");
    std::printf("--------------------------------------------------------\n");
    for (const SearchResult& s : r.searches) {
        char label[64];
        std::snprintf(label, sizeof label, "%s  %s", s.algorithm.c_str(), s.complexity.c_str());
        std::printf("%-26s %8d %16.1f\n", label, s.n, s.avgComparisons);
    }
    std::printf("\n");
}

}  // namespace ht
