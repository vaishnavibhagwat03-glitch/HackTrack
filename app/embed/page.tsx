"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Project } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { ProjectPreview } from "@/components/ui/ProjectPreview";
import { LogoMark } from "@/components/ui/Logo";

// Embeddable gallery, designed to live inside an <iframe>:
// <iframe src="http://localhost:3000/embed?track=judging" width="100%" height="640"></iframe>
// Data comes from the C++ client's public project list (submitted projects only).

function Embed() {
  const track = useSearchParams().get("track") ?? "";
  const res = useApi<{ projects: Project[] }>(`/projects?sort=name&track=${encodeURIComponent(track)}`, { auth: false });
  const list = (res.data?.projects ?? []).filter((p) => p.status === "submitted");
  return (
    <main className="min-h-dvh bg-bg p-4">
      <header className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-fg-2"><LogoMark size={14} />HACKTRACK · {list.length} PROJECTS</span>
        <Link href="/gallery" target="_top" className="font-mono text-[10.5px] tracking-[0.1em] text-muted hover:text-accent">OPEN GALLERY ↗</Link>
      </header>
      {res.error && <p className="font-mono text-[11px] text-danger">{res.error.message}</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {list.map((p) => (
          <li key={p.id}>
            <Link href={`/gallery/${p.id}`} target="_top" className="group block overflow-hidden rounded-md border border-line bg-surface transition-colors hover:border-accent/50">
              <div className="aspect-[16/9]"><ProjectPreview seed={p.slug} /></div>
              <div className="border-t border-line p-3">
                <p className="font-mono text-[10px] text-muted">{p.code}</p>
                <p className="mt-0.5 text-[14px] font-medium text-fg group-hover:text-accent">{p.name}</p>
                <p className="truncate text-[12px] text-muted">{p.team?.name}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function Page() {
  return <Suspense><Embed /></Suspense>;
}
