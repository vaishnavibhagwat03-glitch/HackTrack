"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FileEdit, Search, Check, LogOut, Plus, UserPlus, Trash2, UserMinus, Undo2 } from "lucide-react";
import type { Project, Team, User } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { cn, fmtUTC, hms } from "@/lib/utils";
import { useNow } from "@/lib/hooks";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar, Badge, Button, Field, Meta, Panel, Skeleton, StatusDot, buttonClass, fieldClass } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { JourneyTimeline } from "./JourneyTimeline";

type Mine = { team: Team | null; project?: Project; maxTeamSize: number };

export function TeamWorkspace({ user }: { user: User }) {
  const toast = useToast();
  const now = useNow();
  const { boot } = useSession();
  const mine = useApi<Mine>("/teams/mine");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  if (mine.error) return <ErrorState body={mine.error.message} onRetry={mine.reload} />;
  if (!mine.data) return <Skeleton className="h-[50vh]" />;
  const { team, project, maxTeamSize } = mine.data;
  if (!team) return <NoTeam />;

  const isCaptain = team.members.find((m) => m.handle === user.handle)?.role === "captain";
  const left = now && boot ? Date.parse(boot.event.deadline) - now : null;
  const track = boot?.tracks.find((t) => t.id === project?.trackId);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(team.inviteCode ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ tone: "ok", title: "Invite code copied", body: team.inviteCode });
    } catch {
      toast({ tone: "warn", title: "Clipboard unavailable", body: "Select the code and copy it manually." });
    }
  };

  const leave = async () => {
    if (!confirm(team.members.length === 1 ? "You are the last member: leaving disbands the team and deletes its draft. Continue?" : "Leave this team?")) return;
    setBusy(true);
    try {
      const r = await api<{ disbanded: boolean }>("/teams/leave", { method: "POST" });
      toast({ tone: "ok", title: r.disbanded ? "Team disbanded" : "You left the team" });
    } catch (e) {
      toast({ tone: "warn", title: "Could not leave", body: errorMessage(e) });
    } finally { setBusy(false); }
  };

  const stage = !project ? 1 : project.status === "draft" ? 2 : 3;

  return (
    <>
      <PageHeader crumbs={[{ label: "Team" }]} eyebrow={<><StatusDot tone="ok" />Team workspace · {team.id.toUpperCase()}</>} title={team.name.toUpperCase()}
        meta={<><span>{team.members.length}/{maxTeamSize} members</span><span>{track?.name ?? "No track yet"}</span><span>Created {fmtUTC(team.createdAt)}</span></>}
        actions={<Button onClick={leave} disabled={busy}><LogOut className="size-3.5" />Leave team</Button>} />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Members" meta={`${team.members.length} / ${maxTeamSize} · SINGLY LINKED LIST`} bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {team.members.map((m) => (
              <li key={m.handle} className="flex items-center gap-3 px-4 py-3.5">
                <Avatar initials={m.initials} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[14.5px]">{m.name}{m.handle === user.handle && <span className="font-mono text-[10px] text-muted">(YOU)</span>}</span>
                  <span className="font-mono text-[10.5px] text-muted">{m.handle}{m.country && ` · ${m.country}`}</span>
                </span>
                <Badge tone={m.role === "captain" ? "accent" : "neutral"}>{m.role === "captain" ? "Captain" : "Member"}</Badge>
              </li>
            ))}
            {Array.from({ length: Math.max(0, maxTeamSize - team.members.length) }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3.5 text-muted">
                <span className="flex size-9 items-center justify-center rounded-sm border border-dashed border-line-strong font-mono text-[11px]">+</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.08em]">Open seat</span>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-6">
          <Panel title="Invite code" meta={isCaptain ? "CAPTAIN" : undefined}>
            <label htmlFor="invite" className="sr-only">Invite code</label>
            <div className="flex gap-2">
              <input id="invite" readOnly value={team.inviteCode ?? ""} onFocus={(e) => e.currentTarget.select()} className={cn(fieldClass, "h-10 font-mono text-[15px] tracking-[0.3em]")} />
              <Button variant="primary" onClick={copy} className="h-10" aria-label="Copy invite code">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}<span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
            <p className="mt-3 font-mono text-[10.5px] text-muted">
              TEAMMATES ENTER THIS CODE ON THEIR TEAM PAGE · THE C++ CLIENT RESOLVES IT WITH A LINEAR-PROBING HASH TABLE · {Math.max(0, maxTeamSize - team.members.length)} SEAT(S) LEFT
            </p>
          </Panel>

          <Panel title="Project" meta={project?.code ?? "NOT STARTED"} action={project?.status === "submitted" ? <Badge tone="ok" dot>Submitted</Badge> : <Badge tone="warn" dot>Draft</Badge>}>
            <p className="text-2xl font-semibold tracking-tight">{project?.name ?? "No project yet"}</p>
            <p className="mt-1 text-[13.5px] text-fg-2">{project?.tagline || "Open the submission builder to start."}</p>
            <dl className="mt-4">
              <Meta k="Submission status" v={project?.status === "submitted" ? <span className="text-ok">SUBMITTED</span> : <span className="text-warn">DRAFT</span>} />
              <Meta k="Deadline" v={boot ? fmtUTC(boot.event.deadline) : "—"} />
              <Meta k="Time left" v={<span className="tabular">{left == null ? "--:--:--" : left > 0 ? hms(left) : "CLOSED"}</span>} />
            </dl>
            <Link href="/submission" className={buttonClass("secondary", "md", "mt-4 w-full")}><FileEdit className="size-3.5" />Open submission builder</Link>
          </Panel>
        </div>
      </div>

      <Panel title="Progress" className="mt-6" bodyClassName="p-5 md:p-6"><JourneyTimeline current={stage} /></Panel>
    </>
  );
}

