// The website talks ONLY to the HackTrack C++ client (bridge mode).
// It never contacts the Node server or the database directly.

export const API_BASE = (process.env.NEXT_PUBLIC_HACKTRACK_API ?? "http://localhost:8080/api").replace(/\/$/, "");
const TOKEN_KEY = "hacktrack.token";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

/** Mutation listeners: after any successful write, open views refetch. */
const writeListeners = new Set<() => void>();
export const onWrite = (fn: () => void) => { writeListeners.add(fn); return () => { writeListeners.delete(fn); }; };

export async function api<T = unknown>(path: string, opts: { method?: Method; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {};
  const token = opts.auth === false ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), cache: "no-store" });
  } catch {
    throw new ApiError(0, "ClientUnreachable", "The HackTrack C++ client is not running. Start it with: hacktrack --bridge");
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string };
    if (res.status === 401 && token && path !== "/auth/login") window.dispatchEvent(new Event("hacktrack:unauthorized"));
    throw new ApiError(res.status, d.error ?? "Error", d.message ?? `Request failed (${res.status})`);
  }
  if (method !== "GET") writeListeners.forEach((l) => l());
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
