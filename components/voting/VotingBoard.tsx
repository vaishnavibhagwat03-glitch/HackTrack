"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Check, EyeOff, Info, Shuffle, ShieldAlert, Timer } from "lucide-react";

import type { Project, User, VoteRow } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { cn, fmtUTC } from "@/lib/utils";
import { ProjectPreview } from "@/components/ui/ProjectPreview";
import { Badge, Button, Panel, Skeleton, StatusDot } from "@/components/ui/primitives";
import { AreaChart, ChartFrame } from "@/components/charts/Charts";
import { MetricStrip } from "@/components/dashboard/Widgets";
import { ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";

const COOLDOWN_MS = 1500;

type Voting = {
  open: boolean; votesPerUser: number; remaining: number; myVotes: number[]; projects: Project[]; order: string;
  tally?: VoteRow[]; totalVotes?: number; voters?: number; byHour?: number[];
};

export function VotingBoard({ user }: { user: User }) {
  const toast = useToast();
  const { boot } = useSession();
  const v = useApi<Voting>("/voting");
  const staff = user.role === "admin";
  const eligible = user.role === "participant";
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const last = useRef(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 100)), 100);
    return () => clearTimeout(id);
  }, [cooldown]);

  const votes = v.data?.myVotes ?? [];
  const MAX_VOTES = v.data?.votesPerUser ?? 3;
  const order = useMemo(() => v.data?.projects ?? [], [v.data]);

  const toggle = async (id: number) => {
    const since = Date.now() - last.current;
    if (since < COOLDOWN_MS) {
      setCooldown(COOLDOWN_MS - since);
      toast({ tone: "warn", title: "Slow down", body: "1 vote action / 1.5s" });
      return;
    }
    last.current = Date.now();
    setBusy(id);
    try {
      if (votes.includes(id)) {
        await api(`/voting/${id}`, { method: "DELETE" });
        toast({ tone: "info", title: "Vote withdrawn", body: "VOTE_WITHDRAWN · audit logged" });
      } else {
        const r = await api<{ remaining: number }>(`/voting/${id}`, { method: "POST" });
        toast({ tone: "ok", title: "Vote recorded", body: `${r.remaining} of ${MAX_VOTES} votes left` });
      }
    } catch (e) {
      toast({ tone: "warn", title: "Vote not recorded", body: errorMessage(e) });
    } finally { setBusy(null); }
  };

  if (v.error) return <ErrorState body={v.error.message} onRetry={v.reload} />;
  if (!v.data) return <Skeleton className="h-[70vh]" />;
  const VOTING_CLOSES = boot?.event.resultsAt;
  const hours = (v.data.byHour ?? []).map((value, h) => ({ label: `${String(h).padStart(2, "0")}:00`, value }));

  return (
    <>
      <header className="relative mb-10 overflow-hidden">
        <p className="label flex items-center gap-2"><StatusDot tone={v.data.open ? "ok" : "warn"} pulse={v.data.open} />Community vote · {v.data.open ? `open${VOTING_CLOSES ? ` until ${fmtUTC(VOTING_CLOSES)}` : ""}` : "closed"}</p>
        <h1 className="mt-3 text-[clamp(3rem,9vw,7.5rem)] font-semibold leading-[0.85] tracking-[-0.055em]">
          Vote for<br />the people&apos;s<br /><span className="text-accent">choice.</span>
        </h1>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
          <span className="flex items-center gap-2"><Shuffle className="size-3.5" />{v.data.order}</span>
          <span className="flex items-center gap-2"><EyeOff className="size-3.5" />Tally hidden until results</span>
          <span className="flex items-center gap-2"><Timer className="size-3.5" />{MAX_VOTES} votes per account</span>
        </div>
      </header>

      {staff && (
        <section aria-label="Anti-abuse" className="mb-10 space-y-6">
          <div className="flex items-center gap-2"><ShieldAlert className="size-4 text-warn" /><h2 className="label text-fg-2">Admin · integrity monitor</h2><Badge>Internal</Badge></div>
          <MetricStrip items={[
            { k: "Votes cast", v: v.data.totalVotes ?? 0 },
            { k: "Unique voters", v: v.data.voters ?? 0, delta: "hash table of voter ids" },
            { k: "Projects voted", v: v.data.tally?.length ?? 0 },
            { k: "Leader", v: v.data.tally?.[0]?.votes ?? 0, delta: v.data.tally?.[0]?.name ?? "—" },
          ]} />
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <ChartFrame title="Voting activity" meta="Votes / hour · UTC">
              <AreaChart data={hours} height={200} caption="Community votes per hour" />
            </ChartFrame>
            <Panel title="Live tally" meta="HASH TABLE COUNT → MAX-HEAP" bodyClassName="px-4 py-1">
              <ol className="divide-y divide-line font-mono text-[11.5px]">
                {(v.data.tally ?? []).slice(0, 8).map((t) => (
                  <li key={t.projectId} className="grid grid-cols-[34px_1fr_auto] gap-2 py-2.5">
                    <span className="text-muted">#{t.rank}</span>
                    <span className="truncate text-fg">{t.name}</span>
                    <span className="tabular text-accent">{t.votes}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>
          <p className="flex items-center gap-2 font-mono text-[11px] text-muted"><Info className="size-3.5" />Participants see the tally only after results are published.</p>
        </section>
      )}

      {!eligible && (
        <div className="mb-8 flex items-start gap-3 rounded-md border border-line-strong bg-surface/70 p-4 text-[13.5px]" role="note">
          <Info className="mt-0.5 size-4 shrink-0 text-steel" />
          <p className="text-fg-2">{user.role === "judge" ? "Judges cannot vote in the community round, to keep the two scoring channels independent." : "Admin accounts cannot vote. You are viewing the public voting experience in the same shuffled order a voter would get."}</p>
        </div>
      )}

      {eligible && (
        <div className="sticky top-14 z-20 -mx-4 mb-6 flex items-center justify-between gap-4 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur-xl md:mx-0 md:rounded-md md:border">
          <div className="flex items-center gap-3">
            <div className="flex gap-1" aria-hidden>
              {Array.from({ length: MAX_VOTES }, (_, i) => (
                <motion.span key={i} className={cn("size-2.5 rounded-xs border", i < votes.length ? "border-accent bg-accent" : "border-line-strong")} animate={i < votes.length ? { scale: [1, 1.4, 1] } : {}} />
              ))}
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-fg-2" aria-live="polite">{MAX_VOTES - votes.length} of {MAX_VOTES} votes left</p>
          </div>
          <AnimatePresence>
            {cooldown > 0 && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-mono text-[11px] text-warn" role="status">
                RATE LIMITED · {(cooldown / 1000).toFixed(1)}s
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      <ul className="grid gap-5 md:grid-cols-2">
        {order.map((p, i) => {
          const voted = votes.includes(p.id);
          const own = !!p.ownTeam;
          return (
            <motion.li key={p.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.6, delay: (i % 2) * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className={cn("group relative flex flex-col overflow-hidden rounded-md border bg-surface/70 transition-colors", voted ? "border-accent/60" : "border-line hover:border-line-strong")}>
              {voted && <motion.span layoutId={`v-${p.id}`} className="absolute inset-x-0 top-0 z-10 h-0.5 bg-accent" />}
              <Link href={`/projects/${p.id}`} className="relative block aspect-[16/8] overflow-hidden border-b border-line">
                <div className="h-full transition-transform duration-700 group-hover:scale-[1.03]"><ProjectPreview seed={p.slug} animated /></div>
              </Link>
              <div className="flex flex-1 flex-col p-5 md:p-6">
                <p className="font-mono text-[10.5px] tracking-[0.1em] text-muted">{p.code} · {(p.team?.name ?? "").toUpperCase()}</p>
                <h2 className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.03em]">{p.name}</h2>
                <p className="mt-3 text-[14.5px] leading-relaxed text-fg-2">{p.tagline}</p>
                <div className="mt-4 flex flex-wrap gap-1">{p.stack.map((s) => <span key={s} className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">{s}</span>)}</div>
                <div className="mt-auto pt-6">
                  {eligible ? (
                    <Button size="lg" variant={voted ? "primary" : "outline"} className="w-full" disabled={own || !v.data!.open || busy === p.id} aria-pressed={voted} onClick={() => toggle(p.id)}>
                      {own ? "Your team" : voted ? <><Check className="size-4" />Voted · click to retract</> : "Vote"}
                    </Button>
                  ) : (
                    <Button size="lg" variant="outline" className="w-full" disabled>Vote</Button>
                  )}
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </>
  );
}
