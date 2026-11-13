// Unit 4 — Trees: binary search tree keyed by project ID.
// Search / insert / delete are O(h): O(log n) on average, O(n) worst case.
#pragma once
#include <utility>

namespace ht {

template <typename K, typename V>
class BST {
public:
    struct Node { K key; V val; Node* left; Node* right; };

private:
    Node* root_ = nullptr;
    int size_ = 0;

    static void destroy(Node* n) { if (!n) return; destroy(n->left); destroy(n->right); delete n; }
    static int heightOf(const Node* n) {
        if (!n) return 0;
        int l = heightOf(n->left), r = heightOf(n->right);
        return 1 + (l > r ? l : r);
    }
    template <typename F>
    static void inorder(const Node* n, F& f) { if (!n) return; inorder(n->left, f); f(n->key, n->val); inorder(n->right, f); }
    template <typename F>
    static void preorder(const Node* n, int depth, F& f) { if (!n) return; f(n->key, depth); preorder(n->left, depth + 1, f); preorder(n->right, depth + 1, f); }

    Node* removeRec(Node* n, const K& key, bool& removed) {
        if (!n) return nullptr;
        if (key < n->key) n->left = removeRec(n->left, key, removed);
        else if (n->key < key) n->right = removeRec(n->right, key, removed);
        else {
            removed = true;
            if (!n->left) { Node* r = n->right; delete n; return r; }
            if (!n->right) { Node* l = n->left; delete n; return l; }
            // Two children: copy the in-order successor, then delete it from the right subtree.
            Node* s = n->right;
            while (s->left) s = s->left;
            n->key = s->key;
            n->val = s->val;
            bool dummy = false;
            n->right = removeRec(n->right, s->key, dummy);
        }
        return n;
    }

public:
    BST() = default;
    BST(const BST&) = delete;
    BST& operator=(const BST&) = delete;
    ~BST() { destroy(root_); }

    /// Insert, or overwrite the value if the key exists. Iterative — O(h).
    void insert(const K& key, const V& val) {
        Node** link = &root_;
        while (*link) {
            if (key < (*link)->key) link = &(*link)->left;
            else if ((*link)->key < key) link = &(*link)->right;
            else { (*link)->val = val; return; }
        }
        *link = new Node{key, val, nullptr, nullptr};
        ++size_;
    }
    /// Returns nullptr when absent. `comps` (optional) receives the number of key comparisons.
    V* find(const K& key, long long* comps = nullptr) const {
        long long c = 0;
        Node* n = root_;
        while (n) {
            ++c;
            if (key < n->key) n = n->left;
            else if (n->key < key) n = n->right;
            else { if (comps) *comps = c; return &n->val; }
        }
        if (comps) *comps = c;
        return nullptr;
    }
    bool remove(const K& key) {
        bool removed = false;
        root_ = removeRec(root_, key, removed);
        if (removed) --size_;
        return removed;
    }

    int size() const { return size_; }
    int height() const { return heightOf(root_); }
    const Node* root() const { return root_; }

    /// Sorted (in-order) traversal.
    template <typename F>
    void forEachInOrder(F f) const { inorder(root_, f); }
    /// Pre-order traversal with depth, for drawing the tree.
    template <typename F>
    void forEachPreOrder(F f) const { preorder(root_, 0, f); }

    void clear() { destroy(root_); root_ = nullptr; size_ = 0; }
};

}  // namespace ht
