// Server rule tests against an in-memory database. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.mjs";
import { createApp } from "../src/app.mjs";
import { DEMO_PASSWORDS, seed } from "../src/seed.mjs";

function setup(options) {
  const db = openDb(":memory:");
  seed(db);
  const handle = createApp(db, options);
  const call = (method, path, body, token) => {
    const url = new URL(path, "http://x");
    return handle({
      method, path: url.pathname, query: url.searchParams, body, ip: "test",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  };
  const login = (email, password) => call("POST", "/v1/auth/login", { email, password }).body.token;
  return { db, call, login };
}

test("login with wrong password is 401", () => {
  const { call } = setup();
  const r = call("POST", "/v1/auth/login", { email: "admin@hacktrack.dev", password: "nope" });
  assert.equal(r.status, 401);
  assert.equal(r.body.error, "InvalidCredentials");
});

test("demo logins off: published demo passwords refused at sign-in and sign-up", () => {
  const { call } = setup({ blockedPasswords: Object.values(DEMO_PASSWORDS) });
  const r = call("POST", "/v1/auth/login", { email: "judge@hacktrack.dev", password: "judge123" });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "DemoLoginsOff");
  const s = call("POST", "/v1/auth/signup", { name: "Ada", email: "ada@x.dev", password: "participant123" });
  assert.equal(s.status, 400);
  assert.equal(call("POST", "/v1/auth/signup", { name: "Ada", email: "ada@x.dev", password: "a-real-password" }).status, 201);
  assert.equal(call("POST", "/v1/auth/login", { email: "ada@x.dev", password: "a-real-password" }).status, 200);
});

test("login returns token and role", () => {
  const { call } = setup();
  const r = call("POST", "/v1/auth/login", { email: "judge@hacktrack.dev", password: "judge123" });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, "judge");
  assert.equal(r.body.user.judgeId, "JUDGE_014");
  assert.equal(call("GET", "/v1/me", null, r.body.token).body.id, r.body.user.id);
});

test("signup creates a participant; duplicate email rejected", () => {
  const { call } = setup();
  const r = call("POST", "/v1/auth/signup", { name: "New Person", email: "new@x.dev", password: "secret1" });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, "participant");
  assert.equal(call("POST", "/v1/auth/signup", { name: "Again", email: "NEW@x.dev", password: "secret1" }).status, 409);
});

test("joining a second team is rejected", () => {
  const { call, login } = setup();
  const t = login("participant@hacktrack.dev", "participant123");
  const r = call("POST", "/v1/teams", { name: "Another Team" }, t);
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "AlreadyInTeam");
});

test("solo participant can create a team, another can join by code", () => {
  const { call, login } = setup();
  const solo = login("solo@hacktrack.dev", "participant123");
  const team = call("POST", "/v1/teams", { name: "Fresh Squad" }, solo).body;
  assert.equal(team.members.length, 1);
  const s2 = call("POST", "/v1/auth/signup", { name: "Joiner", email: "j@x.dev", password: "secret1" }).body.token;
  assert.equal(call("POST", `/v1/teams/${team.id}/join`, { inviteCode: "WRONG1" }, s2).status, 403);
  const joined = call("POST", `/v1/teams/${team.id}/join`, { inviteCode: team.inviteCode }, s2);
  assert.equal(joined.status, 200);
  assert.equal(joined.body.members.length, 2);
});

test("submission after the deadline is refused", () => {
  const { db, call, login } = setup();
  const t = login("participant@hacktrack.dev", "participant123");
  const me = call("GET", "/v1/me", null, t).body;
  db.prepare("UPDATE event SET deadline = '2000-01-01T00:00:00Z'").run();
  const r = call("POST", `/v1/teams/${me.teamId}/project/submit`, {}, t);
  assert.equal(r.status, 422);
  assert.equal(r.body.error, "DeadlinePassed");
});

test("server refuses assignments that break a conflict of interest", () => {
  const { call, login } = setup();
  const admin = login("admin@hacktrack.dev", "admin123");
  // JUDGE_007 conflicts with Iron Lattice (t03 / project 81)
  const r = call("PUT", "/v1/assignments", { assignments: [{ judgeId: "JUDGE_007", projectId: 81 }] }, admin);
  assert.equal(r.status, 422);
  assert.equal(r.body.error, "ConflictOfInterest");
});

test("score above maximum is InvalidScore; valid score saves", () => {
  const { call, login } = setup();
  const admin = login("admin@hacktrack.dev", "admin123");
  assert.equal(call("PUT", "/v1/assignments", { assignments: [{ judgeId: "JUDGE_014", projectId: 81 }] }, admin).status, 200);
  const judge = login("judge@hacktrack.dev", "judge123");
  const bad = call("PUT", "/v1/assignments/81", { scores: { impact: 11 } }, judge);
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error, "InvalidScore");
  const ok = call("PUT", "/v1/assignments/81", { scores: { impact: 8 } }, judge);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "in_progress");
  const incomplete = call("PUT", "/v1/assignments/81", { scores: { impact: 8 }, action: "submit" }, judge);
  assert.equal(incomplete.body.error, "IncompleteScore");
});

test("deleting a team returns a snapshot that restores it with its members", () => {
  const { call, login } = setup();
  const admin = login("admin@hacktrack.dev", "admin123");
  const before = call("GET", "/v1/teams/t03").body;
  const snap = call("DELETE", "/v1/teams/t03", null, admin).body;
  assert.equal(call("GET", "/v1/teams/t03").status, 404);
  const restored = call("POST", "/v1/teams/restore", snap, admin);
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.body.members.map((m) => m.userId).sort(), before.members.map((m) => m.userId).sort());
  assert.equal(restored.body.projectId, before.projectId);
});

