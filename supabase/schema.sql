-- ============================================================
-- Century Glass Art — Accounts & Billing
-- Supabase schema (run this whole file once in the SQL Editor)
--
-- NOTE: this replaces the earlier version of this file. If you
-- already ran the old one against a live project, easiest is to
-- drop the affected objects and re-run this in full (there's no
-- real data riding on it yet at this stage of the build).
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------- Enums ----------
create type invoice_kind as enum ('quick', 'job');
create type work_status as enum ('in_progress', 'completed');
-- 'in_progress' only applies to job-order invoices whose work isn't done yet.
-- Everything else is computed live in the invoices_effective view below.
create type invoice_status as enum ('in_progress', 'due', 'overdue', 'partial', 'paid');
create type quotation_status as enum ('pending', 'converted', 'expired');
create type expense_category as enum (
  'Raw Material', 'Labor', 'Payslips & Wages', 'Transport', 'Rent', 'Utilities', 'Maintenance'
);
create type item_slab as enum ('A', 'B', 'C');
-- A = B2C retail rate, B = B2B rate, C = special family rate.
-- Stored for the business's own reference only — never printed on the bill.

-- ---------- Human-friendly numbering (INV-1043, QUO-202, ...) ----------
create sequence invoice_seq start 1043;
create sequence quotation_seq start 202;

-- ---------- Profiles (one row per Supabase Auth user) ----------
-- Populated manually after you create each login in Authentication → Users.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email text not null
);

-- ---------- Business-wide settings (single row) ----------
create table business_settings (
  id boolean primary key default true check (id), -- forces exactly one row
  gst_enabled boolean not null default false
);
insert into business_settings (id, gst_enabled) values (true, false);

-- ---------- Customers ----------
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text not null,
  address text,
  gstin text,
  created_at timestamptz not null default now()
);

-- ---------- Vendors (suppliers only — workers/payroll live separately) ----------
create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  contact text not null,
  created_at timestamptz not null default now()
);

-- ---------- Invoices ----------
-- due_date is null until a job-order invoice is marked Completed (see
-- mark_job_completed below); quick-sale invoices get a due_date at creation.
-- status is NOT stored here — see invoices_effective, which computes it live
-- from work_status + payments + due_date so it can never drift out of sync.
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique default ('INV-' || nextval('invoice_seq')),
  customer_id uuid not null references customers (id) on delete restrict,
  kind invoice_kind not null,
  description text not null, -- short summary shown in tables/lists
  amount numeric(12, 2) not null check (amount > 0), -- subtotal, sum of line items
  gst numeric(12, 2) not null default 0, -- total GST; split 50/50 into CGST/SGST at display time
  transportation numeric(12, 2) not null default 0, -- added after GST, matching the business's own template
  invoice_date date not null default current_date,
  due_date date, -- null while a job order is still in_progress
  work_status work_status, -- null for quick-sale invoices
  completed_at date,
  created_at timestamptz not null default now()
);
create index invoices_customer_id_idx on invoices (customer_id);

-- Line items — two kinds, matching how the business actually prices work:
--   'glass'  — priced by size. SFT (square feet) is computed from length x
--              width x quantity, Rft (running feet, i.e. perimeter) from the
--              same dimensions, and the line total is
--              (SFT x rate_per_sft) + (Rft x polish_rate) + (SFT x fixing_rate_per_sft).
--   'simple' — flat qty x rate, for hardware/misc items (silicon, hinges, etc).
-- The A/B/C slab is kept for the business's own reference on either kind and
-- deliberately left off the printed bill.
create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  item_type text not null check (item_type in ('glass', 'simple')),
  description text not null,
  slab item_slab,
  sort_order int not null default 0,

  -- 'simple' item fields
  quantity numeric(10, 2),
  rate numeric(12, 2),

  -- 'glass' item fields — all in inches for length/width, feet for rft
  length_in numeric(10, 2),
  width_in numeric(10, 2),
  glass_qty numeric(10, 2),
  rate_per_sft numeric(12, 2),
  sft numeric(10, 2),
  work_glass_amount numeric(12, 2),
  rft numeric(10, 2),
  polish_rate numeric(12, 2),
  polish_amount numeric(12, 2),
  fixing_rate_per_sft numeric(12, 2),
  fixing_amount numeric(12, 2),

  amount numeric(12, 2) not null, -- final line total, either kind
  check (
    (item_type = 'simple' and quantity is not null and rate is not null)
    or
    (item_type = 'glass' and length_in is not null and width_in is not null and glass_qty is not null and rate_per_sft is not null)
  )
);
create index invoice_items_invoice_id_idx on invoice_items (invoice_id);

