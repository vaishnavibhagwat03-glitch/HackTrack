"use client";

import { useSession } from "@/lib/session";
import { TeamWorkspace, TeamsTable } from "@/components/teams/TeamWorkspace";

export default function Page() {
  const { user } = useSession();
  if (!user) return null;
  return user.role === "participant" ? <TeamWorkspace user={user} /> : <TeamsTable />;
}
