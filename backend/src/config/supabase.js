import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

const clientOptions = {
  auth: {
    // The API is stateless: sessions are returned to the client explicitly.
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

// Admin/database client. The SERVICE ROLE key bypasses Row Level Security and is
// used ONLY on the backend. It must never be exposed to the frontend.
//
// IMPORTANT: this client must never sign a user in. supabase-js remembers the
// session on the client instance, and after a sign-in PostgREST requests would
// use the user's JWT instead of the service-role key. With RLS enabled and no
// policies, the user's JWT can see nothing, so every query would silently return
// zero rows.
export const supabase = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  clientOptions,
);

// Separate client for password sign-in / token refresh / token verification.
// It uses the anon key and is allowed to hold a user session. Keeping its
// session state away from `supabase` is what keeps the admin client privileged.
export const authClient = createClient(env.supabaseUrl, env.supabaseAnonKey, clientOptions);
