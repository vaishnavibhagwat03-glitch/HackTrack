// Undo for admin actions (Unit 3: stack). After a successful admin change
// the client pushes the *reverse* request(s); Undo pops the top entry and
// sends them through the request queue.
#pragma once
#include <string>

#include "../ds/DynArray.h"
#include "../ds/LinkedStack.h"
#include "RequestQueue.h"

namespace ht {

struct UndoEntry {
    long long id = 0;
    std::string label;   // "Delete team Iron Lattice"
    std::string actor;   // admin handle
    std::string at;
    DynArray<Request> reverse;  // sent in order on undo
};

class UndoManager {
    LinkedStack<UndoEntry> stack_;
    RequestQueue& queue_;
    long long nextId_ = 1;

public:
    UndoManager(RequestQueue& q, int limit = 50) : stack_(limit), queue_(q) {}

    void record(const std::string& label, const std::string& actor, const DynArray<Request>& reverse);
    /// Pops and replays the newest entry with `token`. Throws ApiError if
    /// nothing is left or the server refuses (the entry is then kept).
    UndoEntry undo(const std::string& token);

    int size() const { return stack_.size(); }
    json toJson() const;
};

}  // namespace ht
