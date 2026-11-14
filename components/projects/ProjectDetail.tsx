"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, Binary, Gavel, GitBranch, Globe, Lock, MessageSquare, Send } from "lucide-react";
import { rubricLeaves, type Assignment, type AuditEvent, type Comment, type Project, type RubricNode, type Team, type Track, type User, type Results } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { cn, fmtUTC, pad } from "@/lib/utils";
import { ProjectPreview } from "@/components/ui/ProjectPreview";
import { Avatar, Badge, Button, Meta, Skeleton, Ticks, buttonClass, fieldClass } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";

const SECTIONS = ["About", "Technology", "Demo", "Team", "Submission", "Judging", "Comments", "Audit history"];
const sid = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

function Section({ title, children, index }: { title: string; children: React.ReactNode; index: number }) {
  return (
    <section id={sid(title)} className="scroll-mt-32 grid gap-4 border-t border-line py-10 md:grid-cols-[220px_1fr] md:gap-10">
      <h2 className="label flex items-baseline gap-3 text-fg-2"><span className="text-muted">{pad(index + 1, 2)}</span>{title}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ScoreTable({ scores, total, label, rubric }: { scores: Record<string, number>; total?: number | null; label: string; rubric: RubricNode[] }) {
  const leaves = rubricLeaves(rubric);
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full text-left">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="border-b border-line bg-white/[0.02]">
            <th scope="col" className="label px-4 py-2.5 font-normal">Criterion</th>
            <th scope="col" className="label px-4 py-2.5 text-right font-normal">Weight</th>
            <th scope="col" className="label px-4 py-2.5 text-right font-normal">Score</th>
          </tr>
        </thead>
        <tbody>
          {leaves.map((c) => (
            <tr key={c.id} className="border-b border-line last:border-0">
              <th scope="row" className="px-4 py-3 text-[14px] font-normal text-fg">
                {c.group && <span className="mr-1 font-mono text-[10.5px] text-muted">{c.group} ›</span>}{c.name}
                <div className="mt-2 h-[3px] w-full max-w-60 rounded-full bg-white/[0.06]">
                  <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} whileInView={{ width: `${((scores[c.id] ?? 0) / (c.maxScore ?? 10)) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9 }} />
                </div>
              </th>
              <td className="px-4 py-3 text-right font-mono text-[13px] text-muted">{c.effectiveWeight != null ? `${(c.effectiveWeight * 100).toFixed(0)}%` : ""}</td>
              <td className="px-4 py-3 text-right font-mono text-[15px] tabular text-fg">
                {scores[c.id] != null ? scores[c.id].toFixed(1) : "—"}<span className="text-muted"> / {c.maxScore ?? 10}</span>
              </td>
            </tr>
          ))}
        </tbody>
        {total != null && (
          <tfoot>
            <tr className="border-t border-line-strong bg-white/[0.02]">
              <th scope="row" className="label px-4 py-3 font-normal text-fg-2">Weighted total · C++</th>
              <td />
              <td className="px-4 py-3 text-right font-mono text-lg tabular text-accent">{total.toFixed(2)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function JudgeView({ project }: { project: Project }) {
  const q = useApi<{ queue: Assignment[]; rubric: RubricNode[] }>("/judging/queue");
  if (!q.data) return <Skeleton className="h-40" />;
  const mine = q.data.queue.find((a) => a.projectId === project.id);
  if (!mine) return <p className="flex items-center gap-2 text-[14px] text-muted"><Lock className="size-4" />You are not assigned to this project. Other judges&apos; scores are never visible to you.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label text-fg-2">Judging panel · your scores</p>
        <Link href={`/judging/${project.id}`} className={buttonClass("primary", "sm")}><Gavel className="size-3" />{mine.status === "submitted" ? "Review score" : "Open in judging session"}</Link>
      </div>
      <ScoreTable rubric={q.data.rubric} scores={mine.scores} total={mine.weighted} label="Your rubric scores" />
    </div>
  );
}

function AdminView({ project }: { project: Project }) {
  const { boot } = useSession();
  const o = useApi<{ assignments: Assignment[]; judges: { id: string; name: string }[] }>("/admin/judging");
  const r = useApi<Results>("/results?by=average");
  if (!o.data || !boot) return <Skeleton className="h-40" />;
  const rows = o.data.assignments.filter((a) => a.projectId === project.id);
  const leaves = rubricLeaves(boot.rubric);
  const agg = r.data?.ranking.find((x) => x.projectId === project.id);
  if (!rows.length) return <p className="text-[14px] text-muted">{project.status === "draft" ? "Drafts are not assigned to judges until submitted." : "No judges assigned yet — run the round-robin assignment."}</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 border-l border-t border-line sm:grid-cols-4">
        {[["Average", agg?.average], ["Normalized", agg?.normalized], ["Rank", agg ? `#${agg.rank}` : undefined], ["Scores in", `${rows.filter((a) => a.status === "submitted").length}/${rows.length}`]].map(([k, v]) => (
          <div key={k as string} className="border-b border-r border-line p-4">
            <p className="label">{k}</p>
            <p className="mt-2 font-mono text-2xl tabular">{typeof v === "number" ? v.toFixed(2) : v ?? "—"}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[640px] text-left font-mono text-[12px]">
          <caption className="sr-only">Per-judge scores</caption>
          <thead><tr className="border-b border-line bg-white/[0.02] text-muted">
            <th scope="col" className="px-4 py-2.5 font-normal">JUDGE</th>
            {leaves.map((c) => <th key={c.id} scope="col" className="px-2 py-2.5 text-right font-normal" title={c.name}>{c.name.split(" ")[0].slice(0, 7).toUpperCase()}</th>)}
            <th scope="col" className="px-4 py-2.5 text-right font-normal">WEIGHTED</th>
          </tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.judgeId} className="border-b border-line last:border-0">
                <th scope="row" className="px-4 py-2.5 font-normal text-fg-2">{a.judgeId}<span className="ml-2 text-muted">{o.data!.judges.find((j) => j.id === a.judgeId)?.name}</span></th>
                {leaves.map((c) => <td key={c.id} className="px-2 py-2.5 text-right tabular">{a.scores[c.id]?.toFixed(1) ?? "—"}</td>)}
                <td className="px-4 py-2.5 text-right tabular text-accent">{a.status === "submitted" && a.weighted != null ? a.weighted.toFixed(2) : <Badge tone={a.status === "flagged" ? "danger" : "neutral"}>{a.status.replace("_", " ")}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Judging({ project, user }: { project: Project; user: User | null }) {
  const { boot } = useSession();
  if (user?.role === "judge") return <JudgeView project={project} />;
  if (user?.role === "admin") return <AdminView project={project} />;
  return (
    <div className="flex items-start gap-3 rounded-md border border-dashed border-line-strong p-5">
      <Lock className="mt-0.5 size-4 text-muted" />
      <div>
        <p className="text-[14px]">Scores are sealed</p>
        <p className="mt-1 text-[13px] text-muted">Judging results are hidden from participants until results are published{boot ? ` on ${fmtUTC(boot.event.resultsAt)}` : ""}.</p>
      </div>
    </div>
  );
}

function Comments({ project, user }: { project: Project; user: User | null }) {
  const toast = useToast();
  const c = useApi<Comment[]>(`/projects/${project.id}/comments`, { auth: false });
  const list = c.data ?? [];
  const [body, setBody] = useState("");
  const [lastAt, setLastAt] = useState(0);
  const [error, setError] = useState<string>();

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const text = body.trim();
    if (text.length < 3) return setError("Comment must be at least 3 characters.");
    if (Date.now() - lastAt < 20_000) return setError(`Rate limited — please wait ${Math.ceil((20_000 - (Date.now() - lastAt)) / 1000)}s before commenting again.`);
    setError(undefined);
    try {
      await api(`/projects/${project.id}/comments`, { method: "POST", body: { body: text } });
      setBody("");
      setLastAt(Date.now());
      toast({ tone: "ok", title: "Comment posted", body: "Logged as COMMENT_POSTED" });
    } catch (x) { setError(errorMessage(x)); }
  };

  return (
    <div>
      {user ? (
        <form onSubmit={post} className="mb-6">
          <label htmlFor="comment" className="sr-only">Add a comment</label>
          <textarea id="comment" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000} placeholder="Ask a question or leave constructive feedback…"
            aria-invalid={!!error} aria-describedby={error ? "comment-error" : undefined} className={cn(fieldClass, "resize-y py-2.5")} />
          <div className="mt-2 flex items-center justify-between gap-3">
            {error ? <p id="comment-error" role="alert" className="font-mono text-[11px] text-danger">{error}</p> : <span className="font-mono text-[10.5px] text-muted">{body.length}/1000 · 1 COMMENT / 20S</span>}
            <Button type="submit" size="sm" variant="secondary" disabled={!body.trim()}><Send className="size-3" />Post</Button>
          </div>
        </form>
      ) : (
        <p className="mb-6 text-[13px] text-muted"><Link href="/signin" className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-accent">Sign in</Link> to join the discussion.</p>
      )}
      {list.length === 0 ? (
        <p className="flex items-center gap-2 text-[13px] text-muted"><MessageSquare className="size-4" />No comments yet.</p>
      ) : (
        <ul className="space-y-5">
          {list.map((cm) => (
            <motion.li key={cm.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
              <Avatar initials={cm.author.split(" ").map((s) => s[0]).join("")} />
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]"><span className="text-fg">{cm.author}</span><span className="font-mono text-[10.5px] text-muted">{cm.handle} · {fmtUTC(cm.at)}</span></p>
                <p className="mt-1 text-[14px] leading-relaxed text-fg-2">{cm.body}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Lookup = { bst: number; bstHeight: number; binary: number; linear: number; n: number };
type Detail = { project: Project; team: Team | null; track?: Track; lookup: Lookup };

/** Loads one project through the C++ client (BST lookup by id). */
export function ProjectDetailLoader({ id, publicView }: { id: number; publicView?: boolean }) {
  const { user } = useSession();
  const d = useApi<Detail>(`/projects/${id}`, { auth: !publicView });
  if (d.error) return <ErrorState title={(d.error as { status?: number }).status === 404 ? "Project not found" : undefined} body={d.error.message} onRetry={d.reload} />;
  if (!d.data) return <Skeleton className="h-[70vh]" />;
  if (publicView && d.data.project.status !== "submitted") return <ErrorState title="Project not found" body="Only submitted projects are public." />;
  return <ProjectDetail data={d.data} user={publicView ? null : user} publicView={publicView} />;
}

export function ProjectDetail({ data, user, publicView }: { data: Detail; user: User | null; publicView?: boolean }) {
  const { boot } = useSession();
  const p = data.project;
  const team = data.team ?? { id: p.teamId, name: p.team?.name ?? "", members: [], createdAt: p.updatedAt, projectId: p.id };
  const track = data.track;
  const staff = user?.role === "admin";
  const audit = useApi<{ events: AuditEvent[] }>(staff ? "/admin/audit" : null);
  const [active, setActive] = useState(SECTIONS[0]);
  const sections = useMemo(() => SECTIONS.filter((s) => (s === "Audit history" ? staff : s === "Judging" ? !publicView : true)), [staff, publicView]);

  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      const hit = entries.find((e) => e.isIntersecting);
      if (hit) setActive(SECTIONS.find((s) => sid(s) === hit.target.id) ?? SECTIONS[0]);
    }, { rootMargin: "-30% 0px -60% 0px" });
    sections.forEach((s) => { const el = document.getElementById(sid(s)); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [sections]);

  const history = (audit.data?.events ?? []).filter((e) => e.object === `PROJECT_${pad(p.id)}` || e.object === p.teamId);

  return (
    <article>
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5">
        <Link href={publicView ? "/gallery" : "/projects"} className="label hover:text-fg">Projects</Link>
        <span className="label">/</span>
        <span className="label text-fg-2" aria-current="page">{p.code}</span>
      </nav>

      <header className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-end">
        <div>
          <p className="font-mono text-[12px] tracking-[0.12em] text-accent">{p.code}</p>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-3 text-[clamp(3rem,9vw,7.5rem)] font-semibold leading-[0.85] tracking-[-0.055em]">{p.name}</motion.h1>
          <p className="mt-5 max-w-2xl text-[18px] leading-snug text-fg-2">{p.tagline}</p>
        </div>
        <dl className="rounded-md border border-line bg-surface/70 px-4 py-1">
          <Meta k="Built by" v={team.name} />
          <Meta k="Status" v={p.status === "submitted" ? <span className="text-ok">SUBMITTED</span> : <span className="text-warn">DRAFT</span>} />
          <Meta k="Track" v={track?.name ?? "—"} />
          <Meta k="Technology" v={p.stack.join(" · ")} />
        </dl>
      </header>

      <p className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
        <Binary className="size-3 text-accent" />Found by the C++ client: BST {data.lookup.bst} comparisons (height {data.lookup.bstHeight})
        · binary search {data.lookup.binary} · linear search {data.lookup.linear} · n = {data.lookup.n}
      </p>

      <div className="relative mt-6 overflow-hidden rounded-md border border-line">
        <Ticks />
        <div className="aspect-[16/9] max-h-[640px] w-full md:aspect-[21/9]"><ProjectPreview seed={p.slug} animated /></div>
      </div>

      <nav aria-label="Sections" className="no-scrollbar sticky top-14 z-20 -mx-4 mt-8 flex overflow-x-auto border-b border-line bg-bg/85 px-4 backdrop-blur-xl md:mx-0 md:px-0">
        {sections.map((s) => (
          <a key={s} href={`#${sid(s)}`} aria-current={active === s ? "true" : undefined}
            className={cn("relative flex h-11 shrink-0 items-center px-3 font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors",
              active === s ? "text-fg" : "text-muted hover:text-fg-2")}>
            {s}
            {active === s && <motion.span layoutId="detail-tab" className="absolute inset-x-3 -bottom-px h-px bg-accent" />}
          </a>
        ))}
      </nav>

      {sections.map((s, i) => (
        <Section key={s} title={s} index={i}>
          {s === "About" && <p className="max-w-3xl text-[17px] leading-relaxed text-fg-2">{p.description}</p>}
          {s === "Technology" && (
            <ul className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
              {p.stack.map((t, k) => (
                <li key={t} className="bg-surface p-4">
                  <p className="label">LAYER {pad(k + 1, 2)}</p>
                  <p className="mt-2 text-lg font-medium">{t}</p>
                </li>
              ))}
            </ul>
          )}
          {s === "Demo" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {[{ icon: Globe, k: "Live demo", v: p.demo }, { icon: GitBranch, k: "Repository", v: p.repo }].filter((x) => x.v).map(({ icon: Icon, k, v }) => (
                <a key={k} href={v.startsWith("http") ? v : `https://${v}`} target="_blank" rel="noreferrer" className="group flex items-center gap-4 rounded-md border border-line p-4 transition-colors hover:border-line-strong">
                  <Icon className="size-5 text-muted group-hover:text-accent" />
                  <span className="min-w-0 flex-1"><span className="label block">{k}</span><span className="block truncate font-mono text-[12.5px] text-fg">{v}</span></span>
                  <ArrowUpRight className="size-4 text-muted" />
                </a>
              ))}
            </div>
          )}
          {s === "Team" && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {team.members.map((m) => (
                <li key={m.handle} className="flex items-center gap-3 rounded-md border border-line p-3">
                  <Avatar initials={m.initials} size={36} />
                  <span className="min-w-0 flex-1"><span className="block text-[14px]">{m.name}</span><span className="font-mono text-[10.5px] text-muted">{m.handle}{m.country && ` · ${m.country}`}</span></span>
                  {m.role === "captain" && <Badge tone="accent">Captain</Badge>}
                </li>
              ))}
            </ul>
          )}
          {s === "Submission" && (
            <dl className="max-w-xl">
              <Meta k="Submitted" v={p.submittedAt ? fmtUTC(p.submittedAt) : "Not yet submitted"} />
              <Meta k="Last updated" v={fmtUTC(p.updatedAt)} />
              <Meta k="Deadline" v={boot ? fmtUTC(boot.event.deadline) : "—"} />
              <Meta k="Lock state" v={boot && Date.parse(boot.event.deadline) < Date.now() ? "LOCKED" : "EDITABLE UNTIL DEADLINE"} />
            </dl>
          )}
          {s === "Judging" && <Judging project={p} user={user} />}
          {s === "Comments" && <Comments project={p} user={user} />}
          {s === "Audit history" && (history.length === 0 ? <p className="text-[13px] text-muted">No recorded events for this project yet.</p> :
            <ol className="divide-y divide-line rounded-md border border-line font-mono text-[11.5px]">
              {history.map((e) => (
                <li key={e.id} className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2.5 sm:grid-cols-[170px_150px_1fr_auto]">
                  <span className="text-muted">{fmtUTC(e.at)}</span>
                  <span className="text-fg-2">{e.actor}</span>
                  <span className="text-fg">{e.action}</span>
                  <span className="text-muted">{e.detail}</span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      ))}
    </article>
  );
}
