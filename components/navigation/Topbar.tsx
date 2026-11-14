"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search, Command } from "lucide-react";
import { NAV } from "@/lib/rbac";
import type { Bootstrap, User } from "@/lib/types";
import { useSession } from "@/lib/session";
import { fmtUTC } from "@/lib/utils";
import { useNow } from "@/lib/hooks";
import { LogoMark } from "@/components/ui/Logo";
import { Popover } from "@/components/ui/Popover";
import { Kbd, StatusDot } from "@/components/ui/primitives";
import { UserMenu } from "./Sidebar";

type Note = { id: string; title: string; body: string; at: string; unread: boolean };

/** Notifications derived from the live event state served by the C++ client. */
function notificationsFor(boot: Bootstrap | null, user: User, now: number | null): Note[] {
  if (!boot) return [];
  const e = boot.event;
  const t = now ?? Date.parse(boot.serverTime);
  const out: Note[] = [];
  const left = Date.parse(e.deadline) - t;
  if (left > 0) {
    const h = Math.round(left / 3600e3);
    out.push({ id: "deadline", title: `Submission deadline in ${h} h`, body: `Drafts lock at ${fmtUTC(e.deadline)}.`, at: e.deadline, unread: user.role === "participant" && h < 48 });
  } else {
    out.push({ id: "deadline", title: "Submissions are locked", body: `The deadline passed at ${fmtUTC(e.deadline)}.`, at: e.deadline, unread: false });
  }
  if (user.role === "participant" && !user.teamId) out.push({ id: "team", title: "You are not in a team yet", body: "Create a team or join one with an invite code.", at: boot.serverTime, unread: true });
  if (e.judgingOpen) out.push({ id: "judging", title: "Judging is open", body: user.role === "judge" ? "Your queue is ready in Judging." : "Judges are scoring submitted projects.", at: boot.serverTime, unread: user.role === "judge" });
  if (e.votingOpen) out.push({ id: "voting", title: "Community voting is open", body: `Every account has ${e.votesPerUser} votes.`, at: boot.serverTime, unread: false });
  if (e.resultsPublished) out.push({ id: "results", title: "Results are published", body: "See the leaderboard and your certificates.", at: e.resultsAt, unread: true });
  return out;
}

export function Topbar({ user, onOpenPalette }: { user: User; onOpenPalette: () => void }) {
  const pathname = usePathname();
  const now = useNow();
  const { boot } = useSession();
  const section = NAV.find((n) => pathname.startsWith(n.href));
  const NOTIFICATIONS = notificationsFor(boot, user, now);
  const unread = NOTIFICATIONS.filter((n) => n.unread).length;

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-xl md:px-6">
      <Link href="/dashboard" className="md:hidden" aria-label="Overview"><LogoMark /></Link>

      <div className="hidden min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted sm:flex">
        <span>{boot?.event.name ?? "HackTrack"}</span>
        <span className="text-line-strong">/</span>
        <span className="text-fg-2">{section?.label ?? "Workspace"}</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <span className="mr-2 hidden items-center gap-2 font-mono text-[10.5px] tracking-[0.06em] text-muted xl:flex" aria-label="Event clock, UTC">
          <StatusDot tone="ok" />
          <span className="tabular">{now ? fmtUTC(new Date(now).toISOString(), "clock") : "--:--:--"} UTC</span>
        </span>

        <button onClick={onOpenPalette}
          className="flex h-8 items-center gap-2 rounded-sm border border-line bg-white/[0.02] px-2.5 text-muted transition-colors hover:border-line-strong hover:text-fg-2 sm:w-64"
          aria-label="Search and commands (Ctrl K)">
          <Search className="size-3.5" />
          <span className="hidden flex-1 truncate whitespace-nowrap text-left text-[12.5px] sm:inline">Search projects, commands…</span>
          <span className="hidden items-center gap-0.5 sm:flex"><Kbd><Command className="size-2.5" /></Kbd><Kbd>K</Kbd></span>
        </button>

        <Popover
          label="Notifications"
          align="right"
          className="w-[min(340px,calc(100vw-2rem))]"
          trigger={({ toggle, open }) => (
            <button onClick={toggle} aria-expanded={open} aria-label={`Notifications, ${unread} unread`}
              className="relative flex size-8 items-center justify-center rounded-sm text-muted transition-colors hover:bg-white/[0.04] hover:text-fg">
              <Bell className="size-4" strokeWidth={1.75} />
              {unread > 0 && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent" />}
            </button>
          )}
        >
          {() => (
            <div>
              <p className="label flex justify-between px-2.5 pb-2 pt-2"><span>Notifications</span><span>{unread} unread</span></p>
              <ul>
                {NOTIFICATIONS.map((n) => (
                  <li key={n.id} className="flex gap-3 rounded-sm px-2.5 py-2.5 hover:bg-white/[0.03]">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.unread ? "bg-accent" : "bg-line-strong"}`} />
                    <div className="min-w-0">
                      <p className="text-[13px] text-fg">{n.title}</p>
                      <p className="mt-0.5 text-[12px] text-muted">{n.body}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted">{fmtUTC(n.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Popover>

        <div className="md:hidden"><UserMenu user={user} side="bottom" compact /></div>
      </div>
    </header>
  );
}
