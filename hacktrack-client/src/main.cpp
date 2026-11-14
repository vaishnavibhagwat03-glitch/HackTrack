// HackTrack — C++17 client for hackathon management.
//
//   hacktrack --bridge   (default) serve the website on localhost:8080
//   hacktrack --console  role-based console menus
//   hacktrack --bench    sorting/searching benchmark (report Tables 4 and 5)
//   hacktrack --demo     assign judges and submit demo scores via the protocol
//
// Options: --server HOST:PORT (default 127.0.0.1:4000)  --port N (default 8080)
//          --host ADDR  address the bridge listens on (default 127.0.0.1; 0.0.0.0 in Docker)
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include "algo/Benchmark.h"
#include "modules/HackTrack.h"
#include "ui/Bridge.h"

int main(int argc, char** argv) {
    std::string mode = "bridge", host = "127.0.0.1", listenHost = "127.0.0.1";
    int serverPort = 4000, port = 8080;
    for (int i = 1; i < argc; ++i) {
        std::string a = argv[i];
        if (a == "--bridge" || a == "--console" || a == "--bench" || a == "--demo") mode = a.substr(2);
        else if (a == "--server" && i + 1 < argc) {
            std::string s = argv[++i];
            size_t colon = s.rfind(':');
            host = s.substr(0, colon);
            if (colon != std::string::npos) serverPort = std::atoi(s.c_str() + colon + 1);
        } else if (a == "--port" && i + 1 < argc) port = std::atoi(argv[++i]);
        else if (a == "--host" && i + 1 < argc) listenHost = argv[++i];
        else if (a == "--help" || a == "-h") {
            std::printf("Usage: hacktrack [--bridge|--console|--bench|--demo] [--server HOST:PORT] [--port N] [--host ADDR]\n");
            return 0;
        } else {
            std::fprintf(stderr, "Unknown option %s (try --help)\n", a.c_str());
            return 2;
        }
    }

    if (mode == "bench") {
        ht::DynArray<int> sizes;
        sizes.push(100);
        sizes.push(1000);
        sizes.push(10000);
        ht::printBenchmark(ht::runBenchmark(sizes, 5));
        return 0;
    }

    ht::HackTrack app(host, serverPort);
    if (mode == "console") return ht::runConsole(app);
    if (mode == "demo") return ht::runDemo(app);
    return ht::runBridge(app, port, listenHost);
}
