# HackTrack

**A C++ client for hackathon management using custom data structures and client-server protocol communication.**
Data Structures course project · Department of Computer Engineering, VIT Pune · 2026–27

```
 Browser ── Next.js website (:3000)            the only user interface; no business logic
              │  HTTP/JSON
              ▼
          HackTrack C++17 client (:8080)        every request passes through here
              │  HTTP/JSON (cpp-httplib)        own data structures, no STL containers
              ▼
          Node.js server (:4000)                applies the rules, talks to the database
              │
              ▼
          SQLite  (server/data/hacktrack.db)    permanent storage
```

The website **never** talks to the server. Stop the C++ client and the website stops working.

## Run it

Requirements: Node.js 22.13+ (24 recommended), CMake + Ninja, and g++ (MSYS2 UCRT64 on Windows) or MSVC.

```bash
npm install                 # website dependencies (once)
npm run client:build        # build the C++ client (once, and after C++ changes)
npm run seed                # create the demo database (wipes it)
npm run start:all           # server + C++ client + website  ->  http://localhost:3000
npm run client:demo         # optional, in a 2nd terminal: C++ client assigns judges and submits demo scores
```

Demo accounts (one click on the sign-in page):

| Role | Email | Password |
|---|---|---|
| Admin | admin@hacktrack.dev | admin123 |
| Judge | judge@hacktrack.dev | judge123 |
| Participant (team Void Runners) | participant@hacktrack.dev | participant123 |
| Participant (no team yet) | solo@hacktrack.dev | participant123 |

Other modes of the same C++ program:

```bash
npm run client:console      # role-based console menus (report Figures 4 and 5)
npm run client:bench        # sorting/searching benchmark (report Tables 4 and 5)
```

## Where each data structure does a real job

All structures are hand-written C++ class templates in [hacktrack-client/src/ds](hacktrack-client/src/ds). `std::string` is used for text; no STL containers (`vector`, `map`, `list`, …).

| Unit | Structure | File | Real job in HackTrack | Cost |
|---|---|---|---|---|
| 1 Arrays | Dynamic array | [DynArray.h](hacktrack-client/src/ds/DynArray.h) | Projects, teams, judges records | access O(1), push amortised O(1) |
| 1 Arrays | Sparse matrix (triplets) | [SparseMatrix.h](hacktrack-client/src/ds/SparseMatrix.h) | Judge × project weighted scores | set O(log k + k), fast transpose O(cols + k) |
| 1 Arrays | Bubble, insertion, merge, quick sort | [Sort.h](hacktrack-client/src/algo/Sort.h) | Gallery by name (merge), by time (quick); benchmark | O(n²) / O(n log n) |
| 1 Arrays | Linear, binary search | [Search.h](hacktrack-client/src/algo/Search.h) | Project lookup comparison; benchmark | O(n) / O(log n) |
| 2 Lists | Singly linked list | [SinglyList.h](hacktrack-client/src/ds/SinglyList.h) | Team members; hash chains; graph adjacency lists | insert O(1) |
| 2 Lists | Circular linked list | [CircularList.h](hacktrack-client/src/ds/CircularList.h) | Round-robin judge rotation | rotate O(1) |
| 2 Lists | Generalized list | [GeneralizedList.h](hacktrack-client/src/ds/GeneralizedList.h) | Rubric with sub-criteria; weighted score | O(nodes) |
| 3 Stack & queue | Linked queue | [LinkedQueue.h](hacktrack-client/src/ds/LinkedQueue.h) → [RequestQueue.cpp](hacktrack-client/src/protocol/RequestQueue.cpp) | Every server request, sent FIFO, 3 retries on network/5xx | O(1) |
| 3 Stack & queue | Linked stack | [LinkedStack.h](hacktrack-client/src/ds/LinkedStack.h) → [UndoManager.cpp](hacktrack-client/src/protocol/UndoManager.cpp) | Undo of admin actions (reverse requests) | O(1) |
| 4 Trees | Binary search tree | [BST.h](hacktrack-client/src/ds/BST.h) | Project by id (built middle-first → balanced) | O(log n) avg |
| 4 Trees | Max-heap | [MaxHeap.h](hacktrack-client/src/ds/MaxHeap.h) | Leaderboard; People's Choice vote ranking | build O(n), extract O(log n) |
| 5 Graphs | Adjacency matrix + lists, BFS, DFS | [Graph.h](hacktrack-client/src/ds/Graph.h) | Judge–team conflict check before assignment | lookup O(1), traversal O(V + E) |
| 6 Hashing | Separate chaining | [HashChaining.h](hacktrack-client/src/ds/HashChaining.h) | Session token → role; users; projects; id → index | O(1) avg |
| 6 Hashing | Linear probing | [HashProbing.h](hacktrack-client/src/ds/HashProbing.h) | Invite code → team (tombstones on delete) | O(1) avg |

