-- ============================================================
-- Century Glass Art — Accounts & Billing
-- Supabase schema (run this whole file once in the SQL Editor,
-- on a FRESH project only — this is not idempotent against a
-- database that already has these objects)
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------- Enums ----------
create type invoice_kind as enum ('quick', 'job');
create type work_status as enum ('in_progress', 'completed');
create type invoice_status as enum ('in_progress', 'due', 'overdue', 'partial', 'paid');
create type quotation_status as enum ('pending', 'converted', 'expired');
create type expense_category as enum (
  'Raw Material', 'Labor', 'Payslips & Wages', 'Transport', 'Rent', 'Utilities', 'Maintenance'
);
-- Invoice-level discount tier (NOT a per-item label). A = 10% off,
-- B = 15% off, C = 20% off, D = custom % typed in per-invoice (see
-- invoices.discount_percent). One slab per bill, chosen once at the
-- invoice level — never per line item.
create type invoice_slab as enum ('A', 'B', 'C', 'D');

-- Vendor purchase slip (DC) lifecycle — see vendor_slips below. A slip is
-- created with quantities only (no prices), printed, sent to the vendor to
-- fill in prices by hand, then priced and locked in the system.
create type vendor_slip_status as enum ('pending_pricing', 'priced');

-- Who at the shop raised a given vendor slip — fixed list, not free text.
create type care_of_person as enum ('Shabbir Bhai', 'Abdul Hussain Bhai', 'Taqi Bhai');

-- ---------- Human-friendly numbering (INV-1043, QUO-202, ...) ----------
create sequence invoice_seq start 1043;
create sequence quotation_seq start 202;
-- One global DC sequence shared across ALL vendors (not per-vendor) —
-- matches the shop's physical slip book, which is numbered continuously
-- regardless of which vendor a given slip is for.
create sequence dc_seq start 501;

-- ---------- Profiles (one row per Supabase Auth user) ----------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email text not null
);

-- ---------- Business-wide settings (single row) ----------
create table business_settings (
  id boolean primary key default true check (id),
  gst_enabled boolean not null default false
);
insert into business_settings (id, gst_enabled) values (true, false);

-- ---------- Customers ----------
-- contact is nullable: a customer can be quick-created from the invoice
-- screen with just a name (e.g. a walk-in), and contact info filled in
-- later from the Customers page if it's ever needed.
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
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
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique default ('INV-' || nextval('invoice_seq')),
  customer_id uuid not null references customers (id) on delete restrict,
  kind invoice_kind not null,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  slab invoice_slab not null default 'A',
  discount_percent numeric(5, 2) not null default 10,
  discount_amount numeric(12, 2) not null default 0,
  gst numeric(12, 2) not null default 0,
  transportation numeric(12, 2) not null default 0,
  invoice_date date not null default current_date,
  due_date date,
  work_status work_status,
  completed_at date,
  created_at timestamptz not null default now()
);
create index invoices_customer_id_idx on invoices (customer_id);

-- Line items — two kinds: 'glass' (priced by size) and 'simple' (flat qty x rate).
-- thickness_mm added for glass items (e.g. "12MM", "5+5+5") — reference only.
create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  item_type text not null check (item_type in ('glass', 'simple')),
  description text not null,
  sort_order int not null default 0,
  thickness_mm text,

  -- 'simple' item fields
  quantity numeric(10, 2),
  rate numeric(12, 2),

  -- 'glass' item fields — inches for length/width, feet for rft
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

  amount numeric(12, 2) not null,
  check (
    (item_type = 'simple' and quantity is not null and rate is not null)
    or
    (item_type = 'glass' and length_in is not null and width_in is not null and glass_qty is not null and rate_per_sft is not null)
  )
);
create index invoice_items_invoice_id_idx on invoice_items (invoice_id);

-- Payments recorded against an invoice — supports partial/advance payments.
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
  -- Unlike invoices.slab (fixed once created), a quotation's slab/discount
  -- stays editable for as long as it's 'pending' — prices are still being
  -- negotiated with the customer at this stage. See updateQuotation and
  -- QuotationModal.
  slab invoice_slab not null default 'A',
  discount_percent numeric(5, 2) not null default 10,
  discount_amount numeric(12, 2) not null default 0,
  gst numeric(12, 2) not null default 0,
  quotation_date date not null default current_date,
  valid_until date not null,
  status quotation_status not null default 'pending',
  converted_invoice_id uuid references invoices (id),
  created_at timestamptz not null default now()
);
create index quotations_customer_id_idx on quotations (customer_id);

