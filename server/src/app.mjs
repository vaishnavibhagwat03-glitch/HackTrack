// HackTrack server: applies the rules and talks to the database.
// It is deliberately "dumb" about computation — ranking, judge assignment,
// conflict search, vote tallying and caching all happen in the C++ client.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { tx } from "./db.mjs";
import { GoogleTokenError } from "./google.mjs";

// ── helpers ──────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const bad = (code, msg) => new HttpError(400, code, msg);
const unprocessable = (code, msg) => new HttpError(422, code, msg);
const conflict = (code, msg) => new HttpError(409, code, msg);
const forbidden = (msg = "You are not allowed to do this") => new HttpError(403, "Forbidden", msg);
const notFound = (what) => new HttpError(404, "NotFound", `${what} not found`);

export const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const pad = (n, w = 3) => String(n).padStart(w, "0");
const SESSION_DAYS = 7;

export function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
}
// Stored instead of a hash for accounts created with Google: no password matches it.
const NO_PASSWORD = "google-only";
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !/^[0-9a-f]{64}$/.test(hash ?? "")) return false;
  const got = scryptSync(pw, salt, 32);
  return timingSafeEqual(got, Buffer.from(hash, "hex"));
}
export const initials = (name) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
export function inviteCode(db) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (;;) {
    let c = "";
    for (const b of randomBytes(6)) c += alphabet[b % alphabet.length];
    if (!db.prepare("SELECT 1 FROM teams WHERE invite_code = ?").get(c)) return c;
  }
}
const str = (v, field, { min = 0, max = 10_000, optional = false } = {}) => {
  if (v == null && optional) return undefined;
  if (typeof v !== "string") throw bad("InvalidField", `${field} must be text`);
  const t = v.trim();
  if (t.length < min) throw bad("InvalidField", `${field} must be at least ${min} characters`);
  if (t.length > max) throw bad("InvalidField", `${field} must be at most ${max} characters`);
  return t;
};
const json = (s, fallback) => {
  try { return JSON.parse(s); } catch { return fallback; }
};

// ── row mappers (shapes match the website's TypeScript types) ─

const userOut = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, handle: u.handle, country: u.country,
  teamId: u.team_id ?? null, judgeId: u.judge_id ?? null,
});
const projectOut = (p) => ({
  id: p.id, code: `PROJECT ${pad(p.id)}`, slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  name: p.name, tagline: p.tagline, description: p.description, trackId: p.track_id, teamId: p.team_id,
  stack: json(p.stack, []), status: p.status, submittedAt: p.submitted_at, updatedAt: p.updated_at, repo: p.repo, demo: p.demo,
});
const assignmentOut = (a) => ({
  judgeId: a.judge_id, projectId: a.project_id, status: a.status, scores: json(a.scores, {}),
  confidence: a.confidence, notes: a.notes, submittedAt: a.submitted_at, updatedAt: a.updated_at,
});
const eventOut = (e) => ({
  name: e.name, tagline: e.tagline, startsAt: e.starts_at, deadline: e.deadline, resultsAt: e.results_at,
  judgingOpen: !!e.judging_open, votingOpen: !!e.voting_open, resultsPublished: !!e.results_published,
  judgesPerProject: e.judges_per_project, maxTeamSize: e.max_team_size, votesPerUser: e.votes_per_user,
});

// ── app ──────────────────────────────────────────────────────

/** google: verifier from createGoogleVerifier(); without one, Google sign-in is switched off. */
/**
 * google           - Google ID-token verifier (google.mjs), or null when Google sign-in is off.
 * blockedPasswords - passwords refused at sign-in and sign-up. A public deployment passes the
 *                    published demo passwords here (HACKTRACK_DEMO_LOGINS=off), so nobody can
 *                    sign in as the demo judge or participants.
 */
