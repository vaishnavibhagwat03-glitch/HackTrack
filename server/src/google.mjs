// "Sign in with Google": verifies the ID token Google gives the browser.
//
// The token is a JWT signed by Google with RS256. We check it ourselves with
// node:crypto (no npm packages): the signature against Google's published
// public keys, then who issued it, who it is for, when it expires, and that
// Google has verified the email address.
import { createPublicKey, verify as verifySignature } from "node:crypto";

// GOOGLE_CERTS_URL exists only for end-to-end tests that play the part of Google.
const CERTS_URL = process.env.GOOGLE_CERTS_URL || "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const REFRESH_MS = 6 * 3600e3;   // Google rotates its keys; re-read them a few times a day
const SKEW_S = 60;               // tolerate small clock differences

export class GoogleTokenError extends Error {
  constructor(reason, retry = false) {
    super(reason);
    this.reason = reason;
    this.retry = retry;  // true: our keys are not ready yet, the same token may work in a moment
  }
}

async function fetchGoogleKeys() {
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`Google keys: HTTP ${res.status}`);
  return res.json();
}

/**
 * clientId  - the OAuth client ID from Google Cloud; tokens for any other app are rejected.
 * fetchKeys - returns Google's JWKS ({ keys: [...] }); replaced in tests.
 */
export function createGoogleVerifier({ clientId, fetchKeys = fetchGoogleKeys, now = () => Date.now() } = {}) {
  let keys = new Map();  // kid -> public key
  let fetchedAt = 0;
  let loading = null;

  function refresh() {
    loading ??= fetchKeys()
      .then((jwks) => {
        keys = new Map(jwks.keys.filter((k) => k.kty === "RSA").map((k) => [k.kid, createPublicKey({ key: k, format: "jwk" })]));
        fetchedAt = now();
      })
      .catch((e) => console.error(`Could not load Google sign-in keys: ${e.message}`))
      .finally(() => { loading = null; });
    return loading;
  }

  const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

  function verify(idToken) {
    const parts = String(idToken).split(".");
    if (parts.length !== 3) throw new GoogleTokenError("Malformed token");
    let header, payload;
    try { header = decode(parts[0]); payload = decode(parts[1]); } catch { throw new GoogleTokenError("Malformed token"); }
    if (header.alg !== "RS256") throw new GoogleTokenError("Unexpected algorithm");

    if (now() - fetchedAt > REFRESH_MS) refresh();
    const key = keys.get(header.kid);
    if (!key) {
      // Keys missing or just rotated: fetch them and let the caller retry,
      // unless we already have a fresh set (then the kid is simply not Google's).
      const fresh = keys.size && now() - fetchedAt < 5 * 60e3;
      if (!fresh) refresh();
      throw new GoogleTokenError(fresh ? "Unknown signing key" : "Google keys not loaded yet", !fresh);
    }
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    if (!verifySignature("RSA-SHA256", signed, key, Buffer.from(parts[2], "base64url")))
      throw new GoogleTokenError("Bad signature");

    const t = now() / 1000;
    if (!ISSUERS.has(payload.iss)) throw new GoogleTokenError("Not issued by Google");
    if (payload.aud !== clientId) throw new GoogleTokenError("Token is for a different app");
    if (!(payload.exp > t - SKEW_S)) throw new GoogleTokenError("Token expired");
    if (payload.iat && payload.iat > t + SKEW_S) throw new GoogleTokenError("Token issued in the future");
    if (!payload.email || !(payload.email_verified === true || payload.email_verified === "true"))
      throw new GoogleTokenError("Google has not verified this email address");

    return { sub: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name ?? "") };
  }

  return { enabled: Boolean(clientId), ready: refresh, verify };
}
