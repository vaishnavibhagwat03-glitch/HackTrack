"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FileEdit, RefreshCw, Search, Check } from "lucide-react";
import { EVENT, TEAMS, projectById, teamById, trackById, type User } from "@/lib/data";
import { cn, fmtUTC, hms, mulberry32 } from "@/lib/utils";
import { useNow } from "@/lib/hooks";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar, Badge, Button, Meta, Panel, StatusDot, buttonClass, fieldClass } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { JourneyTimeline } from "./JourneyTimeline";

const MAX_TEAM = 5;

export function TeamWorkspace({ user }: { user: User }) {
  const toast = useToast();
  const now = useNow();
  const team = teamById(user.teamId!);
  const project = projectById(team.projectId)!;
  const [code, setCode] = useState(team.inviteCode);
  const [copied, setCopied] = useState(false);
  const isCaptain = team.members.find((m) => m.handle === user.handle)?.role === "captain";
  const link = `http://${EVENT.instance}/join/${code}`;
  const left = now ? Date.parse(EVENT.deadline) - now : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ tone: "ok", title: "Invite link copied", body: link });
    } catch {
      toast({ tone: "warn", title: "Clipboard unavailable", body: "Select the link and copy it manually." });
    }
  };

  return (
    <>
      <PageHeader crumbs={[{ label: "Team" }]} eyebrow={<><StatusDot tone="ok" />Team workspace · {team.id.toUpperCase()}</>} title={team.name.toUpperCase()}
        meta={<><span>{team.members.length}/{MAX_TEAM} members</span><span>{trackById(project.trackId).name}</span><span>Created {fmtUTC(team.createdAt)}</span></>} />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Members" meta={`${team.members.length} / ${MAX_TEAM}`} bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {team.members.map((m) => (
              <li key={m.handle} className="flex items-center gap-3 px-4 py-3.5">
                <Avatar initials={m.initials} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[14.5px]">{m.name}{m.handle === user.handle && <span className="font-mono text-[10px] text-muted">(YOU)</span>}</span>
                  <span className="font-mono text-[10.5px] text-muted">{m.handle} · {m.country}</span>
                </span>
                <Badge tone={m.role === "captain" ? "accent" : "neutral"}>{m.role === "captain" ? "Captain" : "Member"}</Badge>
              </li>
            ))}
            {Array.from({ length: MAX_TEAM - team.members.length }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3.5 text-muted">
                <span className="flex size-9 items-center justify-center rounded-sm border border-dashed border-line-strong font-mono text-[11px]">+</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.08em]">Open seat</span>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-6">
          <Panel title="Invite link" meta={isCaptain ? "CAPTAIN" : undefined}>
            <label htmlFor="invite" className="sr-only">Invite link</label>
            <div className="flex gap-2">
              <input id="invite" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={cn(fieldClass, "h-10 font-mono text-[12px]")} />
              <Button variant="primary" onClick={copy} className="h-10" aria-label="Copy invite link">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}<span className="hidden sm:inline">{copied ? "Copied" : "Copy invite link"}</span>
              </Button>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="font-mono text-[10.5px] text-muted">SINGLE-TEAM · EXPIRES AT DEADLINE · {MAX_TEAM - team.members.length} SEAT LEFT</p>
              {isCaptain && (
                <Button size="sm" variant="ghost" onClick={() => {
                  setCode(Math.floor(mulberry32(Date.now())() * 36 ** 6).toString(36).toUpperCase().padStart(6, "0"));
                  toast({ tone: "info", title: "Invite link regenerated", body: "The previous link no longer works." });
                }}><RefreshCw className="size-3" />Regenerate</Button>
              )}
            </div>
          </Panel>

          <Panel title="Project" meta={project.code} action={<Badge tone="warn" dot>Draft</Badge>}>
            <p className="text-2xl font-semibold tracking-tight">{project.name}</p>
            <p className="mt-1 text-[13.5px] text-fg-2">{project.tagline}</p>
            <dl className="mt-4">
              <Meta k="Submission status" v={<span className="text-warn">DRAFT</span>} />
              <Meta k="Deadline" v={fmtUTC(EVENT.deadline, "time")} />
              <Meta k="Time left" v={<span className="tabular">{left == null ? "--:--:--" : left > 0 ? hms(left) : "CLOSED"}</span>} />
            </dl>
            <Link href="/submission" className={buttonClass("secondary", "md", "mt-4 w-full")}><FileEdit className="size-3.5" />Open submission builder</Link>
          </Panel>
        </div>
      </div>

      <Panel title="Progress" className="mt-6" bodyClassName="p-5 md:p-6"><JourneyTimeline current={2} /></Panel>
    </>
  );
}

export function TeamsTable() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const rows = useMemo(() => TEAMS.filter((t) => `${t.name} ${t.members.map((m) => m.name).join(" ")} ${projectById(t.projectId)?.name}`.toLowerCase().includes(q.toLowerCase())), [q]);

  return (
    <>
      <PageHeader eyebrow="T1 · Teams" title="Teams" meta={<><span>{TEAMS.length} teams</span><span>{TEAMS.reduce((s, t) => s + t.members.length, 0)} participants</span><span>Max {MAX_TEAM} / team</span></>} />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams, members, projects…" aria-label="Search teams" className={cn(fieldClass, "h-9 pl-9")} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No teams found" body="No team, member or project matches that search." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[760px] text-left">
            <caption className="sr-only">Teams</caption>
            <thead><tr className="border-b border-line bg-white/[0.02]">
              {["Team", "Members", "Project", "Status", "Created"].map((h) => <th key={h} scope="col" className="label px-4 py-3 font-normal">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((t) => {
                const p = projectById(t.projectId)!;
                return (
                  <tr key={t.id} tabIndex={0} onClick={() => router.push(`/projects/${p.id}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/projects/${p.id}`)}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-white/[0.025] focus-visible:bg-white/[0.04]">
                    <th scope="row" className="px-4 py-3 font-normal"><span className="text-[14px] text-fg">{t.name}</span><span className="block font-mono text-[10.5px] text-muted">{t.id.toUpperCase()} · INVITE {t.inviteCode}</span></th>
                    <td className="px-4 py-3"><div className="flex -space-x-1.5">{t.members.map((m) => <Avatar key={m.handle} initials={m.initials} size={26} className="ring-2 ring-bg" />)}</div></td>
                    <td className="px-4 py-3 text-[13.5px]">{p.name}<span className="ml-2 font-mono text-[10.5px] text-muted">{p.code}</span></td>
                    <td className="px-4 py-3">{p.status === "submitted" ? <Badge tone="ok" dot>Submitted</Badge> : <Badge tone="warn" dot>Draft</Badge>}</td>
                    <td className="px-4 py-3 font-mono text-[11.5px] text-muted">{fmtUTC(t.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
