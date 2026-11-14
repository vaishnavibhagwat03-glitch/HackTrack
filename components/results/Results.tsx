"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Award, Download, Eye, Lock, RotateCcw, ArrowUpRight } from "lucide-react";
import type { Results as ResultsData, User } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { cn, downloadCSV, fmtUTC, pad } from "@/lib/utils";
import { EventGrid } from "@/components/ui/EventGrid";
import { Badge, Button, Skeleton, buttonClass } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { Countdown } from "@/components/dashboard/Widgets";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";

const ease = [0.16, 1, 0.3, 1] as const;

function Sealed({ resultsAt, name }: { resultsAt: string; name: string }) {
  return (
    <section className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden rounded-md border border-line px-6 py-20 text-center">
      <EventGrid cells={16} seed={30} />
      <div className="relative">
        <div className="mx-auto flex size-12 items-center justify-center rounded-sm border border-line-strong bg-surface-2"><Lock className="size-5 text-fg-2" /></div>
        <p className="label mt-8">{name} · Results</p>
        <h1 className="mt-3 text-[clamp(3rem,9vw,7rem)] font-semibold leading-[0.85] tracking-[-0.055em]">Sealed<span className="text-accent">.</span></h1>
        <p className="mx-auto mt-5 max-w-md text-[15px] text-fg-2">Scores stay hidden until the admin publishes results. The server refuses to send scores before then. Expected in:</p>
        <div className="mt-8 flex justify-center"><Countdown to={resultsAt} big={false} /></div>
        <p className="mt-6 font-mono text-[11px] text-muted">{fmtUTC(resultsAt).toUpperCase()}</p>
      </div>
    </section>
  );
}

