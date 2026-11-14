"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Network, Plus, RefreshCw, Shuffle, Trash2, Undo2 } from "lucide-react";
import type { Assignment, Judge, Results, Team } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn, downloadCSV, pad } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, Button, Meta, Meter, Panel, Skeleton, fieldClass } from "@/components/ui/primitives";
import { ChartFrame, PairedBars } from "@/components/charts/Charts";
import { MetricStrip } from "@/components/dashboard/Widgets";
import { ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";

type JudgeStat = Judge & { assigned: number; completed: number; inProgress: number; flagged: number; average: number };
type AssignRun = {
  at: string; mode: string; perProject: number; created: number; kept: number; complete?: boolean;
  shortages: { projectId: number; name: string; needed: number; assigned: number }[];
  conflictChecks: number; conflictsAvoided: number; rotations: number; nextJudge: string;
};
type Overview = {
  assignments: Assignment[];
  judges: JudgeStat[];
  coverage: { projectId: number; name: string; teamId: string; judges: number }[];
  underCovered: number;
  perProject: number;
  rotation: string[];
  lastRun: AssignRun | Record<string, never>;
};
type Conflicts = {
  conflicts: { judgeId: string; judgeName: string; teamId: string; teamName: string; reason: string }[];
  graph: { vertices: number; edges: number; components: number; matrixCells: number; bfs: string[]; dfs: string[]; blockedTeams: string[] };
};

/** Admin view of judging: round-robin assignment, conflicts of interest, judge progress. */
export function JudgingOps() {
  const toast = useToast();
  const o = useApi<Overview>("/admin/judging");
  const c = useApi<Conflicts>("/admin/conflicts");
  const teams = useApi<Team[]>("/teams");
  const res = useApi<Results>("/results?by=average");
  const [running, setRunning] = useState<string | null>(null);
  const [run, setRun] = useState<AssignRun | null>(null);
  const [form, setForm] = useState({ judgeId: "", teamId: "", reason: "" });

  if (o.error) return <ErrorState body={o.error.message} onRetry={o.reload} />;
  if (!o.data) return <Skeleton className="h-[60vh]" />;
  const data = o.data;
  const all = data.assignments;
  const submitted = all.filter((a) => a.status === "submitted").length;
  const flagged = all.filter((a) => a.status === "flagged").length;
  const last = run ?? ("at" in data.lastRun ? (data.lastRun as AssignRun) : null);

  const assign = async (mode: "fill" | "rebalance") => {
    setRunning(mode);
    try {
      const r = await api<AssignRun>("/admin/assign", { method: "POST", body: { mode } });
      setRun(r);
      toast({ tone: r.shortages.length ? "warn" : "ok", title: `${r.created} judges assigned`,
        body: r.shortages.length ? `${r.shortages.length} project(s) short of judges` : `${r.conflictsAvoided} conflicts avoided · undo available` });
    } catch (e) {
      toast({ tone: "warn", title: "Assignment failed", body: errorMessage(e) });
    } finally { setRunning(null); }
  };

  const undo = async () => {
    try {
      const r = await api<{ undone: string }>("/admin/undo", { method: "POST" });
      toast({ tone: "ok", title: "Undone", body: r.undone });
      setRun(null);
    } catch (e) { toast({ tone: "warn", title: "Nothing undone", body: errorMessage(e) }); }
  };

  const addConflict = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/admin/conflicts", { method: "POST", body: form });
      toast({ tone: "ok", title: "Conflict recorded", body: `${form.judgeId} will never be assigned to ${form.teamId}` });
      setForm({ judgeId: "", teamId: "", reason: "" });
    } catch (err) { toast({ tone: "warn", title: "Could not add conflict", body: errorMessage(err) }); }
  };
  const removeConflict = async (judgeId: string, teamId: string) => {
    try { await api(`/admin/conflicts/${judgeId}/${teamId}`, { method: "DELETE" }); toast({ tone: "ok", title: "Conflict removed", body: "Undo is available in Audit & Undo" }); }
    catch (err) { toast({ tone: "warn", title: "Could not remove", body: errorMessage(err) }); }
  };

  const exportScores = () => {
    const rows = all.filter((a) => a.status === "submitted");
    downloadCSV("hacktrack-scores.csv", rows.map((a) => ({
      judge: a.judgeId, project: a.projectId, ...a.scores, weighted: a.weighted?.toFixed(3), confidence: a.confidence, submitted_at: a.submittedAt,
    })));
    toast({ tone: "ok", title: "Scores exported", body: `hacktrack-scores.csv · ${rows.length} rows` });
  };

  const panelMean = (() => {
    const xs = all.filter((a) => a.status === "submitted" && a.weighted != null).map((a) => a.weighted!);
    return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
  })();

  return (
    <>
      <PageHeader eyebrow="Judging operations · admin" title="Judging"
        meta={<><span>{data.judges.length} judges</span><span>{all.length} assignments</span><span>{data.perProject} judges / project</span></>}
        actions={<>
          <Button onClick={exportScores}><Download className="size-3.5" />Export CSV</Button>
          <Button onClick={() => assign("rebalance")} disabled={!!running} title="Drop not-started assignments, then reassign">
            <RefreshCw className={running === "rebalance" ? "size-3.5 animate-spin" : "size-3.5"} />Rebalance
          </Button>
          <Button variant="primary" onClick={() => assign("fill")} disabled={!!running}>
            <Shuffle className={running === "fill" ? "size-3.5 animate-spin" : "size-3.5"} />{running === "fill" ? "Assigning…" : "Assign judges"}
          </Button>
        </>} />

      <MetricStrip items={[
        { k: "Assignments", v: all.length },
        { k: "Scores in", v: submitted },
        { k: "Coverage", v: all.length ? (submitted / all.length) * 100 : 0, suffix: "%" },
        { k: "Under-staffed", v: data.underCovered },
        { k: "Panel mean", v: panelMean, decimals: 2 },
      ]} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="Round-robin assignment" meta="CIRCULAR LIST + CONFLICT GRAPH · O(P × J)" ticks>
          <p className="text-[13.5px] leading-relaxed text-fg-2">
            Judges sit in a <span className="text-fg">circular linked list</span>. For each submitted project the pointer walks the ring; a judge is
            skipped when the <span className="text-fg">adjacency matrix</span> of the conflict graph says they conflict with the team (an O(1) lookup).
            If every judge has been tried and the project is still short, it is reported as a shortage instead of looping forever.
          </p>
          <div className="mt-4">
            <p className="label mb-2">Ring order · pointer at <span className="text-accent">{last?.nextJudge || data.rotation[0] || "—"}</span></p>
            <ol className="flex flex-wrap gap-1.5">
              {data.rotation.map((id, i) => (
                <li key={id} className={cn("flex items-center gap-1.5 rounded-xs border px-2 py-1 font-mono text-[10.5px]",
                  id === (last?.nextJudge || data.rotation[0]) ? "border-accent/50 text-accent" : "border-line text-fg-2")}>
                  {id}{i < data.rotation.length - 1 ? <span className="text-muted">→</span> : <span className="text-muted">↺</span>}
                </li>
              ))}
            </ol>
          </div>
          {last ? (
            <dl className="mt-5 grid gap-x-8 border-t border-line pt-3 sm:grid-cols-2">
              <Meta k="Last run" v={`${last.mode} · ${last.at.slice(11, 19)} UTC`} />
              <Meta k="New / kept" v={`${last.created} / ${last.kept}`} />
              <Meta k="Conflict checks" v={last.conflictChecks} />
              <Meta k="Conflicts avoided" v={<span className="text-warn">{last.conflictsAvoided}</span>} />
              <Meta k="Pointer moves" v={last.rotations} />
              <Meta k="Shortages" v={last.shortages.length ? <span className="text-danger">{last.shortages.length}</span> : <span className="text-ok">0</span>} />
            </dl>
          ) : <p className="mt-5 border-t border-line pt-3 font-mono text-[11px] text-muted">NOT RUN IN THIS CLIENT SESSION YET</p>}
          {last && last.shortages.length > 0 && (
            <ul className="mt-3 space-y-1">
              {last.shortages.map((s) => (
                <li key={s.projectId} className="font-mono text-[11px] text-danger">SHORTAGE · {s.name} has {s.assigned}/{s.needed} judges — every other judge conflicts</li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={undo}><Undo2 className="size-3" />Undo last admin change</Button>
            <Link href="/structures" className="label flex items-center gap-1 self-center hover:text-fg"><Network className="size-3" />See the structures</Link>
          </div>
        </Panel>

        <Panel title="Conflicts of interest" meta={c.data ? `${c.data.graph.vertices} VERTICES · ${c.data.graph.edges} EDGES · ${c.data.graph.components} COMPONENTS` : ""} bodyClassName="p-0">
          <form onSubmit={addConflict} className="grid gap-2 border-b border-line p-4 sm:grid-cols-[1fr_1fr_auto]">
            <select aria-label="Judge" required value={form.judgeId} onChange={(e) => setForm({ ...form, judgeId: e.target.value })} className={cn(fieldClass, "h-9 text-[13px]")}>
              <option value="">Judge…</option>
              {data.judges.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
            <select aria-label="Team" required value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })} className={cn(fieldClass, "h-9 text-[13px]")}>
              <option value="">Team…</option>
              {(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Button type="submit" variant="primary"><Plus className="size-3.5" />Add</Button>
            <input aria-label="Reason" placeholder="Reason (e.g. mentored this team)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className={cn(fieldClass, "h-9 text-[13px] sm:col-span-3")} />
          </form>
          {c.data?.graph.blockedTeams.length ? (
            <p className="border-b border-line px-4 py-2 font-mono text-[11px] text-danger">BLOCKED · {c.data.graph.blockedTeams.join(", ")} conflict with every judge</p>
          ) : null}
          <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
            {(c.data?.conflicts ?? []).map((x) => (
              <li key={`${x.judgeId}${x.teamId}`} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]"><span className="text-fg">{x.judgeName}</span> <span className="text-muted">×</span> {x.teamName}</p>
                  <p className="truncate font-mono text-[10.5px] text-muted">{x.judgeId} · {x.teamId}{x.reason && ` · ${x.reason}`}</p>
                </div>
                <Button size="sm" variant="ghost" aria-label={`Remove conflict ${x.judgeName} and ${x.teamName}`} onClick={() => removeConflict(x.judgeId, x.teamId)}><Trash2 className="size-3.5" /></Button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Judge roster" meta="BIAS = JUDGE MEAN − PANEL MEAN" className="mt-6" bodyClassName="p-0 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <caption className="sr-only">Judge progress and scoring bias</caption>
          <thead>
            <tr className="border-b border-line text-muted">
              {["Judge", "Assigned", "Completed", "Progress", "Mean", "Bias", "Status"].map((h, i) => (
                <th key={h} scope="col" className={`label px-4 py-3 font-normal ${i > 0 && i !== 3 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.judges.map((j) => {
              const bias = j.completed ? j.average - panelMean : 0;
              return (
                <tr key={j.id} className="border-b border-line last:border-0 hover:bg-white/[0.02]">
                  <th scope="row" className="px-4 py-3 font-normal">
                    <span className="block text-[14px] text-fg">{j.name}</span>
                    <span className="font-mono text-[10.5px] text-muted">{j.id} · {j.title}</span>
                  </th>
                  <td className="px-4 py-3 text-right font-mono text-[13px] tabular">{j.assigned}</td>
                  <td className="px-4 py-3 text-right font-mono text-[13px] tabular">{j.completed}</td>
                  <td className="w-40 px-4 py-3"><Meter value={j.assigned ? (j.completed / j.assigned) * 100 : 0} tone={j.assigned && j.completed === j.assigned ? "ok" : "accent"} label={`${j.name} progress`} /></td>
                  <td className="px-4 py-3 text-right font-mono text-[13px] tabular">{j.completed ? j.average.toFixed(2) : "—"}</td>
                  <td className={`px-4 py-3 text-right font-mono text-[13px] tabular ${Math.abs(bias) > 0.5 ? "text-warn" : "text-fg-2"}`}>{j.completed ? `${bias > 0 ? "+" : ""}${bias.toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {j.flagged ? <Badge tone="danger" dot>Flagged</Badge>
                      : !j.assigned ? <Badge>Idle</Badge>
                      : j.completed === j.assigned ? <Badge tone="ok" dot>Done</Badge> : <Badge tone="warn" dot>Active</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Coverage" meta={`${data.underCovered} BELOW ${data.perProject} JUDGES · HASH TABLE COUNT`} bodyClassName="p-0">
          <ul className="max-h-[380px] divide-y divide-line overflow-y-auto">
            {data.coverage.map((x) => (
              <li key={x.projectId} className="flex items-center gap-3 px-4 py-2">
                <span className="w-16 font-mono text-[11px] text-muted">P-{pad(x.projectId)}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{x.name}</span>
                <span className={cn("font-mono text-[12px] tabular", x.judges < data.perProject ? "text-danger" : "text-fg-2")}>{x.judges}/{data.perProject}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <ChartFrame title="Normalization impact" meta="Top 12 · average vs z-score normalized">
          {res.data?.ranking.length ? (
            <PairedBars caption="Average versus normalized mean score per project" series={["Average", "Normalized"]} domain={[5, 10]}
              data={res.data.ranking.slice(0, 12).map((r) => ({ label: `P-${pad(r.projectId)} ${r.project?.name ?? ""}`, a: r.average, b: r.normalized }))} />
          ) : <p className="text-[13px] text-muted">No submitted scores yet.</p>}
          <p className="mt-4 font-mono text-[11px] text-muted">Computed by the C++ client from the sparse judge × project matrix. Per-judge z-scores are rescaled to the panel distribution.</p>
        </ChartFrame>
      </div>
    </>
  );
}
