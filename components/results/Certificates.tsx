"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Copy, Download, Lock } from "lucide-react";
import type { User } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { cn, fmtUTC } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, Button, Skeleton } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { Certificate, type CertData } from "./Certificate";

type ApiCert = {
  id: string; type: "winner" | "participation" | "judge"; title: string; recipient: string;
  project?: string; team?: string; rank?: number; of?: number; amount?: string; reviews?: number;
};
type ApiCerts = { available: boolean; event?: string; issuedAt?: string; resultsAt?: string; certificates: ApiCert[] };

function toCert(c: ApiCert, event: string, issued: string): CertData {
  const kind = c.type === "winner" ? "ACHIEVEMENT" : c.type === "judge" ? "JUDGE RECORD" : "PARTICIPATION";
  const forLine = c.type === "judge" ? `Judging ${event}` : c.project ?? "";
  const detail = c.type === "winner" ? `${c.title}${c.amount ? ` · ${c.amount}` : ""}${c.team ? ` · team ${c.team}` : ""}`
    : c.type === "judge" ? `${c.reviews} project reviews submitted against the weighted rubric.`
    : `Built with ${c.team}${c.rank ? ` · ranked #${c.rank} of ${c.of}` : ""} at ${event}.`;
  return { kind, title: c.type === "winner" ? "Certificate of Achievement" : c.title, name: c.recipient, forLine, detail, id: c.id, issued, event };
}

export function Certificates({ user }: { user: User }) {
  const toast = useToast();
  const { boot } = useSession();
  const res = useApi<ApiCerts>("/certificates");
  const [sel, setSel] = useState(0);
  const staff = user.role === "admin";

  if (res.error) return <ErrorState body={res.error.message} onRetry={res.reload} />;
  if (!res.data || !boot) return <Skeleton className="h-[60vh]" />;
  const data = res.data;
  const issued = fmtUTC(data.issuedAt ?? boot.event.resultsAt, "date");
  const certs = data.certificates.map((c) => toCert(c, data.event ?? boot.event.name, issued));

  const header = (
    <PageHeader eyebrow="Certificates" title="Certificates"
      meta={<><span>{staff ? `${certs.length} winner certificates` : "Your certificates"}</span><span>IDs from the C++ FNV-1a hash</span><span>Issued {issued}</span></>} />
  );
  if (!data.available) {
    return (
      <>{header}
        <EmptyState code="SEALED" title="Certificates unlock with the results" body={<><Lock className="mr-1 inline size-3.5" />Results publish on {fmtUTC(data.resultsAt ?? boot.event.resultsAt)}. Your certificate is generated from the final ranking.</>} />
      </>
    );
  }
  if (!certs.length) {
    return <>{header}<EmptyState title="No certificates for this account" body={user.role === "participant" ? "Certificates go to members of teams with a submitted project." : user.role === "judge" ? "Submit at least one score to receive a judge certificate." : "No prizes have winners yet."} /></>;
  }
  const c = certs[Math.min(sel, certs.length - 1)];

  return (
    <>
      {header}
      <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
        <div>
          <AnimatePresence mode="wait">
            <motion.div key={c.id} initial={{ opacity: 0, y: 12, rotateX: 6 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} style={{ perspective: 1200 }}>
              <Certificate c={c} />
            </motion.div>
          </AnimatePresence>
          {!boot.event.resultsPublished && <p className="mt-4 flex items-center gap-2 font-mono text-[11px] text-muted"><Badge tone="warn">Preview</Badge>Admin preview: participants see certificates once results are published.</p>}
        </div>

        <aside className="space-y-4">
          <div className="space-y-2">
            <Button variant="primary" size="lg" className="w-full" onClick={() => window.print()}><Download className="size-3.5" />Download PDF</Button>
            <Button size="lg" className="w-full" onClick={async () => {
              try { await navigator.clipboard.writeText(c.id); toast({ tone: "ok", title: "Verification ID copied", body: c.id }); }
              catch { toast({ tone: "warn", title: "Clipboard unavailable", body: c.id }); }
            }}><Copy className="size-3.5" />Copy verification ID</Button>
          </div>

          {certs.length > 1 && (
            <div>
              <p className="label mb-2">{staff ? "Prize certificates" : "Your certificates"}</p>
              <ul className="space-y-1.5" role="listbox" aria-label="Certificates">
                {certs.map((x, i) => (
                  <li key={x.id} role="option" aria-selected={i === sel}>
                    <button onClick={() => setSel(i)} className={cn("w-full rounded-sm border p-3 text-left transition-colors", i === sel ? "border-accent/50 bg-accent/[0.04]" : "border-line hover:border-line-strong")}>
                      <span className="block text-[13.5px]">{x.name}</span>
                      <span className="block font-mono text-[10.5px] text-muted">{x.kind} · {x.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
