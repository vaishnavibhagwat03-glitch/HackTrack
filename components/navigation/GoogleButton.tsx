"use client";

import { useEffect, useRef, useState } from "react";

// "Sign in with Google" button from Google Identity Services. Google opens its
// own popup, then hands us an ID token ("credential"). We pass it to the C++
// client like any other login; the server verifies it.
//
// Shown only when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set at build time.

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
export const googleSignInEnabled = CLIENT_ID.length > 0;

type GsiButtonOptions = { theme: string; size: string; shape: string; text: string; width: number; logo_alignment: string };
type Gsi = {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode: "popup"; auto_select: boolean; cancel_on_tap_outside: boolean }): void;
      renderButton(el: HTMLElement, o: GsiButtonOptions): void;
    };
  };
};
declare global { interface Window { google?: Gsi } }

let script: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { script = null; reject(new Error("Could not load Google sign-in")); };
    document.head.appendChild(s);
  });
  return script;
}

export function GoogleButton({ onCredential, busy }: { onCredential: (credential: string) => void; busy?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [failed, setFailed] = useState(false);
  useEffect(() => { callback.current = onCredential; });

  useEffect(() => {
    if (!googleSignInEnabled) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        const el = box.current;
        if (cancelled || !el || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (r) => callback.current(r.credential),
          ux_mode: "popup",
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        // Google's button accepts widths from 200 to 400 px.
        const width = Math.max(200, Math.min(400, Math.floor(el.getBoundingClientRect().width)));
        window.google.accounts.id.renderButton(el, { theme: "filled_black", size: "large", shape: "rectangular", text: "continue_with", width, logo_alignment: "center" });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, []);

  if (!googleSignInEnabled) return null;
  if (failed) return <p className="text-center text-[13px] text-muted">Google sign-in could not load. Use your email and password instead.</p>;
  return (
    <div aria-busy={busy} className={busy ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}>
      {/* Google's button is an iframe; on a dark page the browser paints it a white
          backdrop unless its container uses the light colour scheme. */}
      <div ref={box} className="flex min-h-11 w-full justify-center [color-scheme:light]" />
    </div>
  );
}
