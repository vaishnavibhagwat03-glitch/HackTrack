// Time helpers. Timestamps are ISO-8601 UTC strings ("2026-11-13T10:00:00Z"),
// which compare correctly as plain strings.
#pragma once
#include <chrono>
#include <ctime>
#include <string>

namespace ht {

inline long long nowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
}

inline std::string isoFromEpoch(std::time_t t) {
    std::tm tm{};
#ifdef _WIN32
    gmtime_s(&tm, &t);
#else
    gmtime_r(&t, &tm);
#endif
    char buf[32];
    std::strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%SZ", &tm);
    return buf;
}

inline std::string nowIso() { return isoFromEpoch(std::time(nullptr)); }

}  // namespace ht
