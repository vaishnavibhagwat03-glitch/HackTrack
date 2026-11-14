# HackTrack C++ client, built for Linux.
# Stage 1 compiles it and runs the unit tests; stage 2 keeps only the program.

# ── build ─────────────────────────────────────────────────────
FROM debian:trixie-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends g++ cmake ninja-build \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY CMakeLists.txt ./
COPY src ./src
COPY tests ./tests
COPY third_party ./third_party
RUN cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release \
 && cmake --build build \
 && ./build/ht_tests \
 && ./build/ht_algorithms

# ── run ───────────────────────────────────────────────────────
FROM debian:trixie-slim
# The program uses the C++ standard library at run time; curl is for the health check.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libstdc++6 curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --no-create-home hacktrack
COPY --from=build /src/build/hacktrack /usr/local/bin/hacktrack
USER hacktrack

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

# Listen on all interfaces inside the container; the server is reached by its
# Compose service name. Both can be overridden with `command:` in compose.yaml.
ENTRYPOINT ["hacktrack"]
CMD ["--bridge", "--host", "0.0.0.0", "--port", "8080", "--server", "server:4000"]
