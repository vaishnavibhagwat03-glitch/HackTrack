"use client";

import Link from "next/link";
import { ArrowRight, Binary, CircleDashed, Clock, FileEdit, Flag, Gavel, ShieldAlert, Users } from "lucide-react";
import type { Assignment, AuditEvent, Judge, Project, Team, User } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { fmtUTC, pad } from "@/lib/utils";
import { AreaChart, ChartFrame, HBars } from "@/components/charts/Charts";
import { Avatar, Badge, Meta, Meter, Panel, buttonClass } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { JourneyTimeline } from "@/components/teams/JourneyTimeline";
import { JudgeDashboard } from "@/components/judging/JudgeDashboard";
import { ActivityFeed, DashboardSkeleton, EventStatus, Greeting, MetricStrip } from "./Widgets";

export { DashboardSkeleton };

export function Dashboard({ user }: { user: User }) {
  if (user.role === "participant") return <ParticipantDashboard user={user} />;
  if (user.role === "judge") return <JudgeDashboard user={user} />;
  return <AdminDashboard user={user} />;
}

// ── Participant ───────────────────────────────────────────────

function ParticipantDashboard({ user }: { user: User }) {
  const { boot } = useSession();
  const mine = useApi<{ team: Team | null; project?: Project }>("/teams/mine");
  const recent = useApi<{ projects: Project[] }>("/projects?sort=recent");
  if (mine.error) return <ErrorState body={mine.error.message} onRetry={mine.reload} />;
  if (mine.loading || !mine.data) return <DashboardSkeleton />;
  const { team, project } = mine.data;
  const track = boot?.tracks.find((t) => t.id === project?.trackId);

  const checklist = [
    { k: "Project name & tagline", done: !!project?.name && !!project?.tagline },
    { k: "Description", done: !!project?.description },
    { k: "Repository link", done: !!project?.repo },
    { k: "Demo link", done: !!project?.demo },
    { k: "Tech stack", done: !!project?.stack.length },
    { k: "Track selected", done: !!project?.trackId },
  ];
  const done = checklist.filter((c) => c.done).length;
  const stage = !team ? 0 : !project ? 1 : project.status === "draft" ? 2 : boot?.event.resultsPublished ? 5 : boot?.event.judgingOpen ? 4 : 3;

  return (
    <>
      <Greeting name={user.name} sub="Participant workspace" />
      <EventStatus />

      {!team ? (
        <EmptyState className="mt-6" code="NO TEAM · STEP 1" title="Create or join a team"
          body="Every submission belongs to a team. Start your own, or ask a captain for their invite code."
          action={<Link href="/teams" className={buttonClass("primary")}><Users className="size-3.5" />Go to team</Link>} />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="Your submission" meta={project?.code ?? "NOT STARTED"} ticks
            action={project?.status === "submitted" ? <Badge tone="ok" dot>Submitted</Badge> : <Badge tone="warn" dot>Draft</Badge>}>
            <h2 className="text-3xl font-semibold tracking-[-0.03em]">{project?.name ?? "Untitled project"}</h2>
            <p className="mt-1 text-[14px] text-fg-2">{project?.tagline || "Add a one-line tagline in the submission builder."}</p>
            <div className="mt-6">
              <div className="mb-2 flex justify-between font-mono text-[11px]"><span className="text-muted">COMPLETENESS</span><span className="text-fg">{done}/{checklist.length}</span></div>
              <Meter value={(done / checklist.length) * 100} label="Submission completeness" />
            </div>
            <ul className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {checklist.map((c) => (
                <li key={c.k} className="flex items-center gap-2 text-[13px]">
                  {c.done ? <span className="size-1.5 rounded-full bg-ok" /> : <CircleDashed className="size-3 text-warn" />}
                  <span className={c.done ? "text-fg-2" : "text-fg"}>{c.k}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/submission" className={buttonClass("primary")}><FileEdit className="size-3.5" />{project ? "Continue editing" : "Start submission"}</Link>
              <Link href="/teams" className={buttonClass("secondary")}><Users className="size-3.5" />Team</Link>
            </div>
          </Panel>

          <Panel title="Team" meta={team.name.toUpperCase()}>
            <ul className="space-y-3">
              {team.members.map((m) => (
                <li key={m.handle} className="flex items-center gap-3">
                  <Avatar initials={m.initials} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{m.name}</span>
                    <span className="font-mono text-[10.5px] text-muted">{m.handle}</span>
                  </span>
                  {m.role === "captain" && <Badge tone="accent">Captain</Badge>}
                </li>
              ))}
            </ul>
            <dl className="mt-5 border-t border-line pt-3">
              <Meta k="Invite code" v={team.inviteCode ?? "—"} />
              <Meta k="Track" v={track?.name ?? "—"} />
              <Meta k="Last edit" v={project ? fmtUTC(project.updatedAt) : "—"} />
            </dl>
          </Panel>
        </div>
      )}

      <Panel title="Your journey" className="mt-6" bodyClassName="p-5 md:p-6"><JourneyTimeline current={stage} /></Panel>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <div><p className="label">From the gallery · quick sort by time</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Recently submitted</h2></div>
          <Link href="/projects" className="label flex items-center gap-1 hover:text-fg">All projects <ArrowRight className="size-3" /></Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(recent.data?.projects ?? []).filter((p) => p.status === "submitted").slice(0, 3).map((p, i) => <ProjectCard key={p.id} project={p} index={i} />)}
        </div>
      </section>
    </>
  );
}

// ── Admin ─────────────────────────────────────────────────────

type Analytics = {
  counts: { teams: number; participants: number; submitted: number; drafts: number; judges: number; assignments: number; votes: number };
  judging: { submitted: number; inProgress: number; notStarted: number; flagged: number };
  timeline: { label: string; value: number }[];
};
type Overview = {
  assignments: Assignment[];
  judges: (Judge & { assigned: number; completed: number })[];
  coverage: { projectId: number; name: string; judges: number }[];
  underCovered: number;
  perProject: number;
};

function AdminDashboard({ user }: { user: User }) {
  const { boot } = useSession();
  const a = useApi<Analytics>("/admin/analytics");
  const o = useApi<Overview>("/admin/judging");
  const audit = useApi<{ events: AuditEvent[] }>("/admin/audit", { pollMs: 8000 });
  const projects = useApi<{ projects: Project[] }>("/projects?sort=name");
  const ds = useApi<{ hashing: { name: string; size: number; capacity: number }[]; bst: { size: number; height: number }; queue: { sent: number; retries: number } }>("/ds", { pollMs: 8000 });

  if (a.error) return <ErrorState body={a.error.message} onRetry={a.reload} />;
  if (!a.data || !o.data) return <DashboardSkeleton />;
  const c = a.data.counts;
  const j = a.data.judging;
  const total = j.submitted + j.inProgress + j.notStarted + j.flagged;
  const judgedPct = total ? (j.submitted / total) * 100 : 0;
  const flagged = o.data.assignments.filter((x) => x.status === "flagged");
  const drafts = (projects.data?.projects ?? []).filter((p) => p.status === "draft");
  const under = o.data.coverage.filter((x) => x.judges < o.data!.perProject);

  return (
    <>
      <Greeting name={user.name} sub="Event control center" />
      <EventStatus />

      <div className="mt-6">
        <MetricStrip items={[
          { k: "Projects", v: c.submitted + c.drafts, delta: `${c.drafts} in draft`, href: "/projects" },
          { k: "Teams", v: c.teams, delta: `${c.participants} participants`, href: "/teams" },
          { k: "Judges", v: c.judges, delta: `${c.assignments} assignments`, href: "/judging" },
          { k: "Submissions", v: c.submitted, delta: `${c.votes} community votes` },
          { k: "Judged", v: judgedPct, suffix: "%", delta: `${j.submitted} of ${total} reviews`, href: "/judging" },
        ]} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <ChartFrame title="Submission timeline" meta="Merge-sorted · 6-hour buckets">
          {a.data.timeline.length ? <AreaChart data={a.data.timeline} height={220} caption="Cumulative submissions by 6-hour window" /> : <p className="text-[13px] text-muted">No submissions yet.</p>}
        </ChartFrame>
        <ChartFrame title="Judge completion" meta={`${o.data.judges.length} judges`}>
          <HBars caption="Completed assignments per judge" max={100} format={(v) => `${Math.round(v)}%`}
            data={o.data.judges.map((x) => ({ label: x.name, sub: x.id, value: x.assigned ? (x.completed / x.assigned) * 100 : 0 }))
              .sort((p, q) => q.value - p.value).slice(0, 8)} />
        </ChartFrame>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Live activity" meta="AUDIT STREAM" action={<Link href="/audit" className="label flex items-center gap-1 hover:text-fg">Open ledger <ArrowRight className="size-3" /></Link>} bodyClassName="px-4 py-1">
          <ActivityFeed events={audit.data?.events ?? []} limit={9} />
        </Panel>

        <Panel title="Needs attention" meta={`${flagged.length + drafts.length + under.length} ITEMS`} bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {under.length > 0 && (
              <li className="flex items-start gap-3 p-4">
                <Gavel className="mt-0.5 size-4 shrink-0 text-warn" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px]">{under.length} projects have fewer than {o.data.perProject} judges</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">RUN ROUND-ROBIN ASSIGNMENT</p>
                </div>
                <Link href="/judging" className={buttonClass("ghost", "sm")}>Assign</Link>
              </li>
            )}
            {flagged.map((x) => (
              <li key={`${x.judgeId}${x.projectId}`} className="flex items-start gap-3 p-4">
                <Flag className="mt-0.5 size-4 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px]">Score flagged for review</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">{x.judgeId} · PROJECT_{pad(x.projectId)}</p>
                </div>
                <Link href={`/projects/${x.projectId}`} className={buttonClass("ghost", "sm")}>Review</Link>
              </li>
            ))}
            {drafts.map((p) => (
              <li key={p.id} className="flex items-start gap-3 p-4">
                <Clock className="mt-0.5 size-4 shrink-0 text-warn" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px]"><span className="font-medium">{p.name}</span> is still a draft</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">{(p.team?.name ?? "").toUpperCase()} · LOCKS {boot ? fmtUTC(boot.event.deadline, "time") : ""}</p>
                </div>
              </li>
            ))}
            {!flagged.length && !drafts.length && !under.length && (
              <li className="flex items-start gap-3 p-4"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-ok" /><p className="text-[13.5px]">Nothing needs attention.</p></li>
            )}
          </ul>
        </Panel>
      </div>

      <Panel title="C++ client" meta="LIVE DATA STRUCTURES" className="mt-6"
        action={<Link href="/structures" className="label flex items-center gap-1 hover:text-fg"><Binary className="size-3" />Inspect <ArrowRight className="size-3" /></Link>}>
        <dl className="grid gap-x-10 sm:grid-cols-2 xl:grid-cols-4">
          {(ds.data?.hashing ?? []).slice(0, 3).map((h) => <Meta key={h.name} k={`Hash · ${h.name}`} v={`${h.size} / ${h.capacity} buckets`} />)}
          <Meta k="BST · projects" v={ds.data ? `${ds.data.bst.size} nodes · height ${ds.data.bst.height}` : "—"} />
          <Meta k="Request queue" v={ds.data ? `${ds.data.queue.sent} sent · ${ds.data.queue.retries} retries` : "—"} />
          <Meta k="Rubric" v={boot ? `generalized list · depth ${boot.rubricDepth}` : "—"} />
          <Meta k="Judges / project" v={o.data.perProject} />
          <Meta k="Results" v={boot?.event.resultsPublished ? <span className="text-ok">Published</span> : "Hidden"} />
        </dl>
      </Panel>
    </>
  );
}
