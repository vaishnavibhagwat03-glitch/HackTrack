"use client";

import { useSession } from "@/lib/session";
import { Structures } from "@/components/structures/Structures";

export default function Page() {
  const { user } = useSession();
  return user ? <Structures user={user} /> : null;
}
