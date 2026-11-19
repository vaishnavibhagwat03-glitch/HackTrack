"use client";

import { useState } from "react";
import { Cpu, Play } from "lucide-react";
import type { Judge, Results } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn, pad } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, Panel, Skeleton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/States";
import { AreaChart, BarChart, ChartFrame, HBars, PairedBars } from "@/components/charts/Charts";

type Datum = { label: string; value: number };
type Analytics = {
  counts: { submitted: number; judges: number; votes: number };
  judging: { submitted: number };
  timeline: Datum[]; timelineSortComparisons: number; tracks: (Datum & { name: string })[]; scoreHistogram: Datum[]; votesByHour: Datum[];
};
type Bench = {
  seed: number; runs: number;
  sorts: { algorithm: string; complexity: string; n: number; comparisons: number; ms: number }[];
  searches: { algorithm: string; complexity: string; n: number; avgComparisons: number; searches: number }[];
};

function Benchmark() {
  const [data, setData] = useState<Bench | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const run = async () => {
    setRunning(true);
    setError(undefined);
    try { setData(await api<Bench>("/bench?sizes=100,1000,10000&runs=5")); } catch (e) { setError(errorMessage(e)); } finally { setRunning(false); }
  };
  const sizes = data ? [...new Set(data.sorts.map((s) => s.n))] : [];
  const algos = data ? [...new Set(data.sorts.map((s) => s.algorithm))] : [];
  const cell = (a: string, n: number) => data!.sorts.find((s) => s.algorithm === a && s.n === n)!;
  const big = sizes[sizes.length - 1];

  return (
    <Panel title="Sorting & searching benchmark" meta="REPORT TABLES 4 & 5 · RUN LIVE IN THE C++ CLIENT" className="xl:col-span-2" ticks
      action={<Button size="sm" variant="primary" onClick={run} disabled={running}><Play className="size-3" />{running ? "Running in C++…" : data ? "Run again" : "Run benchmark"}</Button>}>
      {error && <p className="mb-3 font-mono text-[11px] text-danger">{error}</p>}
      {!data ? (
        <p className="flex items-center gap-2 text-[13.5px] text-muted"><Cpu className="size-4" />Runs bubble, insertion, merge and quick sort on the same random data (fixed seed) for n = 100, 1,000 and 10,000, five times each, and reports the median. Then 1,000 linear and binary searches.</p>
      ) : (
        <div className="space-y-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] font-mono text-[12px]">
              <caption className="label mb-2 text-left">Table 4 · comparisons and time (median of {data.runs} runs, seed {data.seed})</caption>
              <thead><tr className="border-b border-line text-left text-muted">
                <th scope="col" className="py-2 pr-4 font-normal">ALGORITHM</th>
                {sizes.map((n) => <th key={n} scope="col" className="py-2 pr-4 text-right font-normal">n = {n.toLocaleString()}</th>)}
              </tr></thead>
              <tbody>
                {algos.map((a) => (
                  <tr key={a} className="border-b border-line/60 last:border-0">
                    <th scope="row" className="py-2 pr-4 text-left font-normal text-fg">{a} <span className="text-muted">{cell(a, sizes[0]).complexity}</span></th>
                    {sizes.map((n) => {
                      const c = cell(a, n);
                      return <td key={n} className="py-2 pr-4 text-right tabular"><span className="text-fg">{c.comparisons.toLocaleString()}</span> <span className="text-muted">comps</span><br /><span className="text-accent">{c.ms.toFixed(3)} ms</span></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <p className="label mb-2">Time at n = {big?.toLocaleString()} (ms)</p>
              <HBars caption="Sort time at the largest n" data={algos.map((a) => ({ label: a, sub: cell(a, big).complexity, value: cell(a, big).ms }))}
                max={Math.max(...algos.map((a) => cell(a, big).ms))} format={(v) => `${v.toFixed(2)} ms`} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[12px]">
                <caption className="label mb-2 text-left">Table 5 · average comparisons over {data.searches[0]?.searches} searches</caption>
                <thead><tr className="border-b border-line text-left text-muted">
                  <th scope="col" className="py-2 pr-4 font-normal">SEARCH</th>
                  {sizes.map((n) => <th key={n} scope="col" className="py-2 pr-4 text-right font-normal">n = {n.toLocaleString()}</th>)}
                </tr></thead>
                <tbody>
                  {["Linear", "Binary"].map((a) => (
                    <tr key={a} className="border-b border-line/60 last:border-0">
                      <th scope="row" className="py-2 pr-4 text-left font-normal text-fg">{a} <span className="text-muted">{a === "Linear" ? "O(n)" : "O(log n)"}</span></th>
                      {sizes.map((n) => <td key={n} className="py-2 pr-4 text-right tabular">{data.searches.find((s) => s.algorithm === a && s.n === n)?.avgComparisons.toFixed(1)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                Going from 1,000 to 10,000 records the O(n²) sorts slow down by roughly 100×, the O(n log n) sorts by roughly 13×, and
                binary search needs only ~3 more comparisons.
              </p>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function Analytics() {
  const a = useApi<Analytics>("/admin/analytics");
  const o = useApi<{ judges: (Judge & { assigned: number; completed: number })[] }>("/admin/judging");
  const r = useApi<Results>("/results?by=average");

  if (a.error) return <ErrorState body={a.error.message} onRetry={a.reload} />;
  if (!a.data) return <Skeleton className="h-[70vh]" />;
  const d = a.data;

  return (
    <>
      <PageHeader eyebrow="Admin analytics · computed by the C++ client" title="Analytics"
        meta={<><span>{d.judging.submitted} scores</span><span>{d.counts.submitted} submissions</span><span>{d.counts.votes} votes</span></>} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Benchmark />
        <ChartFrame title="Submission timeline" meta={`Merge sort · ${d.timelineSortComparisons} comparisons`}>
          {d.timeline.length ? <AreaChart data={d.timeline} caption="Cumulative submissions by 6-hour window" /> : <p className="text-[13px] text-muted">No submissions yet.</p>}
        </ChartFrame>
        <ChartFrame title="Judge completion" meta="% of assignments">
          <BarChart caption="Judge completion rate" format={(v) => `${Math.round(v)}%`}
            data={(o.data?.judges ?? []).map((j) => ({ label: j.id.replace("JUDGE_", "J"), value: j.assigned ? (j.completed / j.assigned) * 100 : 0 }))} />
        </ChartFrame>
        <ChartFrame title="Score distribution" meta="Weighted score per review">
          <BarChart caption="Distribution of weighted review scores" data={d.scoreHistogram} />
        </ChartFrame>
        <ChartFrame title="Submissions by track" meta="Hash table count">
          <HBars caption="Submissions per track" data={d.tracks.map((t) => ({ label: t.name, value: t.value }))} max={Math.max(1, ...d.tracks.map((b) => b.value))} className="pt-2" />
        </ChartFrame>
        <ChartFrame title="Normalization impact" meta="Top 10 · average vs normalized" className="xl:col-span-2">
          {r.data?.ranking.length ? (
            <PairedBars caption="Average versus normalized mean score" series={["Average", "Normalized"]} domain={[5, 10]}
              data={r.data.ranking.slice(0, 10).map((x) => ({ label: `P-${pad(x.projectId)} ${x.project?.name ?? ""}`, a: x.average, b: x.normalized }))} />
          ) : <p className="text-[13px] text-muted">No submitted scores yet.</p>}
        </ChartFrame>
        <ChartFrame title="Voting activity" meta="Votes / hour · UTC" className={cn("xl:col-span-2")}>
          <AreaChart data={d.votesByHour} caption="Community votes per hour" />
        </ChartFrame>
      </div>
    </>
  );
}
