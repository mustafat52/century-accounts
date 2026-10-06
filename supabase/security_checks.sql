-- READ-ONLY checks for the permissions review (plan section 9).
-- Run each block in the Supabase SQL editor and review the output.
-- Nothing here changes data.

-- 1. Which policies exist on profiles? Look for any UPDATE/ALL policy that
--    lets a normal signed-in user write their own row (that would let an
--    employee set role = 'owner' from the browser console).
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;

-- 2. Column-level grants on profiles for the browser roles.
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type, column_name;

-- 3. Do the money RPCs reject overpayment server-side? Read the bodies and
--    look for a balance comparison that raises an exception.
select proname, pg_get_functiondef(oid) as definition
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('record_quotation_payment', 'record_vendor_payment', 'record_worker_payment',
                  'convert_quotation_to_invoice', 'rollback_invoice_to_quotation');

-- 4. Are any tables without RLS enabled?
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
order by c.relrowsecurity, c.relname;

-- 5. Do the policies check profiles.is_active, or only "authenticated"?
--    (Switched-off users with a still-valid token can read/write if the
--    policies only test auth.role() = 'authenticated'.)
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public' and qual ilike '%is_active%';

-- ------------------------------------------------------------------
-- PROPOSED FIXES (do NOT run until the checks above show they are needed)
-- ------------------------------------------------------------------
-- A. Employees must not change role / is_active on their own profile:
--    drop any broad UPDATE policy on profiles, and manage role/is_active
--    only through the owner-checked manage-employee Edge Function or an
--    owner-only policy such as:
--
--   create policy "profiles owner update" on profiles
--     for update
--     using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner' and p.is_active))
--     with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner' and p.is_active));
--
-- B. Enforce is_active in RLS via a helper, then use it in policies:
--
--   create or replace function is_active_user() returns boolean
--   language sql stable security definer set search_path = public as
--   $$ select coalesce((select is_active from profiles where id = auth.uid()), false) $$;
--
--   -- example, repeat per table:
--   -- alter policy "customers full access" on customers
--   --   using (auth.role() = 'authenticated' and is_active_user())
--   --   with check (auth.role() = 'authenticated' and is_active_user());