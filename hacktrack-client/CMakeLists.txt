cmake_minimum_required(VERSION 3.16)
project(HackTrackClient CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

if(MSVC)
  add_compile_options(/W4 /utf-8 /bigobj)
else()
  add_compile_options(-Wall -Wextra -O2)
endif()
if(WIN32)
  add_compile_definitions(_WIN32_WINNT=0x0A00 NOMINMAX)
endif()

# Data structures + algorithms: no network code, testable on their own.
add_library(ht_core STATIC
  src/algo/Benchmark.cpp
  src/algo/Assignment.cpp
  src/algo/Ranking.cpp
  src/core/Models.cpp)
target_include_directories(ht_core PUBLIC src third_party)

# Protocol layer + feature modules + UI (bridge, console).
add_library(ht_client STATIC
  src/protocol/Trace.cpp
  src/protocol/RequestQueue.cpp
  src/protocol/UndoManager.cpp
  src/modules/HackTrack.cpp
  src/modules/Judging.cpp
  src/modules/Results.cpp
  src/modules/Admin.cpp
  src/ui/Bridge.cpp
  src/ui/Console.cpp)
target_link_libraries(ht_client PUBLIC ht_core)
if(WIN32)
  target_link_libraries(ht_client PUBLIC ws2_32)
else()
  find_package(Threads REQUIRED)
  target_link_libraries(ht_client PUBLIC Threads::Threads)
endif()

add_executable(hacktrack src/main.cpp)
target_link_libraries(hacktrack PRIVATE ht_client)
if(MINGW)
  target_link_options(hacktrack PRIVATE -static)  # runs without MSYS2 DLLs on PATH
endif()

add_executable(ht_tests tests/test_ds.cpp)
target_link_libraries(ht_tests PRIVATE ht_core)

enable_testing()
add_test(NAME data_structures COMMAND ht_tests)

add_executable(ht_algorithms tests/test_algorithms.cpp)
target_link_libraries(ht_algorithms PRIVATE ht_core)
add_test(NAME algorithms COMMAND ht_algorithms)

# Needs a running server: use `node scripts/integration.mjs` from the repo root.
add_executable(ht_integration tests/test_integration.cpp)
target_link_libraries(ht_integration PRIVATE ht_client)
