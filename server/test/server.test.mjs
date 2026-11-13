// Server rule tests against an in-memory database. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.mjs";
import { createApp } from "../src/app.mjs";
import { seed } from "../src/seed.mjs";

function setup() {
  const db = openDb(":memory:");
  seed(db);
  const handle = createApp(db);
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
