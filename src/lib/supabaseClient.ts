import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly in dev rather than silently making requests that 401.
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session (Supabase's default) so a refresh — or closing
    // and reopening the tab — picks the same login back up instead of
    // forcing a fresh sign-in every time. This used to be turned off
    // deliberately, but that was never an actual requirement and mostly
    // showed up as "the app logs me out on refresh" on mobile, where
    // reloads happen more often than people realize (pull-to-refresh, the
    // browser reclaiming a backgrounded tab, etc.). Explicit "Log out"
    // still works exactly the same.
    persistSession: true,
  },
});