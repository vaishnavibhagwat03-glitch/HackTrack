"use client";

import { useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Binary } from "lucide-react";
import type { User } from "@/lib/types";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, Meta, Panel, Skeleton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/States";

type Chaining = { name: string; use: string; size: number; capacity: number; loadFactor: number; usedBuckets: number; longestChain: number; avgProbes: number; chains: number[] };
type BstNode = { key: number; left: BstNode | null; right: BstNode | null } | null;
type GItem = { group?: string; atom?: string; id?: string; weight: number; max?: number; children?: GItem[] };
type Inspector = {
  hashing: Chaining[];
  probing: { name: string; use: string; size: number; capacity: number; loadFactor: number; avgProbes: number; slots: number[] };
  bst: { use: string; size: number; height: number; root: BstNode };
  heap: { use: string; array: { projectId: number; name: string; key: number }[] };
  sparseMatrix: { rows?: number; cols?: number; nonZero?: number; density?: number; denseBytes?: number; sparseBytes?: number; triplets?: [number, number, number][] };
  graph: { vertices?: number; edges?: number; components?: number; matrixCells?: number; nodes?: { id: number; label: string; kind: "judge" | "team"; degree: number; component: number }[]; links?: [number, number][]; bfs?: string[]; dfs?: string[]; blockedTeams?: string[] };
  circularList: { use: string; order: { id: string; name: string }[]; pointer: string; lastRun: { rotations?: number; conflictChecks?: number; conflictsAvoided?: number } };
  singlyList: { use: string; sample: { team: string; members: string[] }[] };
  generalizedList: { use: string; depth: number; atoms: number; tree: GItem[] };
  dynArray: { projects: number; projectsCapacity: number; teams: number; judges: number };
  queue: { pending: { method: string; path: string; label: string }[]; sent: number; retries: number; failures: number; maxRetries: number; server: string };
  stack: { use: string; entries: { id: number; label: string; actor: string; at: string }[] };
  cache: { hits: number; misses: number; ageMs: number };
};

const Unit = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <span className="flex items-center gap-2"><Badge tone="accent">Unit {n}</Badge><span>{children}</span></span>
);

function HashBuckets({ h }: { h: Chaining }) {
  const max = Math.max(1, ...h.chains);
  return (
    <div>
      <div className="flex h-16 items-end gap-px" role="img" aria-label={`${h.name}: ${h.usedBuckets} of ${h.capacity} buckets used, longest chain ${h.longestChain}`}>
        {h.chains.map((c, i) => (
          <motion.span key={i} initial={{ height: 0 }} animate={{ height: `${(c / max) * 100}%` }} transition={{ duration: 0.4 }}
            className={cn("min-h-px flex-1 rounded-t-[1px]", c === 0 ? "bg-white/[0.06]" : c > 1 ? "bg-warn" : "bg-accent")} title={`bucket ${i}: ${c}`} />
        ))}
      </div>
      <p className="mt-2 font-mono text-[10.5px] text-muted">
        {h.size} keys · {h.capacity} buckets · load {h.loadFactor.toFixed(2)} · longest chain {h.longestChain} · avg probes {h.avgProbes.toFixed(2)}
      </p>
    </div>
  );
}

function BstTree({ root }: { root: BstNode }) {
  const { nodes, edges, w, hgt } = useMemo(() => {
    const nodes: { key: number; x: number; y: number }[] = [];
    const edges: [number, number, number, number][] = [];
    let i = 0;
    let maxD = 0;
    const walk = (n: BstNode, d: number): { x: number; y: number } | null => {
      if (!n) return null;
      const l = walk(n.left, d + 1);
      const me = { x: i++, y: d };
      const r = walk(n.right, d + 1);
      maxD = Math.max(maxD, d);
      nodes.push({ key: n.key, ...me });
      if (l) edges.push([me.x, me.y, l.x, l.y]);
      if (r) edges.push([me.x, me.y, r.x, r.y]);
      return me;
    };
    walk(root, 0);
    return { nodes, edges, w: Math.max(1, i), hgt: maxD + 1 };
  }, [root]);
  if (!nodes.length) return <p className="text-[13px] text-muted">Empty.</p>;
  const sx = 34, sy = 46;
  return (
    <svg viewBox={`-20 -20 ${w * sx + 20} ${hgt * sy + 10}`} className="h-auto w-full" role="img" aria-label="Binary search tree of project ids">
      {edges.map(([x1, y1, x2, y2], k) => <line key={k} x1={x1 * sx} y1={y1 * sy} x2={x2 * sx} y2={y2 * sy} className="stroke-line-strong" strokeWidth={1} />)}
      {nodes.map((n) => (
        <g key={n.key} transform={`translate(${n.x * sx} ${n.y * sy})`}>
          <circle r={13} className={n.y === 0 ? "fill-accent" : "fill-surface-3 stroke-line-strong"} />
          <text textAnchor="middle" dy="0.35em" className={cn("font-mono text-[9px]", n.y === 0 ? "fill-accent-ink" : "fill-fg")}>{n.key}</text>
        </g>
      ))}
    </svg>
  );
}

