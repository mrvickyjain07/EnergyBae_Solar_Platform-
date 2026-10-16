import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only client (uses the secret key — full bypass-RLS access).
// Never import this from a React component; only server.ts / route modules.
let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY not set — check .env.local");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
