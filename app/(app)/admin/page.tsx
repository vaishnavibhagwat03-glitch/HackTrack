"use client";

import { useSession } from "@/lib/session";
import { AdminPanel } from "@/components/admin/AdminPanel";

export default function Page() {
  const { user } = useSession();
  return user ? <AdminPanel user={user} /> : null;
}