function NoTeam() {
  const toast = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<{ create?: string; join?: string }>({});
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const t = await api<Team>("/teams", { method: "POST", body: { name } });
      toast({ tone: "ok", title: `Team ${t.name} created`, body: `Share invite code ${t.inviteCode}` });
    } catch (x) { setErr({ create: errorMessage(x) }); } finally { setBusy(false); }
  };
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const t = await api<Team>("/teams/join", { method: "POST", body: { inviteCode: code } });
      toast({ tone: "ok", title: `Joined ${t.name}` });
    } catch (x) { setErr({ join: errorMessage(x) }); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader crumbs={[{ label: "Team" }]} eyebrow={<><StatusDot tone="warn" />No team yet</>} title="Find your team"
        meta={<span>One team per participant · enforced by the client and the server</span>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Create a team" meta="YOU BECOME CAPTAIN" ticks>
          <form onSubmit={create} className="space-y-4">
            <Field label="Team name" htmlFor="team-name" error={err.create}>
              <input id="team-name" required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className={cn(fieldClass, "h-11")} placeholder="e.g. Stack Overflowers" />
            </Field>
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}><Plus className="size-3.5" />Create team</Button>
          </form>
        </Panel>
        <Panel title="Join with an invite code" meta="ASK YOUR CAPTAIN">
          <form onSubmit={join} className="space-y-4">
            <Field label="Invite code" htmlFor="invite-code" error={err.join} hint="6 characters">
              <input id="invite-code" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8}
                className={cn(fieldClass, "h-11 font-mono tracking-[0.3em]")} placeholder="ABC123" />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={busy}><UserPlus className="size-3.5" />Join team</Button>
          </form>
        </Panel>
      </div>
    </>
  );
}