export function createApp(db, { google = null, blockedPasswords = [] } = {}) {
  const blocked = new Set(blockedPasswords);
  const q = (sql) => db.prepare(sql);
  const event = () => q("SELECT * FROM event WHERE id = 1").get();

  const userById = (id) =>
    q(`SELECT u.*, m.team_id, j.id AS judge_id FROM users u
       LEFT JOIN team_members m ON m.user_id = u.id LEFT JOIN judges j ON j.user_id = u.id WHERE u.id = ?`).get(id);

  function teamOut(t) {
    const members = q(
      `SELECT u.id, u.name, u.handle, u.country, m.role FROM team_members m JOIN users u ON u.id = m.user_id
       WHERE m.team_id = ? ORDER BY m.role = 'captain' DESC, m.joined_at, u.name`,
    ).all(t.id);
    const p = q("SELECT id FROM projects WHERE team_id = ?").get(t.id);
    return {
      id: t.id, name: t.name, inviteCode: t.invite_code, createdAt: t.created_at, projectId: p?.id ?? null,
      members: members.map((m) => ({ userId: m.id, name: m.name, handle: m.handle, role: m.role, country: m.country, initials: initials(m.name) })),
    };
  }
  const teamRow = (id) => q("SELECT * FROM teams WHERE id = ?").get(id);
  const judgeRows = () =>
    q("SELECT j.id, j.title, u.id AS user_id, u.name, u.handle FROM judges j JOIN users u ON u.id = j.user_id ORDER BY j.id").all();
  const judgeOut = (j) => ({ id: j.id, userId: j.user_id, name: j.name, handle: j.handle, title: j.title });

  function audit(ctx, action, object, detail = "") {
    q("INSERT INTO audit (at, actor, action, object, ip, detail) VALUES (?, ?, ?, ?, ?, ?)").run(
      now(), ctx.user?.handle ?? "SYSTEM", action, object, ctx.ip, detail,
    );
  }

  function authUser(ctx, required = true) {
    if (ctx.user !== undefined) {
      if (!ctx.user && required) throw new HttpError(401, "Unauthorized", "Sign in first");
      return ctx.user;
    }
    const m = /^Bearer\s+(\S+)$/i.exec(ctx.headers.authorization ?? "");
    let user = null;
    if (m) {
      const s = q("SELECT * FROM sessions WHERE token = ?").get(m[1]);
      if (s && s.expires_at > now()) user = userById(s.user_id) ?? null;
    }
    ctx.user = user;
    if (!user && required) throw new HttpError(401, "Unauthorized", "Your session has expired. Sign in again.");
    return user;
  }
  function role(ctx, ...roles) {
    const u = authUser(ctx);
    if (!roles.includes(u.role)) throw forbidden(`Only ${roles.join(" or ")} accounts can do this`);
    return u;
  }
  const deadlinePassed = () => now() > event().deadline;

  function newSession(userId) {
    const token = randomBytes(24).toString("hex");
    const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString().replace(/\.\d{3}Z$/, "Z");
    q("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(token, userId, now(), exp);
    return token;
  }
  function nextId(table, prefix, width) {
    const rows = q(`SELECT id FROM ${table} WHERE id LIKE ?`).all(`${prefix}%`);
    let max = 0;
    for (const r of rows) { const n = parseInt(r.id.slice(prefix.length), 10); if (n > max) max = n; }
    return `${prefix}${pad(max + 1, width)}`;
  }

  /** Leaf criteria of the generalized-list rubric: id -> maxScore. */
  function rubricLeaves() {
    const tree = json(q("SELECT json FROM rubric WHERE id = 1").get()?.json ?? "[]", []);
    const out = new Map();
    const walk = (nodes) => { for (const n of nodes) n.children ? walk(n.children) : out.set(n.id, n.maxScore ?? 10); };
    walk(tree);
    return out;
  }
  function validateRubric(nodes, depth = 0) {
    if (!Array.isArray(nodes) || !nodes.length) throw unprocessable("InvalidRubric", "Every rubric group needs at least one criterion");
    if (depth > 3) throw unprocessable("InvalidRubric", "Rubric is nested too deeply");
    for (const n of nodes) {
      str(n.id, "criterion id", { min: 1, max: 40 });
      str(n.name, "criterion name", { min: 1, max: 80 });
      if (!(typeof n.weight === "number" && n.weight > 0)) throw unprocessable("InvalidRubric", `Weight of ${n.name} must be positive`);
      if (n.children) validateRubric(n.children, depth + 1);
      else if (n.maxScore != null && !(n.maxScore > 0)) throw unprocessable("InvalidRubric", `Max score of ${n.name} must be positive`);
    }
  }

  function teamSnapshot(teamId) {
    const t = teamRow(teamId);
    if (!t) throw notFound("Team");
    const p = q("SELECT * FROM projects WHERE team_id = ?").get(teamId);
    return {
      team: t,
      members: q("SELECT * FROM team_members WHERE team_id = ?").all(teamId),
      project: p ?? null,
      assignments: p ? q("SELECT * FROM assignments WHERE project_id = ?").all(p.id) : [],
      votes: p ? q("SELECT * FROM votes WHERE project_id = ?").all(p.id) : [],
      comments: p ? q("SELECT * FROM comments WHERE project_id = ?").all(p.id) : [],
      conflicts: q("SELECT * FROM conflicts WHERE team_id = ?").all(teamId),
    };
  }
  function insertRow(table, row) {
    const keys = Object.keys(row);
    q(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...keys.map((k) => row[k]));
  }

  // ── routes ─────────────────────────────────────────────────

  const routes = [];
  const route = (method, pattern, handler) =>
    routes.push([method, new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), handler]);

  route("GET", "/v1/health", () => ({ ok: true, time: now() }));

  // auth
  route("POST", "/v1/auth/signup", (ctx) => {
    const b = ctx.body;
    const name = str(b.name, "Name", { min: 2, max: 80 });
    const email = str(b.email, "Email", { min: 3, max: 120 }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad("InvalidField", "Enter a valid email address");
    const password = typeof b.password === "string" ? b.password : "";
    if (password.length < 6) throw bad("InvalidField", "Password must be at least 6 characters");
    if (blocked.has(password)) throw bad("InvalidField", "This password is published on the demo page. Choose another one");
    if (q("SELECT 1 FROM users WHERE email = ?").get(email)) throw conflict("EmailTaken", "An account with this email already exists");
    const id = nextId("users", "u_", 3);
    const handle = `PARTICIPANT_${id.slice(2)}`;
    q("INSERT INTO users (id, name, email, handle, role, country, password_hash, created_at) VALUES (?, ?, ?, ?, 'participant', ?, ?, ?)")
      .run(id, name, email, handle, str(b.country ?? "", "Country", { max: 2 }).toUpperCase(), hashPassword(password), now());
    const token = newSession(id);
    ctx.user = userById(id);
    audit(ctx, "USER_SIGNED_UP", handle, "Participant account created");
    return { status: 201, body: { token, user: userOut(ctx.user) } };
  });

  route("POST", "/v1/auth/login", (ctx) => {
    const email = str(ctx.body.email ?? "", "Email").toLowerCase();
    if (blocked.has(String(ctx.body.password ?? "")))
      throw new HttpError(403, "DemoLoginsOff", "Demo accounts are switched off on this server");
    const u = q("SELECT * FROM users WHERE email = ?").get(email);
    if (!u || !checkPassword(String(ctx.body.password ?? ""), u.password_hash))
      throw new HttpError(401, "InvalidCredentials", "Wrong email or password");
    const token = newSession(u.id);
    ctx.user = userById(u.id);
    audit(ctx, "USER_LOGGED_IN", u.handle, "Session issued");
    return { token, user: userOut(ctx.user) };
  });

  // Sign in with Google. The browser got an ID token from Google; the C++ client
  // forwards it here. A verified Google email signs in to the account with that
  // email, or creates a new participant account.
  route("POST", "/v1/auth/google", (ctx) => {
    if (!google?.enabled) throw bad("GoogleSignInDisabled", "Google sign-in is not set up on this server");
    const credential = str(ctx.body.credential, "credential", { min: 20, max: 8192 });
    let g;
    try { g = google.verify(credential); } catch (e) {
      if (!(e instanceof GoogleTokenError)) throw e;
      if (e.retry) throw new HttpError(503, "GoogleKeysLoading", "Google sign-in is starting up. Try again in a moment.");
      throw new HttpError(401, "InvalidGoogleToken", `Google sign-in could not be verified (${e.reason})`);
    }
    let u = q("SELECT * FROM users WHERE email = ?").get(g.email);
    const created = !u;
    if (created) {
      const id = nextId("users", "u_", 3);
      const name = (g.name || g.email.split("@")[0]).slice(0, 80);
      q("INSERT INTO users (id, name, email, handle, role, country, password_hash, created_at) VALUES (?, ?, ?, ?, 'participant', '', ?, ?)")
        .run(id, name, g.email, `PARTICIPANT_${id.slice(2)}`, NO_PASSWORD, now());
      u = q("SELECT * FROM users WHERE id = ?").get(id);
    }
    const token = newSession(u.id);
    ctx.user = userById(u.id);
    if (created) audit(ctx, "USER_SIGNED_UP", u.handle, "Participant account created with Google");
    else audit(ctx, "USER_LOGGED_IN", u.handle, "Session issued (Google)");
    return { status: created ? 201 : 200, body: { token, user: userOut(ctx.user), created } };
  });

  route("POST", "/v1/auth/logout", (ctx) => {
    const m = /^Bearer\s+(\S+)$/i.exec(ctx.headers.authorization ?? "");
    if (m) q("DELETE FROM sessions WHERE token = ?").run(m[1]);
    return { ok: true };
  });

  route("GET", "/v1/me", (ctx) => userOut(authUser(ctx)));

  // event, tracks, prizes, rubric
  route("GET", "/v1/event", () => eventOut(event()));
  route("PUT", "/v1/event", (ctx) => {
    role(ctx, "admin");
    const before = eventOut(event());
    const b = ctx.body;
    const map = {
      name: ["name", (v) => str(v, "Name", { min: 2, max: 80 })],
      tagline: ["tagline", (v) => str(v, "Tagline", { max: 160 })],
      startsAt: ["starts_at", (v) => isoField(v, "Start")],
      deadline: ["deadline", (v) => isoField(v, "Deadline")],
      resultsAt: ["results_at", (v) => isoField(v, "Results date")],
      judgingOpen: ["judging_open", (v) => (v ? 1 : 0)],
      votingOpen: ["voting_open", (v) => (v ? 1 : 0)],
      resultsPublished: ["results_published", (v) => (v ? 1 : 0)],
      judgesPerProject: ["judges_per_project", (v) => intField(v, "Judges per project", 1, 10)],
      maxTeamSize: ["max_team_size", (v) => intField(v, "Max team size", 1, 10)],
      votesPerUser: ["votes_per_user", (v) => intField(v, "Votes per user", 1, 20)],
    };
    const changed = [];
    for (const [k, [col, conv]] of Object.entries(map)) {
      if (!(k in b)) continue;
      q(`UPDATE event SET ${col} = ? WHERE id = 1`).run(conv(b[k]));
      changed.push(k);
    }
    if (!changed.length) throw bad("NothingToUpdate", "No event fields were given");
    audit(ctx, "EVENT_UPDATED", "EVENT", `Changed: ${changed.join(", ")}`);
    return { before, after: eventOut(event()) };
  });
  route("GET", "/v1/tracks", () => q("SELECT * FROM tracks ORDER BY code").all());
  route("GET", "/v1/prizes", () => q("SELECT id, name, amount, track_id AS trackId, winners FROM prizes").all().map((p) => ({ ...p })));
  route("GET", "/v1/rubric", () => json(q("SELECT json FROM rubric WHERE id = 1").get()?.json ?? "[]", []));
  route("PUT", "/v1/rubric", (ctx) => {
    role(ctx, "admin");
    validateRubric(ctx.body.rubric);
    const before = json(q("SELECT json FROM rubric WHERE id = 1").get()?.json ?? "[]", []);
    q("INSERT OR REPLACE INTO rubric (id, json) VALUES (1, ?)").run(JSON.stringify(ctx.body.rubric));
    audit(ctx, "RUBRIC_UPDATED", "RUBRIC", "Rubric replaced");
    return { before, after: ctx.body.rubric };
  });

  // users & judges
  route("GET", "/v1/users", (ctx) => {
    role(ctx, "admin");
    return q(`SELECT u.*, m.team_id, j.id AS judge_id FROM users u LEFT JOIN team_members m ON m.user_id = u.id
              LEFT JOIN judges j ON j.user_id = u.id ORDER BY u.role, u.name`).all().map(userOut);
  });
  route("PUT", "/v1/users/:id/role", (ctx) => {
    const me = role(ctx, "admin");
    const u = userById(ctx.params.id);
    if (!u) throw notFound("User");
    const next = ctx.body.role;
    if (!["participant", "judge", "admin"].includes(next)) throw bad("InvalidField", "Role must be participant, judge or admin");
    if (u.id === me.id && next !== "admin") throw unprocessable("SelfDemotion", "You cannot remove your own admin role");
    const before = { role: u.role, judgeId: u.judge_id ?? null, title: u.judge_id ? q("SELECT title FROM judges WHERE id = ?").get(u.judge_id).title : null };
    tx(db, () => {
      if (next !== "participant" && u.team_id) throw unprocessable("InTeam", `${u.name} is in a team; remove them from it first`);
      q("UPDATE users SET role = ? WHERE id = ?").run(next, u.id);
      if (next === "judge" && !u.judge_id) {
        const jid = ctx.body.judgeId ?? nextId("judges", "JUDGE_", 3);
        q("INSERT INTO judges (id, user_id, title) VALUES (?, ?, ?)").run(jid, u.id, str(ctx.body.title ?? "Judge", "Title", { max: 80 }));
      }
      if (next !== "judge" && u.judge_id) q("DELETE FROM judges WHERE id = ?").run(u.judge_id);
    });
    audit(ctx, "ROLE_GRANTED", u.handle, `Role ${u.role} -> ${next}`);
    return { before, after: userOut(userById(u.id)) };
  });
  route("GET", "/v1/judges", (ctx) => { authUser(ctx); return judgeRows().map(judgeOut); });

  // teams
  route("GET", "/v1/teams", () => q("SELECT * FROM teams ORDER BY id").all().map(teamOut));
  route("GET", "/v1/teams/:id", (ctx) => {
    const t = teamRow(ctx.params.id);
    if (!t) throw notFound("Team");
    return teamOut(t);
  });
  route("POST", "/v1/teams", (ctx) => {
    const u = role(ctx, "participant");
    if (u.team_id) throw conflict("AlreadyInTeam", "You are already in a team. Leave it first.");
    const name = str(ctx.body.name, "Team name", { min: 2, max: 40 });
    if (q("SELECT 1 FROM teams WHERE name = ?").get(name)) throw conflict("TeamNameTaken", "That team name is taken");
    const id = nextId("teams", "t", 2);
    const code = inviteCode(db);
    tx(db, () => {
      q("INSERT INTO teams (id, name, invite_code, created_at) VALUES (?, ?, ?, ?)").run(id, name, code, now());
      q("INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'captain', ?)").run(id, u.id, now());
    });
    audit(ctx, "TEAM_CREATED", id, name);
    return { status: 201, body: teamOut(teamRow(id)) };
  });
  route("POST", "/v1/teams/:id/join", (ctx) => {
    const u = role(ctx, "participant");
    if (u.team_id) throw conflict("AlreadyInTeam", "You are already in a team. Leave it first.");
    const t = teamRow(ctx.params.id);
    if (!t) throw notFound("Team");
    if (String(ctx.body.inviteCode ?? "").toUpperCase() !== t.invite_code) throw forbidden("Invite code does not match this team");
    const size = q("SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?").get(t.id).n;
    if (size >= event().max_team_size) throw conflict("TeamFull", `${t.name} already has ${size} members`);
    q("INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(t.id, u.id, now());
    audit(ctx, "TEAM_MEMBER_JOINED", t.id, "Joined via invite code");
    return teamOut(t);
  });
  route("POST", "/v1/teams/leave", (ctx) => {
    const u = role(ctx, "participant");
    if (!u.team_id) throw unprocessable("NotInTeam", "You are not in a team");
    const t = teamRow(u.team_id);
    const p = q("SELECT * FROM projects WHERE team_id = ?").get(t.id);
    let disbanded = false;
    tx(db, () => {
      const wasCaptain = q("SELECT role FROM team_members WHERE user_id = ?").get(u.id).role === "captain";
      q("DELETE FROM team_members WHERE user_id = ?").run(u.id);
      const left = q("SELECT user_id FROM team_members WHERE team_id = ? ORDER BY joined_at").all(t.id);
      if (!left.length) {
        if (p?.status === "submitted") throw unprocessable("SubmittedTeam", "The last member cannot leave a team with a submitted project");
        q("DELETE FROM teams WHERE id = ?").run(t.id);
        disbanded = true;
      } else if (wasCaptain) {
        q("UPDATE team_members SET role = 'captain' WHERE user_id = ?").run(left[0].user_id);
      }
    });
    audit(ctx, "TEAM_MEMBER_LEFT", t.id, disbanded ? "Team disbanded" : "Left team");
    return { ok: true, disbanded };
  });
  route("DELETE", "/v1/teams/:id", (ctx) => {
    role(ctx, "admin");
    const snap = teamSnapshot(ctx.params.id);
    q("DELETE FROM teams WHERE id = ?").run(ctx.params.id);
    audit(ctx, "TEAM_DELETED", ctx.params.id, `${snap.team.name} with ${snap.members.length} members`);
    return snap;
  });
  route("POST", "/v1/teams/restore", (ctx) => {
    role(ctx, "admin");
    const s = ctx.body;
    if (!s?.team?.id) throw bad("InvalidSnapshot", "Missing team snapshot");
    if (teamRow(s.team.id)) throw conflict("TeamExists", "That team already exists");
    tx(db, () => {
      insertRow("teams", s.team);
      for (const m of s.members ?? []) {
        if (q("SELECT 1 FROM team_members WHERE user_id = ?").get(m.user_id)) continue;  // joined another team since
        if (q("SELECT 1 FROM users WHERE id = ?").get(m.user_id)) insertRow("team_members", m);
      }
      if (s.project) insertRow("projects", s.project);
      for (const a of s.assignments ?? []) if (q("SELECT 1 FROM judges WHERE id = ?").get(a.judge_id)) insertRow("assignments", a);
      for (const v of s.votes ?? []) if (q("SELECT 1 FROM users WHERE id = ?").get(v.user_id)) insertRow("votes", v);
      for (const c of s.comments ?? []) if (q("SELECT 1 FROM users WHERE id = ?").get(c.user_id)) insertRow("comments", c);
      for (const c of s.conflicts ?? []) if (q("SELECT 1 FROM judges WHERE id = ?").get(c.judge_id)) insertRow("conflicts", c);
    });
    audit(ctx, "TEAM_RESTORED", s.team.id, `${s.team.name} restored (undo)`);
    return teamOut(teamRow(s.team.id));
  });
  route("DELETE", "/v1/teams/:id/members/:userId", (ctx) => {
    role(ctx, "admin");
    const m = q("SELECT * FROM team_members WHERE team_id = ? AND user_id = ?").get(ctx.params.id, ctx.params.userId);
    if (!m) throw notFound("Team member");
    q("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").run(ctx.params.id, ctx.params.userId);
    if (m.role === "captain") {
      const next = q("SELECT user_id FROM team_members WHERE team_id = ? ORDER BY joined_at").get(ctx.params.id);
      if (next) q("UPDATE team_members SET role = 'captain' WHERE user_id = ?").run(next.user_id);
    }
    audit(ctx, "TEAM_MEMBER_REMOVED", ctx.params.id, ctx.params.userId);
    return { removed: m };
  });
  route("POST", "/v1/teams/:id/members", (ctx) => {
    role(ctx, "admin");
    const m = ctx.body;
    if (!teamRow(ctx.params.id)) throw notFound("Team");
    if (q("SELECT 1 FROM team_members WHERE user_id = ?").get(m.user_id)) throw conflict("AlreadyInTeam", "That user is already in a team");
    insertRow("team_members", { team_id: ctx.params.id, user_id: m.user_id, role: m.role ?? "member", joined_at: m.joined_at ?? now() });
    audit(ctx, "TEAM_MEMBER_RESTORED", ctx.params.id, m.user_id);
    return teamOut(teamRow(ctx.params.id));
  });

  // projects & submission
  route("GET", "/v1/projects", (ctx) => {
    const u = authUser(ctx, false);
    const rows = u
      ? q("SELECT * FROM projects ORDER BY id").all()
      : q("SELECT * FROM projects WHERE status = 'submitted' ORDER BY id").all();
    return rows.map(projectOut);
  });
  route("GET", "/v1/projects/:id", (ctx) => {
    const p = q("SELECT * FROM projects WHERE id = ?").get(Number(ctx.params.id));
    if (!p || (p.status !== "submitted" && !authUser(ctx, false))) throw notFound("Project");
    return projectOut(p);
  });
  function myTeamGuard(ctx) {
    const u = role(ctx, "participant");
    if (u.team_id !== ctx.params.id) throw forbidden("You can only edit your own team's project");
    return u;
  }
  route("PUT", "/v1/teams/:id/project", (ctx) => {
    myTeamGuard(ctx);
    if (deadlinePassed()) throw unprocessable("DeadlinePassed", "The submission deadline has passed");
    const b = ctx.body;
    const fields = {
      name: str(b.name, "Project name", { min: 1, max: 60 }),
      tagline: str(b.tagline ?? "", "Tagline", { max: 140 }),
      description: str(b.description ?? "", "Description", { max: 5000 }),
      track_id: b.trackId ? str(b.trackId, "Track") : null,
      stack: JSON.stringify(Array.isArray(b.stack) ? b.stack.map((s) => str(s, "Stack item", { max: 30 })).slice(0, 12) : []),
      repo: str(b.repo ?? "", "Repository", { max: 200 }),
      demo: str(b.demo ?? "", "Demo link", { max: 200 }),
    };
    if (fields.track_id && !q("SELECT 1 FROM tracks WHERE id = ?").get(fields.track_id)) throw bad("InvalidField", "Unknown track");
    const existing = q("SELECT * FROM projects WHERE team_id = ?").get(ctx.params.id);
    if (existing) {
      q(`UPDATE projects SET name = ?, tagline = ?, description = ?, track_id = ?, stack = ?, repo = ?, demo = ?, updated_at = ? WHERE id = ?`)
        .run(fields.name, fields.tagline, fields.description, fields.track_id, fields.stack, fields.repo, fields.demo, now(), existing.id);
      audit(ctx, "SUBMISSION_UPDATED", `PROJECT_${pad(existing.id)}`, "Draft saved");
    } else {
      q(`INSERT INTO projects (team_id, name, tagline, description, track_id, stack, repo, demo, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(ctx.params.id, fields.name, fields.tagline, fields.description, fields.track_id, fields.stack, fields.repo, fields.demo, now());
      audit(ctx, "SUBMISSION_CREATED", ctx.params.id, "Draft created");
    }
    return projectOut(q("SELECT * FROM projects WHERE team_id = ?").get(ctx.params.id));
  });
  route("POST", "/v1/teams/:id/project/submit", (ctx) => {
    myTeamGuard(ctx);
    if (deadlinePassed()) throw unprocessable("DeadlinePassed", "The submission deadline has passed");
    const p = q("SELECT * FROM projects WHERE team_id = ?").get(ctx.params.id);
    if (!p) throw unprocessable("NoDraft", "Save a draft first");
    const missing = [["tagline", p.tagline], ["description", p.description], ["track", p.track_id], ["repository", p.repo]]
      .filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw unprocessable("IncompleteSubmission", `Fill in: ${missing.join(", ")}`);
    q("UPDATE projects SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), p.id);
    audit(ctx, "SUBMISSION_SUBMITTED", `PROJECT_${pad(p.id)}`, p.name);
    return projectOut(q("SELECT * FROM projects WHERE id = ?").get(p.id));
  });

  // conflicts of interest
  route("GET", "/v1/conflicts", (ctx) => {
    role(ctx, "admin");
    return q("SELECT judge_id AS judgeId, team_id AS teamId, reason FROM conflicts ORDER BY judge_id, team_id").all().map((r) => ({ ...r }));
  });
  route("POST", "/v1/conflicts", (ctx) => {
    role(ctx, "admin");
    const { judgeId, teamId } = ctx.body;
    if (!q("SELECT 1 FROM judges WHERE id = ?").get(judgeId)) throw notFound("Judge");
    if (!teamRow(teamId)) throw notFound("Team");
    if (q("SELECT 1 FROM conflicts WHERE judge_id = ? AND team_id = ?").get(judgeId, teamId)) throw conflict("ConflictExists", "Conflict already recorded");
    q("INSERT INTO conflicts (judge_id, team_id, reason) VALUES (?, ?, ?)").run(judgeId, teamId, str(ctx.body.reason ?? "", "Reason", { max: 120 }));
    audit(ctx, "CONFLICT_ADDED", `${judgeId}/${teamId}`, ctx.body.reason ?? "");
    return { status: 201, body: { judgeId, teamId, reason: ctx.body.reason ?? "" } };
  });
  route("DELETE", "/v1/conflicts/:judgeId/:teamId", (ctx) => {
    role(ctx, "admin");
    const c = q("SELECT * FROM conflicts WHERE judge_id = ? AND team_id = ?").get(ctx.params.judgeId, ctx.params.teamId);
    if (!c) throw notFound("Conflict");
    q("DELETE FROM conflicts WHERE judge_id = ? AND team_id = ?").run(ctx.params.judgeId, ctx.params.teamId);
    audit(ctx, "CONFLICT_REMOVED", `${c.judge_id}/${c.team_id}`, c.reason);
    return { judgeId: c.judge_id, teamId: c.team_id, reason: c.reason };
  });

  // assignments & scoring
  route("GET", "/v1/assignments", (ctx) => {
    const u = role(ctx, "admin", "judge");
    const rows = u.role === "admin"
      ? q("SELECT * FROM assignments ORDER BY project_id, judge_id").all()
      : q("SELECT * FROM assignments WHERE judge_id = ? ORDER BY project_id").all(u.judge_id);
    return rows.map(assignmentOut);
  });
  route("PUT", "/v1/assignments", (ctx) => {
    role(ctx, "admin");
    const list = ctx.body.assignments;
    if (!Array.isArray(list)) throw bad("InvalidField", "assignments must be a list");
    const before = q("SELECT * FROM assignments ORDER BY project_id, judge_id").all().map(assignmentOut);
    tx(db, () => {
      q("DELETE FROM assignments").run();
      for (const a of list) {
        const p = q("SELECT team_id FROM projects WHERE id = ?").get(a.projectId);
        if (!p) throw notFound(`Project ${a.projectId}`);
        if (!q("SELECT 1 FROM judges WHERE id = ?").get(a.judgeId)) throw notFound(`Judge ${a.judgeId}`);
        if (q("SELECT 1 FROM conflicts WHERE judge_id = ? AND team_id = ?").get(a.judgeId, p.team_id))
          throw unprocessable("ConflictOfInterest", `${a.judgeId} has a conflict with team ${p.team_id}`);
        q(`INSERT INTO assignments (judge_id, project_id, status, scores, confidence, notes, submitted_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
          a.judgeId, a.projectId, a.status ?? "not_started", JSON.stringify(a.scores ?? {}), a.confidence ?? 3, a.notes ?? "",
          a.submittedAt ?? null, a.updatedAt ?? null,
        );
      }
    });
    audit(ctx, "JUDGE_ASSIGNED", "ASSIGNMENTS", `${list.length} assignments (was ${before.length})`);
    return { before, count: list.length };
  });
  route("PUT", "/v1/assignments/:projectId", (ctx) => {
    const u = role(ctx, "judge");
    const pid = Number(ctx.params.projectId);
    const a = q("SELECT * FROM assignments WHERE judge_id = ? AND project_id = ?").get(u.judge_id, pid);
    if (!a) throw forbidden("This project is not assigned to you");
    if (!event().judging_open) throw unprocessable("JudgingClosed", "Judging is closed");
    const leaves = rubricLeaves();
    const scores = ctx.body.scores ?? {};
    for (const [k, v] of Object.entries(scores)) {
      if (!leaves.has(k)) throw bad("UnknownCriterion", `Unknown criterion ${k}`);
      if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > leaves.get(k))
        throw unprocessable("InvalidScore", `${k} must be between 0 and ${leaves.get(k)}`);
    }
    const action = ctx.body.action ?? "save";
    if (!["save", "submit", "flag"].includes(action)) throw bad("InvalidField", "action must be save, submit or flag");
    if (action === "submit") {
      const missing = [...leaves.keys()].filter((k) => scores[k] == null);
      if (missing.length) throw unprocessable("IncompleteScore", `Score every criterion first (missing: ${missing.join(", ")})`);
    }
    const status = action === "submit" ? "submitted" : action === "flag" ? "flagged" : Object.keys(scores).length ? "in_progress" : a.status;
    const confidence = Math.min(5, Math.max(1, Math.round(Number(ctx.body.confidence ?? a.confidence))));
    q(`UPDATE assignments SET scores = ?, notes = ?, confidence = ?, status = ?, submitted_at = ?, updated_at = ? WHERE judge_id = ? AND project_id = ?`)
      .run(JSON.stringify(scores), str(ctx.body.notes ?? "", "Notes", { max: 4000 }), confidence, status,
        action === "submit" ? now() : a.submitted_at, now(), u.judge_id, pid);
    audit(ctx, action === "submit" ? "SCORE_SUBMITTED" : action === "flag" ? "SCORE_FLAGGED" : "SCORE_DRAFT_SAVED", `PROJECT_${pad(pid)}`,
      action === "submit" ? "Final score recorded" : "Draft saved");
    return assignmentOut(q("SELECT * FROM assignments WHERE judge_id = ? AND project_id = ?").get(u.judge_id, pid));
  });
  route("GET", "/v1/scores", (ctx) => {
    const u = authUser(ctx);
    if (u.role !== "admin" && !event().results_published) throw forbidden("Results are not published yet");
    return q("SELECT * FROM assignments WHERE status = 'submitted' ORDER BY project_id").all().map(assignmentOut);
  });

  // community voting
  route("GET", "/v1/votes/mine", (ctx) => {
    const u = authUser(ctx);
    return q("SELECT project_id FROM votes WHERE user_id = ? ORDER BY created_at").all(u.id).map((r) => r.project_id);
  });
  route("POST", "/v1/votes", (ctx) => {
    const u = authUser(ctx);
    const e = event();
    if (!e.voting_open) throw unprocessable("VotingClosed", "Voting is closed");
    const p = q("SELECT * FROM projects WHERE id = ?").get(Number(ctx.body.projectId));
    if (!p || p.status !== "submitted") throw notFound("Project");
    if (u.team_id && p.team_id === u.team_id) throw unprocessable("OwnProject", "You cannot vote for your own team");
    if (q("SELECT 1 FROM votes WHERE user_id = ? AND project_id = ?").get(u.id, p.id)) throw conflict("AlreadyVoted", "You already voted for this project");
    const used = q("SELECT COUNT(*) AS n FROM votes WHERE user_id = ?").get(u.id).n;
    if (used >= e.votes_per_user) throw unprocessable("NoVotesLeft", `You have used all ${e.votes_per_user} votes`);
    q("INSERT INTO votes (user_id, project_id, created_at) VALUES (?, ?, ?)").run(u.id, p.id, now());
    audit(ctx, "VOTE_CAST", `PROJECT_${pad(p.id)}`, "Community vote accepted");
    return { status: 201, body: { ok: true, remaining: e.votes_per_user - used - 1 } };
  });
  route("DELETE", "/v1/votes/:projectId", (ctx) => {
    const u = authUser(ctx);
    if (!event().voting_open) throw unprocessable("VotingClosed", "Voting is closed");
    const r = q("DELETE FROM votes WHERE user_id = ? AND project_id = ?").run(u.id, Number(ctx.params.projectId));
    if (!r.changes) throw notFound("Vote");
    audit(ctx, "VOTE_WITHDRAWN", `PROJECT_${pad(Number(ctx.params.projectId))}`, "Vote withdrawn");
    return { ok: true };
  });
  route("GET", "/v1/votes", (ctx) => {
    const u = authUser(ctx);
    if (u.role !== "admin" && !event().results_published) throw forbidden("The tally is hidden until results are published");
    return q("SELECT user_id AS userId, project_id AS projectId, created_at AS createdAt FROM votes").all().map((r) => ({ ...r }));
  });

  // comments
  route("GET", "/v1/projects/:id/comments", (ctx) =>
    q(`SELECT c.id, c.body, c.created_at, u.name, u.handle FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.project_id = ? ORDER BY c.created_at DESC`).all(Number(ctx.params.id))
      .map((c) => ({ id: `c${c.id}`, author: c.name, handle: c.handle, body: c.body, at: c.created_at })));
  route("POST", "/v1/projects/:id/comments", (ctx) => {
    const u = authUser(ctx);
    const pid = Number(ctx.params.id);
    if (!q("SELECT 1 FROM projects WHERE id = ?").get(pid)) throw notFound("Project");
    const body = str(ctx.body.body, "Comment", { min: 1, max: 1000 });
    const r = q("INSERT INTO comments (project_id, user_id, body, created_at) VALUES (?, ?, ?, ?)").run(pid, u.id, body, now());
    audit(ctx, "COMMENT_POSTED", `PROJECT_${pad(pid)}`, "Comment published");
    return { status: 201, body: { id: `c${r.lastInsertRowid}`, author: u.name, handle: u.handle, body, at: now() } };
  });

  // audit ledger
  route("GET", "/v1/audit", (ctx) => {
    role(ctx, "admin");
    const limit = Math.min(1000, Math.max(1, Number(ctx.query.get("limit") ?? 300)));
    return q("SELECT * FROM audit ORDER BY id DESC LIMIT ?").all(limit)
      .map((a) => ({ id: `evt_${a.id.toString(16).padStart(6, "0")}`, at: a.at, actor: a.actor, action: a.action, object: a.object, ip: a.ip, detail: a.detail }));
  });

  function isoField(v, field) {
    if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw bad("InvalidField", `${field} must be a date`);
    return new Date(v).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  function intField(v, field, min, max) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw bad("InvalidField", `${field} must be a whole number from ${min} to ${max}`);
    return n;
  }

  // ── dispatcher ─────────────────────────────────────────────

  return function handle({ method, path, query, headers, body, ip }) {
    const ctx = { headers, body: body ?? {}, query, ip, params: {}, user: undefined };
    let allowed = false;
    for (const [m, re, fn] of routes) {
      const match = re.exec(path);
      if (!match) continue;
      allowed = true;
      if (m !== method) continue;
      ctx.params = Object.fromEntries(Object.entries(match.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
      try {
        const out = fn(ctx);
        if (out && typeof out === "object" && "status" in out && "body" in out) return out;
        return { status: 200, body: out };
      } catch (e) {
        if (e instanceof HttpError) return { status: e.status, body: { error: e.code, message: e.message } };
        if (String(e?.message).includes("UNIQUE constraint failed: team_members.user_id"))
          return { status: 409, body: { error: "AlreadyInTeam", message: "That user is already in a team" } };
        console.error(e);
        return { status: 500, body: { error: "ServerError", message: "Something went wrong on the server" } };
      }
    }
    return allowed
      ? { status: 405, body: { error: "MethodNotAllowed", message: `${method} is not supported on ${path}` } }
      : { status: 404, body: { error: "NotFound", message: `No route for ${path}` } };
  };
}
