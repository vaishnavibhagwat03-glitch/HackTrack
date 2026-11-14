// Bounded log of what the client did: every HTTP request (with retries) and
// notable data-structure operations. Kept in a queue: when full, the oldest
// entry is dequeued. Shown live in the website's protocol trace panel.
#pragma once
#include <string>

#include "../core/Models.h"
#include "../ds/LinkedQueue.h"

namespace ht {

struct TraceEntry {
    long long id = 0;
    std::string at;
    std::string kind;       // "http" or "ds"
    std::string method;     // GET / POST ... (http) or structure name (ds)
    std::string target;     // path (http) or operation (ds)
    std::string detail;     // label or result
    int status = 0;
    int attempts = 0;
    double ms = 0;
    std::string error;
};

class Trace {
    LinkedQueue<TraceEntry> log_;
    int cap_;
    long long nextId_ = 1;

public:
    explicit Trace(int capacity = 200) : cap_(capacity) {}

    void add(TraceEntry e);
    void ds(const std::string& structure, const std::string& op, const std::string& result);
    json toJson(long long sinceId = 0) const;
    long long lastId() const { return nextId_ - 1; }
};

}  // namespace ht
