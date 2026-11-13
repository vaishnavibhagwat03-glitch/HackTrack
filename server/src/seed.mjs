// Demo data. Run `npm run seed` to wipe and re-create the database.
// Judge assignments and scores are NOT seeded here: run `hacktrack --demo`
// so the C++ client assigns judges and submits scores through the protocol.
import { rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { DEFAULT_DB, openDb, tx } from "./db.mjs";
import { hashPassword, initials } from "./app.mjs";

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pad = (n, w = 3) => String(n).padStart(w, "0");
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const DEMO_PASSWORDS = { admin: "admin123", judge: "judge123", participant: "participant123", others: "hacktrack123" };

const TRACKS = [
  ["core", "TRK-01", "Full Platform", "End-to-end lifecycle: auth, teams, submissions, judging, results."],
  ["judging", "TRK-02", "Judging Engine", "Rubrics, assignment, normalization and judge ergonomics."],
  ["community", "TRK-03", "Community & Trust", "Voting, comments, anti-abuse and audit trails."],
  ["devex", "TRK-04", "Integrations & API", "REST API, webhooks, embeds, certificates and bulk I/O."],
];
const PRIZES = [
  ["grand", "Grand Prize", "₹1,00,000", null],
  ["judging", "Best Judging Engine", "₹30,000", "judging"],
  ["community", "Best Community Experience", "₹30,000", "community"],
  ["devex", "Best Developer Platform", "₹30,000", "devex"],
  ["people", "People's Choice", "₹15,000", null],
];
// Generalized list: groups with sub-criteria, plus a plain atom (Impact).
export const RUBRIC = [
  { id: "innovation", name: "Innovation", weight: 25, description: "Does it rethink how hackathons are run, or reproduce what exists?", children: [
    { id: "originality", name: "Originality", weight: 60, maxScore: 10, description: "How new is the idea?" },
    { id: "problem_fit", name: "Problem fit", weight: 40, maxScore: 10, description: "Does it solve a real organiser pain?" },
  ] },
  { id: "execution", name: "Technical Execution", weight: 30, description: "Correctness, robustness and code quality.", children: [
    { id: "correctness", name: "Correctness", weight: 50, maxScore: 10, description: "Does it work end to end without errors?" },
    { id: "code_quality", name: "Code quality", weight: 50, maxScore: 10, description: "Structure, tests, readability." },
  ] },
  { id: "impact", name: "Impact", weight: 20, maxScore: 10, description: "Would organisers adopt it tomorrow?" },
  { id: "design", name: "Design", weight: 25, description: "Clarity of UX for participants, judges and organisers.", children: [
    { id: "usability", name: "Usability", weight: 60, maxScore: 10, description: "Can each role finish their task quickly?" },
    { id: "visual", name: "Visual polish", weight: 40, maxScore: 10, description: "Consistent, readable, accessible." },
  ] },
];

const JUDGES = [
  ["JUDGE_003", "Priya Raman", "Distributed Systems Lead", "IN"],
  ["JUDGE_007", "Marcus Hale", "Principal Engineer, Payments", "US"],
  ["JUDGE_011", "Yuki Tanaka", "Design Engineer", "JP"],
  ["JUDGE_014", "Lena Brandt", "Staff SRE", "DE"],
  ["JUDGE_018", "Omar Farouk", "Security Researcher", "EG"],
  ["JUDGE_021", "Ines Duarte", "Developer Advocate", "PT"],
  ["JUDGE_026", "Kwame Mensah", "CTO, Seed-stage Startup", "GH"],
  ["JUDGE_032", "Sofia Rossi", "Open Source Maintainer", "IT"],
];

// [name, tagline, stack, track, team, description, draft?]
const SEEDS = [
  ["Tribunal", "A single Go binary that runs your entire hackathon from a USB stick.", ["Go", "SQLite", "htmx"], "core", "Null Pointers", "Tribunal compiles the full event lifecycle — registration, teams, submissions, judging and results — into one 18 MB binary with an embedded SQLite database. No containers, no runtime, no network required."],
  ["Quorum", "Real-time judging with live consensus tracking across panels.", ["Elixir", "Phoenix LiveView", "Postgres"], "judging", "Void Runners", "Quorum streams every score to a live consensus view so head judges can see disagreement as it happens. When two judges diverge by more than two points on a criterion, the project is flagged for a calibration conversation.", true],
  ["Gavel", "Rubric-first judging that tells judges exactly where they're drifting.", ["Rust", "Axum", "SQLite"], "judging", "Iron Lattice", "Gavel tracks each judge's scoring distribution in real time and surfaces gentle drift warnings. Scores are stored as immutable events so every adjustment is explainable."],
  ["Scorecard", "Hackathon ops in a box with zero-config Docker Compose.", ["Next.js", "Prisma", "SQLite"], "core", "Paper Planes", "One `docker compose up` gives organisers a complete platform with seeded demo data, role-based dashboards and CSV exports."],
  ["Arbiter", "Bias-aware score normalization with explainable adjustments.", ["Python", "FastAPI", "DuckDB"], "judging", "Signal & Noise", "Arbiter applies per-judge z-score normalization and shows every participant exactly how raw scores became final scores."],
  ["Ledgerline", "Append-only audit trail with hash-chained event records.", ["Go", "Postgres", "React"], "community", "Merkle Street", "Every state change — a vote, a score, a deadline extension — is written to a hash-chained ledger that anyone can verify offline."],
  ["Jury Box", "Keyboard-driven judge console. Score 40 projects before lunch.", ["SvelteKit", "Drizzle", "SQLite"], "judging", "Hotkeys Anonymous", "Jury Box treats judging like a code review queue: J/K to move, number keys to score, Enter to submit."],
  ["Commons", "Community voting that resists brigading without CAPTCHAs.", ["Django", "HTMX", "Redis"], "community", "Open Floor", "Commons combines account age, velocity limits and vote-graph clustering to detect coordinated voting."],
  ["Hackbase", "Rails 8 monolith with Solid Queue webhooks and CSV everything.", ["Rails 8", "Hotwire", "SQLite"], "core", "Monorail", "Hackbase leans on boring technology: a single Rails app, SQLite in production and background jobs without Redis."],
  ["Relay", "Webhooks and REST API with signed payloads and replay.", ["Bun", "Hono", "SQLite"], "devex", "Packet Loss", "Relay exposes the complete platform over a versioned REST API with HMAC-signed webhooks and retry with exponential backoff."],
  ["Exhibit", "Embeddable project gallery as a 4 KB web component.", ["Lit", "Deno", "SQLite"], "devex", "Small Batch", "Drop one script tag into any page and Exhibit renders a live, filterable gallery of submitted projects."],
  ["Certify", "Verifiable certificates with offline signature checks.", ["TypeScript", "Ed25519", "SQLite"], "devex", "Proof of Work", "Certify issues certificates signed with the instance's Ed25519 key, verifiable without contacting the server."],
  ["Panel", "Laravel + Livewire platform with role isolation by design.", ["Laravel", "Livewire", "MySQL"], "core", "Artisan Collective", "Panel enforces role isolation at the query layer: a judge's session cannot read another judge's scores."],
  ["Consensus", "Pairwise comparison judging using Bradley–Terry ranking.", ["Python", "Litestar", "Postgres"], "judging", "Pairwise", "Instead of absolute scores, judges answer 'which of these two is better?' and a Bradley–Terry model produces the ranking."],
  ["Townhall", "Threaded project comments with moderation queues.", ["Remix", "Postgres", "Tailwind"], "community", "Front Porch", "Townhall brings respectful discussion to project pages with threaded comments, rate limits and a moderation queue."],
  ["Kickoff", "From CSV import to live event in under five minutes.", [".NET 9", "Blazor", "SQLite"], "core", "Blue Screen Club", "Kickoff's setup wizard imports participants, judges, tracks and prizes from CSV and generates invite links in bulk."],
  ["Beacon", "Deadline enforcement with server-authoritative clocks.", ["Kotlin", "Ktor", "Postgres"], "core", "Latency Zero", "Beacon never trusts the client clock. Submissions lock at the server's deadline and every lock event is audited."],
  ["Shortlist", "Judge assignment solver balancing load and conflicts of interest.", ["Go", "OR-Tools", "SQLite"], "judging", "Constraint Solvers", "Shortlist formulates judge assignment as a constraint problem: equal load, minimum coverage and zero conflicts of interest."],
  ["Plaza", "Public voting with randomized order and fairness metrics.", ["Vue 3", "Nitro", "SQLite"], "community", "Fair Share", "Plaza randomizes project order per voter and tracks position bias across the event."],
  ["Stackrank", "Hackathon platform with a first-class GraphQL and REST API.", ["NestJS", "Postgres", "React"], "devex", "Schema First", "Stackrank is API-first: the web UI is just one client of a documented REST and GraphQL API."],
  ["Hearth", "Offline-first PWA for judges in venues with bad Wi-Fi.", ["React", "IndexedDB", "Hono"], "judging", "No Signal", "Hearth caches the judge's queue locally and syncs scores when connectivity returns."],
  ["Dossier", "Every submission becomes a structured, exportable case file.", ["Phoenix", "Elixir", "SQLite"], "core", "Case Closed", "Dossier structures submissions into typed fields so judges compare like with like."],
  ["Sentinel", "Rate limiting and duplicate-vote detection as a drop-in module.", ["Rust", "Tower", "Redis"], "community", "Byte Guard", "Sentinel adds sliding-window rate limits and duplicate detection to any voting endpoint."],
  ["Forge", "Bulk import/export engine with dry-run diffs.", ["Python", "Django", "Postgres"], "devex", "Migration Crew", "Forge validates bulk imports row by row, shows a diff and applies it in a single transaction."],
  ["Podium", "Cinematic results reveal for live stage presentations.", ["SolidStart", "SQLite", "Canvas"], "community", "Stage Left", "Podium turns the results announcement into a stage-ready presenter mode with keyboard-controlled reveals."],
  ["Gatekeeper", "RBAC with policy-as-code and permission diff reviews.", ["Go", "Cedar", "Postgres"], "core", "Least Privilege", "Gatekeeper expresses every permission as a policy checked on the server."],
  ["Meridian", "Multi-timezone event scheduling that never confuses UTC.", ["Deno", "Fresh", "SQLite"], "core", "Timezone Hell", "Meridian shows every deadline in UTC and local time side by side.", true],
  ["Tally", "A minimal voting service in 800 lines of Zig.", ["Zig", "SQLite"], "community", "Low Level", "Tally is a complete voting service with duplicate detection and rate limiting in under 800 lines.", true],
  ["Crucible", "End-to-end tested hackathon platform with 94% coverage.", ["Spring Boot", "Kotlin", "Postgres"], "core", "Test Pilots", "Crucible ships with 1,100 tests including full-lifecycle end-to-end scenarios."],
  ["Signal", "Webhook fan-out to Slack, Discord and Matrix — self-hosted.", ["Gleam", "Wisp", "SQLite"], "devex", "Actor Model", "Signal subscribes to platform events and fans them out to chat platforms.", true],
];
const PROJECT_IDS = [47, 12, 81, 112, 5, 23, 64, 38, 90, 17, 101, 56, 73, 29, 118, 44, 9, 86, 33, 125, 61, 97, 14, 70, 108, 52, 131, 136, 3, 140];

const FIRST = ["Aarav", "Sarah", "Rahul", "Ananya", "Jonas", "Aiko", "Diego", "Fatima", "Noah", "Ishita", "Kenji", "Amara", "Leo", "Zara", "Mateo", "Hana", "Ivan", "Nia", "Omkar", "Priya", "Tanvi", "Elif", "Chen", "Ada", "Felix", "Imani", "Soren", "Yara", "Ravi", "Mila"];
const LAST = ["Chen", "Lindqvist", "Menon", "Kulkarni", "Weber", "Sato", "Alvarez", "Haddad", "Kim", "Joshi", "Ito", "Nwosu", "Novak", "Rahman", "Silva", "Park", "Petrov", "Patil", "Larsen", "Iyer", "Costa", "Yilmaz", "Wu", "Deshmukh", "Kowalski", "Osei", "Berg", "Nasser", "Kapoor", "Shinde"];
const COUNTRIES = ["IN", "IN", "IN", "DE", "JP", "NG", "BR", "US", "FR", "KR", "SE", "CA", "PT", "KE"];

// Judge <-> team conflicts of interest (former colleagues, mentors, relatives...).
const CONFLICTS = [
  ["JUDGE_007", "Iron Lattice", "Former employer of team captain"],
  ["JUDGE_014", "Null Pointers", "Mentored this team"],
  ["JUDGE_014", "Void Runners", "Same company as a member"],
  ["JUDGE_021", "Packet Loss", "Co-author of their library"],
  ["JUDGE_003", "Signal & Noise", "Relative on the team"],
  ["JUDGE_011", "Stage Left", "Advised during the event"],
  ["JUDGE_026", "Schema First", "Investor in the team's startup"],
  ["JUDGE_032", "Open Floor", "Maintains a dependency they forked"],
];

const COMMENTS = [
  "Ran this locally on an old ThinkPad — booted in under a second. Seriously impressive.",
  "How do you handle a judge who is assigned a project from their own company?",
  "The audit export is exactly what our college fest needed last year.",
  "Love that it works fully offline. Our venue Wi-Fi died twice at our last event.",
  "Would be great to see the scoring strategy documented in the README.",
  "Clean keyboard shortcuts. Scored the demo queue without touching the mouse.",
];

export function seed(db) {
  const rng = mulberry32(2026);
  const NOW = Date.now();
  const START = NOW - 30 * 3600e3;
  const pw = { admin: hashPassword(DEMO_PASSWORDS.admin), judge: hashPassword(DEMO_PASSWORDS.judge), participant: hashPassword(DEMO_PASSWORDS.participant), others: hashPassword(DEMO_PASSWORDS.others) };

  tx(db, () => {
    for (const t of ["audit", "comments", "votes", "assignments", "conflicts", "projects", "team_members", "teams", "sessions", "judges", "users", "rubric", "prizes", "tracks", "event"])
      db.exec(`DELETE FROM ${t}`);

    const ins = (sql, ...a) => db.prepare(sql).run(...a);
    ins(`INSERT INTO event (id, name, tagline, starts_at, deadline, results_at, judging_open, voting_open, results_published, judges_per_project, max_team_size, votes_per_user)
         VALUES (1, 'HackTrack 2026', 'Build it, ship it, get judged fairly.', ?, ?, ?, 1, 1, 0, 3, 5, 3)`,
      iso(START), iso(NOW + 2 * 864e5), iso(NOW + 4 * 864e5));
    for (const t of TRACKS) ins("INSERT INTO tracks (id, code, name, description) VALUES (?, ?, ?, ?)", ...t);
    for (const p of PRIZES) ins("INSERT INTO prizes (id, name, amount, track_id, winners) VALUES (?, ?, ?, ?, 1)", ...p);
    ins("INSERT INTO rubric (id, json) VALUES (1, ?)", JSON.stringify(RUBRIC));

    const user = (id, name, email, handle, role, country, hash) =>
      ins("INSERT INTO users (id, name, email, handle, role, country, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        id, name, email, handle, role, country, hash, iso(START - 864e5));

    user("u_001", "Sumit Bansode", "admin@hacktrack.dev", "ADMIN", "admin", "IN", pw.admin);
    JUDGES.forEach(([jid, name, title, country], i) => {
      const uid = `u_${pad(2 + i)}`;
      const email = jid === "JUDGE_014" ? "judge@hacktrack.dev" : `${slug(name).replace(/-/g, ".")}@judges.hacktrack.dev`;
      user(uid, name, email, jid, "judge", country, jid === "JUDGE_014" ? pw.judge : pw.others);
      ins("INSERT INTO judges (id, user_id, title) VALUES (?, ?, ?)", jid, uid, title);
    });

    let nextUser = 100;
    const teamIdByName = new Map();
    SEEDS.forEach(([name, tagline, stack, track, teamName, description, draft], i) => {
      const teamId = `t${pad(i + 1, 2)}`;
      teamIdByName.set(teamName, teamId);
      const created = START + rng() * 6 * 3600e3;
      const code = (teamName.replace(/[^A-Za-z]/g, "").slice(0, 3) + Math.floor(rng() * 46656).toString(36)).toUpperCase().padEnd(6, "X").slice(0, 6);
      ins("INSERT INTO teams (id, name, invite_code, created_at) VALUES (?, ?, ?, ?)", teamId, teamName, code, iso(created));

      const members = teamName === "Void Runners"
        ? [["Vaishnavi Bhagwat", "participant@hacktrack.dev", "IN"], ["Vipul Bangar", null, "IN"], ["Kanan Badoliya", null, "IN"]]
        : Array.from({ length: 2 + Math.floor(rng() * 3) }, () => [`${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`, null, COUNTRIES[Math.floor(rng() * COUNTRIES.length)]]);
      members.forEach(([mname, email, country], m) => {
        const uid = `u_${pad(nextUser)}`;
        const handle = `PARTICIPANT_${pad(nextUser)}`;
        nextUser++;
        user(uid, mname, email ?? `${handle.toLowerCase()}@hacktrack.dev`, handle, "participant", country, email ? pw.participant : pw.others);
        ins("INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)", teamId, uid, m === 0 ? "captain" : "member", iso(created + m * 600e3));
      });

      const submitted = draft ? null : START + (2 + rng() * 24) * 3600e3;
      ins(`INSERT INTO projects (id, team_id, name, tagline, description, track_id, stack, status, submitted_at, updated_at, repo, demo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        PROJECT_IDS[i], teamId, name, tagline, description, track, JSON.stringify(stack), draft ? "draft" : "submitted",
        submitted ? iso(submitted) : null, iso((submitted ?? NOW - 3600e3) - rng() * 3600e3),
        `github.com/${slug(teamName)}/${slug(name)}`, `${slug(name)}.demo.hacktrack.dev`);
    });

    // Participants without a team (to demo create / join).
    for (const [name, email] of [["Rohan Kulkarni", "solo@hacktrack.dev"], ["Sneha Patil", null], ["Arjun Deshmukh", null]]) {
      const handle = `PARTICIPANT_${pad(nextUser)}`;
      user(`u_${pad(nextUser)}`, name, email ?? `${handle.toLowerCase()}@hacktrack.dev`, handle, "participant", "IN", email ? pw.participant : pw.others);
      nextUser++;
    }

    for (const [jid, teamName, reason] of CONFLICTS)
      ins("INSERT INTO conflicts (judge_id, team_id, reason) VALUES (?, ?, ?)", jid, teamIdByName.get(teamName), reason);

    // Community votes and comments.
    const participants = db.prepare("SELECT u.id, m.team_id FROM users u LEFT JOIN team_members m ON m.user_id = u.id WHERE u.role = 'participant'").all();
    const submittedProjects = db.prepare("SELECT id, team_id FROM projects WHERE status = 'submitted'").all();
    for (const p of participants) {
      const want = Math.floor(rng() * 4);
      const chosen = new Set();
      for (let k = 0; k < 10 && chosen.size < want; k++) {
        const pr = submittedProjects[Math.floor(Math.pow(rng(), 1.6) * submittedProjects.length)];
        if (pr.team_id !== p.team_id) chosen.add(pr.id);
      }
      for (const pid of chosen) ins("INSERT INTO votes (user_id, project_id, created_at) VALUES (?, ?, ?)", p.id, pid, iso(START + rng() * 28 * 3600e3));
    }
    for (const pr of submittedProjects) {
      const n = Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const author = participants[Math.floor(rng() * participants.length)];
        ins("INSERT INTO comments (project_id, user_id, body, created_at) VALUES (?, ?, ?, ?)",
          pr.id, author.id, COMMENTS[Math.floor(rng() * COMMENTS.length)], iso(START + rng() * 28 * 3600e3));
      }
    }
    ins("INSERT INTO audit (at, actor, action, object, ip, detail) VALUES (?, 'SYSTEM', 'DATABASE_SEEDED', 'EVENT', '127.0.0.1', ?)",
      iso(NOW), `${SEEDS.length} teams, ${JUDGES.length} judges, ${nextUser - 100 + 9} users`);
  });
}

// `node src/seed.mjs` — wipe and re-seed.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  for (const f of [DEFAULT_DB, `${DEFAULT_DB}-wal`, `${DEFAULT_DB}-shm`]) rmSync(f, { force: true });
  const db = openDb(DEFAULT_DB);
  seed(db);
  const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  console.log(`Seeded ${DEFAULT_DB}: ${count("users")} users, ${count("teams")} teams, ${count("projects")} projects, ${count("judges")} judges, ${count("conflicts")} conflicts, ${count("votes")} votes`);
  console.log("Demo logins: admin@hacktrack.dev / admin123 · judge@hacktrack.dev / judge123 · participant@hacktrack.dev / participant123 · solo@hacktrack.dev / participant123");
}