-- Payments recorded against an invoice — supports partial/advance payments.
-- A single "full" payment that covers the balance just results in effective
-- status flipping to 'paid'; a partial one flips it to 'partial'.
create table invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index invoice_payments_invoice_id_idx on invoice_payments (invoice_id);

-- ---------- Quotations ----------
create table quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text not null unique default ('QUO-' || nextval('quotation_seq')),
  customer_id uuid not null references customers (id) on delete restrict,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  gst numeric(12, 2) not null default 0,
  quotation_date date not null default current_date,
  valid_until date not null,
  status quotation_status not null default 'pending',
  converted_invoice_id uuid references invoices (id),
  created_at timestamptz not null default now()
);
create index quotations_customer_id_idx on quotations (customer_id);

-- ---------- Expenses ----------
create table expenses (
  id uuid primary key default gen_random_uuid(),
  category expense_category not null,
  vendor_id uuid references vendors (id) on delete set null,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  is_paid boolean not null default true, -- false = still owed to the vendor
  created_at timestamptz not null default now()
);
create index expenses_vendor_id_idx on expenses (vendor_id);

-- ---------- Workers & Payslips ----------
-- A fixed roster (added once, reused every month). Advances are logged as
-- they happen through the month; each one also drops a matching row into
-- `expenses` (category 'Payslips & Wages') via log_worker_advance below, so
-- Reports/Expenses totals stay accurate without double entry.
create table workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  monthly_salary numeric(12, 2) not null check (monthly_salary >= 0),
  created_at timestamptz not null default now()
);

