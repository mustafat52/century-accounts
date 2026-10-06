-- 007: automatic activity log ("who did what, when, and what changed")
-- Run once in the Supabase SQL editor (safe to re-run).
--
-- How it works: database TRIGGERS write one row to activity_log for every
-- insert / update / delete on the business tables below. Because this is
-- done inside the database, it cannot be skipped by the app, a stale
-- browser tab or a typo in code, and the actor is taken from the signed-in
-- user's token (auth.uid()), not from anything the browser claims.
--
-- Visibility: owner only (SELECT). Nobody can insert, update or delete log
-- rows from the app; only the triggers (security definer) write to it.
-- A failure while logging NEVER blocks the real business write; it raises
-- a warning instead.

create table if not exists activity_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text not null default 'System',
  action      text not null check (action in ('insert', 'update', 'delete')),
  table_name  text not null,
  record_id   text,
  changes     jsonb,   -- UPDATE only: { column: { "from": old, "to": new } }
  row_data    jsonb    -- the row after the change (before it, for deletes)
);

create index if not exists activity_log_created_idx on activity_log (created_at desc);
create index if not exists activity_log_table_idx   on activity_log (table_name, created_at desc);
create index if not exists activity_log_actor_idx   on activity_log (actor_id, created_at desc);
create index if not exists activity_log_record_idx  on activity_log (record_id);

alter table activity_log enable row level security;

revoke all on activity_log from anon, authenticated;
grant select on activity_log to authenticated;

drop policy if exists "activity_log owner read" on activity_log;
create policy "activity_log owner read" on activity_log
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner' and p.is_active)
  );

create or replace function log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_name    text;
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_changes jsonb;
begin
  -- Employee logins created/deleted by the manage-employee Edge Function
  -- run with no user token; that function writes its own explicit log row
  -- (with the owner as the actor), so skip the duplicate here.
  if v_actor is null and tg_table_name = 'profiles' and tg_op in ('INSERT', 'DELETE') then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_row := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row := v_new;
    select jsonb_object_agg(n.key, jsonb_build_object('from', v_old -> n.key, 'to', n.value))
      into v_changes
      from jsonb_each(v_new) as n
     where n.key not in ('updated_at', 'updated_by')
       and (v_old -> n.key) is distinct from n.value;
    if v_changes is null then
      return null; -- nothing meaningful changed (e.g. only updated_at)
    end if;
  end if;

  if v_actor is not null then
    select coalesce(nullif(p.display_name, ''), u.email)
      into v_name
      from auth.users u
      left join profiles p on p.id = u.id
     where u.id = v_actor;
  end if;

  insert into activity_log (actor_id, actor_name, action, table_name, record_id, changes, row_data)
  values (
    v_actor,
    coalesce(v_name, case when v_actor is null then 'System' else 'Unknown user' end),
    lower(tg_op),
    tg_table_name,
    v_row ->> 'id',
    v_changes,
    v_row - 'updated_at' - 'updated_by'
  );

  return null;
exception when others then
  raise warning 'activity_log write failed on %.%: %', tg_table_name, tg_op, sqlerrm;
  return null;
end;
$$;

-- Attach to every table that matters (skips any that don't exist yet).
-- Line-item child tables are deliberately NOT listed: their parent row
-- (and quotation_changes, for quotation edits) already tells the story,
-- and logging every item row would just add noise.
do $$
declare
  t text;
begin
  foreach t in array array[
    'quotations', 'quotation_payments', 'quotation_changes', 'invoices',
    'customers', 'vendors', 'vendor_payments', 'vendor_slips', 'purchase_bills', 'expenses',
    'workers', 'worker_advances', 'worker_payments',
    'price_list', 'important_links', 'business_settings', 'profiles',
    'inv_categories', 'inv_stock', 'inv_waste', 'inv_cutting_jobs'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_activity_log on %I', t);
      execute format(
        'create trigger trg_activity_log after insert or update or delete on %I for each row execute function log_activity()',
        t
      );
    end if;
  end loop;
end;
$$;