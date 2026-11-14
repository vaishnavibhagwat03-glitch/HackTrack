"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { pad } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { Magnetic, StatusDot, buttonClass } from "@/components/ui/primitives";

const ease = [0.16, 1, 0.3, 1] as const;

export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-bg/60 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-5 md:px-10">
        <Link href="/" aria-label="HackTrack home"><Logo /></Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 font-mono text-[11px] uppercase tracking-[0.1em] text-muted md:flex">
          <Link href="/gallery" className="hover:text-fg">Projects</Link>
          <Link href="/#features" className="hover:text-fg">Features</Link>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden items-center gap-2 font-mono text-[10.5px] tracking-[0.1em] text-fg-2 sm:flex"><StatusDot tone="ok" pulse />C++ CLIENT</span>
          <Link href="/signin" className={buttonClass("secondary", "sm")}>Sign in</Link>
        </div>
      </div>
    </header>
  );
}

const TIERS = [
  { t: "01", name: "Participants", items: ["Sign up and log in with a token", "Create a team or join with an invite code", "One team per participant", "Submission builder with autosave", "Deadline checked before sending", "Community voting (3 votes)"] },
  { t: "02", name: "Judges", items: ["Queue assigned round-robin", "No conflicts of interest, ever", "Rubric with sub-criteria", "Weighted score computed in C++", "Edit scores while judging is open", "Score range validated before sending"] },
  { t: "03", name: "Admins", items: ["Conflict-free judge assignment", "Conflict graph manager", "Undo for every admin change", "Max-heap leaderboard and prizes", "Publish results and certificates", "Audit ledger and CSV exports"] },
];

export function Capabilities() {
  return (
    <section className="border-b border-line px-5 py-24 md:px-10 md:py-32">
      <div className="mx-auto grid max-w-[1600px] gap-12 lg:grid-cols-[360px_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="label">FIG. 07 — FEATURES</p>
          <h2 className="mt-4 text-[clamp(2.2rem,4.5vw,3.75rem)] font-semibold leading-[0.9] tracking-[-0.045em]">Every role.<br />Covered.</h2>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-fg-2">From event creation to a ranked leaderboard, for admins, participants and judges.</p>
        </div>
        <div className="grid border-l border-t border-line md:grid-cols-3">
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
