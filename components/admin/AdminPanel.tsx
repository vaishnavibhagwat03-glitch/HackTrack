"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Activity, Check, Download, Minus, Save, ScrollText, Undo2, Zap } from "lucide-react";
import type { Assignment, Event, Project, Role, RubricNode, Team, User } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/rbac";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { cn, downloadCSV, pad } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, Button, Field, Meta, Panel, Skeleton, StatusDot, fieldClass } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { DataTable } from "./DataTable";

type SectionId = "event" | "phases" | "roles" | "tracks" | "rubric" | "io" | "system";
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "event", label: "Event configuration" },
  { id: "phases", label: "Phases" },
  { id: "roles", label: "Accounts & roles" },
  { id: "tracks", label: "Tracks & prizes" },
  { id: "rubric", label: "Judging rubric" },
  { id: "io", label: "Export" },
  { id: "system", label: "System & fault injection" },
];

function useUndoToast() {
  const toast = useToast();
  return (title: string) => toast({ tone: "ok", title, body: "Reverse request pushed on the C++ undo stack" });
}

function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-0">
      <div>
        <p className="text-[14px]">{label}</p>
        {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
      </div>
      <button role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn("relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-50", checked ? "border-accent bg-accent" : "border-line-strong bg-surface-3")}>
        <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 35 }} className={cn("absolute top-0.5 size-3.5 rounded-full", checked ? "right-0.5 bg-accent-ink" : "left-0.5 bg-fg-2")} />
      </button>
    </div>
  );
}

const toLocalInput = (iso: string) => iso.slice(0, 16);
const toIso = (local: string) => `${local}:00Z`;

function EventConfig({ event }: { event: Event }) {
  const toast = useToast();
  const undoToast = useUndoToast();
  const [v, setV] = useState({
    name: event.name, tagline: event.tagline, start: toLocalInput(event.startsAt), deadline: toLocalInput(event.deadline), results: toLocalInput(event.resultsAt),
    perProject: String(event.judgesPerProject), maxTeam: String(event.maxTeamSize), votes: String(event.votesPerUser),
  });
  const [busy, setBusy] = useState(false);
  const invalid = v.deadline <= v.start ? "Deadline must be after the start." : v.results <= v.deadline ? "Results must be after the deadline." : undefined;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    try {
      await api("/admin/event", { method: "PUT", body: {
        name: v.name, tagline: v.tagline, startsAt: toIso(v.start), deadline: toIso(v.deadline), resultsAt: toIso(v.results),
        judgesPerProject: Number(v.perProject), maxTeamSize: Number(v.maxTeam), votesPerUser: Number(v.votes),
      } });
      undoToast("Event updated");
    } catch (x) { toast({ tone: "warn", title: "Not saved", body: errorMessage(x) }); } finally { setBusy(false); }
  };

  return (
    <Panel title="Event configuration" meta="ALL TIMES UTC">
      <form className="grid gap-5 sm:grid-cols-2" onSubmit={save}>
        <Field label="Event name" htmlFor="ev-name"><input id="ev-name" className={cn(fieldClass, "h-10")} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Tagline" htmlFor="ev-tag"><input id="ev-tag" className={cn(fieldClass, "h-10")} value={v.tagline} onChange={(e) => setV({ ...v, tagline: e.target.value })} /></Field>
        <Field label="Starts (UTC)" htmlFor="ev-start"><input id="ev-start" type="datetime-local" className={cn(fieldClass, "h-10 font-mono text-[13px]")} value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} /></Field>
        <Field label="Submission deadline (UTC)" htmlFor="ev-deadline" error={invalid} hint="Checked by the C++ client"><input id="ev-deadline" type="datetime-local" aria-invalid={!!invalid} className={cn(fieldClass, "h-10 font-mono text-[13px]")} value={v.deadline} onChange={(e) => setV({ ...v, deadline: e.target.value })} /></Field>
        <Field label="Results publish (UTC)" htmlFor="ev-results"><input id="ev-results" type="datetime-local" className={cn(fieldClass, "h-10 font-mono text-[13px]")} value={v.results} onChange={(e) => setV({ ...v, results: e.target.value })} /></Field>
        <Field label="Judges per project" htmlFor="ev-jpp" hint="Round-robin target"><input id="ev-jpp" type="number" min={1} max={10} className={cn(fieldClass, "h-10 font-mono")} value={v.perProject} onChange={(e) => setV({ ...v, perProject: e.target.value })} /></Field>
        <Field label="Max team size" htmlFor="ev-team"><input id="ev-team" type="number" min={1} max={10} className={cn(fieldClass, "h-10 font-mono")} value={v.maxTeam} onChange={(e) => setV({ ...v, maxTeam: e.target.value })} /></Field>
        <Field label="Votes per account" htmlFor="ev-votes"><input id="ev-votes" type="number" min={1} max={20} className={cn(fieldClass, "h-10 font-mono")} value={v.votes} onChange={(e) => setV({ ...v, votes: e.target.value })} /></Field>
        <div className="flex items-end justify-end gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={!!invalid || busy}><Save className="size-3.5" />Save changes</Button>
        </div>
      </form>
    </Panel>
  );
}