-- Quotation line items — mirrors invoice_items, plus an optional "area"
-- (location label, e.g. "BAR COUNTER", "MBR SHOWER") specific to quotations.
create table quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations (id) on delete cascade,
  item_type text not null check (item_type in ('glass', 'simple')),
  description text not null,
  area text,
  sort_order int not null default 0,
  thickness_mm text,

  -- 'simple' item fields
  quantity numeric(10, 2),
  rate numeric(12, 2),

  -- 'glass' item fields
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

  amount numeric(12, 2) not null,
  check (
    (item_type = 'simple' and quantity is not null and rate is not null)
    or
    (item_type = 'glass' and length_in is not null and width_in is not null and glass_qty is not null and rate_per_sft is not null)
  )
);
create index quotation_items_quotation_id_idx on quotation_items (quotation_id);

-- ---------- Expenses ----------
-- vendor_id null = general business expense (Rent, Utilities, Labor, etc.),
-- shown on the Expenses page. vendor_id set = a vendor purchase, shown only
-- on that vendor's page, with its own payment tracking (see vendor_payments).
create table expenses (
  id uuid primary key default gen_random_uuid(),
  category expense_category not null,
  vendor_id uuid references vendors (id) on delete set null,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  is_paid boolean not null default true,
  created_at timestamptz not null default now()
);
create index expenses_vendor_id_idx on expenses (vendor_id);

-- Payments against a vendor purchase (an expenses row with vendor_id set).
-- Mirrors invoice_payments — supports partial payments.
create table vendor_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index vendor_payments_expense_id_idx on vendor_payments (expense_id);

-- ---------- Workers & Payslips ----------
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