test("scores and vote tally are hidden from non-admins until results are published", () => {
  const { db, call, login } = setup();
  const p = login("participant@hacktrack.dev", "participant123");
  assert.equal(call("GET", "/v1/scores", null, p).status, 403);
  assert.equal(call("GET", "/v1/votes", null, p).status, 403);
  db.prepare("UPDATE event SET results_published = 1").run();
  assert.equal(call("GET", "/v1/scores", null, p).status, 200);
});

test("voting: no own-team votes, limited votes per user", () => {
  const { call, login } = setup();
  const p = login("participant@hacktrack.dev", "participant123");
  // Void Runners' project (12) is a draft; vote for others
  const own = call("POST", "/v1/votes", { projectId: 12 }, p);
  assert.equal(own.status, 404);  // drafts are not votable
  const mine = call("GET", "/v1/votes/mine", null, p).body;
  for (const id of mine) call("DELETE", `/v1/votes/${id}`, null, p);
  for (const id of [47, 81, 112]) assert.equal(call("POST", "/v1/votes", { projectId: id }, p).status, 201);
  assert.equal(call("POST", "/v1/votes", { projectId: 5 }, p).body.error, "NoVotesLeft");
});

test("non-admins cannot use admin endpoints", () => {
  const { call, login } = setup();
  const j = login("judge@hacktrack.dev", "judge123");
  assert.equal(call("GET", "/v1/users", null, j).status, 403);
  assert.equal(call("DELETE", "/v1/teams/t01", null, j).status, 403);
  assert.equal(call("GET", "/v1/users").status, 401);
});

// ── Sign in with Google ──────────────────────────────────────
// The tests play Google: they make an RSA key, publish its public half as the
// "Google keys", and sign ID tokens with the private half.
import { generateKeyPairSync, sign as rsaSign } from "node:crypto";
import { createGoogleVerifier } from "../src/google.mjs";

const CLIENT_ID = "test-app.apps.googleusercontent.com";
const googleKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const strangerKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks = { keys: [{ ...googleKey.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" }] };

function idToken(claims = {}, { key = googleKey.privateKey, kid = "k1" } = {}) {
  const t = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${enc({ alg: "RS256", kid, typ: "JWT" })}.${enc({
    iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "1234567890", iat: t, exp: t + 3600,
    email: "ada@gmail.com", email_verified: true, name: "Ada Lovelace", ...claims,
  })}`;
  return `${body}.${rsaSign("RSA-SHA256", Buffer.from(body), key).toString("base64url")}`;
}

async function googleSetup() {
  const db = openDb(":memory:");
  seed(db);
  const google = createGoogleVerifier({ clientId: CLIENT_ID, fetchKeys: async () => jwks });
  await google.ready();
  const handle = createApp(db, { google });
  const call = (method, path, body) => handle({ method, path, query: new URLSearchParams(), body, ip: "test", headers: {} });
  return { call, g: (credential) => call("POST", "/v1/auth/google", { credential }) };
}

test("Google: new verified email creates a participant; second sign-in reuses it", async () => {
  const { g } = await googleSetup();
  const first = g(idToken());
  assert.equal(first.status, 201);
  assert.equal(first.body.created, true);
  assert.equal(first.body.user.role, "participant");
  assert.equal(first.body.user.name, "Ada Lovelace");
  const again = g(idToken());
  assert.equal(again.status, 200);
  assert.equal(again.body.user.id, first.body.user.id);
});

test("Google: an existing account with the same email signs in to that account", async () => {
  const { g } = await googleSetup();
  const r = g(idToken({ email: "Judge@HackTrack.dev" }));
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, "judge");
});

test("Google: forged, foreign, expired and unverified tokens are rejected", async () => {
  const { g } = await googleSetup();
  const reject = (tok) => { const r = g(tok); assert.equal(r.status, 401, JSON.stringify(r.body)); assert.equal(r.body.error, "InvalidGoogleToken"); };
  reject(idToken({}, { key: strangerKey.privateKey }));              // signed by someone else
  reject(idToken({ aud: "another-app.apps.googleusercontent.com" })); // meant for another app
  reject(idToken({ iss: "https://evil.example" }));                   // not issued by Google
  reject(idToken({ exp: Math.floor(Date.now() / 1000) - 3600 }));     // expired
  reject(idToken({ email_verified: false }));                          // email not verified
  const [h, p, s] = idToken().split(".");
  const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url")), email: "admin@hacktrack.dev" })).toString("base64url");
  reject(`${h}.${altered}.${s}`);                                       // payload changed after signing
});

test("Google: switched off without a client ID; Google-only accounts have no password", async () => {
  const db = openDb(":memory:");
  seed(db);
  const off = createApp(db);
  const r = off({ method: "POST", path: "/v1/auth/google", query: new URLSearchParams(), body: { credential: "x".repeat(40) }, ip: "t", headers: {} });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "GoogleSignInDisabled");

  const { g, call } = await googleSetup();
  g(idToken({ email: "new@gmail.com" }));
  for (const password of ["", "google-only", "anything"])
    assert.equal(call("POST", "/v1/auth/login", { email: "new@gmail.com", password }).status, 401);
});
