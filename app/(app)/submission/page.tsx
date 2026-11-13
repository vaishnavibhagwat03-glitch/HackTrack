"use client";

import { useSession } from "@/lib/session";
import { SubmissionBuilder } from "@/components/submission/SubmissionBuilder";

export default function Page() {
  const { user } = useSession();
  return user?.teamId ? <SubmissionBuilder user={user} /> : null;
}
