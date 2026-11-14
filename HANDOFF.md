# HackTrack: handoff for the next chat session

Read this first to continue the work. It records what was decided, built, tested and left open in the session that ran 13–14 Nov 2026.

---

## 1. The assignment and the hard constraint

- Course project for **Data Structures**, Department of Computer Engineering, VIT Pune, 2026–27. Guide: Prof. Nagaraju Bogiri. Team: Vaishnavi Bhagwat (49), Vipul Bangar (36), Kanan Badoliya (34), Sumit Bansode (41).
- Synopsis/report: `C:\Users\athar\OneDrive\Desktop\SY\DS-1\HackTrack_Course_Project_Report_B3.docx`. Title: *HackTrack: A C++ Client for Hackathon Management Using Custom Data Structures and Client-Server Protocol Communication*.
- **Hard rule from the professor: the frontend must NOT be C++.** The team was criticised earlier for building the frontend in C++. A **C++ client must sit between the frontend and the backend**, and all data-structure work must live in that C++ client. The user wants an A+.

## 2. Decisions the user made

| Question | Decision |
|---|---|
| Organizer role (website had 4 roles, report has 3) | **Merged into Admin.** Roles: admin, participant, judge |
| Extra website pages (voting, certificates, analytics, audit, gallery/embed) | **Kept, and wired to real data through the C++ client.** Nothing fake behind sign-in |
| Backend language | **Node.js 24 + built-in `node:sqlite`** (no npm dependencies) |
| C++ console mode | **Keep both modes**: `--bridge` behind the website and `--console` menus (plus `--bench`, `--demo`) |
| Git history | User approved removing `graphify-out/` and `.vscode/` from history (done) |
| Report | User approved updating it (done; saved as a new file) |

## 3. Architecture

```
Browser ─ Next.js 16 website (:3000)      UI only; lib/api.ts is its only network path
            │ HTTP/JSON  /api/...
            ▼
         hacktrack.exe --bridge (:8080)    C++17 client, own data structures, no STL containers
            │ HTTP/JSON  /v1/...  (cpp-httplib client)
            ▼
         Node server (127.0.0.1:4000)      rules + auth (scrypt passwords, bearer tokens)
            │
            ▼
         SQLite: server/data/hacktrack.db  (gitignored; auto-seeded if empty)
```

## 4. Repository layout (project root: `C:\Users\athar\OneDrive\Desktop\SY\DS-1\Hack Track`)

```
app/, components/, lib/        Next.js website
  lib/api.ts                   only place the site makes requests (to the C++ bridge); NEXT_PUBLIC_HACKTRACK_API overrides base
  lib/useApi.ts                fetch hook; refetches after any write
  lib/session.tsx              token in localStorage ("hacktrack.token"); /api/me, /api/bootstrap
  lib/types.ts, lib/rbac.ts    types; nav + route rules (3 roles)
  components/structures/       NEW: Data Structures inspector page (/structures)
  components/navigation/TraceDrawer.tsx  NEW: floating "Protocol trace" panel
  components/landing/experience/sample-data.ts, sample-scoring.ts
                               illustrative data used ONLY by the landing-page animations
hacktrack-client/              C++17 client (CMake + Ninja, g++ 16 from MSYS2 UCRT64)
  src/ds/        DynArray, SparseMatrix, SinglyList, CircularList, GeneralizedList,
                 LinkedStack, LinkedQueue, BST, MaxHeap, Graph(+ConflictGraph), Hashing,
                 HashChaining, HashProbing
  src/algo/      Sort.h (bubble/insertion/merge/quick, count comparisons), Search.h,
                 Assignment.{h,cpp} (Listing 1), Ranking.{h,cpp} (sparse matrix -> max-heap,
                 z-score normalisation, vote tally), Benchmark.{h,cpp} (Tables 4 & 5)
  src/core/      Models (records + JSON conversion), ApiError, Clock
  src/protocol/  RequestQueue (FIFO, MAX_RETRIES=3 on network/5xx, 4xx final), UndoManager
                 (LinkedStack of reverse requests), Trace (bounded log)
  src/modules/   HackTrack.h/.cpp (cache, sessions, projects, teams, submission),
                 Judging.cpp, Results.cpp, Admin.cpp (incl. inspector JSON)
  src/ui/        Bridge.cpp (httplib server, global mutex, 64-thread pool, 1 s keep-alive),
                 Console.cpp (role menus + --demo)
  src/main.cpp   modes: --bridge (default) | --console | --bench | --demo; --server HOST:PORT, --port N
  tests/         test_ds.cpp (17), test_algorithms.cpp (8), test_integration.cpp (9, report Table 3)
  third_party/   cpp-httplib 0.18.3, nlohmann/json 3.11.3 (vendored)
server/          src/db.mjs (schema), app.mjs (routes/rules), index.mjs (HTTP, chaos mode),
                 seed.mjs, test/server.test.mjs (12)
scripts/         start-all.mjs, run-client.mjs, integration.mjs
README.md        run instructions + viva cheat-sheet (structure → file → job → complexity)
```

