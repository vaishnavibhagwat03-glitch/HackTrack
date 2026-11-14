#include "RequestQueue.h"

#include <chrono>
#include <thread>

#include "httplib.h"

namespace ht {

json Response::parsed() const {
    if (body.empty()) return json::object();
    json j = json::parse(body, nullptr, false);
    return j.is_discarded() ? json::object() : j;
}

RequestQueue::RequestQueue(const std::string& host, int port, Trace& trace)
    : trace_(trace), cli_(new httplib::Client(host, port)), host_(host), port_(port) {
    cli_->set_connection_timeout(2, 0);
    cli_->set_read_timeout(8, 0);
    cli_->set_write_timeout(8, 0);
    cli_->set_keep_alive(true);
}

RequestQueue::~RequestQueue() { delete cli_; }

void RequestQueue::enqueue(const Request& r, Response* out) { q_.enqueue(Pending{r, out}); }

Response RequestQueue::attempt(const Request& r) {
    httplib::Headers headers{{"Accept", "application/json"}, {"User-Agent", "HackTrack-Client/1.0 (C++17)"}};
    if (!r.token.empty()) headers.emplace("Authorization", "Bearer " + r.token);
    const char* ctype = "application/json";
    const std::string& body = r.body;

    httplib::Result res(nullptr, httplib::Error::Unknown);
    if (r.method == "GET") res = cli_->Get(r.path, headers);
    else if (r.method == "POST") res = cli_->Post(r.path, headers, body, ctype);
    else if (r.method == "PUT") res = cli_->Put(r.path, headers, body, ctype);
    else if (r.method == "DELETE") res = body.empty() ? cli_->Delete(r.path, headers) : cli_->Delete(r.path, headers, body, ctype);

    Response out;
    if (!res) {
        out.networkError = true;
        out.error = httplib::to_string(res.error());
        return out;
    }
    out.status = res->status;
    out.body = res->body;
    return out;
}

void RequestQueue::flush() {
    while (!q_.empty()) {
        Pending p = q_.dequeue();
        auto t0 = std::chrono::steady_clock::now();
        Response res;
        int attempts = 0;
        for (;;) {
            ++attempts;
            ++sent_;
            res = attempt(p.req);
            bool retryable = res.networkError || res.status >= 500;
            if (!retryable || attempts > MAX_RETRIES) break;
            ++retries_;
            std::this_thread::sleep_for(std::chrono::milliseconds(retryDelayMs * attempts));
        }
        if (res.networkError || res.status >= 500) ++failures_;
        res.attempts = attempts;
        res.ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();

        TraceEntry e;
        e.kind = "http";
        e.method = p.req.method;
        e.target = p.req.path;
        e.detail = p.req.label;
        e.status = res.status;
        e.attempts = attempts;
        e.ms = res.ms;
        e.error = res.networkError ? res.error : "";
        trace_.add(e);

        if (p.out) *p.out = res;
    }
}

Response RequestQueue::send(const Request& r) {
    Response out;
    enqueue(r, &out);
    flush();
    return out;
}

json RequestQueue::snapshot() const {
    json items = json::array();
    q_.forEach([&](const Pending& p) { items.push_back({{"method", p.req.method}, {"path", p.req.path}, {"label", p.req.label}}); });
    return {{"pending", items}, {"sent", sent_}, {"retries", retries_}, {"failures", failures_}, {"maxRetries", MAX_RETRIES},
            {"server", serverAddress()}};
}

}  // namespace ht