function Phases({ event }: { event: Event }) {
  const toast = useToast();
  const undoToast = useUndoToast();
  const set = (k: "judgingOpen" | "votingOpen" | "resultsPublished") => async (on: boolean) => {
    try { await api("/admin/event", { method: "PUT", body: { [k]: on } }); undoToast(`${k} → ${on ? "on" : "off"}`); }
    catch (x) { toast({ tone: "warn", title: "Not changed", body: errorMessage(x) }); }
  };
  return (
    <Panel title="Phases" meta="EACH SWITCH IS UNDOABLE">
      <Switch label="Judging open" description="Judges can save and submit scores. The C++ client refuses score requests while closed." checked={event.judgingOpen} onChange={set("judgingOpen")} />
      <Switch label="Community voting open" description={`Each account has ${event.votesPerUser} votes; own-team votes are refused.`} checked={event.votingOpen} onChange={set("votingOpen")} />
      <Switch label="Results published" description="Unlocks the leaderboard, prizes, vote tally and certificates for everyone." checked={event.resultsPublished} onChange={set("resultsPublished")} />
    </Panel>
  );
}

const PERMS: [string, Role[]][] = [
  ["View public gallery", ["participant", "judge", "admin"]],
  ["Create / join a team, edit own submission", ["participant"]],
  ["Vote in community round", ["participant"]],
  ["Score assigned projects", ["judge"]],
  ["Assign judges, manage conflicts", ["admin"]],
  ["Delete teams, change roles, undo", ["admin"]],
  ["Publish results, export data", ["admin"]],
];
const ROLES: Role[] = ["participant", "judge", "admin"];

