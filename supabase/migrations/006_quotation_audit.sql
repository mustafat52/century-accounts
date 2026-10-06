-- 006: quotation audit trail + item age tracking
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).
-- The app works before AND after this runs: the edit audit insert is
-- best-effort and just logs a console warning if the table is missing.

-- 1. Who last touched a quotation, and when (stamped by a trigger so it
--    can't be forgotten or spoofed by the client).
alter table quotations
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create or replace function set_quotation_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_quotations_updated on quotations;
create trigger trg_quotations_updated
  before update on quotations
  for each row execute function set_quotation_updated();

-- 2. Item row age. Existing rows stay NULL ("unknown") on purpose so they
--    are not falsely dated to the migration; new/rewritten rows get now().
--    Note: an edit rewrites item rows, so this shows when the CURRENT rows
--    were last written.
alter table quotation_items add column if not exists created_at timestamptz;
alter table quotation_items alter column created_at set default now();

-- 3. Before/after record of every edit (written by the app on each save).
create table if not exists quotation_changes (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  before_state jsonb,
  after_state jsonb
);
create index if not exists quotation_changes_quotation_idx on quotation_changes (quotation_id, changed_at desc);

alter table quotation_changes enable row level security;

-- Readable by signed-in users; insert only as yourself. No update/delete
-- policies, so the log is append-only from the client.
drop policy if exists "quotation_changes read" on quotation_changes;
create policy "quotation_changes read" on quotation_changes
  for select using (auth.role() = 'authenticated');

drop policy if exists "quotation_changes insert own" on quotation_changes;
create policy "quotation_changes insert own" on quotation_changes
  for insert with check (auth.role() = 'authenticated' and changed_by = auth.uid());