## 5. Run, test, demo

```bash
npm install                 # once
npm run client:build        # build C++ (cmake -G Ninja); needs MSYS2 ucrt64 on PATH to build
npm run seed                # wipe + reseed DB. Deadline = now + 2 days (relative!)
npm run start:all           # server + C++ bridge + website -> http://localhost:3000
npm run client:demo         # 2nd terminal: C++ client assigns judges + submits 78 demo reviews
npm run client:console      # console role menus
npm run client:bench        # benchmark tables
npm test                    # server 12 + DS 17 + algorithms 8 + Table 3 end-to-end 9 (all pass)
```

Demo accounts: `admin@hacktrack.dev / admin123`, `judge@hacktrack.dev / judge123` (Lena Brandt, JUDGE_014), `participant@hacktrack.dev / participant123` (Vaishnavi, team Void Runners, draft project "Quorum"), `solo@hacktrack.dev / participant123` (no team). Other seeded users use `hacktrack123`.

**Before the viva:** `npm run seed`, then `npm run client:demo`, then `npm run start:all`. Seeding long before the viva means the deadline will have passed and submissions will be locked.

Viva features: Data Structures page; Protocol trace button; Administration → System → fault injection (server returns 503 for 30%/60% of requests, so retries show in the trace); delete a team + Undo; Analytics → Run benchmark; the project page shows BST vs binary vs linear comparison counts.

## 6. Git state

- Branch `main`, 7 commits, clean working tree when this file was written (this HANDOFF.md is new and uncommitted):
  ```
  115fe7e Fix start-all leaving the website server orphaned on Windows
  2d8d3eb Phase 4: website reads everything through the C++ client
  fc866c1 Stop tracking local tooling output (graphify-out, .vscode)
  107e49a Phase 3: C++ protocol layer, feature modules, bridge, console and demo modes
  5611c12 Phase 2: Node + SQLite backend server with rules, auth and seed data
  4715980 Phase 1: hand-written data structures, sorts, searches and unit tests
  050c75f Baseline: existing Next.js frontend (mock data)
  ```
- History was rewritten with `git filter-branch` to drop `graphify-out/` and `.vscode/` (both still on disk, now gitignored). Backup refs were deleted and gc'd.
- Remote `origin` = `https://github.com/vaishnavibhagwat03-glitch/HackTrack.git`. **Every push failed with 403**: the git credential on this PC is GitHub user `vaishnavibhagwat`, which has no write access to `vaishnavibhagwat03-glitch/HackTrack`. `gh` CLI is not installed. **The user said they will provide the repo.** Next step: set the remote they give (`git remote set-url origin <url>`), make sure the signed-in account has write access, then `git push -u origin main`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Git identity: Vaishnavi Bhagwat.
- `git commit --amend` was blocked by the permission classifier; use new commits instead.

## 7. Report update (done)

- Output: `C:\Users\athar\OneDrive\Desktop\SY\DS-1\HackTrack_Course_Project_Report_B3_updated.docx` (+ `.pdf`). The original is untouched.
- **Rewritten text:** abstract, objective 1 (plus a new objective), scope, 2.1 architecture, 2.3 step 2, 3.1, 3.2, 3.3, 4 Implementation, 5.1 (new note that tests are automated), 5.2 text, conclusion, future scope (GUI removed).
- **Tables:** 1 (admin and participant features) and 2 (hashing row) corrected. Tables 4 and 5 use new benchmark numbers (seed 2026).
- **Listing 1:** replaced with the real algorithm (shortage list + `setHead`).
- **Figures:**
  - Figure 1 redrawn: architecture with the website.
  - Figure 3 redrawn: shortage branch, `PUT /v1/assignments`.
  - Figure 4: real console output.
  - Figure 5: website submission page.
  - Figure 6 is new: Data Structures page.
