"use client";

import { useSession } from "@/lib/session";
import { JudgeDashboard } from "@/components/judging/JudgeDashboard";
import { JudgingOps } from "@/components/judging/JudgingOps";

export default function Page() {
  const { user } = useSession();
  if (!user) return null;
  return user.role === "judge" ? <JudgeDashboard user={user} /> : <JudgingOps />;
}
