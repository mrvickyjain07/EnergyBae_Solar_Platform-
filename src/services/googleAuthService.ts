import { loadScript } from "./scriptLoader";

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file";

const TOKEN_STORAGE_KEY = "energybae_google_access_token";
const TOKEN_EXPIRY_STORAGE_KEY = "energybae_google_token_expiry";

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
