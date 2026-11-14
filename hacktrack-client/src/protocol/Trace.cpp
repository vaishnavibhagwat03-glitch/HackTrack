#include "Trace.h"

#include "../core/Clock.h"

namespace ht {

void Trace::add(TraceEntry e) {
    e.id = nextId_++;
    if (e.at.empty()) e.at = nowIso();
    log_.enqueue(e);
    while (log_.size() > cap_) log_.dequeue();
}

void Trace::ds(const std::string& structure, const std::string& op, const std::string& result) {
    TraceEntry e;
    e.kind = "ds";
    e.method = structure;
    e.target = op;
    e.detail = result;
    add(e);
}

json Trace::toJson(long long sinceId) const {
    json out = json::array();
    log_.forEach([&](const TraceEntry& e) {
        if (e.id <= sinceId) return;
        out.push_back({{"id", e.id}, {"at", e.at}, {"kind", e.kind}, {"method", e.method}, {"target", e.target},
                       {"detail", e.detail}, {"status", e.status}, {"attempts", e.attempts}, {"ms", e.ms}, {"error", e.error}});
    });
    return out;
}

}  // namespace ht
