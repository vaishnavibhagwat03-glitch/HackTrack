"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, onWrite } from "./api";

/**
 * Fetch `path` from the C++ client. Refetches when `path` changes, when
 * `reload()` is called, after any write made through `api()`, and every
 * `pollMs` if given. Pass `null` to skip.
 */
export function useApi<T>(path: string | null, { pollMs, auth }: { pollMs?: number; auth?: boolean } = {}) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);

  const load = useCallback(async (quiet = false) => {
    if (!path) return;
    const id = ++seq.current;
    if (!quiet) setLoading(true);
    try {
      const d = await api<T>(path, { auth });
      if (id === seq.current) { setData(d); setError(undefined); }
    } catch (e) {
      if (id === seq.current) setError(e as Error);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [path, auth]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onWrite(() => { load(true); }), [load]);
  useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(() => load(true), pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  return { data, error, loading: loading && data === undefined, reload: () => load(), setData };
}
