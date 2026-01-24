import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

// ✅ Fallback så både gamla och nya env-namn funkar
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLIC_ANON_KEY as string | undefined);

if (!supabaseUrl || !supabaseAnonKey) {
  // Gör felet tydligt direkt istället för att “inget händer”
  throw new Error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and one of: " +
      "VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PUBLIC_ANON_KEY"
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
