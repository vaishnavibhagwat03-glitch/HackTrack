"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { DEMO_USERS, EVENT } from "@/lib/data";
import { ROLE_LABEL } from "@/lib/rbac";
import { useSession } from "@/lib/session";
import { Logo } from "@/components/ui/Logo";
import { EventGrid } from "@/components/ui/EventGrid";
import { Avatar, Badge, Button, Field, StatusDot, fieldClass } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const ROLE_BLURB = {
  participant: "Team workspace, submission builder, gallery",
  judge: "Focused judging queue with keyboard scoring",
  organizer: "Event control room, analytics, exports",
  admin: "Everything, plus roles, API and system",
} as const;

export function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string | null>(null);

  const enter = (id: string) => {
    setPending(id);
    setTimeout(() => {
      signIn(id);
      const next = params.get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    }, 450);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = DEMO_USERS.find((d) => d.email.toLowerCase() === email.trim().toLowerCase());
    if (!u || password.length < 4) {
      setError("Email or password is incorrect.");
      return;
    }
    setError(undefined);
    enter(u.id);
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-line bg-[#070708] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <EventGrid cells={24} seed={11} />
        <Link href="/" className="relative"><Logo /></Link>
        <div className="relative">
          <p className="label mb-6 flex items-center gap-2"><StatusDot tone="ok" pulse />{EVENT.id} · LIVE</p>
          <h1 className="text-[clamp(3rem,6vw,5.5rem)] font-semibold leading-[0.88] tracking-[-0.045em]">
            Welcome to<br />the control<br />room<span className="text-accent">.</span>
          </h1>
        </div>
        <dl className="relative grid grid-cols-3 gap-6 border-t border-line pt-6 font-mono text-[11px]">
          <div><dt className="label">Instance</dt><dd className="mt-1 text-fg-2">{EVENT.instance}</dd></div>
          <div><dt className="label">Version</dt><dd className="mt-1 text-fg-2">{EVENT.version}</dd></div>
          <div><dt className="label">Data</dt><dd className="mt-1 text-fg-2">On this machine</dd></div>
        </dl>
      </section>

      <section className="flex flex-col justify-center px-5 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-[440px]">
          <Link href="/" className="mb-12 inline-block lg:hidden"><Logo /></Link>
          <p className="label">Authentication</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Sign in to Dogfood</h2>
          <p className="mt-2 text-[14px] text-muted">Accounts are stored on this instance. Nothing leaves your network.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <Field label="Email" htmlFor="email" error={error}>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!error} aria-describedby={error ? "email-error" : undefined}
                className={cn(fieldClass, "h-11")} placeholder="you@team.dev" />
            </Field>
            <Field label="Password" htmlFor="password">
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                className={cn(fieldClass, "h-11")} placeholder="••••••••" />
            </Field>
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!!pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <>Sign in <ArrowRight className="size-3.5" /></>}
            </Button>
          </form>

          <div className="my-8 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="label">Demo accounts · local seed</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <ul className="space-y-2">
            {DEMO_USERS.map((u, i) => (
              <motion.li key={u.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
                <button onClick={() => enter(u.id)} disabled={!!pending}
                  className="group flex w-full items-center gap-3 rounded-sm border border-line bg-white/[0.015] p-3 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.03] disabled:opacity-50">
                  <Avatar initials={u.name.split(" ").map((s) => s[0]).join("")} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="text-[14px] text-fg">{u.name}</span><Badge tone="accent">{ROLE_LABEL[u.role]}</Badge></span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">{ROLE_BLURB[u.role]}</span>
                  </span>
                  {pending === u.id ? <Loader2 className="size-4 animate-spin text-accent" /> : <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />}
                </button>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
