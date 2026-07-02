import { createClient } from "@supabase/supabase-js";

/**
 * Read-only browser/server client (anon key). Row-level security governs what
 * this can see. Used by server components for the public, mostly-read pages.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local."
    );
  }
  return createClient(url, anon, { auth: { persistSession: false } });
}
