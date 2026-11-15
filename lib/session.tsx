"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, onWrite, setToken } from "./api";
import type { Bootstrap, User } from "./types";

// Session: the token comes from the C++ client (which caches token -> role
// in its hash table). The website keeps only the token.

type Session = {
  user: User | null;
  ready: boolean;
  boot: Bootstrap | null;
  login: (email: string, password: string) => Promise<User>;
  signup: (name: string, email: string, password: string) => Promise<User>;
  loginWithGoogle: (credential: string) => Promise<User>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
};

const Ctx = createContext<Session>({
  user: null, ready: false, boot: null,
  login: async () => { throw new Error("no session provider"); },
  signup: async () => { throw new Error("no session provider"); },
  loginWithGoogle: async () => { throw new Error("no session provider"); },
  signOut: () => {}, refreshUser: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [boot, setBoot] = useState<Bootstrap | null>(null);

  const loadBoot = useCallback(async () => {
    try { setBoot(await api<Bootstrap>("/bootstrap")); } catch {}
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getToken()) { setUser(null); return; }
    try { setUser(await api<User>("/me")); } catch (e) {
      if ((e as { status?: number }).status === 401) { setToken(null); setUser(null); }
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshUser();
      await loadBoot();
      setReady(true);
    })();
  }, [refreshUser, loadBoot]);

  // Team or role changes come back through writes; keep user + event fresh.
  useEffect(() => onWrite(() => { refreshUser(); loadBoot(); }), [refreshUser, loadBoot]);
  useEffect(() => {
    const t = setInterval(loadBoot, 15000);
    const onUnauth = () => { setToken(null); setUser(null); };
    window.addEventListener("hacktrack:unauthorized", onUnauth);
    return () => { clearInterval(t); window.removeEventListener("hacktrack:unauthorized", onUnauth); };
  }, [loadBoot]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>("/auth/login", { method: "POST", body: { email, password }, auth: false });
    setToken(r.token);
    setUser(r.user);
    loadBoot();
    return r.user;
  }, [loadBoot]);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const r = await api<{ token: string; user: User }>("/auth/signup", { method: "POST", body: { name, email, password }, auth: false });
    setToken(r.token);
    setUser(r.user);
    loadBoot();
    return r.user;
  }, [loadBoot]);

  // Google's ID token goes to the C++ client, which forwards it to the server to verify.
  const loginWithGoogle = useCallback(async (credential: string) => {
    const r = await api<{ token: string; user: User }>("/auth/google", { method: "POST", body: { credential }, auth: false });
    setToken(r.token);
    setUser(r.user);
    loadBoot();
    return r.user;
  }, [loadBoot]);

  const signOut = useCallback(() => {
    api("/auth/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    setUser(null);
    try { sessionStorage.removeItem("hacktrack.booted"); } catch {}
  }, []);

  return <Ctx.Provider value={{ user, ready, boot, login, signup, loginWithGoogle, signOut, refreshUser }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
