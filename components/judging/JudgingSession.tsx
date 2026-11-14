"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Cpu, GitBranch, Globe, Lock, Pencil, Save, X } from "lucide-react";
import { rubricLeaves, type Assignment, type RubricNode, type User } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/hooks";
import { cn, fmtUTC, pad, relativeTime } from "@/lib/utils";
import { ProjectPreview } from "@/components/ui/ProjectPreview";
import { Badge, Button, Field, Kbd, Meter, Skeleton, buttonClass, fieldClass } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { ErrorState, Restricted } from "@/components/ui/States";
import { STATUS_META, type JudgeQueue } from "./JudgeDashboard";

const CONFIDENCE = ["Low", "Some", "Moderate", "High", "Expert"];

function Criterion({ c, i, value, onChange, locked, inputRef }: {
  c: RubricNode & { group?: string }; i: number; value: number | undefined; onChange: (v: number) => void; locked: boolean; inputRef: (el: HTMLInputElement | null) => void;
}) {
  const id = `crit-${c.id}`;
  const max = c.maxScore ?? 10;
  return (
    <fieldset className={cn("group rounded-md border p-4 transition-colors focus-within:border-accent/50 focus-within:bg-accent/[0.02]", value == null ? "border-line" : "border-line-strong")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <legend className="flex flex-wrap items-center gap-2">
            {i < 9 && <Kbd>{i + 1}</Kbd>}
            {c.group && <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">{c.group} ›</span>}
            <span className="text-[15px] font-medium">{c.name}</span>
            {c.effectiveWeight != null && <span className="font-mono text-[11px] text-muted">{(c.effectiveWeight * 100).toFixed(0)}%</span>}
          </legend>
          <p id={`${id}-desc`} className="mt-1.5 text-[12.5px] leading-snug text-muted">{c.description}</p>
        </div>
        <output htmlFor={id} className="shrink-0 text-right font-mono tabular">
          <span className={cn("text-3xl font-semibold tracking-tight", value == null ? "text-muted" : "text-fg")}>{value != null ? value.toFixed(1) : "—"}</span>
          <span className="block text-[10px] text-muted">/ {max}</span>
        </output>
      </div>
      <input
        ref={inputRef} id={id} type="range" min={0} max={max} step={0.5} disabled={locked}
        value={value ?? max / 2} onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${c.name} score, out of ${max}`} aria-describedby={`${id}-desc`} aria-valuetext={value != null ? `${value} out of ${max}` : "Not scored"}
        className="range mt-3" style={{ ["--fill" as string]: `${((value ?? 0) / max) * 100}%` }}
      />
      <div className="mt-1 flex justify-between" aria-hidden>
        {Array.from({ length: max + 1 }, (_, n) => (
          <button key={n} type="button" tabIndex={-1} disabled={locked} onClick={() => onChange(n)}
            className={cn("font-mono text-[10px] transition-colors hover:text-fg", value === n ? "text-accent" : "text-muted")}>{n}</button>
        ))}
      </div>
    </fieldset>
  );
}

export function JudgingSession({ projectId, user }: { projectId: number; user: User }) {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const { boot } = useSession();
  const q = useApi<JudgeQueue>("/judging/queue");
  const rows = useMemo(() => q.data?.queue ?? [], [q.data]);
  const leaves = useMemo(() => rubricLeaves(q.data?.rubric ?? []), [q.data]);
  const idx = rows.findIndex((a) => a.projectId === projectId);
  const a = rows[idx];
  const p = a?.project;

  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [missing, setMissing] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState<Assignment | null>(null);
  const [saved, setSaved] = useState<{ at: number; weighted: number | null } | null>(null);
  const [error, setError] = useState<string>();
  const loadedFor = useRef<number | null>(null);
  const sliders = useRef<(HTMLInputElement | null)[]>([]);

  // Load the stored assignment when the project changes.
  useEffect(() => {
    if (!a || loadedFor.current === projectId) return;
    loadedFor.current = projectId;
    setScores(a.scores);
    setNotes(a.notes);
    setConfidence(a.confidence);
    setMissing([]);
    setEditing(false);
    setJustSubmitted(null);
    setSaved(a.updatedAt ? { at: Date.parse(a.updatedAt), weighted: a.weighted ?? null } : null);
  }, [a, projectId]);

  const judgingOpen = q.data?.judgingOpen ?? false;
  const locked = !judgingOpen || (a?.status === "submitted" && !editing);
  const scored = leaves.filter((c) => scores[c.id] != null).length;
  const done = rows.filter((r) => r.status === "submitted").length;

  const send = async (action: "save" | "submit") => {
    const res = await api<Assignment>(`/judging/${projectId}`, { method: "PUT", body: { scores, notes, confidence, action } });
    setSaved({ at: Date.now(), weighted: res.weighted ?? null });
    setError(undefined);
    return res;
  };

  // Debounced autosave of drafts through the C++ client.
  const dirty = !!a && !locked && (JSON.stringify(scores) !== JSON.stringify(a.scores) || notes !== a.notes || confidence !== a.confidence);
  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(() => { send("save").catch((e) => setError(errorMessage(e))); }, 900);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, scores, notes, confidence]);

  const go = (d: 1 | -1) => {
    const n = rows[idx + d];
    if (n) router.push(`/judging/${n.projectId}`);
  };

  const saveDraft = async () => {
    if (locked) return;
    try {
      await send("save");
      toast({ tone: "ok", title: "Draft saved", body: `PUT /judging/${projectId} · validated by the C++ client` });
    } catch (e) { setError(errorMessage(e)); }
  };

  const submit = async () => {
    if (locked) return;
    const miss = leaves.filter((c) => scores[c.id] == null).map((c) => c.name);
    setMissing(miss);
    if (miss.length) return;
    try {
      const res = await send("submit");
      setEditing(false);
      setJustSubmitted(res);
    } catch (e) { setError(errorMessage(e)); }
  };

  // Session shortcuts. Text fields keep their keys; sliders still allow J/K/S/Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range");
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "j") go(1);
      else if (k === "k") go(-1);
      else if (k === "s") { e.preventDefault(); saveDraft(); }
      else if (k === "enter" && t.tagName !== "BUTTON" && t.tagName !== "A") { e.preventDefault(); submit(); }
      else if (/^[1-9]$/.test(k) && +k <= leaves.length) { e.preventDefault(); sliders.current[+k - 1]?.focus(); }
      else if (k === "escape") router.push("/judging");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (q.error) return <ErrorState body={q.error.message} onRetry={q.reload} />;
  if (!q.data) return <Skeleton className="h-[60vh]" />;
  if (!p || !a) return <Restricted role="Judge (not assigned to this project)" />;
  const meta = STATUS_META[a.status];
  const track = boot?.tracks.find((t) => t.id === p.trackId);
  const weighted = saved?.weighted ?? a.weighted ?? null;

  return (
    <div>
      {/* Focus header */}
      <header className="sticky top-14 z-30 -mx-4 -mt-8 mb-8 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur-xl md:-mx-8 md:-mt-10 md:px-8 xl:-mx-12 xl:px-12">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/judging" className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted hover:text-fg"><ArrowLeft className="size-3" />Queue</Link>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-2">Judging session · <span className="text-fg">{p.code}</span> <span className="text-muted">/ {pad(idx + 1, 2)} of {pad(rows.length, 2)}</span></p>
          <div className="order-last flex w-full items-center gap-3 md:order-none md:ml-auto md:w-64">
            <Meter value={(done / Math.max(1, rows.length)) * 100} label="Session progress" />
            <span className="shrink-0 font-mono text-[10.5px] tabular text-muted">{done}/{rows.length} REVIEWED</span>
          </div>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <Button size="sm" variant="ghost" onClick={() => go(-1)} disabled={idx === 0} aria-label="Previous project (K)"><ChevronLeft className="size-3.5" /><Kbd>K</Kbd></Button>
            <Button size="sm" variant="ghost" onClick={() => go(1)} disabled={idx === rows.length - 1} aria-label="Next project (J)"><Kbd>J</Kbd><ChevronRight className="size-3.5" /></Button>
          </div>
        </div>
      </header>

      <div className="grid gap-8 xl:grid-cols-[1fr_480px]">
        {/* Project */}
        <section aria-label="Project under review" className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={meta.tone} dot>{meta.label}</Badge>
            {track && <Badge>{track.name}</Badge>}
          </div>
          <h1 className="mt-4 text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[0.88] tracking-[-0.05em]">{p.name}</h1>
          <p className="mt-3 text-[17px] text-fg-2">{p.tagline}</p>
          <div className="mt-6 overflow-hidden rounded-md border border-line"><div className="aspect-[16/9]"><ProjectPreview seed={p.slug} animated /></div></div>
          <p className="mt-6 max-w-2xl text-[15.5px] leading-relaxed text-fg-2">{p.description}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[{ icon: Globe, k: "Demo", v: p.demo }, { icon: GitBranch, k: "Repository", v: p.repo }].filter((x) => x.v).map(({ icon: Icon, k, v }) => (
              <a key={k} href={v.startsWith("http") ? v : `https://${v}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-sm border border-line p-3 hover:border-line-strong">
                <Icon className="size-4 text-muted" /><span className="min-w-0"><span className="label block">{k}</span><span className="block truncate font-mono text-[12px]">{v}</span></span>
              </a>
            ))}
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-3">
            <div><dt className="label">Team</dt><dd className="mt-1 text-[14px]">{p.team?.name} · {p.team?.members.length}</dd></div>
            <div><dt className="label">Stack</dt><dd className="mt-1 font-mono text-[12px] text-fg-2">{p.stack.join(" · ")}</dd></div>
            <div><dt className="label">Submitted</dt><dd className="mt-1 font-mono text-[12px] text-fg-2">{p.submittedAt && fmtUTC(p.submittedAt)}</dd></div>
          </dl>
        </section>

        {/* Rubric */}
        <section aria-label="Scoring rubric" className="xl:sticky xl:top-32 xl:self-start">
          <AnimatePresence mode="wait">
            {justSubmitted ? (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="relative overflow-hidden rounded-md border border-ok/30 bg-ok/[0.04] p-6" role="status">
                <div className="flex size-10 items-center justify-center rounded-sm bg-ok text-bg"><Check className="size-5" strokeWidth={3} /></div>
                <p className="label mt-5 text-ok">Score submitted</p>
                <p className="mt-2 font-mono text-6xl font-semibold tabular tracking-tight">{justSubmitted.weighted?.toFixed(2) ?? "—"}</p>
                <dl className="mt-5 space-y-1 font-mono text-[11px] text-muted">
                  <div className="flex justify-between"><dt>PROJECT</dt><dd className="text-fg-2">{p.code}</dd></div>
                  <div className="flex justify-between"><dt>JUDGE</dt><dd className="text-fg-2">{user.judgeId}</dd></div>
                  <div className="flex justify-between"><dt>RECORDED</dt><dd className="text-fg-2">{justSubmitted.submittedAt ? fmtUTC(justSubmitted.submittedAt) : ""}</dd></div>
                  <div className="flex justify-between"><dt>WEIGHTED BY</dt><dd className="text-fg-2">C++ GENERALIZED LIST</dd></div>
                </dl>
                <div className="mt-6 flex gap-2">
                  {rows[idx + 1] ? (
                    <Button variant="primary" autoFocus onClick={() => go(1)}>Next project <ArrowRight className="size-3.5" /></Button>
                  ) : (
                    <Link href="/judging" autoFocus className={buttonClass("primary")}>Back to queue</Link>
                  )}
                  <Button variant="ghost" onClick={() => setJustSubmitted(null)}>View scores</Button>
                </div>
              </motion.div>
            ) : (
              <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
                <div className="flex items-end justify-between rounded-md border border-line bg-surface/70 p-4">
                  <div>
                    <p className="label flex items-center gap-1.5"><Cpu className="size-3" />Weighted total · computed in C++</p>
                    <p className="mt-1 font-mono text-5xl font-semibold tabular tracking-tight">{weighted != null && scored ? weighted.toFixed(2) : "—"}</p>
                  </div>
                  <div className="text-right font-mono text-[10.5px] text-muted">
                    <p>{scored}/{leaves.length} CRITERIA</p>
                    <p className="mt-1" aria-live="polite">
                      {a.status === "submitted" && !editing ? <span className="flex items-center gap-1 text-ok"><Lock className="size-3" />SUBMITTED</span>
                        : saved && now ? `SAVED ${relativeTime(saved.at, now).toUpperCase()}` : "NOT SAVED"}
                    </p>
                  </div>
                </div>

                {leaves.map((c, i) => (
                  <Criterion key={c.id} c={c} i={i} value={scores[c.id]} locked={locked}
                    inputRef={(el) => { sliders.current[i] = el; }}
                    onChange={(v) => { setScores((s) => ({ ...s, [c.id]: v })); setMissing((m) => m.filter((x) => x !== c.name)); }} />
                ))}

                <Field label="Notes" htmlFor="notes" hint="Private to judges and admins">
                  <textarea id="notes" rows={3} value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)}
                    className={cn(fieldClass, "resize-y py-2 text-[13.5px]")} placeholder="What stood out? What would you ask the team?" />
                </Field>
                <div role="radiogroup" aria-label="Confidence in this assessment">
                  <p className="label mb-1.5 text-fg-2">Confidence</p>
                  <div className="grid grid-cols-5 gap-1 rounded-sm border border-line-strong p-1">
                    {CONFIDENCE.map((l, i) => (
                      <button key={l} type="button" role="radio" aria-checked={confidence === i + 1} disabled={locked} onClick={() => setConfidence(i + 1)}
                        className={cn("h-8 rounded-xs font-mono text-[10px] uppercase tracking-[0.06em] transition-colors",
                          confidence === i + 1 ? "bg-fg text-bg" : "text-muted hover:bg-white/[0.05] hover:text-fg")}>{l}</button>
                    ))}
                  </div>
                </div>

                <AnimatePresence>
                  {(missing.length > 0 || error) && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} role="alert"
                      className="flex items-center gap-2 font-mono text-[11px] text-danger"><X className="size-3" />{error ?? `Score required: ${missing.join(", ")}`}</motion.p>
                  )}
                </AnimatePresence>

                {!judgingOpen ? (
                  <p className="flex items-center gap-2 rounded-sm border border-line p-3 text-[12.5px] text-muted"><Lock className="size-3.5" />Judging is closed. Scores can no longer be changed.</p>
                ) : a.status === "submitted" && !editing ? (
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 rounded-sm border border-line p-3 text-[12.5px] text-muted"><Lock className="size-3.5" />Submitted {a.submittedAt && fmtUTC(a.submittedAt)}. You can still edit while judging is open; you must submit again.</p>
                    <Button size="lg" className="w-full" onClick={() => setEditing(true)}><Pencil className="size-3.5" />Edit score</Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button type="button" size="lg" onClick={saveDraft}><Save className="size-3.5" />Save draft <Kbd className="ml-1">S</Kbd></Button>
                    <Button type="submit" size="lg" variant="primary">Submit score <Kbd className="ml-1 border-accent-ink/20 bg-accent-ink/10 text-accent-ink">↵</Kbd></Button>
                  </div>
                )}
                <p className="hidden pt-1 text-center font-mono text-[10px] text-muted md:block">1–{Math.min(9, leaves.length)} FOCUS CRITERION · ←/→ ADJUST · J/K PROJECT · ESC QUEUE</p>
              </motion.form>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}