Algorithms from the report:

- **Judge assignment (Section 3.1, Listing 1):** [Assignment.cpp](hacktrack-client/src/algo/Assignment.cpp). Uses the circular list and the conflict graph. It reports shortages instead of looping forever, and leaves the ring pointer where it stopped.
- **Ranking (Section 3.2):** [Ranking.cpp](hacktrack-client/src/algo/Ranking.cpp). Builds the sparse matrix, computes column averages, then builds a max-heap and extracts from it. Equal scores share a rank. The website can also show z-score normalised scores.
- **Request queue and undo (Section 3.3):** [RequestQueue.cpp](hacktrack-client/src/protocol/RequestQueue.cpp) and [UndoManager.cpp](hacktrack-client/src/protocol/UndoManager.cpp).

## Showing it in the viva

- **Data Structures page** (sidebar): the live state of every structure inside the running C++ client. It shows hash buckets, the probing table, the BST drawn as a tree, the heap array, the sparse matrix triplets, the conflict graph with BFS and DFS orders, the judge ring and its pointer, the team lists, the rubric list, the queue and the undo stack.
- **Protocol trace** (bottom-right button): every HTTP request the C++ client sends (status, attempts, time) and every data-structure operation it runs.
- **Retries:** Administration → System → Fault injection makes the server fail 30% or 60% of requests. The trace then shows the client retrying, up to 3 times.
- **Undo:** delete a team (Team page, admin), then press Undo. The team comes back with its members, project and scores.
- **Benchmark:** Analytics → Run benchmark runs Tables 4 and 5 live in C++.
- **Project page:** shows how many comparisons the BST, binary search and linear search needed to find it.

## Tests

```bash
npm test     # server rule tests + C++ data-structure/algorithm tests + report Table 3 end to end
```

| Suite | What | Count |
|---|---|---|
| [server/test](server/test/server.test.mjs) | Server rules (auth, deadline, teams, conflicts, scores, votes, restore) | 12 |
| [test_ds.cpp](hacktrack-client/tests/test_ds.cpp) | Every data structure, sort and search | 17 tests, 184 checks |
| [test_algorithms.cpp](hacktrack-client/tests/test_algorithms.cpp) | Assignment, ranking, normalisation, vote tally, rubric | 8 |
| [test_integration.cpp](hacktrack-client/tests/test_integration.cpp) via [integration.mjs](scripts/integration.mjs) | Report Table 3 test cases against a fresh server | 9 |

Report Table 3 cases, all automated:
1. Wrong password gives 401.
2. Server stopped gives 3 retries, then a network error.
3. Submitting after the deadline gives DeadlinePassed, and nothing is sent.
4. Joining a second team is rejected.
5. Judges never get a conflicting team.
6. A team that conflicts with every judge is reported as a shortage.
7. A score above the maximum gives InvalidScore, and nothing is sent.
8. Undoing a team deletion restores the team with its members.

## Layout

```
app/, components/, lib/     Next.js website (lib/api.ts is the only place it makes requests: to the C++ client)
hacktrack-client/
  src/ds/                   data structures (no network code)
  src/algo/                 sorts, searches, assignment, ranking, benchmark
  src/protocol/             request queue, undo manager, trace
  src/modules/              features (sessions, teams, submission, judging, results, admin, inspector)
  src/ui/                   bridge (HTTP service for the website) and console menus
  tests/                    unit, algorithm and integration tests
  third_party/              cpp-httplib 0.18.3, nlohmann/json 3.11.3
server/                     Node.js + SQLite server, seed data, rule tests
scripts/                    start-all, integration test runner
```

The landing page's scroll animations use an illustrative sample event ([sample-data.ts](components/landing/experience/sample-data.ts)). Everything behind sign-in, and the public gallery, uses live data from the C++ client.
