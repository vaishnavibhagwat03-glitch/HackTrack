"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ChevronsUpDown, LogOut, Repeat, Settings2 } from "lucide-react";
import { navFor, ROLE_LABEL } from "@/lib/rbac";
import type { User } from "@/lib/types";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { cn, fmtUTC } from "@/lib/utils";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { Popover, MenuItem } from "@/components/ui/Popover";
import { Avatar, Badge, Kbd, StatusDot } from "@/components/ui/primitives";

export function EventSwitcher({ user }: { user: User }) {
  const router = useRouter();
  const { boot } = useSession();
  const e = boot?.event;
  const phase = !e ? "…" : e.resultsPublished ? "RESULTS" : e.judgingOpen ? "JUDGING" : "BUILDING";
  return (
    <Popover
      label="Event"
      className="w-64"
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open}
          className="group flex w-full items-center gap-3 rounded-sm border border-line bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:border-line-strong">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-xs bg-accent font-mono text-[10px] font-bold text-accent-ink">HT</span>
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-[13px] font-medium text-fg">{e?.name ?? "HackTrack"}</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted"><StatusDot tone="ok" pulse />LIVE · {phase}</span>
          </span>
          <ChevronsUpDown className="hidden size-3.5 text-muted group-hover:text-fg lg:block" />
        </button>
      )}
    >
      {(close) => (
        <div className="p-1">
          <p className="label px-2.5 pb-1 pt-2">Event schedule (UTC)</p>
          {e && (
            <dl className="px-2.5 pb-2 font-mono text-[11px]">
              <div className="flex justify-between py-1"><dt className="text-muted">Starts</dt><dd className="text-fg-2">{fmtUTC(e.startsAt)}</dd></div>
              <div className="flex justify-between py-1"><dt className="text-muted">Deadline</dt><dd className="text-fg-2">{fmtUTC(e.deadline)}</dd></div>
              <div className="flex justify-between py-1"><dt className="text-muted">Results</dt><dd className="text-fg-2">{fmtUTC(e.resultsAt)}</dd></div>
            </dl>
          )}
          {user.role === "admin" && (
            <>
              <div className="my-1 h-px bg-line" />
              <MenuItem onClick={() => { close(); router.push("/admin"); }}><Settings2 className="size-3.5" />Event settings</MenuItem>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

/** Live status of the C++ client and, through it, the server. */
function ClientStatus() {
  const { data, error } = useApi<{ client: { ok: boolean }; server: { ok: boolean; ms: number }; serverAddress: string }>("/health", { pollMs: 10000 });
  const connecting = !data && !error;
  const clientOk = !error && !!data;
  const serverOk = clientOk && data!.server.ok;
  return (
    <div className="hidden rounded-sm border border-line bg-white/[0.015] px-2.5 py-2 lg:block" title="Website → C++ client → server">
      <p className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.06em] text-fg-2">
        <StatusDot tone={clientOk ? "ok" : connecting ? "warn" : "danger"} pulse={clientOk} />C++ CLIENT {clientOk ? "ONLINE" : connecting ? "CONNECTING…" : "OFFLINE"}
      </p>
      <p className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted">
        <StatusDot tone={serverOk ? "ok" : connecting ? "warn" : "danger"} />SERVER {serverOk ? `OK · ${Math.round(data!.server.ms)} ms` : connecting ? "CHECKING…" : "UNREACHABLE"}
      </p>
    </div>
  );
}

export function UserMenu({ user, side = "top", compact }: { user: User; side?: "top" | "bottom"; compact?: boolean }) {
  const router = useRouter();
  const { signOut } = useSession();
  const initials = user.name.split(" ").map((s) => s[0]).join("");
  return (
    <Popover
      label="Account"
      side={side}
      align={side === "bottom" ? "right" : "left"}
      className="w-64"
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} aria-label="Account menu"
          className={cn("flex w-full items-center gap-2.5 rounded-sm text-left transition-colors hover:bg-white/[0.04]", compact ? "p-0.5" : "p-1.5")}>
          <Avatar initials={initials} size={compact ? 28 : 30} />
          {!compact && (
            <span className="hidden min-w-0 flex-1 lg:block">
              <span className="block truncate text-[13px] text-fg">{user.name}</span>
              <span className="block truncate font-mono text-[10px] uppercase tracking-[0.06em] text-muted">{user.handle}</span>
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2.5 py-2">
            <p className="text-[13px] text-fg">{user.name}</p>
            <p className="font-mono text-[11px] text-muted">{user.email}</p>
            <Badge tone="accent" className="mt-2">{ROLE_LABEL[user.role]}</Badge>
          </div>
          <div className="my-1 h-px bg-line" />
          {user.role === "admin" && (
            <MenuItem onClick={() => { close(); router.push("/admin"); }}><Settings2 className="size-3.5" />Settings</MenuItem>
          )}
          <MenuItem onClick={() => { close(); signOut(); router.push("/signin"); }}><Repeat className="size-3.5" />Switch account</MenuItem>
          <MenuItem onClick={() => { close(); signOut(); router.push("/"); }}><LogOut className="size-3.5" />Sign out</MenuItem>
        </div>
      )}
    </Popover>
  );
}

export function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const items = navFor(user.role);
  const groups = [
    { id: "main", label: "Event", items: items.filter((i) => i.group === "main") },
    { id: "admin", label: "Administration", items: items.filter((i) => i.group === "admin") },
  ].filter((g) => g.items.length);

  return (
    <aside className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col border-r border-line bg-bg md:flex lg:w-60">
      <div className="flex h-14 items-center border-b border-line px-5">
        <Link href="/" aria-label="HackTrack home">
          <Logo className="hidden lg:inline-flex" />
          <LogoMark className="text-fg lg:hidden" />
        </Link>
      </div>

      <div className="p-3"><EventSwitcher user={user} /></div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.id} className="mt-3 first:mt-1">
            <p className="label hidden px-2.5 pb-2 lg:block">{g.label}</p>
            {g.id === "admin" && <div className="mx-2 mb-2 h-px bg-line lg:hidden" />}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={active ? "page" : undefined} title={item.label}
                      className={cn("group relative flex h-9 items-center gap-3 rounded-sm px-2.5 text-[13.5px] transition-colors",
                        active ? "bg-white/[0.05] text-fg" : "text-fg-2 hover:bg-white/[0.03] hover:text-fg")}>
                      {active && <motion.span layoutId="nav-active" className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                      <Icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-muted group-hover:text-fg-2")} strokeWidth={1.75} />
                      <span className="hidden flex-1 lg:inline">{item.label}</span>
                      {item.shortcut && (
                        <span className="hidden gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 lg:flex">
                          {item.shortcut.split(" ").map((k) => <Kbd key={k}>{k}</Kbd>)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-line p-3">
        <ClientStatus />
        <div className="flex items-center justify-between gap-1">
          <div className="min-w-0 flex-1"><UserMenu user={user} /></div>
        </div>
        <p className="hidden px-1.5 lg:block"><Badge tone="accent">{ROLE_LABEL[user.role]}</Badge></p>
      </div>
    </aside>
  );
}