function RolesPermissions({ me }: { me: User }) {
  const toast = useToast();
  const undoToast = useUndoToast();
  const users = useApi<User[]>("/admin/users");
  const setRole = async (u: User, role: Role) => {
    if (role === u.role) return;
    try { await api(`/admin/users/${u.id}/role`, { method: "PUT", body: { role } }); undoToast(`${u.name} is now ${ROLE_LABEL[role]}`); }
    catch (x) { toast({ tone: "warn", title: "Role not changed", body: errorMessage(x) }); }
  };
  return (
    <div className="space-y-6">
      <Panel title="Permission matrix" meta="CHECKED BY THE C++ CLIENT, ENFORCED BY THE SERVER" bodyClassName="p-0 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <caption className="sr-only">Permissions by role</caption>
          <thead><tr className="border-b border-line"><th scope="col" className="label px-4 py-3 font-normal">Capability</th>{ROLES.map((r) => <th key={r} scope="col" className="label px-4 py-3 text-center font-normal">{ROLE_LABEL[r]}</th>)}</tr></thead>
          <tbody>
            {PERMS.map(([p, roles]) => (
              <tr key={p} className="border-b border-line last:border-0">
                <th scope="row" className="px-4 py-2.5 text-[13.5px] font-normal">{p}</th>
                {ROLES.map((r) => (
                  <td key={r} className="px-4 py-2.5 text-center">
                    {roles.includes(r) ? <Check className="mx-auto size-3.5 text-accent" aria-label="Allowed" /> : <Minus className="mx-auto size-3.5 text-line-strong" aria-label="Denied" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Accounts" meta={`${users.data?.length ?? 0} USERS · CACHED IN A HASH TABLE`}>
        {!users.data ? <Skeleton className="h-64" /> : (
          <DataTable caption="Accounts" rows={users.data} rowKey={(u) => u.id} search={(u) => `${u.name} ${u.email} ${u.handle} ${u.role}`}
            columns={[
              { key: "name", header: "Name", sort: (u) => u.name, cell: (u) => <span><span className="block text-fg">{u.name}</span><span className="font-mono text-[10.5px] text-muted">{u.email}</span></span> },
              { key: "handle", header: "Handle", sort: (u) => u.handle, cell: (u) => <span className="font-mono text-[11.5px] text-fg-2">{u.handle}</span> },
              { key: "team", header: "Team", sort: (u) => u.teamId ?? "", cell: (u) => <span className="font-mono text-[11.5px] text-muted">{u.teamId ?? u.judgeId ?? "—"}</span> },
              { key: "role", header: "Role", sort: (u) => u.role, cell: (u) => (
                <select aria-label={`Role of ${u.name}`} value={u.role} disabled={u.id === me.id} onChange={(e) => setRole(u, e.target.value as Role)}
                  className={cn(fieldClass, "h-8 w-auto pr-6 font-mono text-[11.5px]")}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              ) },
            ]} />
        )}
      </Panel>
    </div>
  );
}

function TracksPrizes() {
  const { boot } = useSession();
  const projects = useApi<{ projects: Project[] }>("/projects?sort=name");
  if (!boot) return <Skeleton className="h-64" />;
  const list = projects.data?.projects ?? [];
  return (
    <div className="space-y-6">
      <Panel title="Tracks" meta={`${boot.tracks.length} TRACKS`}>
        <DataTable caption="Tracks" rows={boot.tracks} rowKey={(t) => t.id} search={(t) => `${t.name} ${t.description}`}
          columns={[
            { key: "code", header: "Code", sort: (t) => t.code, cell: (t) => <span className="font-mono text-[11.5px] text-muted">{t.code}</span> },
            { key: "name", header: "Track", sort: (t) => t.name, cell: (t) => <span><span className="block text-fg">{t.name}</span><span className="text-[12px] text-muted">{t.description}</span></span> },
            { key: "subs", header: "Submitted", align: "right", cell: (t) => <span className="font-mono tabular">{list.filter((p) => p.trackId === t.id && p.status === "submitted").length}</span> },
            { key: "drafts", header: "Drafts", align: "right", cell: (t) => <span className="font-mono tabular text-muted">{list.filter((p) => p.trackId === t.id && p.status === "draft").length}</span> },
          ]} />
      </Panel>
      <Panel title="Prizes" meta="WINNERS COME FROM THE C++ MAX-HEAP RANKING">
        <DataTable caption="Prizes" rows={boot.prizes} rowKey={(p) => p.id}
          columns={[
            { key: "name", header: "Prize", cell: (p) => <span className="text-fg">{p.name}</span> },
            { key: "track", header: "Scope", cell: (p) => <span className="font-mono text-[11.5px] text-fg-2">{p.trackId ? boot.tracks.find((t) => t.id === p.trackId)?.name : p.id === "people" ? "Community vote" : "Overall"}</span> },
            { key: "amount", header: "Amount", align: "right", cell: (p) => <span className="font-mono text-fg">{p.amount}</span> },
          ]} />
      </Panel>
    </div>
  );
}

/** Editor for the generalized-list rubric: groups (sub-lists) and atoms (criteria). */
function Rubric() {
  const toast = useToast();
  const undoToast = useUndoToast();
  const { boot } = useSession();
  const [tree, setTree] = useState<RubricNode[] | null>(null);
  useEffect(() => { if (boot && !tree) setTree(boot.rubric); }, [boot, tree]);
  if (!tree || !boot) return <Skeleton className="h-64" />;

  const setWeight = (path: number[], w: number) => {
    const copy: RubricNode[] = JSON.parse(JSON.stringify(tree));
    let list = copy;
    for (let i = 0; i < path.length - 1; i++) list = list[path[i]].children!;
    list[path[path.length - 1]].weight = w;
    setTree(copy);
  };
  const strip = (nodes: RubricNode[]): RubricNode[] => nodes.map(({ effectiveWeight: _e, ...n }) => (n.children ? { ...n, children: strip(n.children) } : n));
  const save = async () => {
    try {
      const r = await api<{ depth: number; criteria: number }>("/admin/rubric", { method: "PUT", body: { rubric: strip(tree) } });
      undoToast(`Rubric saved · depth ${r.depth} · ${r.criteria} criteria`);
      setTree(null);
    } catch (x) { toast({ tone: "warn", title: "Rubric not saved", body: errorMessage(x) }); }
  };

  const render = (nodes: RubricNode[], path: number[], depth: number): React.ReactNode => (
    <ul className={cn("space-y-2", depth > 0 && "mt-2 border-l border-line pl-4")}>
      {nodes.map((n, i) => (
        <li key={n.id} className={cn(depth === 0 && "rounded-md border border-line p-3")}>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-muted">{n.children ? "( )" : "•"}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px]">{n.name} {n.children && <Badge>group · {n.children.length}</Badge>}</p>
              {n.description && <p className="truncate text-[12px] text-muted">{n.description}</p>}
            </div>
            {!n.children && n.effectiveWeight != null && <span className="font-mono text-[11px] text-muted">{(n.effectiveWeight * 100).toFixed(1)}% eff.</span>}
            <label className="flex items-center gap-1.5">
              <span className="sr-only">{n.name} weight</span>
              <input type="number" min={1} max={100} value={n.weight} onChange={(e) => setWeight([...path, i], Number(e.target.value))} className={cn(fieldClass, "h-8 w-20 text-right font-mono")} />
            </label>
          </div>
          {n.children && render(n.children, [...path, i], depth + 1)}
        </li>
      ))}
    </ul>
  );

  return (
    <Panel title="Judging rubric" meta={`GENERALIZED LIST · DEPTH ${boot.rubricDepth}`}
      action={<Button size="sm" variant="primary" onClick={save}><Save className="size-3" />Save rubric</Button>}>
      <p className="mb-4 text-[13px] text-muted">Weights are relative within each group. The C++ client walks the list to compute each leaf&apos;s effective weight and every weighted score; groups are sub-lists, criteria are atoms.</p>
      {render(tree, [], 0)}
    </Panel>
  );
}

function ExportData() {
  const toast = useToast();
  const projects = useApi<{ projects: Project[] }>("/projects?sort=id");
  const teams = useApi<Team[]>("/teams");
  const judging = useApi<{ assignments: Assignment[] }>("/admin/judging");
  const users = useApi<User[]>("/admin/users");
  const exp = (file: string, rows: Record<string, string | number | null | undefined>[]) => {
    downloadCSV(file, rows);
    toast({ tone: "ok", title: "Export generated", body: `${file} · ${rows.length} rows` });
  };
  const items = [
    { k: "Submissions", f: "hacktrack-submissions.csv", n: projects.data?.projects.length ?? 0, run: () => exp("hacktrack-submissions.csv", (projects.data?.projects ?? []).map((p) => ({ id: p.id, name: p.name, status: p.status, team: p.team?.name, track: p.trackId, stack: p.stack.join(" · "), repo: p.repo, submitted_at: p.submittedAt }))) },
    { k: "Teams", f: "hacktrack-teams.csv", n: teams.data?.length ?? 0, run: () => exp("hacktrack-teams.csv", (teams.data ?? []).map((t) => ({ id: t.id, name: t.name, members: t.members.map((m) => m.name).join("; "), invite: t.inviteCode, project: t.projectId }))) },
    { k: "Scores", f: "hacktrack-scores.csv", n: judging.data?.assignments.length ?? 0, run: () => exp("hacktrack-scores.csv", (judging.data?.assignments ?? []).map((a) => ({ judge: a.judgeId, project: a.projectId, status: a.status, ...a.scores, weighted: a.weighted?.toFixed(3), confidence: a.confidence }))) },
    { k: "Accounts", f: "hacktrack-users.csv", n: users.data?.length ?? 0, run: () => exp("hacktrack-users.csv", (users.data ?? []).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, team: u.teamId }))) },
  ];
  return (
    <Panel title="Export" meta="CSV · FROM THE C++ CLIENT'S DATA">
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((x) => (
          <li key={x.k} className="flex items-center justify-between gap-3 rounded-md border border-line p-4">
            <span><span className="block text-[14px]">{x.k}</span><span className="font-mono text-[11px] text-muted">{x.f} · {x.n} rows</span></span>
            <Button size="sm" onClick={x.run} disabled={!x.n}><Download className="size-3" />CSV</Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function System() {
  const toast = useToast();
  const health = useApi<{ client: { name: string; time: string }; server: { ok: boolean; ms: number; attempts: number }; serverAddress: string }>("/health", { pollMs: 5000 });
  const ds = useApi<{ queue: { sent: number; retries: number; failures: number; maxRetries: number }; cache: { hits: number; misses: number } }>("/ds", { pollMs: 3000 });
  const [rate, setRate] = useState(0);
  const apply = async (r: number) => {
    try { await api("/admin/chaos", { method: "POST", body: { rate: r } }); setRate(r); toast({ tone: r ? "warn" : "ok", title: r ? `Server now fails ${Math.round(r * 100)}% of requests` : "Fault injection off", body: "Watch the retries in the protocol trace" }); }
    catch (x) { toast({ tone: "warn", title: "Could not change", body: errorMessage(x) }); }
  };
  const undo = async () => {
    try { const r = await api<{ undone: string }>("/admin/undo", { method: "POST" }); toast({ tone: "ok", title: "Undone", body: r.undone }); }
    catch (x) { toast({ tone: "warn", title: "Nothing undone", body: errorMessage(x) }); }
  };
  return (
    <div className="space-y-6">
      <Panel title="Architecture" meta="WEBSITE → C++ CLIENT → SERVER → DATABASE">
        <dl className="grid gap-x-10 sm:grid-cols-2">
          <Meta k="Website" v="Next.js (this page) · no business logic" />
          <Meta k="C++ client" v={health.data ? <span className="flex items-center gap-2"><StatusDot tone="ok" />{health.data.client.name}</span> : <span className="text-danger">unreachable</span>} />
          <Meta k="Server" v={health.data ? `${health.data.serverAddress} · ${health.data.server.ok ? `OK ${Math.round(health.data.server.ms)} ms` : "DOWN"}` : "—"} />
          <Meta k="Database" v="SQLite (server/data/hacktrack.db)" />
          <Meta k="Requests sent" v={ds.data?.queue.sent ?? "—"} />
          <Meta k="Retries / failures" v={ds.data ? `${ds.data.queue.retries} / ${ds.data.queue.failures}` : "—"} />
          <Meta k="Cache hits / misses" v={ds.data ? `${ds.data.cache.hits} / ${ds.data.cache.misses}` : "—"} />
          <Meta k="Max retries" v={ds.data?.queue.maxRetries ?? "—"} />
        </dl>
      </Panel>
      <Panel title="Fault injection" meta="DEMONSTRATES THE REQUEST QUEUE'S RETRIES" ticks>
        <p className="text-[13.5px] text-fg-2">Make the server answer a share of requests with <span className="font-mono">503</span>. The C++ client retries 5xx and network errors up to three times; 4xx errors are reported at once. Open the protocol trace (bottom-right) and watch the attempts column.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[0, 0.3, 0.6].map((r) => (
            <Button key={r} variant={rate === r ? "primary" : "secondary"} onClick={() => apply(r)}>{r === 0 ? <><Activity className="size-3.5" />Off</> : <><Zap className="size-3.5" />{Math.round(r * 100)}% failures</>}</Button>
          ))}
        </div>
      </Panel>
      <Panel title="Undo" meta="LINKED STACK">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={undo}><Undo2 className="size-3.5" />Undo last admin change</Button>
          <Link href="/audit" className="label flex items-center gap-1 hover:text-fg"><ScrollText className="size-3" />See the whole stack</Link>
        </div>
      </Panel>
    </div>
  );
}

export function AdminPanel({ user }: { user: User }) {
  const { boot } = useSession();
  const [active, setActive] = useState<SectionId>("event");
  if (!boot) return <Skeleton className="h-[60vh]" />;
  const view: Record<SectionId, React.ReactNode> = {
    event: <EventConfig key={JSON.stringify(boot.event)} event={boot.event} />, phases: <Phases event={boot.event} />, roles: <RolesPermissions me={user} />,
    tracks: <TracksPrizes />, rubric: <Rubric />, io: <ExportData />, system: <System />,
  };

  return (
    <>
      <PageHeader eyebrow={`${ROLE_LABEL[user.role]} · ${boot.event.name}`} title="Administration"
        meta={<><span>{SECTIONS.length} areas</span><span>Every change audited and undoable</span><span>P-{pad(boot.counts.projects)} projects</span></>} />
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Administration sections" className="lg:sticky lg:top-24 lg:self-start">
          <label htmlFor="admin-section" className="sr-only">Section</label>
          <select id="admin-section" value={active} onChange={(e) => setActive(e.target.value as SectionId)} className={cn(fieldClass, "h-10 lg:hidden")}>
            {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <ul className="hidden space-y-0.5 lg:block">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button onClick={() => setActive(s.id)} aria-current={active === s.id ? "page" : undefined}
                  className={cn("relative flex h-9 w-full items-center rounded-sm px-3 text-left text-[13.5px] transition-colors", active === s.id ? "bg-white/[0.05] text-fg" : "text-fg-2 hover:text-fg")}>
                  {active === s.id && <motion.span layoutId="admin-nav" className="absolute inset-y-2 left-0 w-[2px] bg-accent" />}
                  {s.label}
                </button>
              </li>
            ))}
            <li className="pt-2"><Link href="/audit" className="flex h-9 items-center gap-2 px-3 text-[13.5px] text-muted hover:text-fg"><ScrollText className="size-3.5" />Audit & undo ↗</Link></li>
          </ul>
        </nav>
        <AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.25 }} className="min-w-0">
            {view[active]}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
