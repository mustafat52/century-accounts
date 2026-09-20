// manage-employee — Supabase Edge Function
//
// The only place in this project allowed to hold the Supabase
// SERVICE ROLE key. That key can do absolutely anything (create/delete
// logins, bypass every row-level-security rule) — it must never be
// shipped to the browser, which is why "Add Employee" / "Delete
// Employee" can't just be another `supabase.from(...)` call from
// AppContext.tsx like everything else in this app. This function runs
// on Supabase's servers, reads the key from a secret set on the
// function itself (never in frontend code or in git), and is the sole
// gate the frontend goes through for those two actions.
//
// Every request must carry the CALLER's own normal user session token
// (Authorization: Bearer <jwt>) — this function looks that user up and
// requires profiles.role = 'owner' before doing anything. That check is
// done with the service-role client specifically so it can't be spoofed
// by a non-owner crafting their own request straight to this URL.
//
// Deploy with the Supabase CLI from the project root:
//   supabase functions deploy manage-employee
// Then set the secret it reads below (once per project):
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key from Project Settings → API>
// SUPABASE_URL is provided automatically by the Edge Functions runtime,
// no need to set it by hand.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  // ---------- Who's calling, and are they the owner? ----------
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Missing authorization.' }, 401);

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData.user) return json({ error: 'Invalid or expired session — sign in again.' }, 401);

  const { data: callerProfile, error: callerProfileErr } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', callerData.user.id)
    .single();

  if (callerProfileErr || !callerProfile || callerProfile.role !== 'owner' || !callerProfile.is_active) {
    return json({ error: 'Only the business owner can manage employee logins.' }, 403);
  }

  // ---------- Parse the request ----------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const action = body.action;

  // ---------- Create a new employee login ----------
  if (action === 'create') {
    const email = String(body.email ?? '').trim();
    const password = String(body.password ?? '');
    const displayName = String(body.displayName ?? '').trim();

    if (!email || !password || !displayName) {
      return json({ error: 'Name, email, and password are all required.' }, 400);
    }
    if (password.length < 6) {
      return json({ error: 'Password must be at least 6 characters.' }, 400);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no email-verification step for an internal-team login
    });
    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? 'Could not create the login.' }, 400);
    }

    const { error: insertErr } = await admin.from('profiles').insert({
      id: created.user.id,
      display_name: displayName,
      email,
      role: 'employee',
      is_active: true,
    });
    if (insertErr) {
      // Don't leave an orphaned Auth login with no profile row behind if
      // the insert failed (e.g. a rare id collision) — clean up.
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: insertErr.message }, 400);
    }

    return json({
      id: created.user.id,
      displayName,
      email,
      role: 'employee',
      isActive: true,
    });
  }

  // ---------- Permanently delete an employee login ----------
  if (action === 'delete') {
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'id is required.' }, 400);
    if (id === callerData.user.id) {
      return json({ error: "You can't delete your own login." }, 400);
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(id);
    if (deleteErr) return json({ error: deleteErr.message }, 400);

    // profiles.id → auth.users.id is "on delete cascade" in the schema,
    // so this is usually already gone — deleted explicitly too in case
    // that constraint isn't present on however this project's live
    // database actually looks today.
    await admin.from('profiles').delete().eq('id', id);

    return json({ ok: true });
  }

  return json({ error: `Unknown action "${String(action)}".` }, 400);
});