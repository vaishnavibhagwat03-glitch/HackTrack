// Protocol layer: every request to the server goes through a FIFO queue
// (Unit 3) and is sent in order. Network failures and 5xx responses are
// retried up to MAX_RETRIES times; 4xx responses are final and reported at once.
#pragma once
#include <string>

#include "../core/Models.h"
#include "../ds/DynArray.h"
#include "../ds/LinkedQueue.h"
#include "Trace.h"

namespace httplib { class Client; }

namespace ht {

struct Request {
    std::string method = "GET";
    std::string path;
    std::string body;   // JSON text, empty for none
    std::string token;  // bearer token of the user the request is for
    std::string label;  // human description for the trace
};

struct Response {
    int status = 0;          // 0 when the server could not be reached
    std::string body;
    bool networkError = false;
    std::string error;       // network error text
    int attempts = 0;
    double ms = 0;

    bool ok() const { return status >= 200 && status < 300; }
    json parsed() const;
};

class RequestQueue {
public:
    static constexpr int MAX_RETRIES = 3;

    RequestQueue(const std::string& host, int port, Trace& trace);
    ~RequestQueue();
    RequestQueue(const RequestQueue&) = delete;
    RequestQueue& operator=(const RequestQueue&) = delete;

    /// Queue a request; the result is written to *out when the queue is flushed.
    void enqueue(const Request& r, Response* out);
    /// Send everything waiting, in FIFO order.
    void flush();
    /// enqueue + flush for a single request.
    Response send(const Request& r);

    int pending() const { return q_.size(); }
    long long sent() const { return sent_; }
    long long retries() const { return retries_; }
    long long failures() const { return failures_; }
    int retryDelayMs = 150;  // grows linearly per attempt
    std::string serverAddress() const { return host_ + ":" + std::to_string(port_); }

    /// Pending requests, front to rear (for the inspector).
    json snapshot() const;

private:
    struct Pending { Request req; Response* out; };
    LinkedQueue<Pending> q_;
    Trace& trace_;
    httplib::Client* cli_;
    std::string host_;
    int port_;
    long long sent_ = 0, retries_ = 0, failures_ = 0;

    Response attempt(const Request& r);
};

}  // namespace ht