export function Results({ user }: { user: User }) {
  const toast = useToast();
  const { boot } = useSession();
  const staff = user.role === "admin";
  const [stage, setStage] = useState(0);
  const [run, setRun] = useState(0);
  const [mode, setMode] = useState<"normalized" | "average">("average");
  const res = useApi<ResultsData>(`/results?by=${mode}`);
  const data = res.data;
  const shown = !!data && (data.published || !!data.preview);

  useEffect(() => {
    if (!shown) return;
    setStage(0);
    const t = [setTimeout(() => setStage(1), 1500), setTimeout(() => setStage(2), 2300)];
    return () => t.forEach(clearTimeout);
  }, [run, shown]);

  if (res.error) return <ErrorState body={res.error.message} onRetry={res.reload} />;
  if (!data || !boot) return <Skeleton className="h-[70vh]" />;
  if (!shown) return <Sealed resultsAt={data.resultsAt ?? boot.event.resultsAt} name={boot.event.name} />;
  if (!data.ranking.length) return <EmptyState code="0 SCORES" title="No scores yet" body="Results appear once judges submit scores. Assign judges from the Judging page." />;

  const EVENT = boot.event;
  const ranking = data.ranking;
  const podium = ranking.slice(0, 3);
  const grand = data.prizes.find((p) => p.id === "grand");
  const others = data.prizes.filter((p) => p.id !== "grand");
  const trackName = (id: string | null | undefined) => boot.tracks.find((t) => t.id === id)?.name ?? "";

  const exportResults = () => {
    downloadCSV("hacktrack-results.csv", ranking.map((r) => ({
      rank: r.rank, project_id: r.projectId, project: r.project?.name, team: r.project?.team?.name,
      track: trackName(r.project?.trackId), average: r.average.toFixed(3), normalized: r.normalized.toFixed(3), judges: r.judges, votes: r.votes,
    })));
    toast({ tone: "ok", title: "Results exported", body: `hacktrack-results.csv · ${ranking.length} rows` });
  };

  const publish = async (on: boolean) => {
    try {
      await api("/admin/event", { method: "PUT", body: { resultsPublished: on } });
      toast({ tone: "ok", title: on ? "Results published" : "Results hidden again", body: "Recorded on the undo stack" });
    } catch (e) { toast({ tone: "warn", title: "Could not change", body: errorMessage(e) }); }
  };

  return (
    <div>
      <div className={cn("mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3", data.published ? "border-ok/30 bg-ok/[0.05]" : "border-warn/30 bg-warn/[0.05]")}>
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-warn"><Eye className="size-3.5" />{data.published ? "Published · visible to everyone" : "Preview · not published · admin only"}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setRun((r) => r + 1)}><RotateCcw className="size-3" />Replay</Button>
          <Button size="sm" onClick={exportResults}><Download className="size-3" />Download results</Button>
          {staff && (data.published
            ? <Button size="sm" onClick={() => publish(false)}>Unpublish</Button>
            : <Button size="sm" variant="primary" onClick={() => publish(true)}>Publish results</Button>)}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {stage === 0 && (
          <motion.section key={`intro-${run}`} exit={{ opacity: 0, scale: 1.04, filter: "blur(8px)" }} transition={{ duration: 0.6, ease }}
            className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden rounded-md border border-line bg-[#060606]">
            <EventGrid cells={22} seed={run + 5} />
            <motion.p initial={{ opacity: 0, letterSpacing: "0.6em" }} animate={{ opacity: 1, letterSpacing: "0.3em" }} transition={{ duration: 1.2, ease }}
              className="relative font-mono text-[13px] uppercase text-fg-2">{EVENT.name}</motion.p>
            <div className="relative overflow-hidden">
              <motion.h1 initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ duration: 1, delay: 0.2, ease }}
                className="mt-2 text-[clamp(4rem,14vw,13rem)] font-semibold leading-[0.9] tracking-[-0.06em]">RESULTS</motion.h1>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {stage >= 1 && (
        <motion.div key={`main-${run}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
          <header className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="label">{EVENT.name} · {ranking.length} ranked projects · {data.algorithm?.structure ?? "max-heap"} · {mode}</p>
              <h1 className="mt-2 text-[clamp(3rem,8vw,6.5rem)] font-semibold leading-[0.85] tracking-[-0.055em]">Final results</h1>
            </div>
            {staff && <Link href="/judging" className="label flex items-center gap-1 hover:text-fg">Scoring breakdown <ArrowUpRight className="size-3" /></Link>}
          </header>

          {/* Podium: revealed 3 → 2 → 1 */}
          <ol className="grid gap-4 lg:grid-cols-3">
            {podium.map((r, i) => {
              const revealOrder = [2, 1, 0][i];
              const prize = i === 0 && grand?.winner?.projectId === r.projectId ? grand : null;
              return (
                <motion.li key={r.projectId} initial={{ opacity: 0, y: 40 }} animate={stage >= 2 ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.9, delay: revealOrder * 0.55, ease }}
                  className={cn("relative flex flex-col overflow-hidden rounded-md border p-6 md:p-8", i === 0 ? "border-accent/50 bg-accent/[0.04] lg:order-2 lg:-mt-6" : i === 1 ? "border-line bg-surface/70 lg:order-1" : "border-line bg-surface/70 lg:order-3")}>
                  {i === 0 && <EventGrid cells={6} seed={1} size={36} className="opacity-60" />}
                  <div className="relative flex items-start justify-between">
                    <span className={cn("font-mono text-[clamp(4.5rem,9vw,7.5rem)] font-semibold leading-[0.8] tracking-[-0.06em]", i === 0 ? "text-accent" : "text-fg")}>{r.rank}</span>
                    {prize && <Badge tone="accent">{prize.name} · {prize.amount}</Badge>}
                  </div>
                  <p className="relative mt-8 font-mono text-[10.5px] tracking-[0.1em] text-muted">{r.project?.code} · {trackName(r.project?.trackId).toUpperCase()}</p>
                  <h2 className="relative mt-2 text-[34px] font-semibold leading-none tracking-[-0.035em]">{r.project?.name}</h2>
                  <p className="relative mt-2 text-[14px] text-fg-2">{r.project?.team?.name} · {r.judges} judges · {r.votes} votes</p>
                  <div className="relative mt-6 flex items-end justify-between border-t border-line pt-4">
                    <span><span className="label block">Score</span><span className="font-mono text-3xl tabular">{(mode === "normalized" ? r.normalized : r.average).toFixed(2)}</span></span>
                    <span className="flex gap-1.5">
                      <Link href={`/projects/${r.projectId}`} className={buttonClass("secondary", "sm")}>View project</Link>
                      <Link href="/certificates" className={buttonClass("ghost", "sm")} aria-label="View certificate"><Award className="size-3.5" /></Link>
                    </span>
                  </div>
                </motion.li>
              );
            })}
          </ol>

          {/* Prizes */}
          <motion.section initial={{ opacity: 0 }} animate={stage >= 2 ? { opacity: 1 } : {}} transition={{ delay: 1.8 }} className="mt-14">
            <h2 className="label mb-4 text-fg-2">Prizes</h2>
            <ul className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
              {others.map((w) => (
                <li key={w.id} className="bg-surface p-5">
                  <p className="label">{w.name} · {w.amount}</p>
                  <p className="mt-3 text-xl font-semibold tracking-tight">{w.winner?.name ?? "—"}</p>
                  <p className="text-[13px] text-muted">{w.winner?.teamName}{w.id === "people" && w.winner ? ` · ${w.winner.score} votes` : ""}</p>
                </li>
              ))}
            </ul>
          </motion.section>

          {/* Full ranking with animated reordering */}
          <motion.section initial={{ opacity: 0 }} animate={stage >= 2 ? { opacity: 1 } : {}} transition={{ delay: 2 }} className="mt-14">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
              <h2 className="label text-fg-2">Full ranking</h2>
              <Tabs size="sm" className="border-0" value={mode} onChange={setMode} tabs={[{ id: "average", label: "Average (report)" }, { id: "normalized", label: "Normalized" }]} />
            </div>
            <LayoutGroup>
              <ol className="overflow-hidden rounded-md border border-line">
                {ranking.map((r, i) => (
                  <motion.li layout key={r.projectId} transition={{ type: "spring", stiffness: 300, damping: 34 }}
                    className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b border-line bg-surface/70 px-4 py-3 last:border-0 md:grid-cols-[56px_1fr_180px_110px_110px]">
                    <span className={cn("font-mono text-[15px] tabular", i < 3 ? "text-accent" : "text-muted")}>{pad(r.rank, 2)}</span>
                    <Link href={`/projects/${r.projectId}`} className="min-w-0 hover:text-accent">
                      <span className="block truncate text-[14.5px] font-medium">{r.project?.name}</span>
                      <span className="block truncate text-[12px] text-muted">{r.project?.team?.name} · {r.judges} judges</span>
                    </Link>
                    <span className="hidden truncate font-mono text-[11px] text-muted md:block">{trackName(r.project?.trackId)}</span>
                    <span className={cn("hidden text-right font-mono text-[12px] tabular md:block", mode === "average" ? "text-fg" : "text-muted")}>{r.average.toFixed(2)}</span>
                    <span className={cn("text-right font-mono text-[13px] tabular", mode === "normalized" ? "text-fg" : "text-muted")}>{r.normalized.toFixed(2)}</span>
                  </motion.li>
                ))}
              </ol>
            </LayoutGroup>
          </motion.section>
        </motion.div>
      )}
    </div>
  );
}
