"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { Project, Results } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { useHotkeys } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Button, Kbd, Skeleton, fieldClass } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { ProjectCard } from "./ProjectCard";

type Sort = "newest" | "oldest" | "name" | "id" | "score";

function Select({ label, value, onChange, children, id }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="relative flex h-9 shrink-0 items-center rounded-sm border border-line-strong bg-bg/60 pl-3 transition-colors focus-within:border-accent hover:border-fg/25">
      <span className="label mr-2">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className="h-full cursor-pointer appearance-none bg-transparent pr-7 text-[13px] text-fg focus:outline-none focus-visible:outline-none">
        {children}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-2.5 text-[9px] text-muted">▼</span>
    </label>
  );
}

export function Gallery({ staff = false, hrefBase = "/projects", compactHeader }: { staff?: boolean; hrefBase?: string; compactHeader?: boolean }) {
  const searchRef = useRef<HTMLInputElement>(null);
  const { boot } = useSession();
  const TRACKS = boot?.tracks ?? [];
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [track, setTrack] = useState("all");
  const [status, setStatus] = useState(staff ? "all" : "submitted");
  const [tech, setTech] = useState("all");
  const [size, setSize] = useState("any");
  const [minScore, setMinScore] = useState("0");
  const [sort, setSort] = useState<Sort>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useHotkeys({ "/": () => searchRef.current?.focus() });
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  // Sorting and text search run in the C++ client (merge / quick sort, BST in-order).
  const serverSort = sort === "name" ? "name" : sort === "id" ? "id" : "recent";
  const res = useApi<{ projects: Project[]; sort: { algorithm: string; comparisons: number; n: number } }>(
    `/projects?sort=${serverSort}&track=${track}&q=${encodeURIComponent(debounced)}`, { auth: !hrefBase.startsWith("/gallery") });
  const ranking = useApi<Results>(staff ? "/results?by=normalized" : null);
  const score = useMemo(() => new Map((ranking.data?.ranking ?? []).map((r) => [r.projectId, r])), [ranking.data]);
  const loading = res.loading;
  const PROJECTS = useMemo(() => res.data?.projects ?? [], [res.data]);
  const ALL_TECH = useMemo(() => [...new Set(PROJECTS.flatMap((p) => p.stack))].sort(), [PROJECTS]);

  const visible = useMemo(() => {
    const list = PROJECTS.filter((p) => {
      if (!staff && p.status !== "submitted") return false;
      if (status !== "all" && p.status !== status) return false;
      if (tech !== "all" && !p.stack.includes(tech)) return false;
      const n = p.team?.members.length ?? 0;
      if (size === "2" && n > 2) return false;
      if (size === "3" && n !== 3) return false;
      if (size === "4" && n < 4) return false;
      if (staff && +minScore > 0 && (score.get(p.id)?.normalized ?? 0) < +minScore) return false;
      return true;
    });
    // Already sorted by the C++ client; "oldest" is newest reversed, "score" follows the heap's ranking.
    if (sort === "oldest") return list.reverse();
    if (sort === "score") return list.sort((a, b) => (score.get(a.id)?.rank ?? 1e9) - (score.get(b.id)?.rank ?? 1e9));
    return list;
  }, [PROJECTS, status, tech, size, minScore, sort, staff, score]);

  const active = [track !== "all", staff && status !== "all", tech !== "all", size !== "any", +minScore > 0].filter(Boolean).length;
  const reset = () => { setQ(""); setTrack("all"); setStatus(staff ? "all" : "submitted"); setTech("all"); setSize("any"); setMinScore("0"); };
  const total = boot ? (staff ? boot.counts.projects : boot.counts.submitted) : PROJECTS.length;

  return (
    <div>
      {!compactHeader && (
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="label">Public gallery · {total} {staff ? "projects" : "submissions"}</p>
            <h1 className="mt-2 text-[clamp(3rem,8vw,6.5rem)] font-semibold leading-[0.85] tracking-[-0.055em]">PROJECTS</h1>
          </div>
          <div className="text-right font-mono text-[12px] tabular text-muted" aria-live="polite">
            <p>SHOWING <span className="text-fg">{visible.length}</span> / {total}</p>
            {res.data && <p className="mt-1 text-[10.5px] uppercase">C++ {res.data.sort.algorithm} · {res.data.sort.comparisons} comparisons</p>}
          </div>
        </header>
      )}

      <div className="sticky top-14 z-30 -mx-4 mb-6 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur-xl md:mx-0 md:rounded-md md:border md:px-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects"
              placeholder="Search projects, teams, technologies…" className={cn(fieldClass, "h-9 pl-9 pr-10")} />
            <Kbd className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
          </div>
          <Button className="lg:hidden" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
            <SlidersHorizontal className="size-3.5" />{active ? active : ""}
          </Button>
        </div>
        <div className={cn("no-scrollbar mt-2 gap-2 overflow-x-auto lg:flex", filtersOpen ? "flex flex-wrap" : "hidden")}>
          <Select id="f-track" label="Track" value={track} onChange={setTrack}>
            <option value="all">All</option>
            {TRACKS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          {staff && (
            <Select id="f-status" label="Status" value={status} onChange={setStatus}>
              <option value="all">All</option><option value="submitted">Submitted</option><option value="draft">Draft</option>
            </Select>
          )}
          <Select id="f-tech" label="Tech" value={tech} onChange={setTech}>
            <option value="all">All</option>
            {ALL_TECH.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select id="f-size" label="Team" value={size} onChange={setSize}>
            <option value="any">Any size</option><option value="2">1–2</option><option value="3">3</option><option value="4">4+</option>
          </Select>
          {staff && (
            <Select id="f-score" label="Score ≥" value={minScore} onChange={setMinScore}>
              {["0", "6", "7", "7.5", "8", "8.5"].map((v) => <option key={v} value={v}>{v === "0" ? "Any" : v}</option>)}
            </Select>
          )}
          <Select id="f-sort" label="Sort" value={sort} onChange={(v) => setSort(v as Sort)}>
            <option value="newest">Newest (quick sort)</option><option value="oldest">Oldest</option><option value="name">Name A–Z (merge sort)</option><option value="id">ID (BST in-order)</option>
            {staff && <option value="score">Score</option>}
          </Select>
          {active > 0 && <Button variant="ghost" onClick={reset}><X className="size-3" />Clear {active}</Button>}
        </div>
      </div>

      {res.error ? (
        <ErrorState body={res.error.message} onRetry={res.reload} />
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4" aria-busy="true" aria-label="Loading projects">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[430px]" />)}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState code="0 MATCHES" title="No projects match these filters" body="Try a broader search, or clear filters to see every submission."
          action={<Button onClick={reset}>Clear filters</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {visible.map((p, i) => <ProjectCard key={p.id} project={p} index={i} href={`${hrefBase}/${p.id}`} />)}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
