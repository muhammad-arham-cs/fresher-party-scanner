import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Create a Supabase browser client (anon key, respects RLS).
 * Call this inside components/hooks, never at module level.
 */
export function createBrowserClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
  return createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Create a Supabase admin client (service role key, bypasses RLS).
 * Only use in API routes and server components — never expose to client.
 */
export function createAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Lazy Supabase client proxy for convenience:
 * Uses admin client on server (Node.js) and browser client in browser.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = typeof window === 'undefined' ? createAdminClient() : createBrowserClient();
    const val = (client as unknown as Record<string, unknown>)[prop as string];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});
