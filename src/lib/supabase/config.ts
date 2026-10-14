export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const isSupabaseConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);
/** Demo mode runs on a local file store when Supabase is not configured. It is refused in
 *  production unless explicitly allowed, so a misconfigured deployment never runs unauthenticated. */
export const isDemoMode = () => !isSupabaseConfigured();
export const demoModeAllowed = () => process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_MODE === "true";
