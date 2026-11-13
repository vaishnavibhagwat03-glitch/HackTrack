"use client";

import { use } from "react";
import { useSession } from "@/lib/session";
import { JudgingSession } from "@/components/judging/JudgingSession";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useSession();
  return user?.judgeId ? <JudgingSession key={id} projectId={Number(id)} user={user} /> : null;
}