export function TeamsTable() {
  const router = useRouter();
  const toast = useToast();
  const teams = useApi<Team[]>("/teams");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => (teams.data ?? []).filter((t) =>
    `${t.name} ${t.members.map((m) => m.name).join(" ")} ${t.project?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())), [q, teams.data]);

  const undoToast = (title: string) => toast({ tone: "ok", title, body: "Pushed on the undo stack — use Undo to restore." });
  const del = async (t: Team) => {
    if (!confirm(`Delete team ${t.name} with ${t.members.length} member(s)? Its project, scores and votes go too. You can undo this.`)) return;
    try { await api(`/admin/teams/${t.id}`, { method: "DELETE" }); undoToast(`Deleted ${t.name}`); }
    catch (e) { toast({ tone: "warn", title: "Delete failed", body: errorMessage(e) }); }
  };
  const removeMember = async (t: Team, userId: string, name: string) => {
    if (!confirm(`Remove ${name} from ${t.name}?`)) return;
    try { await api(`/admin/teams/${t.id}/members/${userId}`, { method: "DELETE" }); undoToast(`Removed ${name}`); }
    catch (e) { toast({ tone: "warn", title: "Remove failed", body: errorMessage(e) }); }
  };
  const undo = async () => {
    try { const r = await api<{ undone: string }>("/admin/undo", { method: "POST" }); toast({ tone: "ok", title: "Undone", body: r.undone }); }
    catch (e) { toast({ tone: "warn", title: "Nothing undone", body: errorMessage(e) }); }
  };

  if (teams.error) return <ErrorState body={teams.error.message} onRetry={teams.reload} />;
  const all = teams.data ?? [];

  return (
    <>
      <PageHeader eyebrow="Teams · admin" title="Teams"
        meta={<><span>{all.length} teams</span><span>{all.reduce((s, t) => s + t.members.length, 0)} participants</span><span>Merge-sorted by name</span></>}
        actions={<Button onClick={undo}><Undo2 className="size-3.5" />Undo last change</Button>} />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams, members, projects…" aria-label="Search teams" className={cn(fieldClass, "h-9 pl-9")} />
      </div>
      {!teams.data ? <Skeleton className="h-96" /> : rows.length === 0 ? (
        <EmptyState title="No teams found" body="No team, member or project matches that search." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[860px] text-left">
            <caption className="sr-only">Teams</caption>
            <thead><tr className="border-b border-line bg-white/[0.02]">
              {["Team", "Members", "Project", "Status", "Created", ""].map((h, i) => <th key={i} scope="col" className="label px-4 py-3 font-normal">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((t) => (
                <Fragment key={t.id}>
                  <tr className="border-b border-line last:border-0 hover:bg-white/[0.025]">
                    <th scope="row" className="px-4 py-3 font-normal">
                      <button className="text-left" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
                        <span className="text-[14px] text-fg hover:text-accent">{t.name}</span>
                        <span className="block font-mono text-[10.5px] text-muted">{t.id.toUpperCase()} · INVITE {t.inviteCode}</span>
                      </button>
                    </th>
                    <td className="px-4 py-3"><div className="flex -space-x-1.5">{t.members.map((m) => <Avatar key={m.handle} initials={m.initials} size={26} className="ring-2 ring-bg" />)}</div></td>
                    <td className="px-4 py-3 text-[13.5px]">
                      {t.project ? <button className="hover:text-accent" onClick={() => router.push(`/projects/${t.project!.id}`)}>{t.project.name}</button> : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">{!t.project ? <Badge>None</Badge> : t.project.status === "submitted" ? <Badge tone="ok" dot>Submitted</Badge> : <Badge tone="warn" dot>Draft</Badge>}</td>
                    <td className="px-4 py-3 font-mono text-[11.5px] text-muted">{fmtUTC(t.createdAt)}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => del(t)} aria-label={`Delete ${t.name}`}><Trash2 className="size-3.5" /></Button></td>
                  </tr>
                  {open === t.id && (
                    <tr className="border-b border-line bg-white/[0.015]">
                      <td colSpan={6} className="px-4 py-3">
                        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {t.members.map((m) => (
                            <li key={m.handle} className="flex items-center gap-2 rounded-sm border border-line px-2 py-1.5">
                              <Avatar initials={m.initials} size={24} />
                              <span className="min-w-0 flex-1 truncate text-[13px]">{m.name} <span className="font-mono text-[10px] text-muted">{m.role}</span></span>
                              {m.userId && <Button size="sm" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => removeMember(t, m.userId!, m.name)}><UserMinus className="size-3.5" /></Button>}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