function ConflictGraph({ g }: { g: Inspector["graph"] }) {
  const nodes = g.nodes ?? [];
  const judges = nodes.filter((n) => n.kind === "judge");
  const teams = nodes.filter((n) => n.kind === "team");
  const pos = new Map<number, { x: number; y: number }>();
  judges.forEach((n, i) => pos.set(n.id, { x: 90, y: 20 + i * 34 }));
  teams.forEach((n, i) => pos.set(n.id, { x: 410, y: 20 + i * 34 }));
  const h = Math.max(judges.length, teams.length) * 34 + 10;
  if (!nodes.length) return <p className="text-[13px] text-muted">No conflicts recorded (or not loaded yet).</p>;
  return (
    <svg viewBox={`0 0 500 ${h}`} className="h-auto w-full" role="img" aria-label="Bipartite conflict graph between judges and teams">
      {(g.links ?? []).map(([a, b], k) => {
        const p = pos.get(a), q = pos.get(b);
        return p && q ? <line key={k} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="stroke-warn/60" strokeWidth={1.2} /> : null;
      })}
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        return (
          <g key={n.id} transform={`translate(${p.x} ${p.y})`}>
            <circle r={6} className={n.kind === "judge" ? "fill-accent" : "fill-steel"} />
            <text x={n.kind === "judge" ? -12 : 12} dy="0.35em" textAnchor={n.kind === "judge" ? "end" : "start"} className="fill-fg-2 font-mono text-[10px]">{n.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Ring({ order, pointer }: { order: { id: string; name: string }[]; pointer: string }) {
  const R = 90, c = 120;
  if (!order.length) return <p className="text-[13px] text-muted">No judges loaded.</p>;
  return (
    <svg viewBox="0 0 240 240" className="mx-auto h-auto w-full max-w-[280px]" role="img" aria-label="Circular linked list of judges">
      <circle cx={c} cy={c} r={R} className="fill-none stroke-line-strong" strokeDasharray="3 4" />
      {order.map((j, i) => {
        const a = (i / order.length) * Math.PI * 2 - Math.PI / 2;
        const x = c + R * Math.cos(a), y = c + R * Math.sin(a);
        const on = j.id === pointer || (!pointer && i === 0);
        return (
          <g key={j.id} transform={`translate(${x} ${y})`}>
            <circle r={on ? 15 : 12} className={on ? "fill-accent" : "fill-surface-3 stroke-line-strong"} />
            <text textAnchor="middle" dy="0.35em" className={cn("font-mono text-[8px]", on ? "fill-accent-ink" : "fill-fg")}>{j.id.replace("JUDGE_", "J")}</text>
          </g>
        );
      })}
      <text x={c} y={c - 4} textAnchor="middle" className="fill-muted font-mono text-[9px]">POINTER</text>
      <text x={c} y={c + 10} textAnchor="middle" className="fill-accent font-mono text-[10px]">{pointer || order[0].id}</text>
    </svg>
  );
}

function GList({ items, depth = 0 }: { items: GItem[]; depth?: number }) {
  return (
    <ul className={cn("font-mono text-[11.5px]", depth > 0 && "ml-4 border-l border-line pl-3")}>
      {items.map((n, i) => (
        <li key={i} className="py-0.5">
          {n.group ? <><span className="text-accent">(</span> <span className="text-fg">{n.group}</span> <span className="text-muted">w={n.weight}</span><GList items={n.children ?? []} depth={depth + 1} /><span className="text-accent">)</span></>
            : <><span className="text-muted">•</span> <span className="text-fg-2">{n.atom}</span> <span className="text-muted">w={n.weight} max={n.max}</span></>}
        </li>
      ))}
    </ul>
  );
}

export function Structures({ user }: { user: User }) {
  const ds = useApi<Inspector>("/ds", { pollMs: 3000 });
  // Populate the heap, sparse matrix and graph by running the algorithms once.
  useEffect(() => {
    api("/results?by=average").catch(() => {});
    if (user.role === "admin") api("/admin/conflicts").catch(() => {});
  }, [user.role]);

  if (ds.error) return <ErrorState body={ds.error.message} onRetry={ds.reload} />;
  if (!ds.data) return <Skeleton className="h-[80vh]" />;
  const d = ds.data;
  const sm = d.sparseMatrix;

  return (
    <>
      <PageHeader eyebrow={<><Binary className="size-3.5" />Live from the C++ client · refreshes every 3 s</>} title="Data Structures"
        meta={<><span>Hand-written C++17 templates</span><span>No STL containers</span><span>Cache {d.cache.hits} hits / {d.cache.misses} misses</span></>} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={<Unit n={6}>Hashing · separate chaining</Unit>} meta="O(1) AVERAGE" className="xl:col-span-2">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {d.hashing.map((h) => (
              <div key={h.name}>
                <p className="text-[14px] text-fg">{h.name}</p>
                <p className="mb-2 text-[12px] text-muted">{h.use}</p>
                <HashBuckets h={h} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={<Unit n={6}>Hashing · linear probing</Unit>} meta={`${d.probing.size} / ${d.probing.capacity} SLOTS`}>
          <p className="mb-3 text-[12.5px] text-muted">{d.probing.use}. Collisions step to the next slot; deleted slots become tombstones so later searches keep probing past them.</p>
          <div className="grid grid-cols-[repeat(32,minmax(0,1fr))] gap-px" role="img" aria-label="Probing table slots">
            {d.probing.slots.map((s, i) => <span key={i} className={cn("aspect-square rounded-[1px]", s === 1 ? "bg-accent" : s === 2 ? "bg-danger/70" : "bg-white/[0.06]")} title={`slot ${i}`} />)}
          </div>
          <p className="mt-2 font-mono text-[10.5px] text-muted">load {d.probing.loadFactor.toFixed(2)} (resizes above 0.60) · avg probes {d.probing.avgProbes.toFixed(2)} · <span className="text-accent">■</span> full <span className="text-danger">■</span> tombstone</p>
        </Panel>

        <Panel title={<Unit n={4}>Binary search tree</Unit>} meta={`${d.bst.size} NODES · HEIGHT ${d.bst.height}`}>
          <p className="mb-3 text-[12.5px] text-muted">{d.bst.use}. Built by inserting the middle id first, so sorted ids still give a balanced tree (height {d.bst.height} vs ⌈log₂(n+1)⌉ = {Math.ceil(Math.log2(d.bst.size + 1))}).</p>
          <BstTree root={d.bst.root} />
        </Panel>

        <Panel title={<Unit n={4}>Max-heap</Unit>} meta={`${d.heap.array.length} ITEMS · LEVEL ORDER`}>
          <p className="mb-3 text-[12.5px] text-muted">{d.heap.use}. Parent of i is ⌊(i−1)/2⌋, children are 2i+1 and 2i+2. Built bottom-up in O(n); each extract-max is O(log n).</p>
          {d.heap.array.length ? (
            <ol className="flex flex-wrap gap-1">
              {d.heap.array.map((x, i) => (
                <li key={i} className={cn("min-w-[64px] rounded-xs border px-2 py-1 font-mono text-[10.5px]", i === 0 ? "border-accent/60 text-accent" : "border-line text-fg-2")}>
                  <span className="text-muted">[{i}]</span> {x.key.toFixed(2)}<span className="block truncate text-[9.5px] text-muted">{x.name}</span>
                </li>
              ))}
            </ol>
          ) : <p className="text-[13px] text-muted">Built when results are computed (admin, or after publishing).</p>}
        </Panel>

        <Panel title={<Unit n={1}>Sparse matrix · triplets</Unit>} meta="JUDGE × PROJECT SCORES">
          {sm.rows ? (
            <>
              <dl className="grid gap-x-8 sm:grid-cols-2">
                <Meta k="Size" v={`${sm.rows} × ${sm.cols}`} />
                <Meta k="Non-zero" v={sm.nonZero} />
                <Meta k="Density" v={`${((sm.density ?? 0) * 100).toFixed(1)}%`} />
                <Meta k="Memory" v={`${sm.sparseBytes} B vs ${sm.denseBytes} B dense`} />
              </dl>
              <div className="mt-3 max-h-48 overflow-y-auto">
                <table className="w-full font-mono text-[11px]">
                  <thead><tr className="text-left text-muted"><th className="py-1 font-normal">row (judge)</th><th className="py-1 font-normal">col (project)</th><th className="py-1 text-right font-normal">value</th></tr></thead>
                  <tbody>{(sm.triplets ?? []).map(([r, c, v], i) => <tr key={i} className="border-t border-line/50"><td className="py-0.5">{r}</td><td>{c}</td><td className="text-right text-accent">{v.toFixed(2)}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          ) : <p className="text-[13px] text-muted">Built when results are computed.</p>}
        </Panel>

        <Panel title={<Unit n={5}>Conflict graph</Unit>} meta={d.graph.vertices ? `${d.graph.vertices} V · ${d.graph.edges} E · ${d.graph.components} COMPONENTS` : "ADMIN"}>
          <p className="mb-3 text-[12.5px] text-muted">Judges and teams are vertices; an edge means the judge must never score that team. Stored as an adjacency matrix ({d.graph.matrixCells ?? 0} cells, O(1) lookup) and as adjacency lists (BFS / DFS in O(V + E)).</p>
          <ConflictGraph g={d.graph} />
          {d.graph.bfs?.length ? (
            <dl className="mt-3 space-y-1 font-mono text-[10.5px]">
              <div><dt className="inline text-muted">BFS · </dt><dd className="inline text-fg-2">{d.graph.bfs.join(" → ")}</dd></div>
              <div><dt className="inline text-muted">DFS · </dt><dd className="inline text-fg-2">{d.graph.dfs?.join(" → ")}</dd></div>
            </dl>
          ) : null}
        </Panel>

        <Panel title={<Unit n={2}>Circular linked list</Unit>} meta={`${d.circularList.order.length} JUDGES`}>
          <p className="mb-3 text-[12.5px] text-muted">{d.circularList.use}. The pointer stays where the last run stopped, so the next assignment run starts with the next judge.</p>
          <Ring order={d.circularList.order} pointer={d.circularList.pointer} />
          {d.circularList.lastRun?.rotations != null && (
            <p className="mt-2 text-center font-mono text-[10.5px] text-muted">last run: {d.circularList.lastRun.rotations} moves · {d.circularList.lastRun.conflictChecks} checks · {d.circularList.lastRun.conflictsAvoided} conflicts avoided</p>
          )}
        </Panel>

        <Panel title={<Unit n={2}>Singly linked lists</Unit>} meta="TEAM MEMBERS">
          <ul className="space-y-2">
            {d.singlyList.sample.map((t) => (
              <li key={t.team} className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
                <span className="mr-1 w-28 truncate text-fg">{t.team}</span>
                <span className="text-muted">head →</span>
                {t.members.map((m, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="rounded-xs border border-line px-1.5 py-0.5 text-fg-2">{m.split(" ")[0]}</span>
                    <span className="text-muted">{i === t.members.length - 1 ? "→ null" : "→"}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={<Unit n={2}>Generalized list</Unit>} meta={`DEPTH ${d.generalizedList.depth} · ${d.generalizedList.atoms} ATOMS`}>
          <p className="mb-3 text-[12.5px] text-muted">{d.generalizedList.use}. Groups are sub-lists, criteria are atoms; the weighted score walks it recursively.</p>
          <GList items={d.generalizedList.tree} />
        </Panel>

        <Panel title={<Unit n={3}>Request queue</Unit>} meta={`FIFO · ${d.queue.maxRetries} RETRIES`}>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <Meta k="Requests sent" v={d.queue.sent} />
            <Meta k="Retries" v={d.queue.retries} />
            <Meta k="Failures" v={d.queue.failures} />
            <Meta k="Waiting now" v={d.queue.pending.length} />
          </dl>
          <p className="mt-3 text-[12.5px] text-muted">Network errors and 5xx responses are retried; 4xx responses are final. Try the fault injection under Administration → System.</p>
        </Panel>

        <Panel title={<Unit n={3}>Undo stack</Unit>} meta={`LIFO · ${d.stack.entries.length} ENTRIES`}>
          {d.stack.entries.length ? (
            <ol className="space-y-1">
              {d.stack.entries.map((e, i) => (
                <li key={e.id} className={cn("rounded-xs border px-2 py-1 font-mono text-[11px]", i === 0 ? "border-accent/60 text-fg" : "border-line text-fg-2")}>
                  {i === 0 && <span className="text-accent">top → </span>}{e.label}
                </li>
              ))}
            </ol>
          ) : <p className="text-[13px] text-muted">Empty. Admin changes push their reverse request here.</p>}
        </Panel>

        <Panel title={<Unit n={1}>Dynamic arrays</Unit>} meta="RECORDS">
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <Meta k="Projects" v={`${d.dynArray.projects} (capacity ${d.dynArray.projectsCapacity})`} />
            <Meta k="Teams" v={d.dynArray.teams} />
            <Meta k="Judges" v={d.dynArray.judges} />
            <Meta k="Growth" v="×2 when full · amortised O(1)" />
          </dl>
        </Panel>
      </div>
    </>
  );
}
