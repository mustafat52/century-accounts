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
    // Don't persist the session to localStorage — every fresh open of the
    // app (new tab, browser restart, etc.) should land on /login rather
    // than silently restoring a previous login. Session still works
    // normally for as long as this tab/page stays open.
    persistSession: false,
  },
});