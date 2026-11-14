#pragma once
#include <string>

#include "../modules/HackTrack.h"

namespace ht {

/// Serve the website's /api requests on localhost:port. Blocks.
int runBridge(HackTrack& app, int port, const std::string& allowOrigin = "*");

/// Role-based console menus (report Figures 4 and 5). Blocks until exit.
int runConsole(HackTrack& app);

/// Populate the demo: assign judges and submit judge scores through the protocol.
int runDemo(HackTrack& app);

}  // namespace ht
