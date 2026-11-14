#pragma once
#include <string>

#include "../modules/HackTrack.h"

namespace ht {

/// Serve the website's /api requests on listenHost:port. Blocks.
/// 127.0.0.1 (default) accepts local connections only; 0.0.0.0 is for Docker.
int runBridge(HackTrack& app, int port, const std::string& listenHost = "127.0.0.1", const std::string& allowOrigin = "*");

/// Role-based console menus (report Figures 4 and 5). Blocks until exit.
int runConsole(HackTrack& app);

/// Populate the demo: assign judges and submit judge scores through the protocol.
int runDemo(HackTrack& app);

}  // namespace ht
