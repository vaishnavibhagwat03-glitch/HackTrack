import type { Role } from "./types";
import {
  LayoutGrid, FolderKanban, Users, Gavel, Vote, Trophy, Award, BarChart3,
  Settings2, ScrollText, FileEdit, Binary, type LucideIcon,
} from "lucide-react";

export { ROLE_LABEL } from "./types";

// UI routing only. The C++ client checks the role from its session cache,
// and the server checks again — these rules decide what to *show*.

export type NavItem = { href: string; label: string; icon: LucideIcon; roles: Role[]; group: "main" | "admin"; shortcut?: string };

const ALL: Role[] = ["participant", "judge", "admin"];

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid, roles: ALL, group: "main", shortcut: "G O" },
  { href: "/projects", label: "Projects", icon: FolderKanban, roles: ALL, group: "main", shortcut: "G P" },
  { href: "/teams", label: "Team", icon: Users, roles: ["participant", "admin"], group: "main", shortcut: "G T" },
  { href: "/submission", label: "Submission", icon: FileEdit, roles: ["participant"], group: "main", shortcut: "G S" },
  { href: "/judging", label: "Judging", icon: Gavel, roles: ["judge", "admin"], group: "main", shortcut: "G J" },
  { href: "/voting", label: "Voting", icon: Vote, roles: ALL, group: "main", shortcut: "G V" },
  { href: "/results", label: "Results", icon: Trophy, roles: ALL, group: "main", shortcut: "G R" },
  { href: "/certificates", label: "Certificates", icon: Award, roles: ALL, group: "main" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, roles: ["admin"], group: "admin" },
  { href: "/admin", label: "Administration", icon: Settings2, roles: ["admin"], group: "admin" },
  { href: "/audit", label: "Audit & Undo", icon: ScrollText, roles: ["admin"], group: "admin" },
  { href: "/structures", label: "Data Structures", icon: Binary, roles: ALL, group: "main", shortcut: "G D" },
];

/** Routes a role may open. Judging sessions are judge-only (role isolation). */
const ROUTE_RULES: [prefix: string, roles: Role[]][] = [
  ["/judging/", ["judge"]],
  ...NAV.map((n) => [n.href, n.roles] as [string, Role[]]),
];

export function canView(role: Role, pathname: string) {
  const rule = ROUTE_RULES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : prefix + "/"));
  return rule ? rule[1].includes(role) : true;
}

export const navFor = (role: Role) => NAV.filter((n) => n.roles.includes(role));
