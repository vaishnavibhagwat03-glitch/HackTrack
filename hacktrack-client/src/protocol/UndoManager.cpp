#include "UndoManager.h"

#include "../core/ApiError.h"
#include "../core/Clock.h"

namespace ht {

void UndoManager::record(const std::string& label, const std::string& actor, const DynArray<Request>& reverse) {
    UndoEntry e;
    e.id = nextId_++;
    e.label = label;
    e.actor = actor;
    e.at = nowIso();
    e.reverse = reverse;
    stack_.push(e);
}

UndoEntry UndoManager::undo(const std::string& token) {
    if (stack_.empty()) throw ApiError(409, "NothingToUndo", "There is nothing to undo");
    UndoEntry e = stack_.pop();
    DynArray<Response> results(e.reverse.size());
    for (int i = 0; i < e.reverse.size(); ++i) {
        Request r = e.reverse[i];
        r.token = token;
        r.label = "UNDO: " + e.label;
        queue_.enqueue(r, &results[i]);
    }
    queue_.flush();
    for (const Response& r : results) {
        if (r.ok()) continue;
        stack_.push(e);  // keep it so the admin can retry
        json b = r.parsed();
        if (r.networkError) throw ApiError(503, "NetworkError", "Server unreachable; undo kept for retry");
        throw ApiError(r.status, b.value("error", "UndoFailed"), "Undo failed: " + b.value("message", std::string("server refused")));
    }
    return e;
}

json UndoManager::toJson() const {
    json out = json::array();
    stack_.forEach([&](const UndoEntry& e) {
        json reqs = json::array();
        for (const Request& r : e.reverse) reqs.push_back({{"method", r.method}, {"path", r.path}});
        out.push_back({{"id", e.id}, {"label", e.label}, {"actor", e.actor}, {"at", e.at}, {"reverse", reqs}});
    });
    return out;
}

}  // namespace ht