- **Contents page numbers** fixed by hand (they are typed text, not a TOC field). The report is now 15 pages.
- The work files (edit script, figure HTML, renders) were in the old session's temp scratchpad and may be gone. To edit again: unzip the docx, run the docx skill's `merge_runs.py`, edit `word/document.xml`, rezip with Python (`[Content_Types].xml` first), validate with `PYTHONUTF8=1 python .../validate.py`, render with Word COM (`SaveAs2(path, 17)`) + PyMuPDF.

## 8. Gotchas learned (Windows + OneDrive environment)

- **Stale `.next` cache** in OneDrive caused 404s on dynamic routes (`/projects/[id]`, `/judging/[id]`). Fix: stop the dev server, delete `.next`.
- **Orphaned Next dev server:** fixed in `scripts/start-all.mjs` (`taskkill /T /F` on the child tree). Symptom was "Another next dev server is already running" plus hung page loads.
- **C++ binaries** are linked with `-static` (MinGW) so they run without MSYS2 on PATH. Without it, `ht_integration.exe` exited 127 (missing `libwinpthread-1.dll`).
- **cpp-httplib thread starvation:** browsers' idle keep-alive connections each hold a worker thread. The bridge now uses `ThreadPool(64)` and a 1 s keep-alive.
- **Git Bash mangles args** starting with `/` (e.g. `/results` became `C:/Program Files/Git/results`). Use `MSYS_NO_PATHCONV=1`.
- **Browser tests:** Playwright's bundled Chromium is not installed; use `chromium.launch(channel="msedge")`. Wait for `load`, not `domcontentloaded`, before clicking (hydration).
- **Python:** for scripts that print unicode, set `PYTHONUTF8=1`. Installed during the session: defusedxml, lxml, pymupdf. No pandoc, LibreOffice, Poppler or `zip`; MS Word 16 is available via COM.
- **No `make`:** use Ninja (`C:\msys64\ucrt64\bin\ninja.exe`); g++ 16.2 is in `C:\msys64\ucrt64\bin`.
- **The Node server must be stopped before `npm run seed`** (the DB file is locked on Windows).
- **Next.js 16:** `AGENTS.md` says to read `node_modules/next/dist/docs/` before using new APIs. `devIndicators: false` is set in `next.config.ts`.

## 9. Open items / not yet done

1. **Push to GitHub.** Repo confirmed: `vaishnavibhagwat03-glitch/HackTrack`. Push still 403s because Windows has GitHub user `vaishnavibhagwat` cached. Needs either that account added as a collaborator, or the cached credential replaced with the `vaishnavibhagwat03-glitch` login.
2. ~~Landing-page flap board ghosting~~ **Fixed (14 Nov).** Cause: tiles are 82% opaque and the static bottom half kept the previous drum glyph after the flap landed. Overlays now render only while moving (`landed` state in `Hero.tsx`). Also removed the Architecture and Run-it landing sections and the "Under the hood" feature column at the user's request (C++ details are for the README/viva).
3. **Not tested:** phone-sized layouts; the fault-injection buttons clicked in the browser (the retry logic itself is covered by the automated "server stopped" test).
4. **Landing animations** still use the illustrative sample dataset (isolated in `components/landing/experience/`). Everything behind sign-in, plus `/gallery` and `/embed`, is live.
5. **Behaviour to explain in the viva:** editing an already-submitted score sets it back to "in progress" until it is submitted again.
6. **Building needs tools** (Node 22.13+, CMake, Ninja, g++/MSVC). Teammates without them cannot build the C++ client.
7. **Possible extras if the user wants:** commit the updated report into the repo (e.g. `docs/`); AVL tree; parallel request handling.

## 10. How to resume

Start the new chat with something like:

> Read `HANDOFF.md` in the project root. That is the full context of our previous session. Continue from the open items.
