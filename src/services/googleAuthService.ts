import { loadScript } from "./scriptLoader";

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
// drive.file only covers files the app created or that were explicitly
// opened through the Picker — a folder link just pasted in (never picked)
// is invisible to it, so files.list silently returns zero results rather
// than erroring. drive.readonly is what batch import (googleDriveService's
// importBillsFromFolder) needs to list and download arbitrary pre-existing
// files in a folder the user merely has read access to.
const SCOPES =
  "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly";

// _v2: bumped alongside the SCOPES change above so a token cached under the
// old (narrower) scope set from an earlier session is never silently
// reused — an old key here would look "valid" (unexpired) while still
// lacking drive.readonly, reproducing the exact empty-result bug this fixes.
const TOKEN_STORAGE_KEY = "energybae_google_access_token_v2";
const TOKEN_EXPIRY_STORAGE_KEY = "energybae_google_token_expiry_v2";

// Minimal shape of the Google Identity Services API we rely on — the full
// type definitions ship only via @types packages we don't depend on.
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
            error_callback?: (err: any) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
        // The Sign In With Google identity flow — a different GIS API
        // surface than oauth2 above, used by LoginScreen.tsx for app login
        // (issues a verifiable ID token) rather than Drive/Sheets access
        // tokens. Declared here too since TS global augmentations must
        // agree on Window.google's full shape across every file.
        id: {
          initialize: (config: { client_id: string; callback: (resp: { credential: string }) => void }) => void;
          renderButton: (
            parent: HTMLElement,
            options: { theme?: string; size?: string; width?: number; shape?: string; text?: string }
          ) => void;
          // Triggers the One Tap / Sign In With Google prompt programmatically —
          // used by LoginScreen.tsx's custom-styled button instead of the
          // auto-rendered one. The notification lets us detect Google silently
          // suppressing the prompt (e.g. previously dismissed) instead of
          // failing with no feedback.
          prompt: (momentListener?: (notification: {
            isNotDisplayed: () => boolean;
            isSkippedMoment: () => boolean;
          }) => void) => void;
        };
      };
    };
  }
}

let tokenClient: TokenClient | null = null;

function getClientId(): string {
  const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "Google authentication failed."
    );
  }
  return clientId;
}

async function ensureTokenClient(): Promise<TokenClient> {
  if (tokenClient) return tokenClient;
  await loadScript(GIS_SCRIPT_URL);
  if (!window.google) {
    throw new Error("Google authentication failed.");
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: getClientId(),
    scope: SCOPES,
    callback: () => {}, // overridden per-request in getAccessToken()
  });
  return tokenClient;
}

function readStoredToken(): string | null {
  const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  const expiry = Number(sessionStorage.getItem(TOKEN_EXPIRY_STORAGE_KEY) || 0);
  if (token && Date.now() < expiry) return token;
  return null;
}

function storeToken(token: string, expiresInSeconds: number) {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  // Subtract a small buffer so we refresh slightly before actual expiry.
  sessionStorage.setItem(TOKEN_EXPIRY_STORAGE_KEY, String(Date.now() + (expiresInSeconds - 60) * 1000));
}

// Returns a valid access token, reusing the cached one if still valid.
// Otherwise prompts the user (silently if a prior consent exists, via popup if not).
export async function getAccessToken(forcePrompt = false): Promise<string> {
  if (!forcePrompt) {
    const cached = readStoredToken();
    if (cached) return cached;
  }

  const client = await ensureTokenClient();

  return new Promise<string>((resolve, reject) => {
    (client as any).callback = (resp: TokenResponse) => {
      if (resp.error || !resp.access_token) {
        reject(new Error("Google authentication failed."));
        return;
      }
      storeToken(resp.access_token, resp.expires_in || 3600);
      resolve(resp.access_token);
    };
    try {
      client.requestAccessToken({ prompt: forcePrompt ? "consent" : "" });
    } catch {
      reject(new Error("Google authentication failed."));
    }
  });
}

export function isSignedIn(): boolean {
  return readStoredToken() !== null;
}

export function signOut() {
  const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
  if (token && window.google) {
    window.google.accounts.oauth2.revoke(token);
  }
}
