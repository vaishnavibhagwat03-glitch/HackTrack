"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { EventGrid } from "@/components/ui/EventGrid";
import { Avatar, Badge, Button, Field, StatusDot, fieldClass } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { GoogleButton, googleSignInEnabled } from "./GoogleButton";

// Seeded demo accounts (server/src/seed.mjs).
type DemoAccount = { name: string; email: string; password: string; role: Role; blurb: string };
const DEMO = ([
  { name: "Vaishnavi Bhagwat", email: "participant@hacktrack.dev", password: "participant123", role: "participant", blurb: "Team Void Runners · draft submission, voting" },
  { name: "Rohan Kulkarni", email: "solo@hacktrack.dev", password: "participant123", role: "participant", blurb: "No team yet · create or join with an invite code" },
  { name: "Lena Brandt", email: "judge@hacktrack.dev", password: "judge123", role: "judge", blurb: "Judging queue with the rubric's sub-criteria" },
  { name: "Sumit Bansode", email: "admin@hacktrack.dev", password: "admin123", role: "admin", blurb: "Judge assignment, conflicts, undo, results" },
  // Public deployments give the admin a private password, so its one-click card is hidden there.
] satisfies DemoAccount[]).filter((u: DemoAccount) => !(u.role === "admin" && process.env.NEXT_PUBLIC_HIDE_ADMIN_DEMO === "1"));

export function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, signup, loginWithGoogle, boot } = useSession();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [googleError, setGoogleError] = useState<string>();
  const [pending, setPending] = useState<string | null>(null);

  const go = () => {
    const next = params.get("next");
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
  };

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setPending(key);
    setError(undefined);
    setGoogleError(undefined);
    try {
      await fn();
      go();
    } catch (e) {
      (key === "google" ? setGoogleError : setError)(errorMessage(e));
      setPending(null);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") run("form", () => login(email.trim(), password));
    else run("form", () => signup(name.trim(), email.trim(), password));
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-line bg-[#070708] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <EventGrid cells={24} seed={11} />
        <Link href="/" className="relative"><Logo /></Link>
        <div className="relative">
          <p className="label mb-6 flex items-center gap-2"><StatusDot tone="ok" pulse />{boot?.event.name ?? "HackTrack"} · LIVE</p>
          <h1 className="text-[clamp(3rem,6vw,5.5rem)] font-semibold leading-[0.88] tracking-[-0.045em]">
            Welcome to<br />the control<br />room<span className="text-accent">.</span>
          </h1>
        </div>
        <dl className="relative grid grid-cols-3 gap-6 border-t border-line pt-6 font-mono text-[11px]">
          <div><dt className="label">Website</dt><dd className="mt-1 text-fg-2">Next.js</dd></div>
          <div><dt className="label">Client</dt><dd className="mt-1 text-fg-2">C++17 · own DS</dd></div>
          <div><dt className="label">Server</dt><dd className="mt-1 text-fg-2">Node · SQLite</dd></div>
        </dl>
      </section>

      <section className="flex flex-col justify-center px-5 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-[440px]">
          <Link href="/" className="mb-12 inline-block lg:hidden"><Logo /></Link>
          <p className="label">{mode === "login" ? "Authentication" : "New participant"}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">{mode === "login" ? "Sign in to HackTrack" : "Create your account"}</h2>
          <p className="mt-2 text-[14px] text-muted">
            The C++ client checks your password with the server and keeps your session token and role in its hash table.
          </p>

          {googleSignInEnabled && (
            <div className="mt-8">
              <GoogleButton busy={!!pending} onCredential={(c) => run("google", () => loginWithGoogle(c))} />
              {pending === "google" && <p className="mt-2 flex items-center justify-center gap-2 text-[13px] text-muted"><Loader2 className="size-3.5 animate-spin" />Checking with Google through the C++ client…</p>}
              {googleError && <p role="alert" className="mt-2 text-center text-[13px] text-danger">{googleError}</p>}
              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="label">or with email</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className={cn(googleSignInEnabled ? "mt-6" : "mt-8", "space-y-4")} noValidate>
            {mode === "signup" && (
              <Field label="Full name" htmlFor="name">
                <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={cn(fieldClass, "h-11")} placeholder="Your name" />
              </Field>
            )}
            <Field label="Email" htmlFor="email" error={error}>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!error} aria-describedby={error ? "email-error" : undefined}
                className={cn(fieldClass, "h-11")} placeholder="you@college.edu" />
            </Field>
            <Field label="Password" htmlFor="password" hint={mode === "signup" ? "6+ characters" : undefined}>
              <input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password}
                onChange={(e) => setPassword(e.target.value)} className={cn(fieldClass, "h-11")} placeholder="••••••••" />
            </Field>
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!!pending}>
              {pending === "form" ? <Loader2 className="size-3.5 animate-spin" /> : <>{mode === "login" ? "Sign in" : "Create account"} <ArrowRight className="size-3.5" /></>}
            </Button>
            <p className="text-center text-[13px] text-muted">
              {mode === "login" ? "New here? " : "Already have an account? "}
              <button type="button" className="text-accent hover:underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(undefined); }}>
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </form>

          <div className="my-8 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="label">Demo accounts · seeded</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <ul className="space-y-2">
            {DEMO.map((u, i) => (
              <motion.li key={u.email} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
                <button onClick={() => run(u.email, () => login(u.email, u.password))} disabled={!!pending}
                  className="group flex w-full items-center gap-3 rounded-sm border border-line bg-white/[0.015] p-3 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.03] disabled:opacity-50">
                  <Avatar initials={u.name.split(" ").map((s) => s[0]).join("")} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="text-[14px] text-fg">{u.name}</span><Badge tone="accent">{ROLE_LABEL[u.role]}</Badge></span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">{u.blurb}</span>
                  </span>
                  {pending === u.email ? <Loader2 className="size-4 animate-spin text-accent" /> : <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />}
                </button>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
