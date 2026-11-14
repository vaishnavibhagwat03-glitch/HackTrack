"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Activity, X } from "lucide-react";
import type { TraceEntry } from "@/lib/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Live log of what the C++ client did: HTTP requests to the server and DS operations. */
export function TraceDrawer() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TraceEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "http" | "ds">("all");
  const since = useRef(0);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let busy = false;  // never overlap polls: a slow response would deliver the same entries twice
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const fresh = (await api<TraceEntry[]>(`/trace?since=${since.current}`)).filter((e) => e.id > since.current);
        if (!alive || !fresh.length) return;
        since.current = fresh[fresh.length - 1].id;
        setRows((r) => {
          const seen = new Set(r.map((x) => x.id));
          return [...fresh.reverse().filter((x) => !seen.has(x.id)), ...r].slice(0, 200);
        });
      } catch {} finally { busy = false; }
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [open]);

  const shown = rows.filter((r) => filter === "all" || r.kind === filter);

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="fixed bottom-20 right-4 z-[60] flex items-center gap-2 rounded-sm border border-line-strong bg-surface-2/95 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-2 shadow-xl backdrop-blur hover:text-fg md:bottom-6">
        <Activity className="size-3.5 text-accent" />Protocol trace
      </button>
      <AnimatePresence>
        {open && (
          <motion.aside role="dialog" aria-label="Protocol trace"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.25 }}
            className="fixed bottom-32 right-4 z-[60] flex h-[min(520px,70vh)] w-[min(620px,calc(100vw-2rem))] flex-col overflow-hidden rounded-md border border-line-strong bg-[#0b0b0c]/97 shadow-2xl backdrop-blur md:bottom-16">
            <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-2">C++ client · website → client → server</p>
              <div className="flex items-center gap-1">
                {(["all", "http", "ds"] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={cn("rounded-xs px-2 py-0.5 font-mono text-[10px] uppercase", filter === f ? "bg-white/10 text-fg" : "text-muted hover:text-fg")}>{f}</button>
                ))}
                <button onClick={() => setOpen(false)} aria-label="Close trace" className="ml-1 text-muted hover:text-fg"><X className="size-3.5" /></button>
              </div>
            </header>
            <ol className="flex-1 overflow-y-auto font-mono text-[10.5px]">
              {shown.length === 0 && <li className="p-4 text-muted">Waiting for activity… use the site and requests appear here.</li>}
              {shown.map((r) => (
                <li key={r.id} className="grid grid-cols-[56px_1fr_auto] gap-2 border-b border-line/50 px-3 py-1.5">
                  <span className="text-muted">{r.at.slice(11, 19)}</span>
                  {r.kind === "http" ? (
                    <span className="min-w-0">
                      <span className="text-steel">{r.method}</span> <span className="text-fg">{r.target}</span>
                      <span className="block truncate text-muted">{r.detail}{r.error && <span className="text-danger"> · {r.error}</span>}</span>
                    </span>
                  ) : (
                    <span className="min-w-0">
                      <span className="text-accent">{r.method}</span> <span className="text-fg-2">{r.target}</span>
                      <span className="block truncate text-muted">{r.detail}</span>
                    </span>
                  )}
                  <span className="text-right">
                    {r.kind === "http" ? (
                      <>
                        <span className={cn(r.status >= 500 || r.status === 0 ? "text-danger" : r.status >= 400 ? "text-warn" : "text-ok")}>{r.status || "ERR"}</span>
                        <span className={cn("block", r.attempts > 1 ? "text-warn" : "text-muted")}>{r.attempts > 1 ? `${r.attempts} tries` : `${Math.round(r.ms)} ms`}</span>
                      </>
                    ) : <span className="text-muted">DS</span>}
                  </span>
                </li>
              ))}
            </ol>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
