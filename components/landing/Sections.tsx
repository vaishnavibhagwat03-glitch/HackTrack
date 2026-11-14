"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import type { Bootstrap, Project } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { pad } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { Counter } from "@/components/ui/Counter";
import { Magnetic, StatusDot, Ticks, buttonClass } from "@/components/ui/primitives";

const ease = [0.16, 1, 0.3, 1] as const;

export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-bg/60 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-5 md:px-10">
        <Link href="/" aria-label="HackTrack home"><Logo /></Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 font-mono text-[11px] uppercase tracking-[0.1em] text-muted md:flex">
          <Link href="/gallery" className="hover:text-fg">Projects</Link>
          <Link href="/#platform" className="hover:text-fg">Architecture</Link>
          <Link href="/#self-host" className="hover:text-fg">Run it</Link>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden items-center gap-2 font-mono text-[10.5px] tracking-[0.1em] text-fg-2 sm:flex"><StatusDot tone="ok" pulse />C++ CLIENT</span>
          <Link href="/signin" className={buttonClass("secondary", "sm")}>Sign in</Link>
        </div>
      </div>
    </header>
  );
}

const LAYERS = [
  { k: "WEBSITE", t: "Next.js · React", d: "The only user interface. Shows data and collects input; it does no ranking, sorting, assignment or validation of its own.", port: ":3000" },
  { k: "C++ CLIENT", t: "C++17 · own data structures", d: "Every request passes through here. Caches, sorts, searches, assigns judges, ranks projects, retries failed requests and undoes admin changes.", port: ":8080", accent: true },
  { k: "SERVER", t: "Node.js", d: "Applies the rules (roles, deadline, one team per participant, score range, conflicts) and talks to the database.", port: ":4000" },
  { k: "DATABASE", t: "SQLite", d: "Stores users, teams, projects, assignments, scores, votes and the audit ledger permanently.", port: "file" },
];

const UNITS = [
  ["Arrays", "Dynamic array · sparse matrix (judge × project) · 4 sorts · linear & binary search"],
  ["Linked lists", "Singly (team members) · circular (judge rotation) · generalized (rubric)"],
  ["Stack & queue", "Request queue with 3 retries · undo stack of reverse requests"],
  ["Trees", "BST (project by id) · max-heap (leaderboard, people's choice)"],
  ["Graphs", "Judge–team conflict graph · adjacency matrix + lists · BFS, DFS"],
  ["Hashing", "Chaining (sessions, users, projects) · linear probing (invite codes)"],
];

