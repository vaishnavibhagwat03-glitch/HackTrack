"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Lock, Send, X } from "lucide-react";
import type { Project, Team, Track } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/hooks";
import { cn, fmtUTC, hms, relativeTime } from "@/lib/utils";
import { Avatar, Badge, Button, Field, Panel, Skeleton, buttonClass, fieldClass } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";

type Draft = {
  name: string; tagline: string; description: string; stack: string[]; repo: string; demo: string; trackId: string;
};
type Errors = Partial<Record<keyof Draft, string>>;
type Sub = { deadline: string; locked: boolean; tracks: Track[]; team: Team | null; project: Project | null };

const isUrl = (s: string) => /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(s.trim());

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (d.name.trim().length < 2) e.name = "Project name is required.";
  if (d.tagline.trim().length < 10) e.tagline = "Tagline should be at least 10 characters.";
  if (d.description.trim().length < 80) e.description = `Description needs at least 80 characters (${d.description.trim().length}/80).`;
  if (!d.stack.length) e.stack = "Add at least one technology.";
  if (!isUrl(d.repo)) e.repo = "Enter a valid repository URL.";
  if (d.demo && !isUrl(d.demo)) e.demo = "Enter a valid demo URL, or leave empty.";
  if (!d.trackId) e.trackId = "Choose a track.";
  return e;
}

export function SubmissionBuilder() {
  const sub = useApi<Sub>("/submission");
  if (sub.error) return <ErrorState body={sub.error.message} onRetry={sub.reload} />;
  if (!sub.data) return <Skeleton className="h-[70vh]" />;
  if (!sub.data.team) return <EmptyState code="NO TEAM" title="Join a team first" body="Every submission belongs to a team."
    action={<Link href="/teams" className={buttonClass("primary")}>Go to team</Link>} />;
  return <Builder sub={sub.data} />;
}

