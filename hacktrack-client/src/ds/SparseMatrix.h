// Unit 1 — Arrays: sparse matrix in triplet (row, col, value) form.
// HackTrack stores the judge x project score matrix this way: most judges
// see only a handful of projects, so a dense J x P matrix would be mostly empty.
#pragma once
#include "DynArray.h"

namespace ht {

struct Triplet {
    int row = 0;      // judge index
    int col = 0;      // project index
    double value = 0; // weighted score
};

class SparseMatrix {
    int rows_ = 0, cols_ = 0;
    DynArray<Triplet> t_;  // kept sorted by (row, col)

    // Binary search for (r, c); returns index or the insertion point encoded as -(pos+1).
    int locate(int r, int c) const {
        int lo = 0, hi = t_.size() - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            const Triplet& m = t_[mid];
            if (m.row == r && m.col == c) return mid;
            if (m.row < r || (m.row == r && m.col < c)) lo = mid + 1; else hi = mid - 1;
        }
        return -(lo + 1);
    }

public:
    SparseMatrix() = default;
    SparseMatrix(int rows, int cols) : rows_(rows), cols_(cols) {}

    void resize(int rows, int cols) { rows_ = rows; cols_ = cols; }
    int rows() const { return rows_; }
    int cols() const { return cols_; }
    int nonZero() const { return t_.size(); }
    const DynArray<Triplet>& triplets() const { return t_; }

    /// Insert or overwrite — O(log k) search + O(k) shift.
    void set(int r, int c, double v) {
        if (r < 0 || c < 0 || r >= rows_ || c >= cols_) throw std::out_of_range("SparseMatrix::set");
        int i = locate(r, c);
        if (i >= 0) { t_[i].value = v; return; }
        t_.insertAt(-i - 1, Triplet{r, c, v});
    }
    bool get(int r, int c, double& out) const {
        int i = locate(r, c);
        if (i < 0) return false;
        out = t_[i].value;
        return true;
    }
    bool erase(int r, int c) {
        int i = locate(r, c);
        if (i < 0) return false;
        t_.removeAt(i);
        return true;
    }

    /// Average of a column (all judges' scores for one project) — O(k).
    double colAverage(int c, int& count) const {
        double sum = 0; count = 0;
        for (const Triplet& x : t_) if (x.col == c) { sum += x.value; ++count; }
        return count ? sum / count : 0.0;
    }
    /// Every column's sum and count in one O(k) pass.
    void colTotals(DynArray<double>& sums, DynArray<int>& counts) const {
        sums = DynArray<double>(cols_, 0.0);
        counts = DynArray<int>(cols_, 0);
        for (const Triplet& x : t_) { sums[x.col] += x.value; counts[x.col]++; }
    }
    int rowCount(int r) const {
        int n = 0;
        for (const Triplet& x : t_) if (x.row == r) ++n;
        return n;
    }

    /// Fast transpose (Horowitz & Sahni) — O(cols + k).
    SparseMatrix transpose() const {
        SparseMatrix out(cols_, rows_);
        int k = t_.size();
        if (!k) return out;
        DynArray<int> rowTerms(cols_, 0), start(cols_, 0);
        for (const Triplet& x : t_) rowTerms[x.col]++;
        for (int i = 1; i < cols_; ++i) start[i] = start[i - 1] + rowTerms[i - 1];
        out.t_ = DynArray<Triplet>(k);
        for (const Triplet& x : t_) out.t_[start[x.col]++] = Triplet{x.col, x.row, x.value};
        return out;
    }
};

}  // namespace ht
