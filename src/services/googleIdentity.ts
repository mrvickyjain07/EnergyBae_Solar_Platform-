// src/services/googleIdentity.ts
// Verifies "Sign In With Google" ID tokens (login) — distinct from
// googleAuthService.ts, which is the client-side Drive/Sheets OAuth ACCESS
// token flow (google.accounts.oauth2). This is the sibling google.accounts.id
// identity flow: the browser gets a Google-signed (RS256) ID token, and this
// module is the one place that verifies it server-side.
//
// Uses google-auth-library rather than hand-rolling verification: RS256
// against Google's rotating public keys (JWKS fetch/cache/rotation, aud/iss/
// exp checks) is a trust-boundary security task, unlike our own self-signed
// session token in authService.ts where we're both signer and verifier.
import { OAuth2Client } from "google-auth-library";

let client: OAuth2Client | null = null;
function getClient(): OAuth2Client {
  if (!client) client = new OAuth2Client();
  return client;
}

function getClientId(): string {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("VITE_GOOGLE_CLIENT_ID not set — check .env.local");
  return clientId;
}

export interface GoogleIdentity {
  email: string;
  name: string;
}

// Returns null on any verification failure (expired, wrong audience, bad
// signature, unverified email) rather than throwing, so callers can
// uniformly treat "not a valid Google identity" as one case.
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity | null> {
  try {
    const ticket = await getClient().verifyIdToken({ idToken, audience: getClientId() });
    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.email_verified) return null;
    return { email: payload.email, name: payload.name || payload.email };
  } catch {
    return null;
  }
}
