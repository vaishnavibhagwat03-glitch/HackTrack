cmake_minimum_required(VERSION 3.16)
project(HackTrackClient CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

if(MSVC)
  add_compile_options(/W4 /utf-8)
else()
  add_compile_options(-Wall -Wextra -O2)
endif()

# Data structures, algorithms and benchmark: no network code, testable alone.
add_library(ht_core STATIC src/algo/Benchmark.cpp)
target_include_directories(ht_core PUBLIC src)

add_executable(ht_tests tests/test_ds.cpp)
target_link_libraries(ht_tests PRIVATE ht_core)

enable_testing()
add_test(NAME data_structures COMMAND ht_tests)