/** Architecture: website → C++ client → server → database, with live counts. */
export function Architecture() {
  const boot = useApi<Bootstrap>("/bootstrap", { auth: false });
  const projects = useApi<{ projects: Project[]; sort: { algorithm: string; comparisons: number } }>("/projects?sort=name", { auth: false });
  const online = !!boot.data;
  const c = boot.data?.counts;

  return (
    <section className="relative overflow-hidden px-5 py-24 md:px-10 md:py-32">
      <div className="mx-auto max-w-[1600px]">
        <div className="grid gap-8 md:grid-cols-2 md:items-end">
          <div>
            <p className="label">FIG. 07 — ARCHITECTURE</p>
            <h2 className="mt-4 text-[clamp(2.4rem,6vw,5.5rem)] font-semibold leading-[0.88] tracking-[-0.05em]">A C++ client<br />in the middle<span className="text-accent">.</span></h2>
          </div>
          <p className="max-w-md text-[16px] leading-relaxed text-fg-2 md:justify-self-end">
            The website never talks to the server. Every click goes to the HackTrack C++ client, which does the work with
            hand-written data structures and speaks HTTP/JSON to the server.
          </p>
        </div>

        <ol className="mt-14 grid gap-px overflow-hidden rounded-md border border-line bg-line lg:grid-cols-4">
          {LAYERS.map((l, i) => (
            <motion.li key={l.k} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.1, ease }}
              className={l.accent ? "relative bg-accent/[0.06] p-6" : "relative bg-surface p-6"}>
              {l.accent && <Ticks />}
              <div className="flex items-baseline justify-between">
                <span className={l.accent ? "font-mono text-[11px] tracking-[0.14em] text-accent" : "font-mono text-[11px] tracking-[0.14em] text-fg-2"}>{pad(i + 1, 2)} · {l.k}</span>
                <span className="font-mono text-[10px] text-muted">{l.port}</span>
              </div>
              <p className="mt-4 text-xl font-semibold tracking-tight">{l.t}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">{l.d}</p>
              {i < LAYERS.length - 1 && <ArrowRight aria-hidden className="absolute -right-2 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-accent lg:block" />}
            </motion.li>
          ))}
        </ol>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-md border border-line bg-surface/70 p-6">
            <p className="label flex items-center gap-2"><StatusDot tone={online ? "ok" : "danger"} pulse={online} />{online ? "Live from the C++ client right now" : "C++ client not running"}</p>
            <dl className="mt-5 grid grid-cols-3 border-l border-t border-line">
              {[["PROJECTS", c?.projects ?? 0], ["SUBMITTED", c?.submitted ?? 0], ["TEAMS", c?.teams ?? 0]].map(([k, v]) => (
                <div key={k as string} className="border-b border-r border-line p-4">
                  <dt className="label">{k}</dt>
                  <dd className="mt-2 text-3xl font-semibold tracking-tight"><Counter value={v as number} /></dd>
                </div>
              ))}
            </dl>
            {projects.data && (
              <p className="mt-4 font-mono text-[11px] text-muted">
                Gallery sorted by C++ {projects.data.sort.algorithm} · {projects.data.sort.comparisons} comparisons
              </p>
            )}
            <Link href="/gallery" className={buttonClass("secondary", "md", "mt-5")}>Open the project gallery <ArrowRight className="size-3.5" /></Link>
          </div>
          <ul className="grid border-l border-t border-line sm:grid-cols-2">
            {UNITS.map(([u, d], i) => (
              <motion.li key={u} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                className="border-b border-r border-line p-5">
                <p className="font-mono text-[10.5px] tracking-[0.12em] text-accent">UNIT {i + 1}</p>
                <p className="mt-1 text-[16px] font-medium">{u}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{d}</p>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const TIERS = [
  { t: "01", name: "Participants", items: ["Sign up and log in with a token", "Create a team or join with an invite code", "One team per participant", "Submission builder with autosave", "Deadline checked before sending", "Community voting (3 votes)"] },
  { t: "02", name: "Judges", items: ["Queue assigned round-robin", "No conflicts of interest, ever", "Rubric with sub-criteria", "Weighted score computed in C++", "Edit scores while judging is open", "Score range validated before sending"] },
  { t: "03", name: "Admins", items: ["Conflict-free judge assignment", "Conflict graph manager", "Undo for every admin change", "Max-heap leaderboard and prizes", "Publish results and certificates", "Audit ledger and CSV exports"] },
  { t: "04", name: "Under the hood", items: ["Request queue with 3 retries", "Session cache in a hash table", "BST project lookup", "Live data-structure inspector", "Sort & search benchmark", "Protocol trace of every request"] },
];

export function Capabilities() {
  return (
    <section className="border-b border-line px-5 py-24 md:px-10 md:py-32">
      <div className="mx-auto grid max-w-[1600px] gap-12 lg:grid-cols-[360px_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="label">FIG. 08 — FEATURES</p>
          <h2 className="mt-4 text-[clamp(2.2rem,4.5vw,3.75rem)] font-semibold leading-[0.9] tracking-[-0.045em]">Every role.<br />Covered.</h2>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-fg-2">From event creation to a ranked leaderboard, for admins, participants and judges.</p>
        </div>
        <div className="grid border-l border-t border-line sm:grid-cols-2">
          {TIERS.map((tier, i) => (
            <motion.div key={tier.t} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, delay: i * 0.08, ease }} className="group relative border-b border-r border-line p-6 md:p-8">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-5xl font-semibold tracking-tight text-fg transition-colors group-hover:text-accent">{tier.t}</span>
                <span className="label">{pad(tier.items.length, 2)} FEATURES</span>
              </div>
              <p className="mt-3 text-lg font-medium">{tier.name}</p>
              <ul className="mt-5 space-y-2">
                {tier.items.map((it) => (
                  <li key={it} className="flex items-start gap-2.5 text-[14px] text-fg-2"><Check className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={2.5} />{it}</li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TERMINAL = [
  ["$", "cd server && npm start", "text-ink"],
  ["", "✓ HackTrack server   127.0.0.1:4000   SQLite", "text-ink/60"],
  ["$", "hacktrack --bridge", "text-ink"],
  ["", "✓ C++ client         localhost:8080   own DS", "text-ink/60"],
  ["$", "npm run dev", "text-ink"],
  ["", "✓ website            localhost:3000", "text-ink/60"],
  ["→", "http://localhost:3000", "text-[#c93c0b]"],
];

export function SelfHosted() {
  return (
    <section id="self-host" className="grain relative bg-paper px-5 py-24 text-ink md:px-10 md:py-32">
      <div className="mx-auto grid max-w-[1600px] gap-14 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/50">FIG. 09 — RUN IT</p>
          <h2 className="mt-4 text-[clamp(2.6rem,6vw,5.5rem)] font-semibold leading-[0.86] tracking-[-0.05em]">Three processes.<br />One machine.</h2>
          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-ink/70">
            The server, the C++ client and the website all run locally. <span className="font-mono">start-all</span> launches them together.
          </p>
          <dl className="mt-10 grid grid-cols-2 gap-px border border-ink/15 bg-ink/15 sm:grid-cols-4">
            {[["6", "DS units"], ["0", "STL containers"], ["3", "Roles"], ["1", "Data file"]].map(([v, k]) => (
              <div key={k} className="bg-paper p-4">
                <dd className="text-3xl font-semibold tracking-tight">{v}</dd>
                <dt className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink/50">{k}</dt>
              </div>
            ))}
          </dl>
        </div>
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, ease }}
          className="rounded-md border border-ink/15 bg-paper-2 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.35)]">
          <div className="flex h-9 items-center gap-2 border-b border-ink/10 px-4">
            {[0, 1, 2].map((i) => <span key={i} className="size-2 rounded-full bg-ink/20" />)}
            <span className="ml-3 font-mono text-[10.5px] text-ink/50">~/hacktrack</span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-7 md:p-7 md:text-[13.5px]">
            {TERMINAL.map(([p, cmd, c], i) => (
              <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.18 }} className={c}>
                <span className="mr-3 select-none text-ink/40">{p || " "}</span>{cmd}
              </motion.div>
            ))}
          </pre>
        </motion.div>
      </div>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden px-5 py-28 md:px-10 md:py-40">
      <div className="event-grid fade-mask-radial absolute inset-0" aria-hidden />
      <div className="relative mx-auto flex max-w-[1600px] flex-col items-start gap-10 md:flex-row md:items-end md:justify-between">
        <h2 className="text-[clamp(3rem,9vw,8.5rem)] font-semibold leading-[0.85] tracking-[-0.055em]">Build.<br />Submit.<br /><span className="text-accent">Judge.</span></h2>
        <Magnetic>
          <Link href="/signin" className={buttonClass("primary", "lg", "h-14 px-8")}>Enter HackTrack <ArrowRight className="size-4" /></Link>
        </Magnetic>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line px-5 py-8 md:px-10">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted md:flex-row md:items-center md:justify-between">
        <Logo />
        <span>Data Structures course project · VIT Pune · 2026–27</span>
        <span className="flex items-center gap-2"><StatusDot tone="ok" />Website → C++ client → server</span>
      </div>
    </footer>
  );
}