create table worker_advances (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers (id) on delete cascade,
  linked_expense_id uuid references expenses (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  advance_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index worker_advances_worker_id_idx on worker_advances (worker_id);

-- ---------- Important Links ----------
create table important_links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  url text not null,
  category text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Functions — the multi-step operations, done atomically
-- ============================================================

-- Create an invoice with multiple line items in one call. Each item in
-- p_items is one of:
--   {"type":"glass","description":"...","slab":"A","lengthIn":84,"widthIn":60,
--    "qty":1,"ratePerSft":760,"polishRate":45,"fixingRatePerSft":65}
--   {"type":"simple","description":"...","slab":"","quantity":2,"rate":250}
-- polishRate/fixingRatePerSft may be omitted or 0 if not applicable.
create or replace function create_invoice_with_items(
  p_customer_id uuid,
  p_kind invoice_kind,
  p_due_date date, -- pass null for job orders (set later on completion)
  p_gst_enabled boolean,
  p_transportation numeric,
  p_items jsonb
)
returns invoices
language plpgsql
security definer
as $$
declare
  v_subtotal numeric(12,2) := 0;
  v_gst numeric(12,2);
  v_summary text;
  v_invoice invoices;
  v_item jsonb;
  v_len numeric;
  v_wid numeric;
  v_gqty numeric;
  v_rate_sft numeric;
  v_sft numeric;
  v_work_glass numeric;
  v_rft numeric;
  v_polish_rate numeric;
  v_polish_amt numeric;
  v_fixing_rate numeric;
  v_fixing_amt numeric;
  v_line_amount numeric;
  v_ord int := 0;
  v_first_descs text[] := array[]::text[];
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Invoice must have at least one item';
  end if;

  -- Pass 1: compute the subtotal and a short summary, without writing yet.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_ord := v_ord + 1;
    if v_ord <= 3 then
      v_first_descs := v_first_descs || (v_item->>'description');
    end if;

    if v_item->>'type' = 'glass' then
      v_len := (v_item->>'lengthIn')::numeric;
      v_wid := (v_item->>'widthIn')::numeric;
      v_gqty := (v_item->>'qty')::numeric;
      v_sft := round((v_len * v_wid / 144.0) * v_gqty, 2);
      v_work_glass := round(v_sft * (v_item->>'ratePerSft')::numeric, 2);
      v_rft := round((2 * (v_len + v_wid) / 12.0) * v_gqty, 2);
      v_polish_amt := round(v_rft * coalesce((v_item->>'polishRate')::numeric, 0), 2);
      v_fixing_amt := round(v_sft * coalesce((v_item->>'fixingRatePerSft')::numeric, 0), 2);
      v_line_amount := v_work_glass + v_polish_amt + v_fixing_amt;
    else
      v_line_amount := round((v_item->>'quantity')::numeric * (v_item->>'rate')::numeric, 2);
    end if;

    v_subtotal := v_subtotal + v_line_amount;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'Invoice must have at least one item with a positive amount';
  end if;

  v_gst := case when p_gst_enabled then round(v_subtotal * 0.18, 2) else 0 end;
  v_summary := array_to_string(v_first_descs, ', ');

  insert into invoices (customer_id, kind, description, amount, gst, transportation, due_date, work_status)
  values (
    p_customer_id,
    p_kind,
    coalesce(v_summary, 'Invoice'),
    v_subtotal,
    v_gst,
    coalesce(p_transportation, 0),
    p_due_date,
    case when p_kind = 'job' then 'in_progress' else null end
  )
  returning * into v_invoice;

  -- Pass 2: recompute the same per-item figures and write the rows.
  v_ord := 0;
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_ord := v_ord + 1;

    if v_item->>'type' = 'glass' then
      v_len := (v_item->>'lengthIn')::numeric;
      v_wid := (v_item->>'widthIn')::numeric;
      v_gqty := (v_item->>'qty')::numeric;
      v_rate_sft := (v_item->>'ratePerSft')::numeric;
      v_polish_rate := coalesce((v_item->>'polishRate')::numeric, 0);
      v_fixing_rate := coalesce((v_item->>'fixingRatePerSft')::numeric, 0);

      v_sft := round((v_len * v_wid / 144.0) * v_gqty, 2);
      v_work_glass := round(v_sft * v_rate_sft, 2);
      v_rft := round((2 * (v_len + v_wid) / 12.0) * v_gqty, 2);
      v_polish_amt := round(v_rft * v_polish_rate, 2);
      v_fixing_amt := round(v_sft * v_fixing_rate, 2);
      v_line_amount := v_work_glass + v_polish_amt + v_fixing_amt;

      insert into invoice_items (
        invoice_id, item_type, description, slab, sort_order,
        length_in, width_in, glass_qty, rate_per_sft, sft, work_glass_amount,
        rft, polish_rate, polish_amount, fixing_rate_per_sft, fixing_amount, amount
      ) values (
        v_invoice.id, 'glass', v_item->>'description', nullif(v_item->>'slab', '')::item_slab, v_ord,
        v_len, v_wid, v_gqty, v_rate_sft, v_sft, v_work_glass,
        v_rft, v_polish_rate, v_polish_amt, v_fixing_rate, v_fixing_amt, v_line_amount
      );
    else
      v_line_amount := round((v_item->>'quantity')::numeric * (v_item->>'rate')::numeric, 2);

      insert into invoice_items (invoice_id, item_type, description, slab, sort_order, quantity, rate, amount)
      values (
        v_invoice.id, 'simple', v_item->>'description', nullif(v_item->>'slab', '')::item_slab, v_ord,
        (v_item->>'quantity')::numeric, (v_item->>'rate')::numeric, v_line_amount
      );
    end if;
  end loop;

  return v_invoice;
end;
$$;

revoke all on function create_invoice_with_items(uuid, invoice_kind, date, boolean, numeric, jsonb) from public;
grant execute on function create_invoice_with_items(uuid, invoice_kind, date, boolean, numeric, jsonb) to authenticated;

-- Mark a job-order invoice's work as done. This is what starts the
-- due → (1 month later) → overdue clock; due_date is set here, not at
-- invoice creation time.
create or replace function mark_job_completed(p_invoice_id uuid)
returns invoices
language plpgsql
security definer
as $$
declare
  v_invoice invoices;
begin
  update invoices
  set work_status = 'completed',
      completed_at = current_date,
      due_date = current_date + interval '1 month'
  where id = p_invoice_id and kind = 'job' and work_status = 'in_progress'
  returning * into v_invoice;

  if not found then
    raise exception 'Invoice not found or is not an in-progress job order';
  end if;

  return v_invoice;
end;
$$;

revoke all on function mark_job_completed(uuid) from public;
grant execute on function mark_job_completed(uuid) to authenticated;

-- Record a payment (full or partial/advance) against an invoice.
create or replace function record_invoice_payment(p_invoice_id uuid, p_amount numeric, p_note text)
returns invoice_payments
language plpgsql
security definer
as $$
declare
  v_payment invoice_payments;
begin
  insert into invoice_payments (invoice_id, amount, note)
  values (p_invoice_id, p_amount, nullif(p_note, ''))
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function record_invoice_payment(uuid, numeric, text) from public;
grant execute on function record_invoice_payment(uuid, numeric, text) to authenticated;

-- Convert an accepted quotation straight into a job-order invoice
-- (starts as in_progress, same as any other job order).
create or replace function convert_quotation_to_invoice(p_quotation_id uuid)
returns invoices
language plpgsql
security definer
as $$
declare
  q quotations;
  new_invoice invoices;
begin
  select * into q from quotations where id = p_quotation_id and status = 'pending';
  if not found then
    raise exception 'Quotation not found or is no longer pending';
  end if;

  insert into invoices (customer_id, kind, description, amount, gst, work_status)
  values (q.customer_id, 'job', q.description, q.amount, q.gst, 'in_progress')
  returning * into new_invoice;

  insert into invoice_items (invoice_id, item_type, description, quantity, rate, amount, sort_order)
  values (new_invoice.id, 'simple', q.description, 1, q.amount, q.amount, 0);

  update quotations
  set status = 'converted', converted_invoice_id = new_invoice.id
  where id = p_quotation_id;

  return new_invoice;
end;
$$;

revoke all on function convert_quotation_to_invoice(uuid) from public;
grant execute on function convert_quotation_to_invoice(uuid) to authenticated;

-- Log a worker's cash advance and mirror it into Expenses in one step.
create or replace function log_worker_advance(
  p_worker_id uuid,
  p_amount numeric,
  p_date date,
  p_note text
)
returns worker_advances
language plpgsql
security definer
as $$
declare
  v_worker_name text;
  v_expense_id uuid;
  v_advance worker_advances;
begin
  select name into v_worker_name from workers where id = p_worker_id;
  if not found then
    raise exception 'Worker not found';
  end if;

  insert into expenses (category, description, amount, expense_date, is_paid)
  values ('Payslips & Wages', 'Advance — ' || v_worker_name, p_amount, p_date, true)
  returning id into v_expense_id;

  insert into worker_advances (worker_id, linked_expense_id, amount, advance_date, note)
  values (p_worker_id, v_expense_id, p_amount, p_date, nullif(p_note, ''))
  returning * into v_advance;

  return v_advance;
end;
$$;

revoke all on function log_worker_advance(uuid, numeric, date, text) from public;
grant execute on function log_worker_advance(uuid, numeric, date, text) to authenticated;

-- ============================================================
-- Views — derived numbers, never stored redundantly
-- ============================================================

-- Live, computed invoice status. This is the source of truth the frontend
-- reads — nothing mutates a stored "status" column directly.
create view invoices_effective with (security_invoker = true) as
select
  i.*,
  coalesce(p.paid, 0) as paid_amount,
  greatest((i.amount + i.gst + i.transportation) - coalesce(p.paid, 0), 0) as balance,
  (case
    when i.kind = 'job' and i.work_status = 'in_progress' then 'in_progress'
    when coalesce(p.paid, 0) >= (i.amount + i.gst + i.transportation) then 'paid'
    when coalesce(p.paid, 0) > 0 then 'partial'
    when i.due_date is not null and i.due_date < current_date then 'overdue'
    else 'due'
  end)::invoice_status as effective_status
from invoices i
left join (
  select invoice_id, sum(amount) as paid from invoice_payments group by invoice_id
) p on p.invoice_id = i.id;

-- Per-customer running totals. Outstanding excludes job orders still in
-- progress — that work isn't billable yet.
create view customer_balances with (security_invoker = true) as
select
  c.id,
  c.name,
  c.contact,
  c.address,
  c.gstin,
  coalesce(sum(i.amount + i.gst + i.transportation), 0) as total_billed,
  coalesce(sum(
    case
      when i.kind = 'job' and i.work_status = 'in_progress' then 0
      else greatest((i.amount + i.gst + i.transportation) - coalesce(p.paid, 0), 0)
    end
  ), 0) as outstanding
from customers c
left join invoices i on i.customer_id = c.id
left join (
  select invoice_id, sum(amount) as paid from invoice_payments group by invoice_id
) p on p.invoice_id = i.id
group by c.id;

-- Per-vendor running totals (unchanged — vendors are suppliers only now).
create view vendor_balances with (security_invoker = true) as
select
  v.id,
  v.name,
  v.category,
  v.contact,
  coalesce(sum(e.amount), 0) as total_purchased,
  coalesce(sum(e.amount) filter (where e.is_paid = false), 0) as payable
from vendors v
left join expenses e on e.vendor_id = v.id
group by v.id;

-- Last 12 months of revenue vs. expenses, for the Dashboard/Reports charts.
-- Revenue only counts invoices that have actually reached a billable state
-- (excludes in-progress job orders).
create view monthly_revenue_expense with (security_invoker = true) as
with months as (
  select date_trunc('month', gs)::date as month_start
  from generate_series(
    date_trunc('month', now()) - interval '11 months',
    date_trunc('month', now()),
    interval '1 month'
  ) as gs
),
rev as (
  select date_trunc('month', invoice_date)::date as month_start, sum(amount + gst + transportation) as revenue
  from invoices
  where not (kind = 'job' and work_status = 'in_progress')
  group by 1
),
exp as (
  select date_trunc('month', expense_date)::date as month_start, sum(amount) as expenses
  from expenses
  group by 1
)
select
  to_char(m.month_start, 'Mon') as month,
  m.month_start,
  coalesce(rev.revenue, 0) as revenue,
  coalesce(exp.expenses, 0) as expenses
from months m
left join rev on rev.month_start = m.month_start
left join exp on exp.month_start = m.month_start
order by m.month_start;

-- Dashboard summary: customers billed this month, jobs in progress, jobs
-- completed this month.
create view dashboard_summary with (security_invoker = true) as
select
  (select count(distinct customer_id) from invoices
    where date_trunc('month', invoice_date) = date_trunc('month', current_date)) as customers_billed_this_month,
  (select count(*) from invoices where kind = 'job' and work_status = 'in_progress') as jobs_in_progress,
  (select count(*) from invoices where kind = 'job' and work_status = 'completed'
    and date_trunc('month', completed_at) = date_trunc('month', current_date)) as jobs_completed_this_month;

-- This month's payslip picture per worker: salary minus advances taken so far.
create view worker_month_summary with (security_invoker = true) as
select
  w.id,
  w.name,
  w.monthly_salary,
  coalesce(sum(a.amount) filter (
    where date_trunc('month', a.advance_date) = date_trunc('month', current_date)
  ), 0) as advances_this_month,
  w.monthly_salary - coalesce(sum(a.amount) filter (
    where date_trunc('month', a.advance_date) = date_trunc('month', current_date)
  ), 0) as remaining_this_month
from workers w
left join worker_advances a on a.worker_id = w.id
group by w.id;

-- ============================================================
-- Row Level Security
-- Internal team tool: any signed-in user (Shabbir Bhai / Abdul
-- Hussain Bhai) can read and write everything. Nothing is public.
-- ============================================================

alter table profiles enable row level security;
alter table business_settings enable row level security;
alter table customers enable row level security;
alter table vendors enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table invoice_payments enable row level security;
alter table quotations enable row level security;
alter table expenses enable row level security;
alter table workers enable row level security;
alter table worker_advances enable row level security;
alter table important_links enable row level security;

create policy "profiles readable by signed-in users" on profiles
  for select using (auth.role() = 'authenticated');

create policy "business_settings full access" on business_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "customers full access" on customers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "vendors full access" on vendors
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "invoices full access" on invoices
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "invoice_items full access" on invoice_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "invoice_payments full access" on invoice_payments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "quotations full access" on quotations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "expenses full access" on expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "workers full access" on workers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "worker_advances full access" on worker_advances
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "important_links full access" on important_links
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Views were created with security_invoker = true, so they respect the RLS
-- of the querying user rather than running as the view owner — without that,
-- an unauthenticated request could read a view and see everything regardless
-- of the "authenticated only" policies above.

-- ============================================================
-- Seed data (optional) — comment out if you want to start empty
-- ============================================================

insert into customers (name, contact, address, gstin) values
  ('Meridian Interiors', '+91 98200 11223', null, '27ABCPM1234F1Z5'),
  ('Kapoor Residence', '+91 90040 55621', null, null),
  ('Grand Vista Hotels', '+91 98330 77410', null, '27GVHPL5678K1Z2');

insert into vendors (name, category, contact) values
  ('Saint-Roch Glass Suppliers', 'Raw Material — Sheet Glass', '+91 98220 60011'),
  ('Precision Hardware Co.', 'Fittings & Hardware', '+91 90210 44780');