-- ---------- Price List (glass rate catalog) ----------
-- Managed entirely from its own tab in the app (add/edit/delete) — this is
-- just a rate lookup, not a stock/inventory system. Selecting an entry on a
-- glass line item auto-fills rate_per_sft / polish_rate / fixing_rate, but
-- those stay editable per-item afterward for one-off custom jobs.
create table price_list (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  rate_per_sft numeric(12, 2) not null check (rate_per_sft >= 0),
  polish_rate numeric(12, 2) not null default 0 check (polish_rate >= 0),
  fixing_rate numeric(12, 2) not null default 0 check (fixing_rate >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Vendor purchase slips (DC) ----------
-- Replicates the shop's real paper workflow: a slip is written up with
-- item descriptions + quantities only (no prices), printed, and sent to
-- the vendor. The vendor pens in rates by hand and sends it back; the
-- accountant then re-opens THIS SAME slip in the system and enters those
-- rates, which locks it. Once priced, exactly one `expenses` row is
-- created for it (category 'Raw Material') so it flows into the existing
-- vendor payable / vendor_payments machinery unchanged.
create table vendor_slips (
  id uuid primary key default gen_random_uuid(),
  dc_no text not null unique default ('DC-' || nextval('dc_seq')),
  vendor_id uuid not null references vendors (id) on delete restrict,
  care_of care_of_person not null,
  status vendor_slip_status not null default 'pending_pricing',
  slip_date date not null default current_date,
  priced_at timestamptz,
  expense_id uuid references expenses (id) on delete set null,
  created_at timestamptz not null default now()
);
create index vendor_slips_vendor_id_idx on vendor_slips (vendor_id);

-- Quantity always known up front; rate/amount stay null until the
-- accountant prices the slip, at which point they're filled in and the
-- whole slip locks (see price_vendor_slip below) — never edited after.
create table vendor_slip_items (
  id uuid primary key default gen_random_uuid(),
  slip_id uuid not null references vendor_slips (id) on delete cascade,
  description text not null,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit text not null,
  rate numeric(12, 2),
  amount numeric(12, 2),
  sort_order int not null default 0
);
create index vendor_slip_items_slip_id_idx on vendor_slip_items (slip_id);

create type purchase_bill_tax_type as enum ('cgst_sgst', 'igst');

-- ---------- Purchase bills (GST purchase register) ----------
-- A pure compliance record of tax invoices RECEIVED from suppliers — unlike
-- vendor_slips/expenses, this never touches payable/payments. It exists so
-- the fields a GST return needs (GSTIN, HSN, taxable value, CGST/SGST/IGST
-- split) are captured exactly as printed on the physical bill.
-- Deliberately NOT linked to vendors — suppliers and vendors are treated
-- as separate concepts by the client, and there's no confirmed Suppliers
-- tab yet, so this stays a fully standalone record.
create table purchase_bills (
  id uuid primary key default gen_random_uuid(),
  supplier_gstin text not null,
  supplier_name text not null,
  supplier_address text,
  invoice_no text not null,
  invoice_date date not null,
  place_of_supply text not null,
  tax_type purchase_bill_tax_type not null default 'cgst_sgst',
  subtotal numeric(12, 2) not null default 0,
  cgst_total numeric(12, 2) not null default 0,
  sgst_total numeric(12, 2) not null default 0,
  igst_total numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index purchase_bills_supplier_gstin_idx on purchase_bills (supplier_gstin);

create table purchase_bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references purchase_bills (id) on delete cascade,
  hsn_code text,
  description text not null,
  quantity numeric(10, 2) not null check (quantity > 0),
  rate numeric(12, 2) not null check (rate >= 0),
  taxable_amount numeric(12, 2) not null default 0,
  gst_rate numeric(5, 2) not null default 18,
  cgst_amount numeric(12, 2) not null default 0,
  sgst_amount numeric(12, 2) not null default 0,
  igst_amount numeric(12, 2) not null default 0,
  sort_order int not null default 0
);
create index purchase_bill_items_bill_id_idx on purchase_bill_items (bill_id);

-- ============================================================
-- Functions
--
-- NOTE (see SYSTEM_DOCUMENTATION.md §13.1): create_order_with_items,
-- create_quotation_with_items, update_quotation_with_items, and
-- convert_quotation_to_invoice are defined here for schema
-- completeness, but the deployed frontend does NOT call them as
-- RPCs — a network-layer issue on the original dev machine caused
-- POST requests to /rest/v1/rpc/* with a JSON body to silently
-- fail ("No API key found in request") despite valid credentials.
-- The application instead performs the equivalent work as
-- sequential client-side .insert() calls in AppContext.tsx, with
-- manual rollback-on-failure in place of true transaction atomicity.
-- mark_job_completed and record_invoice_payment ARE still called
-- as RPCs and were confirmed working.
-- ============================================================

create or replace function create_order_with_items(
  p_customer_id uuid,
  p_kind invoice_kind,
  p_due_date date,
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
    p_customer_id, p_kind, coalesce(v_summary, 'Invoice'), v_subtotal, v_gst,
    coalesce(p_transportation, 0), p_due_date,
    case when p_kind = 'job' then 'in_progress' else null end
  )
  returning * into v_invoice;

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
        invoice_id, item_type, description, sort_order, thickness_mm,
        length_in, width_in, glass_qty, rate_per_sft, sft, work_glass_amount,
        rft, polish_rate, polish_amount, fixing_rate_per_sft, fixing_amount, amount
      ) values (
        v_invoice.id, 'glass', v_item->>'description', v_ord,
        nullif(v_item->>'thicknessMm', ''),
        v_len, v_wid, v_gqty, v_rate_sft, v_sft, v_work_glass,
        v_rft, v_polish_rate, v_polish_amt, v_fixing_rate, v_fixing_amt, v_line_amount
      );
    else
      v_line_amount := round((v_item->>'quantity')::numeric * (v_item->>'rate')::numeric, 2);

      insert into invoice_items (invoice_id, item_type, description, sort_order, quantity, rate, amount)
      values (
        v_invoice.id, 'simple', v_item->>'description', v_ord,
        (v_item->>'quantity')::numeric, (v_item->>'rate')::numeric, v_line_amount
      );
    end if;
  end loop;

  return v_invoice;
end;
$$;

revoke all on function create_order_with_items(uuid, invoice_kind, date, boolean, numeric, jsonb) from public;
grant execute on function create_order_with_items(uuid, invoice_kind, date, boolean, numeric, jsonb) to authenticated;

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

create or replace function create_quotation_with_items(
  p_customer_id uuid,
  p_valid_until date,
  p_gst_enabled boolean,
  p_items jsonb
)
returns quotations
language plpgsql
security definer
as $$
declare
  v_subtotal numeric(12,2) := 0;
  v_gst numeric(12,2);
  v_summary text;
  v_quotation quotations;
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
    raise exception 'Quotation must have at least one item';
  end if;

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
    raise exception 'Quotation must have at least one item with a positive amount';
  end if;

  v_gst := case when p_gst_enabled then round(v_subtotal * 0.18, 2) else 0 end;
  v_summary := array_to_string(v_first_descs, ', ');

  insert into quotations (customer_id, description, amount, gst, valid_until)
  values (p_customer_id, coalesce(v_summary, 'Quotation'), v_subtotal, v_gst, p_valid_until)
  returning * into v_quotation;

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

      insert into quotation_items (
        quotation_id, item_type, description, area, sort_order, thickness_mm,
        length_in, width_in, glass_qty, rate_per_sft, sft, work_glass_amount,
        rft, polish_rate, polish_amount, fixing_rate_per_sft, fixing_amount, amount
      ) values (
        v_quotation.id, 'glass', v_item->>'description', nullif(v_item->>'area', ''),
        v_ord, nullif(v_item->>'thicknessMm', ''),
        v_len, v_wid, v_gqty, v_rate_sft, v_sft, v_work_glass,
        v_rft, v_polish_rate, v_polish_amt, v_fixing_rate, v_fixing_amt, v_line_amount
      );
    else
      v_line_amount := round((v_item->>'quantity')::numeric * (v_item->>'rate')::numeric, 2);

      insert into quotation_items (quotation_id, item_type, description, area, sort_order, quantity, rate, amount)
      values (
        v_quotation.id, 'simple', v_item->>'description', nullif(v_item->>'area', ''),
        v_ord,
        (v_item->>'quantity')::numeric, (v_item->>'rate')::numeric, v_line_amount
      );
    end if;
  end loop;

  return v_quotation;
end;
$$;

revoke all on function create_quotation_with_items(uuid, date, boolean, jsonb) from public;
grant execute on function create_quotation_with_items(uuid, date, boolean, jsonb) to authenticated;

create or replace function update_quotation_with_items(
  p_quotation_id uuid,
  p_valid_until date,
  p_gst_enabled boolean,
  p_items jsonb
)
returns quotations
language plpgsql
security definer
as $$
declare
  v_subtotal numeric(12,2) := 0;
  v_gst numeric(12,2);
  v_summary text;
  v_quotation quotations;
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
  select * into v_quotation from quotations where id = p_quotation_id and status = 'pending';
  if not found then
    raise exception 'Quotation not found or is no longer pending';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Quotation must have at least one item';
  end if;

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
    raise exception 'Quotation must have at least one item with a positive amount';
  end if;

  v_gst := case when p_gst_enabled then round(v_subtotal * 0.18, 2) else 0 end;
  v_summary := array_to_string(v_first_descs, ', ');

  update quotations
  set description = coalesce(v_summary, 'Quotation'),
      amount = v_subtotal,
      gst = v_gst,
      valid_until = p_valid_until
  where id = p_quotation_id
  returning * into v_quotation;

  delete from quotation_items where quotation_id = p_quotation_id;

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

      insert into quotation_items (
        quotation_id, item_type, description, area, sort_order, thickness_mm,
        length_in, width_in, glass_qty, rate_per_sft, sft, work_glass_amount,
        rft, polish_rate, polish_amount, fixing_rate_per_sft, fixing_amount, amount
      ) values (
        v_quotation.id, 'glass', v_item->>'description', nullif(v_item->>'area', ''),
        v_ord, nullif(v_item->>'thicknessMm', ''),
        v_len, v_wid, v_gqty, v_rate_sft, v_sft, v_work_glass,
        v_rft, v_polish_rate, v_polish_amt, v_fixing_rate, v_fixing_amt, v_line_amount
      );
    else
      v_line_amount := round((v_item->>'quantity')::numeric * (v_item->>'rate')::numeric, 2);

      insert into quotation_items (quotation_id, item_type, description, area, sort_order, quantity, rate, amount)
      values (
        v_quotation.id, 'simple', v_item->>'description', nullif(v_item->>'area', ''),
        v_ord,
        (v_item->>'quantity')::numeric, (v_item->>'rate')::numeric, v_line_amount
      );
    end if;
  end loop;

  return v_quotation;
end;
$$;

revoke all on function update_quotation_with_items(uuid, date, boolean, jsonb) from public;
grant execute on function update_quotation_with_items(uuid, date, boolean, jsonb) to authenticated;

-- Converts a pending quotation into a job-order invoice, copying its REAL
-- itemized line items across (not collapsed to a single flat line).
create or replace function convert_quotation_to_invoice(p_quotation_id uuid)
returns invoices
language plpgsql
security definer
as $$
declare
  q quotations;
  new_invoice invoices;
  v_item quotation_items;
  v_ord int := 0;
begin
  select * into q from quotations where id = p_quotation_id and status = 'pending';
  if not found then
    raise exception 'Quotation not found or is no longer pending';
  end if;

  -- NOTE: this converts using the invoices table's defaults (slab 'A',
  -- discount_percent 10, discount_amount 0) — GST here is still the
  -- quotation's original undiscounted GST, not recalculated against the
  -- new discount. Reconciling quotation→invoice discount/GST math is
  -- explicitly deferred (client confirmed quotations stay discount-free
  -- for now) — flagged here rather than silently wrong.
  insert into invoices (customer_id, kind, description, amount, gst, work_status)
  values (q.customer_id, 'job', q.description, q.amount, q.gst, 'in_progress')
  returning * into new_invoice;

  for v_item in select * from quotation_items where quotation_id = p_quotation_id order by sort_order
  loop
    v_ord := v_ord + 1;
    if v_item.item_type = 'glass' then
      insert into invoice_items (
        invoice_id, item_type, description, sort_order, thickness_mm,
        length_in, width_in, glass_qty, rate_per_sft, sft, work_glass_amount,
        rft, polish_rate, polish_amount, fixing_rate_per_sft, fixing_amount, amount
      ) values (
        new_invoice.id, 'glass', v_item.description, v_ord, v_item.thickness_mm,
        v_item.length_in, v_item.width_in, v_item.glass_qty, v_item.rate_per_sft, v_item.sft, v_item.work_glass_amount,
        v_item.rft, v_item.polish_rate, v_item.polish_amount, v_item.fixing_rate_per_sft, v_item.fixing_amount, v_item.amount
      );
    else
      insert into invoice_items (invoice_id, item_type, description, sort_order, quantity, rate, amount)
      values (new_invoice.id, 'simple', v_item.description, v_ord, v_item.quantity, v_item.rate, v_item.amount);
    end if;
  end loop;

  update quotations
  set status = 'converted', converted_invoice_id = new_invoice.id
  where id = p_quotation_id;

  return new_invoice;
end;
$$;

revoke all on function convert_quotation_to_invoice(uuid) from public;
grant execute on function convert_quotation_to_invoice(uuid) to authenticated;

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

-- Prices and locks a pending vendor slip in one step: fills in rate/amount
-- on each line (p_items is [{ "id": <item uuid>, "rate": <numeric> }, ...]),
-- totals them, creates the matching expenses row (category 'Raw Material'),
-- links it back via vendor_slips.expense_id, and flips status to 'priced'.
-- Re-running this against an already-priced slip is rejected — a slip
-- locks the moment it's priced, matching the physical workflow where the
-- vendor's handwritten bill is a one-time record.
create or replace function price_vendor_slip(p_slip_id uuid, p_items jsonb)
returns vendor_slips
language plpgsql
security definer
as $$
declare
  v_slip vendor_slips;
  v_expense_id uuid;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_item_id uuid;
  v_rate numeric;
  v_qty numeric;
  v_amount numeric;
begin
  select * into v_slip from vendor_slips where id = p_slip_id;
  if not found then
    raise exception 'Slip not found';
  end if;
  if v_slip.status <> 'pending_pricing' then
    raise exception 'Slip has already been priced and is locked';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item rate is required';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item->>'id')::uuid;
    v_rate := (v_item->>'rate')::numeric;

    select quantity into v_qty from vendor_slip_items where id = v_item_id and slip_id = p_slip_id;
    if not found then
      raise exception 'Slip item % not found on this slip', v_item_id;
    end if;

    v_amount := round(v_qty * v_rate, 2);
    v_total := v_total + v_amount;

    update vendor_slip_items set rate = v_rate, amount = v_amount where id = v_item_id;
  end loop;

  if v_total <= 0 then
    raise exception 'Priced slip must total more than zero';
  end if;

  insert into expenses (category, vendor_id, description, amount, expense_date, is_paid)
  values ('Raw Material', v_slip.vendor_id, v_slip.dc_no, v_total, current_date, false)
  returning id into v_expense_id;

  update vendor_slips
  set status = 'priced', priced_at = now(), expense_id = v_expense_id
  where id = p_slip_id
  returning * into v_slip;

  return v_slip;
end;
$$;

revoke all on function price_vendor_slip(uuid, jsonb) from public;
grant execute on function price_vendor_slip(uuid, jsonb) to authenticated;

-- Records ONE payment against a vendor as a whole, rather than against a
-- single purchase — matches how the shop actually pays: the vendor is
-- owed one number at month-end, not paid bill-by-bill. Internally this
-- still allocates the amount across that vendor's outstanding expenses
-- (oldest expense_date first) as individual vendor_payments rows, so each
-- purchase/slip's own paid_amount/balance/status keeps working exactly as
-- before — the person just no longer has to pick which bill to pay.
create or replace function record_vendor_payment(
  p_vendor_id uuid,
  p_amount numeric,
  p_date date default current_date,
  p_note text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_remaining numeric(12,2) := p_amount;
  v_alloc numeric(12,2);
  rec record;
begin
  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  for rec in
    select e.id, greatest(e.amount - coalesce(p.paid, 0), 0) as balance
    from expenses e
    left join (
      select expense_id, sum(amount) as paid from vendor_payments group by expense_id
    ) p on p.expense_id = e.id
    where e.vendor_id = p_vendor_id
      and greatest(e.amount - coalesce(p.paid, 0), 0) > 0
    order by e.expense_date asc, e.created_at asc
  loop
    exit when v_remaining <= 0;
    v_alloc := least(v_remaining, rec.balance);
    insert into vendor_payments (expense_id, amount, payment_date, note)
    values (rec.id, v_alloc, p_date, p_note);
    v_remaining := v_remaining - v_alloc;
  end loop;

  if v_remaining > 0 then
    raise exception 'Payment amount exceeds this vendor''s total payable';
  end if;
end;
$$;

revoke all on function record_vendor_payment(uuid, numeric, date, text) from public;
grant execute on function record_vendor_payment(uuid, numeric, date, text) to authenticated;

-- ============================================================
-- Views — derived numbers, never stored redundantly
-- ============================================================

create view invoices_effective with (security_invoker = true) as
select
  i.*,
  coalesce(p.paid, 0) as paid_amount,
  greatest((i.amount - i.discount_amount + i.gst + i.transportation) - coalesce(p.paid, 0), 0) as balance,
  (case
    when i.kind = 'job' and i.work_status = 'in_progress' then 'in_progress'
    when coalesce(p.paid, 0) >= (i.amount - i.discount_amount + i.gst + i.transportation) then 'paid'
    when coalesce(p.paid, 0) > 0 then 'partial'
    when i.due_date is not null and i.due_date < current_date then 'overdue'
    else 'due'
  end)::invoice_status as effective_status
from invoices i
left join (
  select invoice_id, sum(amount) as paid from invoice_payments group by invoice_id
) p on p.invoice_id = i.id;

create view customer_balances with (security_invoker = true) as
select
  c.id,
  c.name,
  c.contact,
  c.address,
  c.gstin,
  coalesce(sum(i.amount - i.discount_amount + i.gst + i.transportation), 0) as total_billed,
  coalesce(sum(
    case
      when i.kind = 'job' and i.work_status = 'in_progress' then 0
      else greatest((i.amount - i.discount_amount + i.gst + i.transportation) - coalesce(p.paid, 0), 0)
    end
  ), 0) as outstanding
from customers c
left join invoices i on i.customer_id = c.id
left join (
  select invoice_id, sum(amount) as paid from invoice_payments group by invoice_id
) p on p.invoice_id = i.id
group by c.id;

-- Vendor purchases only (expenses with vendor_id set), with live
-- paid_amount / balance / payment_status from vendor_payments.
create view vendor_purchases_effective with (security_invoker = true) as
select
  e.*,
  coalesce(p.paid, 0) as paid_amount,
  greatest(e.amount - coalesce(p.paid, 0), 0) as balance,
  (case
    when coalesce(p.paid, 0) >= e.amount then 'paid'
    when coalesce(p.paid, 0) > 0 then 'partial'
    else 'unpaid'
  end) as payment_status
from expenses e
left join (
  select expense_id, sum(amount) as paid from vendor_payments group by expense_id
) p on p.expense_id = e.id
where e.vendor_id is not null;

-- Per-vendor running totals — payable now computed from real remaining
-- balance via vendor_payments, not the old is_paid boolean.
create view vendor_balances with (security_invoker = true) as
select
  v.id,
  v.name,
  v.category,
  v.contact,
  coalesce(sum(e.amount), 0) as total_purchased,
  coalesce(sum(greatest(e.amount - coalesce(p.paid, 0), 0)), 0) as payable
from vendors v
left join expenses e on e.vendor_id = v.id
left join (
  select expense_id, sum(amount) as paid from vendor_payments group by expense_id
) p on p.expense_id = e.id
group by v.id;

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
  select date_trunc('month', invoice_date)::date as month_start, sum(amount - discount_amount + gst + transportation) as revenue
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

create view dashboard_summary with (security_invoker = true) as
select
  (select count(distinct customer_id) from invoices
    where date_trunc('month', invoice_date) = date_trunc('month', current_date)) as customers_billed_this_month,
  (select count(*) from invoices where kind = 'job' and work_status = 'in_progress') as jobs_in_progress,
  (select count(*) from invoices where kind = 'job' and work_status = 'completed'
    and date_trunc('month', completed_at) = date_trunc('month', current_date)) as jobs_completed_this_month;

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
-- Internal team tool: any signed-in user can read and write
-- everything. Nothing is public.
-- ============================================================

alter table profiles enable row level security;
alter table business_settings enable row level security;
alter table customers enable row level security;
alter table vendors enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table invoice_payments enable row level security;
alter table quotations enable row level security;
alter table quotation_items enable row level security;
alter table expenses enable row level security;
alter table vendor_payments enable row level security;
alter table workers enable row level security;
alter table worker_advances enable row level security;
alter table important_links enable row level security;
alter table price_list enable row level security;
alter table vendor_slips enable row level security;
alter table vendor_slip_items enable row level security;
alter table purchase_bills enable row level security;
alter table purchase_bill_items enable row level security;

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

create policy "quotation_items full access" on quotation_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "expenses full access" on expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "vendor_payments full access" on vendor_payments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "workers full access" on workers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "worker_advances full access" on worker_advances
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "important_links full access" on important_links
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "price_list full access" on price_list
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "vendor_slips full access" on vendor_slips
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "vendor_slip_items full access" on vendor_slip_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "purchase_bills full access" on purchase_bills
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "purchase_bill_items full access" on purchase_bill_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Views were created with security_invoker = true, so they respect the RLS
-- of the querying user rather than running as the view owner.

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

insert into price_list (description, rate_per_sft, polish_rate, fixing_rate, sort_order) values
  ('Mirror with bevelling', 125, 45, 75, 1),
  ('Mirror with C.E.P', 125, 15, 75, 2),
  ('5mm Plain', 85, 15, 75, 3),
  ('6mm Plain', 110, 15, 75, 4),
  ('8mm Plain', 125, 15, 75, 5),
  ('10mm Plain', 165, 15, 75, 6),
  ('12mm Plain', 180, 15, 75, 7),
  ('5mm Tuff', 135, 15, 75, 8),
  ('6mm Tuff', 160, 15, 75, 9),
  ('8mm Tuff', 175, 15, 75, 10),
  ('10mm Tuff', 215, 15, 75, 11),
  ('12mm Tuff', 230, 15, 75, 12),
  ('black painted', 455, 15, 75, 13);