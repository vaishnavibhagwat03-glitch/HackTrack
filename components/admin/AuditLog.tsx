"use client";

import { useMemo, useState } from "react";
import { Download, Layers, Pause, Play, Undo2 } from "lucide-react";
import type { AuditEvent, UndoEntry } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn, downloadCSV, fmtUTC } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, Button, Panel, Skeleton, StatusDot, fieldClass } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";

const ACTOR_KINDS = ["JUDGE", "PARTICIPANT", "ADMIN", "SYSTEM"];

function tone(action: string) {
  if (action.includes("DELETED") || action.includes("REMOVED") || action.includes("FLAG")) return "text-warn";
  if (action.includes("GRANTED") || action.includes("RUBRIC") || action.includes("ASSIGNED") || action.includes("RESTORED") || action.includes("EVENT")) return "text-steel";
  if (action.startsWith("SCORE")) return "text-accent";
  return "text-fg";
}

/** Undo stack (LIFO) of the C++ client: each entry holds the reverse request(s). */
function UndoStack({ entries }: { entries: UndoEntry[] }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const undo = async () => {
    setBusy(true);
    try {
      const r = await api<{ undone: string; remaining: number }>("/admin/undo", { method: "POST" });
      toast({ tone: "ok", title: "Undone", body: `${r.undone} · ${r.remaining} left on the stack` });
    } catch (e) { toast({ tone: "warn", title: "Undo failed", body: errorMessage(e) }); } finally { setBusy(false); }
  };
  return (
    <Panel title="Undo stack" meta={`LINKED STACK · ${entries.length} ENTRIES · NEWEST ON TOP`} ticks
      action={<Button size="sm" variant="primary" onClick={undo} disabled={busy || !entries.length}><Undo2 className="size-3" />Undo top</Button>}>
      {entries.length === 0 ? (
        <p className="flex items-center gap-2 text-[13px] text-muted"><Layers className="size-4" />Empty. Admin changes (delete team, assign judges, conflicts, roles, event settings) push their reverse request here.</p>
      ) : (
        <ol className="space-y-1.5">
          {entries.map((e, i) => (
            <li key={e.id} className={cn("rounded-sm border px-3 py-2", i === 0 ? "border-accent/50 bg-accent/[0.04]" : "border-line")}>
              <p className="flex items-center justify-between gap-2 text-[13px]">
                <span className="truncate text-fg">{e.label}</span>
                {i === 0 && <Badge tone="accent">Top</Badge>}
              </p>
              <p className="mt-0.5 font-mono text-[10.5px] text-muted">
                {e.actor} · {fmtUTC(e.at, "clock")} · reverse: {e.reverse.map((r) => `${r.method} ${r.path}`).join(", ")}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** The event ledger recorded by the server, plus the client's undo stack. */
export function AuditLog() {
  const [live, setLive] = useState(true);
  const res = useApi<{ events: AuditEvent[]; undo: UndoEntry[] }>("/admin/audit", { pollMs: live ? 4000 : undefined });
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");
  const [actor, setActor] = useState("all");

  const all = useMemo(() => res.data?.events ?? [], [res.data]);
  const actions = useMemo(() => [...new Set(all.map((e) => e.action))].sort(), [all]);
  const rows = useMemo(() => all.filter((e) =>
    (action === "all" || e.action === action) &&
    (actor === "all" || e.actor.startsWith(actor)) &&
    (!q || `${e.actor} ${e.action} ${e.object} ${e.detail} ${e.id}`.toLowerCase().includes(q.toLowerCase())),
  ), [q, action, actor, all]);

  const sel = cn(fieldClass, "h-8 w-auto cursor-pointer pr-8 font-mono text-[11.5px]");
  if (res.error) return <ErrorState body={res.error.message} onRetry={res.reload} />;

  return (
    <>
      <PageHeader eyebrow="Audit ledger · undo" title="Audit & Undo"
        meta={<><span className="flex items-center gap-2"><StatusDot tone="ok" pulse={live} />{live ? "Polling every 4 s" : "Paused"}</span><span>{all.length} latest events</span><span>Stored by the server</span></>}
        actions={<>
          <Button onClick={() => setLive((l) => !l)} aria-pressed={!live}>{live ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{live ? "Pause" : "Resume"}</Button>
          <Button onClick={() => downloadCSV("hacktrack-audit.csv", rows.map(({ id, at, actor, action, object, ip, detail }) => ({ id, at, actor, action, object, ip, detail })))}><Download className="size-3.5" />Export</Button>
        </>} />

      <div className="mb-6"><UndoStack entries={res.data?.undo ?? []} /></div>

      <div className="mb-3 flex flex-wrap gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actor, action, object, event id…" aria-label="Search audit log" className={cn(fieldClass, "h-8 max-w-sm font-mono text-[12px]")} />
        <select aria-label="Filter by actor" value={actor} onChange={(e) => setActor(e.target.value)} className={sel}>
          <option value="all">ALL ACTORS</option>
          {ACTOR_KINDS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} className={sel}>
          <option value="all">ALL ACTIONS</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="ml-auto self-center font-mono text-[10.5px] text-muted">{rows.length} / {all.length}</span>
      </div>

      {!res.data ? (
        <div className="space-y-1.5" aria-busy="true">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState code="0 EVENTS" title="No events match" body="The ledger has no events for this combination of filters." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-[#0c0c0d]">
          <table className="w-full min-w-[820px] font-mono text-[11.5px]">
            <caption className="sr-only">Audit events</caption>
            <thead>
              <tr className="border-b border-line text-left text-muted">
                {["Timestamp", "Actor", "Action", "Object", "Detail", "Source", "Event"].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-normal uppercase tracking-[0.08em]">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-line/60 last:border-0 hover:bg-white/[0.025]">
                  <td className="whitespace-nowrap px-4 py-2 text-muted"><span className="text-fg-2">{fmtUTC(e.at, "clock")}</span> <span className="text-[10px]">{fmtUTC(e.at, "date").slice(0, 6)}</span></td>
                  <td className="px-4 py-2 text-fg-2">{e.actor}</td>
                  <td className={cn("px-4 py-2", tone(e.action))}>{e.action}</td>
                  <td className="px-4 py-2 text-fg-2">{e.object}</td>
                  <td className="px-4 py-2 text-muted">{e.detail}</td>
                  <td className="px-4 py-2 text-muted">{e.ip}</td>
                  <td className="px-4 py-2 text-muted">{e.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
