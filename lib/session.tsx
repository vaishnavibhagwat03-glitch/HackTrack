"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEMO_USERS, type User } from "./data";

// Local demo session. A real deployment uses an HTTP-only session cookie
// issued by the self-hosted auth service; this only mirrors "who am I".

type Session = { user: User | null; ready: boolean; signIn: (id: string) => void; signOut: () => void };
const Ctx = createContext<Session>({ user: null, ready: false, signIn: () => {}, signOut: () => {} });
const KEY = "dogfood.session";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const id = localStorage.getItem(KEY);
      setUser(DEMO_USERS.find((u) => u.id === id) ?? null);
    } catch {}
    setReady(true);
  }, []);

  const signIn = useCallback((id: string) => {
    setUser(DEMO_USERS.find((u) => u.id === id) ?? null);
    try { localStorage.setItem(KEY, id); } catch {}
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    try { localStorage.removeItem(KEY); sessionStorage.removeItem("dogfood.booted"); } catch {}
  }, []);

  return <Ctx.Provider value={{ user, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