function Builder({ sub }: { sub: Sub }) {
  const toast = useToast();
  const now = useNow();
  const team = sub.team!;
  const project = sub.project;
  const TRACKS = sub.tracks;
  const EVENT = { deadline: sub.deadline };

  const [d, setD] = useState<Draft>({
    name: project?.name ?? "", tagline: project?.tagline ?? "", description: project?.description ?? "", stack: project?.stack ?? [],
    repo: project?.repo ?? "", demo: project?.demo ?? "", trackId: project?.trackId ?? "",
  });
  const [submittedAt, setSubmittedAt] = useState<string | null>(project?.status === "submitted" ? project.submittedAt : null);
  const [savedAt, setSavedAt] = useState<number | null>(project ? Date.parse(project.updatedAt) : null);
  const [saveError, setSaveError] = useState<string>();
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const [tech, setTech] = useState("");
  const first = useRef(true);

  // Autosave (debounced) through the C++ client: PUT /api/submission.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (d.name.trim().length < 1) return;
    const id = setTimeout(async () => {
      try {
        await api("/submission", { method: "PUT", body: d });
        setSavedAt(Date.now());
        setSaveError(undefined);
      } catch (e) { setSaveError(errorMessage(e)); }
    }, 900);
    return () => clearTimeout(id);
  }, [d]);

  const deadline = Date.parse(EVENT.deadline);
  const left = now == null ? null : deadline - now;
  const closed = left != null && left <= 0;
  const locked = closed;
  const urgency = left == null ? "calm" : left < 3600e3 ? "critical" : left < 6 * 3600e3 ? "warn" : "calm";

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const addTech = () => {
    const t = tech.trim().replace(/,$/, "");
    if (t && !d.stack.includes(t) && d.stack.length < 8) set("stack", [...d.stack, t]);
    setTech("");
  };

  const submit = async () => {
    const e = validate(d);
    setErrors(e);
    if (Object.keys(e).length) {
      setConfirming(false);
      document.getElementById(`f-${Object.keys(e)[0]}`)?.focus();
      toast({ tone: "warn", title: "Submission incomplete", body: `${Object.keys(e).length} field(s) need attention` });
      return;
    }
    if (!confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 5000); return; }
    setConfirming(false);
    try {
      await api("/submission", { method: "PUT", body: d });
      const p = await api<Project>("/submission/submit", { method: "POST" });
      setSubmittedAt(p.submittedAt);
      toast({ tone: "ok", title: "Project submitted", body: "SUBMISSION_SUBMITTED · recorded in the audit ledger" });
    } catch (x) {
      toast({ tone: "warn", title: "Not submitted", body: errorMessage(x) });
    }
  };

  const checklist: [string, boolean][] = [
    ["Name & tagline", !validate(d).name && !validate(d).tagline],
    ["Description", !validate(d).description],
    ["Technologies", d.stack.length > 0],
    ["Repository", isUrl(d.repo)],
    ["Demo link", isUrl(d.demo)],
    ["Track", !!d.trackId],
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <p className="label">{project?.code ?? "NEW PROJECT"} · Submission builder</p>
        <h1 className="mt-2 text-[clamp(2.2rem,5vw,3.5rem)] font-semibold leading-[0.9] tracking-[-0.04em]">{d.name || "Untitled project"}</h1>

        <AnimatePresence>
          {submittedAt && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex items-start gap-4 rounded-md border border-ok/30 bg-ok/[0.05] p-5" role="status">
              <Lock className="mt-0.5 size-5 text-ok" />
              <div>
                <p className="font-mono text-[12px] tracking-[0.1em] text-ok">SUBMITTED</p>
                <p className="mt-1 font-mono text-[13px] text-fg">SUBMITTED {fmtUTC(submittedAt).toUpperCase()}</p>
                <p className="mt-2 text-[13px] text-muted">Your project is in the public gallery and queued for judging. You can keep editing until the deadline; changes save automatically.</p>
              </div>
            </motion.div>
          )}
          {closed && (
            <div className="mt-6 flex items-center gap-3 rounded-md border border-danger/30 bg-danger/[0.05] p-4 text-[13.5px]" role="alert">
              <AlertTriangle className="size-4 text-danger" />Submissions closed at {fmtUTC(EVENT.deadline)}. The C++ client blocks further edits before sending them, and the server rejects them too.
            </div>
          )}
        </AnimatePresence>

        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mt-10 space-y-8" noValidate>
          <fieldset disabled={locked} className="space-y-8 disabled:opacity-70">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Project name" htmlFor="f-name" error={errors.name} required>
                <input id="f-name" value={d.name} onChange={(e) => set("name", e.target.value)} maxLength={40} aria-invalid={!!errors.name} aria-describedby={errors.name ? "f-name-error" : undefined} className={cn(fieldClass, "h-11 text-[15px]")} />
              </Field>
              <Field label="Tagline" htmlFor="f-tagline" error={errors.tagline} hint={`${d.tagline.length}/90`} required>
                <input id="f-tagline" value={d.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={90} aria-invalid={!!errors.tagline} aria-describedby={errors.tagline ? "f-tagline-error" : undefined} className={cn(fieldClass, "h-11")} />
              </Field>
            </div>

            <Field label="Description" htmlFor="f-description" error={errors.description} hint={`${d.description.length}/2000 · Markdown`} required>
              <textarea id="f-description" rows={7} value={d.description} onChange={(e) => set("description", e.target.value)} maxLength={2000}
                aria-invalid={!!errors.description} aria-describedby={errors.description ? "f-description-error" : undefined} className={cn(fieldClass, "resize-y py-3 leading-relaxed")} />
            </Field>

            <Field label="Technologies" htmlFor="f-stack" error={errors.stack} hint="Enter to add · max 8" required>
              <div className={cn(fieldClass, "flex min-h-11 flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-accent")}>
                {d.stack.map((t) => (
                  <span key={t} className="inline-flex h-7 items-center gap-1 rounded-xs border border-line-strong bg-surface-2 pl-2 pr-1 font-mono text-[11.5px]">
                    {t}
                    <button type="button" onClick={() => set("stack", d.stack.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="rounded-xs p-0.5 text-muted hover:text-fg"><X className="size-3" /></button>
                  </span>
                ))}
                <input id="f-stack" value={tech} onChange={(e) => setTech(e.target.value)} onBlur={addTech}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTech(); }
                    if (e.key === "Backspace" && !tech && d.stack.length) set("stack", d.stack.slice(0, -1));
                  }}
                  placeholder={d.stack.length ? "" : "React, Go, SQLite…"} className="h-7 min-w-24 flex-1 bg-transparent text-[14px] focus:outline-none focus-visible:outline-none" />
              </div>
            </Field>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Repository" htmlFor="f-repo" error={errors.repo} required>
                <input id="f-repo" value={d.repo} onChange={(e) => set("repo", e.target.value)} inputMode="url" aria-invalid={!!errors.repo} aria-describedby={errors.repo ? "f-repo-error" : undefined} className={cn(fieldClass, "h-11 font-mono text-[13px]")} placeholder="git.example.com/team/project" />
              </Field>
              <Field label="Demo" htmlFor="f-demo" error={errors.demo} hint="Optional">
                <input id="f-demo" value={d.demo} onChange={(e) => set("demo", e.target.value)} inputMode="url" aria-invalid={!!errors.demo} aria-describedby={errors.demo ? "f-demo-error" : undefined} className={cn(fieldClass, "h-11 font-mono text-[13px]")} placeholder="project.demo.local" />
              </Field>
            </div>

            <fieldset>
              <legend className="label mb-2 text-fg-2">Track <span className="text-accent">*</span></legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                {TRACKS.map((t) => (
                  <label key={t.id} className={cn("relative flex cursor-pointer gap-3 rounded-md border p-3.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-accent",
                    d.trackId === t.id ? "border-accent/50 bg-accent/[0.04]" : "border-line hover:border-line-strong")}>
                    <input type="radio" name="track" value={t.id} checked={d.trackId === t.id} onChange={() => set("trackId", t.id)} className="sr-only" id={t.id === TRACKS[0].id ? "f-trackId" : undefined} />
                    <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", d.trackId === t.id ? "border-accent" : "border-line-strong")}>
                      {d.trackId === t.id && <span className="size-2 rounded-full bg-accent" />}
                    </span>
                    <span><span className="block text-[14px]">{t.name} <span className="font-mono text-[10px] text-muted">{t.code}</span></span><span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{t.description}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <p className="label mb-2 text-fg-2">Team</p>
              <div className="flex flex-wrap gap-2">
                {team.members.map((m) => (
                  <span key={m.handle} className="inline-flex items-center gap-2 rounded-sm border border-line py-1 pl-1 pr-2.5 text-[13px]"><Avatar initials={m.initials} size={22} />{m.name}</span>
                ))}
                <Link href="/teams" className="inline-flex items-center rounded-sm border border-dashed border-line-strong px-2.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted hover:text-fg">Manage</Link>
              </div>
            </div>
          </fieldset>
        </form>
      </div>

      {/* Status rail */}
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className={cn("rounded-md border p-5 transition-colors",
          urgency === "critical" ? "border-danger/40 bg-danger/[0.05]" : urgency === "warn" ? "border-warn/30 bg-warn/[0.04]" : "border-line bg-surface/70")}>
          <p className={cn("label", urgency === "critical" ? "text-danger" : urgency === "warn" ? "text-warn" : "")}>{closed ? "Submissions closed" : "Submission closes in"}</p>
          <p className={cn("mt-2 font-mono text-[40px] font-semibold leading-none tabular tracking-tight", urgency === "critical" && "animate-pulse")} role="timer" aria-live="off">
            {left == null ? "--:--:--" : hms(left)}
          </p>
          <p className="mt-3 font-mono text-[10.5px] text-muted">{fmtUTC(EVENT.deadline).toUpperCase()}</p>
        </div>

        <Panel title="Status" action={submittedAt ? <Badge tone="ok" dot>Submitted</Badge> : <Badge tone="warn" dot>Draft</Badge>}>
          <p className="flex items-center gap-2 font-mono text-[11px] text-muted" aria-live="polite">
            {closed ? <><Lock className="size-3" />LOCKED</> : saveError ? <span className="text-danger">{saveError}</span> : savedAt && now ? <><Check className="size-3 text-ok" />SAVED {relativeTime(savedAt, now).toUpperCase()}</> : "AUTOSAVE ON"}
          </p>
          <ul className="mt-4 space-y-2">
            {checklist.map(([k, ok]) => (
              <li key={k} className="flex items-center justify-between text-[13px]">
                <span className={ok ? "text-fg-2" : "text-fg"}>{k}</span>
                {ok ? <Check className="size-3.5 text-ok" /> : <span className="font-mono text-[10px] text-muted">TODO</span>}
              </li>
            ))}
          </ul>
        </Panel>

        {!locked && (
          <Button variant={confirming ? "danger" : "primary"} size="lg" className="w-full" onClick={submit}>
            <Send className="size-3.5" />{confirming ? "Confirm submission" : submittedAt ? "Resubmit project" : "Submit project"}
          </Button>
        )}
        {confirming && <p className="text-center font-mono text-[10.5px] text-muted">Submitting sends your project to judging. Click again to confirm.</p>}
      </aside>
    </div>
  );
}
