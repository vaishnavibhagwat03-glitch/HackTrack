// Minimal self-registering test harness (no external test library).
#pragma once
#include <cstdio>
#include <exception>
#include <string>

namespace httest {

struct Case { const char* name; void (*fn)(); Case* next; };
inline Case*& registry() { static Case* head = nullptr; return head; }
inline int& failures() { static int f = 0; return f; }
inline int& checks() { static int c = 0; return c; }

struct Registrar {
    Registrar(const char* name, void (*fn)()) {
        static Case* tail = nullptr;
        Case* c = new Case{name, fn, nullptr};
        if (tail) tail->next = c; else registry() = c;
        tail = c;
    }
};

inline int runAll() {
    int passed = 0, total = 0;
    for (Case* c = registry(); c; c = c->next) {
        ++total;
        int before = failures();
        try { c->fn(); } catch (const std::exception& e) {
            ++failures();
            std::printf("  ! %s threw: %s\n", c->name, e.what());
        }
        bool ok = failures() == before;
        if (ok) ++passed;
        std::printf("[%s] %s\n", ok ? "PASS" : "FAIL", c->name);
    }
    std::printf("\n%d/%d tests passed, %d checks, %d failures\n", passed, total, checks(), failures());
    return failures() ? 1 : 0;
}

}  // namespace httest

#define HT_CAT2(a, b) a##b
#define HT_CAT(a, b) HT_CAT2(a, b)
#define TEST(name)                                                                  \
    static void HT_CAT(test_, __LINE__)();                                          \
    static httest::Registrar HT_CAT(reg_, __LINE__)(name, &HT_CAT(test_, __LINE__)); \
    static void HT_CAT(test_, __LINE__)()

#define CHECK(cond)                                                                   \
    do {                                                                              \
        ++httest::checks();                                                           \
        if (!(cond)) { ++httest::failures(); std::printf("  x %s:%d  CHECK(%s)\n", __FILE__, __LINE__, #cond); } \
    } while (0)

#define CHECK_EQ(a, b) CHECK((a) == (b))
#define CHECK_NEAR(a, b, eps) CHECK(((a) - (b)) < (eps) && ((b) - (a)) < (eps))
#define CHECK_THROWS(expr)                                                  \
    do {                                                                    \
        bool threw_ = false;                                                \
        try { (void)(expr); } catch (...) { threw_ = true; }                \
        ++httest::checks();                                                 \
        if (!threw_) { ++httest::failures(); std::printf("  x %s:%d  expected throw: %s\n", __FILE__, __LINE__, #expr); } \
    } while (0)
