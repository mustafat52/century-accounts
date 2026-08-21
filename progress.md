# Century Glass Art — Accounts & Billing Software
### Complete System Documentation

**Client:** Century Glass Art (glass fabrication business, Hyderabad, Telangana)
**Built by:** HussainiAutomation
**Status:** Deployed — frontend on Vercel, backend on Supabase (live)
**Last updated:** This document reflects the system as of the most recent build pass (SFT/Rft dimensional pricing, WhatsApp reminders, and all 9 client-requested changes).

---

## 1. What This System Is

A custom accounts, billing, and business-tracking web application built to replace Century Glass Art's manual Excel-based workflow. It is used by two people — the business owner and an accountant/staff member — to manage customers, vendors, invoices, quotations, expenses, worker payslips, and business reports for a glass fabrication business.

It was **not** built as a generic off-the-shelf accounting tool. Its pricing model, document formats, and terminology were reverse-engineered from the client's own real working Excel template (a per-customer "Estimate" sheet), so the software mirrors how the business actually prices and documents a job — including square-footage-based glass pricing, running-foot edge/polish charges, and their specific GST/bank/terms formatting.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| Routing | react-router-dom (HashRouter) |
| Charts | Recharts |
| Excel export | SheetJS (`xlsx`) |
| Backend / Database | Supabase (hosted Postgres + Auth), free tier |
| Auth | Supabase Auth (email/password) |
| Hosting (frontend) | Vercel |
| Hosting (backend) | Supabase (nothing separate to deploy — schema is run once via SQL Editor) |
| Styling | Hand-written CSS (no framework), CSS custom properties for theming |

No server/API layer was written — the React app talks directly to Supabase via `@supabase/supabase-js`, with Postgres Row Level Security enforcing who can read/write what, and a handful of Postgres functions (RPCs) handling multi-step writes atomically.

---

## 3. Architecture

```
+---------------------------+         +--------------------------------+
|   Browser (React SPA)     |         |            Supabase             |
|   Vercel-hosted           |<------->|   Postgres + Auth + RLS         |
|                           |  HTTPS   |                                  |
|  AppContext.tsx (global   |  REST/   |  Tables, Views, Functions        |
|  state + all read/write   |  RPC     |  (see Section 5 - Database)      |
|  logic lives here)        |         |                                  |
+---------------------------+         +--------------------------------+
```

- There is **one global React Context** (`AppContext`) that owns all application state — customers, vendors, invoices, quotations, expenses, workers, links, dashboard stats, auth session, and every modal's open/closed state. Every page and component reads from and writes through this single context via the `useApp()` hook. There is no separate state-management library (no Redux/Zustand) — Context + `useState`/`useMemo` is sufficient at this scale.
- **No local/mock data remains.** Earlier in development the app ran on in-memory mock arrays; that was fully replaced by real Supabase calls. The old `src/data/mockData.ts` file was deleted once nothing referenced it.
- **Multi-step writes are done via Postgres functions (RPCs)**, not multiple sequential client-side calls, so they're atomic — e.g. creating an invoice with several line items, or converting a quotation into an invoice, happens in one database transaction.
- **Computed values are never stored redundantly.** Customer outstanding balances, vendor payables, invoice status (Due/Overdue/Partial/Paid), and monthly revenue figures are all computed live by Postgres **views**, not stored as columns that could drift out of sync.

---

## 4. Authentication & Access Model

- Two real user accounts exist in Supabase Auth:
  - `Shabbir@accounts.com` -> displays as "Shabbir Bhai"
  - `AbdulHussain@accounts.com` -> displays as "Abdul Hussain Bhai"
- Display names are stored in a `profiles` table (one row per `auth.users` row), looked up after login.
- On successful login, a full-screen "Welcome back, [Name]" animation plays (gold glow, fade timing) before landing on the Dashboard.
- **Row Level Security (RLS)** is enabled on every table. The policy for this app is simple: *any authenticated user can read and write everything* — there's no per-user data partitioning, because both users are trusted staff of the same single business (not a multi-tenant system).
- **Desktop vs. Mobile access is different** (see Section 7). This is a UI-layer restriction, not a security one — a technically savvy person could still hit the API from a phone, but the UI hides every mutating action below 860px width, so normal usage on mobile is view-only.

---

## 5. Database Schema (Supabase / Postgres)

Full source: `supabase/schema.sql` — this is the single file that provisions the entire backend. It is idempotent to run once on a fresh project; re-running on a project that already has it would error on `CREATE TABLE` (by design — a second run against live data should be a deliberate migration, not an accidental overwrite).

### 5.1 Enums
| Enum | Values | Used by |
|---|---|---|
| `invoice_kind` | `quick`, `job` | `invoices.kind` |
| `work_status` | `in_progress`, `completed` | `invoices.work_status` |
| `invoice_status` | `in_progress`, `due`, `overdue`, `partial`, `paid` | computed in `invoices_effective` view |
| `quotation_status` | `pending`, `converted`, `expired` | `quotations.status` |
| `expense_category` | `Raw Material`, `Labor`, `Payslips & Wages`, `Transport`, `Rent`, `Utilities`, `Maintenance` | `expenses.category` |
| `item_slab` | `A`, `B`, `C` | `invoice_items.slab` (A=B2C retail, B=B2B trade, C=special family rate — internal reference only, never printed) |

### 5.2 Sequences
- `invoice_seq` (starts at 1043) and `quotation_seq` (starts at 202) generate the human-readable `INV-####` / `QUO-###` numbers as column defaults on `invoices.invoice_no` / `quotations.quotation_no`.

### 5.3 Tables

**`profiles`** — one row per Supabase Auth user (`id` references `auth.users`), holds `display_name` and `email`. Populated manually in the dashboard, not via app signup (there's no signup flow — logins are provisioned by hand).

**`business_settings`** — a single-row table (`id boolean primary key default true check (id)` forces exactly one row) holding `gst_enabled boolean`. This is the global GST on/off toggle in the sidebar, shared by both users.

**`customers`** — `id, name, contact, address, gstin, created_at`. Note: no `total_billed`/`outstanding` columns — those are computed by the `customer_balances` view (Section 5.5), never stored.

**`vendors`** — `id, name, category, contact, created_at`. Suppliers only (raw glass, hardware, transport vendors) — deliberately kept separate from worker payroll, which lives in `workers`/`worker_advances`.

**`invoices`** — the core billing table:
- `id` (uuid, PK), `invoice_no` (human-readable, auto), `customer_id`, `kind`
- `description` — a short auto-generated summary (first ~3 item descriptions joined) shown in tables/lists
- `amount` — subtotal (sum of all line items' amounts)
- `gst` — total GST amount (displayed split 50/50 as CGST+SGST, see Section 6.4)
- `transportation` — optional flat charge added *after* GST (matches the client's own Excel template's Grand Total structure)
- `invoice_date`, `due_date` (nullable — null while a job order is still in progress), `work_status` (nullable — null for quick-sale invoices), `completed_at`
- **No `status` column.** Status is never stored — see `invoices_effective` view.

**`invoice_items`** — line items, one invoice to many items. Supports **two item shapes in the same table**, discriminated by `item_type`:
  - `'simple'` — flat-rate items (hardware, silicon, misc): `quantity`, `rate` -> `amount = quantity x rate`
  - `'glass'` — dimensional glass pricing, matching the client's real costing method:
    - `length_in`, `width_in` (inches), `glass_qty` (pieces), `rate_per_sft`
    - `sft` = `(length_in x width_in / 144) x glass_qty` — computed and **stored** at insert time
    - `work_glass_amount` = `sft x rate_per_sft`
    - `rft` (running feet / perimeter) = `(2 x (length_in + width_in) / 12) x glass_qty`
    - `polish_rate`, `polish_amount` = `rft x polish_rate` (optional — 0 if unused)
    - `fixing_rate_per_sft`, `fixing_amount` = `sft x fixing_rate_per_sft` (optional — 0 if unused)
    - `amount` = `work_glass_amount + polish_amount + fixing_amount`
  - Both types carry an optional `slab` (`A`/`B`/`C`) for internal reference.
  - A `CHECK` constraint enforces that the right fields are populated for whichever `item_type` is chosen.

**`invoice_payments`** — supports partial/advance payments against an invoice: `invoice_id`, `amount`, `payment_date`, `note`. An invoice can have any number of payment rows; the running total drives its computed status (see Section 5.5).

**`quotations`** — `id, quotation_no, customer_id, description, amount, gst, quotation_date, valid_until, status, converted_invoice_id`. Quotations are intentionally simpler than invoices — single description/amount, no line items, no dimensional pricing (that complexity only exists on the invoice side, once a job is confirmed).

**`expenses`** — `id, category, vendor_id (nullable), description, amount, expense_date, is_paid`. `is_paid = false` means the amount is still owed to the linked vendor (feeds `vendor_balances.payable`).

**`workers`** — the Payslips & Wages roster: `id, name, monthly_salary`. Added once, reused every month (not free-typed each time).

**`worker_advances`** — `id, worker_id, linked_expense_id, amount, advance_date, note`. Every advance also creates a matching row in `expenses` (category `Payslips & Wages`) via the `log_worker_advance()` function, so Reports/Expense totals stay accurate without double-entry.

**`important_links`** — `id, label, url, category, sort_order`. The "Important Links" page's data.

### 5.4 Functions (RPCs)
All are `SECURITY DEFINER` (run with elevated privilege internally, so they can write across multiple tables), but access is locked down explicitly:
```sql
revoke all on function ... from public;
grant execute on function ... to authenticated;
```
This matters because Postgres grants `EXECUTE` on new functions to `PUBLIC` by default — without the explicit revoke, an unauthenticated request could have called these functions directly.

| Function | Purpose |
|---|---|
| `create_invoice_with_items(customer_id, kind, due_date, gst_enabled, transportation, items jsonb)` | Creates an invoice and all its line items atomically. Computes each item's amount (glass formula or simple), sums the subtotal, computes GST, inserts the invoice row, then inserts every item row. Called by the "New Invoice" screen. |
| `mark_job_completed(invoice_id)` | Flips a job-order invoice from `work_status='in_progress'` to `'completed'`, sets `completed_at = today`, and sets `due_date = today + 1 month`. This is what starts the Due->Overdue clock — nothing is due until this is clicked. |
| `record_invoice_payment(invoice_id, amount, note)` | Inserts a payment row against an invoice. Used for both full and partial/advance payments. |
| `convert_quotation_to_invoice(quotation_id)` | Converts a pending quotation into a new job-order invoice (starts `in_progress`, one line item carrying the quotation's description/amount), and marks the quotation `converted`. |
| `log_worker_advance(worker_id, amount, date, note)` | Inserts into `worker_advances` **and** a matching row into `expenses` in the same call, so both the Payslips view and the general expense log stay in sync. |

### 5.5 Views (computed, never stored)

**`invoices_effective`** — the single source of truth for invoice status. Every column of `invoices`, plus:
- `paid_amount` = sum of that invoice's `invoice_payments`
- `balance` = `greatest((amount + gst + transportation) - paid_amount, 0)`
- `effective_status` computed as (priority order):
  1. `kind = 'job' AND work_status = 'in_progress'` -> **`in_progress`** (a job in progress is never "due", regardless of payments)
  2. `paid_amount >= total` -> **`paid`**
  3. `paid_amount > 0` -> **`partial`**
  4. `due_date < today` -> **`overdue`**
  5. otherwise -> **`due`**

**`customer_balances`** — per customer: `total_billed` (sum of all invoices ever) and `outstanding` (sum of unpaid balances, **excluding** in-progress job orders — unfinished work isn't billable yet).

**`vendor_balances`** — per vendor: `total_purchased` and `payable` (sum of `expenses` linked to that vendor where `is_paid = false`).

**`monthly_revenue_expense`** — last 12 months of revenue vs. expenses (revenue excludes in-progress job orders, same reasoning as above). Powers the Dashboard/Reports charts.

**`dashboard_summary`** — three scalar counts: customers billed this month, jobs currently in progress, jobs completed this month.

**`worker_month_summary`** — per worker: this month's total advances and `monthly_salary - advances_this_month` = remaining payout.

**Important implementation detail:** every view is created `with (security_invoker = true)`. Without this, a Postgres view runs as its *owner* by default, which can bypass the RLS policies on its underlying tables entirely — meaning an unauthenticated request could read a view and see everything, regardless of the "authenticated only" policies. This was caught and fixed during the build.

### 5.6 Row Level Security
Every table has RLS enabled with one policy: `using (auth.role() = 'authenticated')` for all operations. Since both real users are trusted staff with no need for data separation, there's no per-row filtering — the policy is uniform, not role- or ownership-based.

### 5.7 Seed Data
`schema.sql` ends with a few sample `customers` and `vendors` inserts, meant to be deleted once real data is entered. (These are what currently show on the live deployed site.)

---

## 6. Core Business Logic

### 6.1 Job Lifecycle (job-order invoices only)
```
[Created] -> in_progress (no due date, not billable yet)
     |  "Mark Completed" button
     v
  due (due_date = completion date + 1 month)
     |  time passes, unpaid
     v
  overdue
```
At any point after leaving `in_progress`, a payment can flip status to `partial` or `paid`. Quick-sale invoices skip the `in_progress` stage entirely — they get a due date at creation and behave like a normal due/overdue invoice from day one.

### 6.2 Dimensional Glass Pricing
Reverse-engineered from the client's own Excel ("VISHESH_SIR.xlsx" estimate sheet):
```
Sft  = (Length_in x Width_in / 144) x Qty
Rft  = (2 x (Length_in + Width_in) / 12) x Qty        [perimeter, running feet]
Work + Glass  = Sft x Rate_per_Sft
Polish        = Rft x Polish_Rate                       [optional, 0 if unused]
Fixing        = Sft x Fixing_Rate_per_Sft                [optional, 0 if unused]
Line Total    = Work+Glass + Polish + Fixing
```
Hardware/misc items on the same invoice use plain `Qty x Rate`.

### 6.3 Pricing Slabs (A/B/C)
Each line item (glass or simple) can carry a slab: **A** = B2C retail rate, **B** = B2B trade rate, **C** = special family rate. This is chosen per item (not per whole invoice), stored for the business's own reference, and **deliberately never printed on the bill**. There is currently no rate catalog — rates are typed in manually each time; a future Stock Management module is expected to eventually feed rates in automatically.

### 6.4 GST
- Global on/off toggle (`business_settings.gst_enabled`), shared by both users.
- When on, 18% is calculated on the item subtotal and stored as one `gst` amount — but **displayed as two lines, CGST 9% + SGST 9%**, matching how the client's own template and Indian domestic tax convention presents it. (Interstate customers would technically need IGST instead of CGST+SGST — this distinction is **not** currently implemented; flagged as a known gap.)
- Transportation is added **after** GST and is not itself taxed.

### 6.5 Payments
Any invoice not `in_progress` can receive one or more payments. Each payment is a row in `invoice_payments`; the invoice's status/balance is always derived live from the sum of its payments — nothing is manually toggled to "paid," it becomes `paid` automatically once `paid_amount >= total`.

### 6.6 Payslips & Wages
Workers are a fixed roster with a monthly salary. Cash advances are logged through the month as they're taken; the system shows `salary - this month's advances = remaining payout` per worker, so on salary day the owner can see the number instantly instead of doing the math. Every advance also lands in the general Expense log automatically (category "Payslips & Wages").

---

## 7. Desktop vs. Mobile

Full create/edit access on screens >= 860px. Below that:
- The sidebar is replaced by a horizontal scrollable tab bar (`MobileNav.tsx`) with a "View only on mobile" note.
- Every mutating control — New Invoice, New Quotation, New Customer, New Vendor, Record Expense, Edit, Convert, Mark Completed, Record Payment, the GST toggle, Add Worker/Log Advance, Add Link — carries a `desktop-only` CSS class, hidden below the breakpoint.
- **Printing and the "Copy Reminder" button remain available on mobile** — neither mutates data, they're read/output actions.
- All dashboards, tables, and reports remain fully viewable and scrollable on mobile.

---

## 8. Feature Walkthrough (page by page)

### Login (`/login`)
Email/password against Supabase Auth. On success, plays a personalized "Welcome back" animation, then routes to Dashboard. Session persists across refreshes via Supabase's own session storage.

### Dashboard (`/`)
- Revenue vs. expense trend chart (last 6 of the 12 months available)
- Outstanding receivables/payables totals
- Overdue invoice alerts
- Recent invoices feed
- **Customers billed this month / Jobs in progress / Jobs completed this month** — the three stats specifically requested by the client

### Invoicing (`/invoicing`)
Two tabs:
- **Invoices** — filterable by all 5 statuses. Each row can be printed, marked payment (Record Payment), marked completed (job orders), or have a reminder copied (due/overdue/partial only).
- **Quotations** — printable, editable while pending, convertible to an invoice in one click.

New Invoice modal: pick a customer, invoice type (Quick Sale / Job Order — due date only asked for Quick Sale), add any number of line items each toggled between **Glass (by size)** and **Hardware/Simple**, optional transportation charge, live-computed subtotal/GST/total preview.

### Customers (`/customers`)
List + detail view. Add customer (name, contact, address, GSTIN). Per-customer profile shows full purchase history (date, invoice, description, amount, status), a "+ New Bill" shortcut that pre-fills that customer, and Excel export (single customer, or "Export All" for a bulk workbook with one sheet per customer).

### Vendors (`/vendors`)
Supplier list with purchase history and running payables. No expense category conflation — vendors here are strictly suppliers.

### Expenses (`/expenses`)
- General categorized expense log + category breakdown
- **Payslips & Wages** section: worker roster, "Log Advance" per worker, live salary-minus-advances table

### Reports (`/reports`)
A full statistics hub filterable by This Month / Last 3 Months / Last 6 Months / This Year:
- Revenue vs. expense chart for the period
- Invoice status breakdown (all 5 statuses)
- Top customers, top vendors
- Expense-by-category
- Quotation performance (pending value vs. converted/won value)
- Live receivables/payables snapshot (not period-filtered — always "as of today")

### Important Links (`/links`)
Frequently used business links (banking, GST portal, suppliers, etc.), grouped by optional category, opens in a new tab. Visible read-only on mobile.

### Printable Documents
A single component (`PrintableDocument.tsx`) renders both invoices and quotations in a professional letterhead format:
- Real logo, address, email, GSTIN
- Bill-to block (customer name, contact, address, GSTIN)
- **Two separate item tables** when both are present — "Glass Work" (with Size/Sft/Rate/Rft/Polish/Fixing columns) and "Architectural Hardware" — matching the client's own Excel layout
- Subtotal -> CGST -> SGST -> Transportation -> Total, plus a Paid/Balance Due section if any payment has been recorded
- Bank details (Kotak Mahindra Bank) and standard Terms & Conditions
- "Print" opens the browser print dialog (styled to hide everything but the document — "Save as PDF" works cleanly)

### WhatsApp Reminders
A "Copy Reminder" button on any Due/Overdue/Partial invoice (in Invoicing and in customer history) builds a formal reminder message (customer name, invoice number, amount, and remaining balance if partially paid) and copies it to the clipboard — ready to paste into WhatsApp. No API integration; purely a copy-paste time-saver.

---

## 9. Full File Reference

### Root
| File | Purpose |
|---|---|
| `package.json` | Dependencies & scripts (`dev`, `build`, `preview`) |
| `vite.config.ts` | Vite + React plugin config |
| `tsconfig.json` / `tsconfig.node.json` | TypeScript project config |
| `index.html` | Vite entry HTML — loads Google Fonts, mounts `#root` |
| `.env.example` | Template for the two required env vars |
| `.gitignore` | Ignores `node_modules`, `dist`, env files, editor/OS junk |
| `README.md` | Setup instructions, architecture notes, per-round changelog |
| `TESTING_CHECKLIST.md` | Full QA checklist covering every feature built |
| `SYSTEM_DOCUMENTATION.md` | This file |

### `supabase/`
| File | Purpose |
|---|---|
| `schema.sql` | The entire backend — run once in Supabase's SQL Editor (see Section 5) |

### `src/` (top level)
| File | Purpose |
|---|---|
| `main.tsx` | React entry point — wraps `<App>` in `<HashRouter>` |
| `App.tsx` | Route definitions + `ProtectedShell` (auth-gates everything except `/login`) |
| `types.ts` | Every TypeScript type/interface used across the app (mirrors the DB shape) |
| `nav.ts` | Shared nav item list, used by both `Sidebar` and `MobileNav` |
| `vite-env.d.ts` | Ambient types so TS recognizes `import.meta.env` and image imports |

### `src/lib/`
| File | Purpose |
|---|---|
| `supabaseClient.ts` | Initializes the Supabase client from env vars |
| `mappers.ts` | Converts Supabase's snake_case rows into the app's camelCase types — the one file that changes if the schema changes |

### `src/context/`
| File | Purpose |
|---|---|
| `AppContext.tsx` | **The heart of the app.** All state (customers, vendors, invoices, quotations, expenses, workers, links, dashboard stats, auth, every modal's open state), all data loading, and every `add*`/`update*`/`mark*`/`record*` function that talks to Supabase. Everything else in the app reads/writes through `useApp()`. |

### `src/utils/`
| File | Purpose |
|---|---|
| `format.ts` | `formatINR()` — Rupee currency formatting |
| `exportLedger.ts` | Excel export (single customer + bulk all-customers workbook), via SheetJS |
| `reminderMessage.ts` | Builds the WhatsApp reminder text from an invoice + customer name |

### `src/pages/` (one per route)
| File | Route | Purpose |
|---|---|---|
| `Login.tsx` | `/login` | Email/password form + welcome animation |
| `Dashboard.tsx` | `/` | Stats, chart, overdue alerts, recent invoices |
| `Invoicing.tsx` | `/invoicing` | Invoices + Quotations tabs |
| `Customers.tsx` | `/customers` | List + profile + history + Excel export |
| `Vendors.tsx` | `/vendors` | Supplier list |
| `Expenses.tsx` | `/expenses` | Expense log + Payslips & Wages |
| `Reports.tsx` | `/reports` | Period-filterable statistics hub |
| `Links.tsx` | `/links` | Important Links list |

### `src/components/`
| File | Purpose |
|---|---|
| `Sidebar.tsx` | Desktop nav, logo, GST toggle, logout, signed-in-as label |
| `MobileNav.tsx` | Mobile-only horizontal tab bar + view-only notice |
| `Topbar.tsx` | Per-page header (title, subtitle, New Quotation/New Invoice buttons) |
| `StatCard.tsx` | Small faceted stat tile (used on Dashboard/Reports) |
| `StatusBadge.tsx` | Colored pill for the 5 invoice statuses |
| `InvoiceModal.tsx` | New Invoice form — glass/simple item cards, transportation, live totals |
| `CustomerModal.tsx` | New Customer form (name, contact, address, GSTIN) |
| `VendorModal.tsx` | New Vendor form |
| `ExpenseModal.tsx` | New Expense form (incl. Payslips & Wages as a selectable category) |
| `QuotationModal.tsx` | New/Edit Quotation form |
| `WorkerModal.tsx` | Add Worker form (name, monthly salary) |
| `AdvanceModal.tsx` | Log Advance form (worker, amount, date, note) |
| `LinkModal.tsx` | Add Link form (label, URL, category) |
| `PaymentModal.tsx` | Record Payment form against an invoice |
| `PrintableDocument.tsx` | The letterhead-formatted printable invoice/quotation (see Section 8) |
| `CopyReminderButton.tsx` | The WhatsApp reminder copy-to-clipboard button |

### `src/styles/`
| File | Purpose |
|---|---|
| `global.css` | The entire design system — CSS custom properties (dark + gold theme), layout, all component styles, print styles, mobile breakpoint |

### `src/assets/`
| File | Purpose |
|---|---|
| `logo-dark.png` | Century Glass Art logo for dark backgrounds (sidebar, login) |
| `logo-light.png` | Logo for light/white backgrounds (printed documents) |

---

## 10. Design System Notes
- **Theme:** dark charcoal background with gold accents, warm off-white text, a serif display font (Fraunces) for headings paired with Manrope for body/UI and a monospace font for currency figures.
- **Signature visual element:** "faceted" stat cards with one clipped corner (CSS `clip-path`), evoking a cut-glass edge.
- All colors are CSS custom properties (`--gold`, `--success`, `--danger`, `--info`, `--partial`, etc.) defined once in `global.css` — status badges, charts, and buttons all reference these rather than hardcoding colors.

---

## 11. Known Gaps / Backlog (not built yet, intentionally deferred)
- **Realtime sync** — if both users are active simultaneously, each needs to refresh to see the other's changes. Supabase supports realtime subscriptions as a future addition to `AppContext.tsx`.
- **Stock Management module** — raw glass sheet inventory by size (what arrives, what's cut/used, what remains in the godown). Committed scope, not yet built. Would eventually feed rates into the invoice item picker instead of manual entry.
- **Product/rate catalog** — depends on Stock Management above.
- **IGST handling** — interstate customers currently get the same CGST+SGST split as intrastate ones; no logic distinguishes by customer state yet.
- **Salary payout action** — Payslips currently shows what's owed; there's no dedicated "mark salary paid" event separate from ad-hoc advances.
- **Business phone number** — still a placeholder on the printed document (email, GSTIN, address, and bank details are all real).

---

## 12. Deployment Summary
- **Frontend:** GitHub repo -> Vercel (Vite preset, auto-detected). Env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in Vercel Project Settings, applied to all environments. Vite bakes these in at build time, so a redeploy is required after adding/changing them.
- **Backend:** Supabase project, schema run once via SQL Editor. GitHub-Supabase integration connected for reference, with "Deploy to production" left **off** (the repo doesn't use Supabase's CLI migration-file format, so auto-apply-on-merge isn't safe to enable as-is).
- **Auth:** two users provisioned manually in Supabase Authentication -> Users, with matching `profiles` rows for their display names.

---

## 13. Changelog — Testing Session & Feature Build (this pass)

This section documents everything found, fixed, and built during the post-deployment testing session that followed the initial build. It covers bug fixes, infrastructure debugging, and two significant feature additions (itemized quotations, vendor purchase/payment tracking). Organized by file, in the order the work happened.

### 13.1 Critical infrastructure issue: invoice saves silently failing

**Symptom:** New Invoice modal appeared to save successfully (modal closed, no visible error) but no row ever appeared in Supabase's `invoices` table. Browser console showed `400 Bad Request` on `POST /rest/v1/rpc/create_invoice_with_items` with the response `{"message":"No API key found in request","hint":"No \`apikey\` request header or url param was found."}`.

**Root cause investigation (extensive, ruled out in this order):**
1. ❌ Wrong Supabase URL/key in `.env.local`/Vercel — verified correct via direct `curl` test, which succeeded with the same keys the browser was using
2. ❌ Outdated `@supabase/supabase-js` not supporting the new `sb_publishable_...` key format — upgraded from `2.45.4` to `2.112.2`, issue persisted
3. ❌ Browser extension stripping the `apikey` header — reproduced identically in Incognito with extensions disabled
4. ❌ Something specific to the word "invoice" in the URL — renamed the RPC function from `create_invoice_with_items` to `create_order_with_items`; issue persisted identically
5. ❌ RPC calls in general being blocked — a different RPC (`log_worker_advance`) succeeded fine from the same session
6. ❌ Payload size/complexity — a minimal single-item payload still failed identically
7. ❌ Malformed request from application code — inspected the raw request payload in DevTools; it was well-formed, valid JSON matching the expected shape
8. ❌ Duplicate/misconfigured Vercel deployments — found and cleaned up two duplicate Vercel projects (`century-accounts-qc9m`, `century-accounts`) pointing at the same repo; not the root cause, but cleaned up as good hygiene
9. **Confirmed via direct request-header inspection**: the `apikey` header WAS present and correct in the outgoing browser request (verified in DevTools Network tab, matched byte-for-byte against a simultaneously-successful GET request using the same key) — yet Supabase's server reported it as absent. This proves the header was being stripped or the request altered **in transit**, after leaving the browser but before reaching Supabase's edge — consistent with antivirus/security-software HTTPS inspection or similar local network-layer interference on the developer's machine, specifically triggered by this one POST request shape (cause never fully identified, despite eliminating every application-level explanation).

**Resolution (pragmatic workaround, not a root-cause fix):** Rather than continue chasing the network-layer cause, `addInvoice` in `AppContext.tsx` was rewritten to stop calling the `create_order_with_items` RPC entirely. It now performs the equivalent work as two sequential client-side calls instead:
1. Computes Sft/Rft/GST/line-totals in JavaScript (moved out of the Postgres function, logic ported 1:1 from the SQL)
2. `supabase.from('invoices').insert(...)` to create the invoice row
3. `supabase.from('invoice_items').insert(...)` to insert all line items
4. If step 3 fails, the invoice row from step 2 is deleted (`supabase.from('invoices').delete()`) to avoid an orphaned invoice with no items — a manual rollback since this is no longer a single atomic DB transaction

This same client-side-insert pattern was later reused for quotations and vendor purchases (see below), since those also needed to avoid the same class of RPC POST failure.

**Consequence for the architecture:** the "Multi-step writes are done via Postgres functions (RPCs)... atomic" claim in Section 3 of this document is now **only true for `mark_job_completed` and `record_invoice_payment`**, which are still RPC-based and were confirmed working. Invoice creation, quotation creation/editing, and quotation-to-invoice conversion now use sequential client-side inserts with manual rollback-on-failure instead of true DB-transaction atomicity. This is a deliberate trade-off accepted to unblock testing; the original `create_order_with_items` (renamed) SQL function still exists in the database, unused, and could be revisited later if the root network cause is ever identified.

**Files touched:** `src/context/AppContext.tsx` (`addInvoice` rewritten), `supabase/schema.sql` (function renamed via `ALTER FUNCTION`, though the rewrite means it's currently dead code).

### 13.2 Bug fix: New Invoice modal — content overflow, no scroll

**Symptom:** Adding more than ~3 line items to an invoice caused the modal to overflow the viewport with no way to scroll; form fields appeared visually clipped/misaligned.

**Root cause:** `.modal` had no `max-height` or internal scroll; `.modal-overlay` centered the modal with `align-items: center`, so once content exceeded viewport height it simply overflowed off-screen top and bottom.

**Fix (`src/styles/global.css`):**
- `.modal` given `max-height: calc(100vh - 80px)` and made a flex column
- `.modal-body` given `flex: 1; min-height: 0; overflow-y: auto` so only the middle section scrolls, while header/footer stay pinned
- `.modal-overlay` given vertical padding as a safety margin on short viewports

### 13.3 Bug fix: New Invoice modal — horizontal field overflow

**Symptom:** After fixing the vertical scroll, glass item fields (Length, Width, Polish rate, etc.) were still visibly clipped/overflowing horizontally, with a stray horizontal scrollbar inside the modal.

**Root cause:** `.item-fields` used CSS Grid with `grid-template-columns: repeat(4, 1fr)`. Grid/flex items default to `min-width: auto`, meaning number/text inputs refused to shrink below their content's natural minimum width even though the grid tracks were set to `1fr` — with 4 columns of inputs in a fixed-width modal, they overflowed the container.

**Fix (`src/styles/global.css`):** Changed grid columns to `repeat(4, minmax(0, 1fr))` and added explicit `min-width: 0` to `.item-fields .form-field` and its child `input`/`select` elements, overriding the browser default so columns can actually shrink to fit.

### 13.4 Bug fix: Invoice/Quotation modal form resets on tab switch

**Symptom:** Mid-entry on a New Invoice form, switching browser tabs and returning wiped all entered data back to blank.

**Root cause:** The form-population `useEffect` in `InvoiceModal.tsx` had `customers` in its dependency array. Supabase's client silently refreshes the auth session in the background on tab-focus/visibility change, which triggers `onAuthStateChange` → `loadAllData()` → `refreshCustomers()`, producing a **new** `customers` array reference each time (even with identical data). React saw this as a changed dependency and re-ran the reset logic on every background refresh, not just on modal open.

**Fix:** Added a `wasOpenRef` (via `useRef`) to track whether the modal was already open on the previous render, so the reset logic only fires on the actual open transition (`false → true`), ignoring background data refreshes while the modal stays open. Applied to `InvoiceModal.tsx`; the same pattern was built into `QuotationModal.tsx` from the start since it was written after this fix was identified.

### 13.5 Bug fix: Dashboard revenue delta — NaN% and +Infinity%

**Symptom:** The "Revenue this month" stat card's percentage-vs-last-month delta showed literal `NaN%` (when both this month and last month were ₹0) or `+Infinity%` (when last month was ₹0 and this month had real revenue).

**Root cause (`src/pages/Dashboard.tsx`):** `revenueDelta` calculation divided `(thisMonth.revenue - lastMonth.revenue) / lastMonth.revenue` with no guard for `lastMonth.revenue === 0`.

**Fix:** Added explicit branching — when last month is `0` and this month has revenue, display "First revenue this period" instead of computing a percentage; when both are `0`, show no delta (as before). Normal month-over-month cases unchanged.

### 13.6 Feature fix: Customer ledger export — invoice-level, not item-level

**Symptom:** The client wanted a detailed, date-by-date purchase history per customer (what was bought, when, at what price) ending in a lifetime total. The existing Excel export (`src/utils/exportLedger.ts`) only listed one row per **invoice** (with a combined description string like "shower cubbicle, window pane, SS Patch Fixing"), not one row per **item purchased**.

**Fix:** Rewrote `customerLedgerRows()` to iterate each invoice's `items` array and emit one row per line item, with a new `itemDetail()` helper that formats glass items as `"48in × 24in × 2 pcs · 16 sft · 24 rft"` and simple items as `"Qty 4 × ₹250"`. Invoice-level totals (Total, Status) now only print once per invoice, on that invoice's first item row, to avoid implying each item row carries the full invoice total. Sheet order changed so "Purchase History" (the detailed sheet) opens first instead of the summary card.

### 13.7 Printed invoice/quotation — Terms & Conditions and Bank Details reformatted, page-fit tightened

**Context:** Client provided their real, current Terms & Conditions and Bank Details block (from their existing Excel-based billing process) and asked for it to appear verbatim on every printed bill.

**Changes to `src/components/PrintableDocument.tsx`:**
- Bank Details changed from a single condensed line to a labeled 5-line block (Company Name, Bank Name, Branch, Account No, IFSC Code), matching the client's exact reference format
- Terms & Conditions expanded from a 4-sentence paraphrase to the client's full, exact 9-clause numbered list (delivery timeline, 70/20/10 payment terms, non-cancellable custom orders, responsibility ceasing at goods leaving premises, no scratch guarantee, 2-day quotation validity, Hyderabad jurisdiction, E&O.E.)
- Logo size reduced (190px → 130px), header/address block font sizes trimmed slightly

**Changes to `src/styles/global.css` (multiple rounds, iteratively tightened to fit one printed page):**
- `.receipt-page` padding reduced (48px 52px → 32px 40px on-screen; further reduced for `@media print`)
- `.receipt-table th`/`td` padding reduced (~40% less vertical padding per row)
- `.receipt-head` bottom padding/margin reduced
- `.receipt-footer` and `.receipt-signature-line` top margins reduced
- `.receipt-totals-row` padding reduced, `.grand` row font-size trimmed
- Added an explicit `@page { size: A4; margin: 8mm; }` rule inside the `@media print` block, which reclaims the browser's default reserved print margin (this had the single biggest impact on reclaiming vertical space)
- `PrintableDocument.tsx`: Terms & Conditions block `lineHeight` reduced 1.5 → 1.4, `marginBottom` reduced 8 → 4

**Result:** A 3-item invoice (2 glass + 1 hardware line) with full Bank Details and all 9 T&C clauses now fits on one A4 page, verified via Chrome's Print/Save-as-PDF preview. Noted to the client: invoices with significantly more line items (~8+) may still spill to a second page — this is a physical space constraint, not a bug, and was called out explicitly rather than silently left as a surprise.

**Known caveat:** current T&C block is printed identically on both invoices and quotations, including clause 6 ("Quotation Validity - 2 days"), which the client confirmed he wants shown on *every* document as-is, even though it's logically quotation-specific. This was a deliberate choice, not an oversight.

### 13.8 Major feature: Itemized quotations (previously flat single-line-item)

**Problem identified by client:** Quotations only supported a single flat description + amount (no line items), while invoices had full glass/hardware itemization. Client provided a real reference quotation ("SNEHA KULKARNI VILLA PROJECT") showing how the business actually quotes jobs — itemized by Area/Location, Description of Goods, Glass Thickness, Size, Qty, Sft, Rate, Work+Glass, Rft, Polish, Fixing, Amount — confirming quotations need the same structural depth as invoices, not just a lump sum.

**New fields introduced (not previously in the schema):**
- **`thickness_mm`** (text, e.g. "12MM", "5+5+5") — added to both `invoice_items` and the new `quotation_items` table, since it appeared in the client's real reference document and applies to both stages
- **`area`** (text, e.g. "BAR COUNTER", "MBR SHOWER") — added to `quotation_items` only, an optional location/area label separate from the item description

**Database changes (`supabase/schema.sql`, applied via a live `ALTER`/`CREATE` migration, additive/non-destructive — existing invoice/customer data untouched):**
- `alter table invoice_items add column thickness_mm text;`
- New table **`quotation_items`** — mirrors `invoice_items`' structure (glass/simple discriminated union, same Sft/Rft/polish/fixing columns) plus `area` and `thickness_mm`, with RLS enabled under the same "any authenticated user" policy as every other table
- New view **`vendor_purchases_effective`** — see §13.9, unrelated to quotations but added in the same session
- Three new/replaced Postgres functions were written for schema completeness (`create_quotation_with_items`, `update_quotation_with_items`, and a rewritten `convert_quotation_to_invoice`) but — consistent with §13.1 — **the actual application code does NOT call these as RPCs**. All three were reimplemented as sequential client-side inserts in `AppContext.tsx` from the start, to avoid the same POST-to-`/rpc/` failure mode already diagnosed. The SQL functions exist in the database as unused/dormant code, kept for schema documentation completeness and as a fallback if the RPC issue is ever resolved.
- **Known limitation flagged, not yet fixed:** quotations created *before* this migration have no corresponding `quotation_items` rows. Opening Edit or Convert on any such legacy quotation will not show/carry real items (only new quotations created after this change have proper item data). Test/seed quotations predating the migration should be deleted and recreated.

**`src/types.ts` changes:** New `NewQuotationItemInput` discriminated union type (mirrors `NewInvoiceItemInput` but adds `area` and `thicknessMm`); `NewQuotationInput`/`EditQuotationInput` changed from `{description, amount}` to `{items: NewQuotationItemInput[]}`.

**`src/context/AppContext.tsx` changes:**
- `addQuotation`, `updateQuotation`, `convertQuotationToInvoice` fully rewritten (previously: single insert with flat description/amount; now: compute subtotal from real items client-side, insert quotation row, insert `quotation_items` rows, with rollback-on-failure for `addQuotation`)
- `convertQuotationToInvoice` rewritten to fetch the quotation's real `quotation_items`, create a new Job Order invoice, and copy every real item across into `invoice_items` (previously: collapsed the whole quotation into a single flat invoice line item, discarding any itemization)
- New shared helpers `computeQuotationItemAmount()` and `buildQuotationItemRows()` (same Sft/Rft/GST math as invoices, kept in sync manually since there's no shared module between the two yet — worth refactoring into a shared utility later if invoice and quotation formulas ever need to change together)

**New `src/components/QuotationModal.tsx`** (previously a simple description/amount form, now rebuilt to mirror `InvoiceModal.tsx`'s item-card UI):
- Same Glass/Hardware item-type toggle, same Sft/Rft live computation, same "+ Add Glass Item" / "+ Add Hardware Item" buttons
- New fields not present on invoice items: **Area/Location** (text input) and **Thickness (mm)** (text input, glass items only)
- Supports both create (`New Quotation`) and edit (`Edit Quotation`) modes via the existing `editingQuotationId` context state; customer selector is disabled while editing (can't reassign an existing quotation to a different customer)
- Uses the `wasOpenRef` tab-switch-reset-guard pattern from §13.4
- Default "Valid until" date auto-fills to **today + 2 days**, matching the client's own T&C clause 6 ("Quotation Validity - 2 days")
- **Known incomplete piece, explicitly flagged, not yet built:** when editing an existing quotation, the modal currently pre-fills only `customerId` and `validUntil` — it does **not** yet fetch and load that quotation's existing `quotation_items` into the item-card UI, since `AppContext`'s `quotations` state doesn't carry items. Opening Edit on a saved itemized quotation will currently show one blank item card instead of the real saved items. A `fetchQuotationItems(quotationDbId)` helper (mirroring the existing `fetchInvoiceEffective`) was identified as the needed fix but **not implemented in this session** — this is the single most important remaining gap in the quotation feature and should be addressed before relying on the Edit flow for real itemized quotations.

**Convert-to-Invoice button:** confirmed already existed in both `Invoicing.tsx` (Quotations tab, "Convert" button) and `PrintableDocument.tsx` (print-preview toolbar, "Convert to Invoice" button) from the original build — no new UI needed here, only the underlying `convertQuotationToInvoice` logic needed the item-copying rewrite described above.

**Testing status:** schema migration applied and confirmed running without error. End-to-end save→convert→verify flow (using the Sneha Kulkarni reference data) was set up as the next test step but **not yet confirmed completed/verified** in this session before the conversation moved to the vendor feature.

### 13.9 Major feature: Vendor purchase & payment tracking (previously vendor list was read-only, purchases logged awkwardly via generic Expenses)

**Problem identified by client:** The Vendors page only ever showed a static list with lifetime totals — there was no way to log a purchase against a specific vendor from that page, no per-vendor purchase history/drill-down (unlike Customers, which has a full profile view), and vendor-linked spending had to be recorded through the generic Expenses form by remembering to pick a vendor from a dropdown, with only a binary paid/unpaid flag (no partial payments).

**Design decision (confirmed with client):** Vendor purchases stay in the existing `expenses` table (already had a nullable `vendor_id` — no need for a new item-level table). Two behavioral changes requested and implemented:
1. Vendor-linked expenses now **excluded entirely** from the general Expenses page — that page shows only non-vendor spending (Rent, Utilities, Labor, Transport, Payslips & Wages)
2. Vendor purchases support **partial payments** (like invoices already do), not just a binary paid/unpaid toggle

**Database changes (`supabase/schema.sql`, additive migration):**
- New table **`vendor_payments`** (`expense_id`, `amount`, `payment_date`, `note`) — mirrors `invoice_payments` structurally, supports multiple partial payments against one purchase
- New view **`vendor_purchases_effective`** — every `expenses` row where `vendor_id is not null`, joined against `vendor_payments` to compute live `paid_amount`, `balance`, and `payment_status` (`unpaid`/`partial`/`paid`), same computed-not-stored pattern as `invoices_effective`
- **`vendor_balances` view replaced** (`create or replace view`) — `payable` now computed from real remaining balance (`amount - sum(vendor_payments)`) instead of the old binary `is_paid` flag
- **Known data caveat, flagged but not auto-fixed:** any expense rows logged against a vendor *before* this migration (using the old `is_paid` boolean) will now show as **fully unpaid** in the new payable calculation, since no corresponding `vendor_payments` row exists for them. A one-time backfill script (inserting a full-amount `vendor_payments` row for any pre-existing `is_paid = true` row) was offered but **not requested/run** — pre-existing test data should be deleted and re-logged if this matters.

**`src/types.ts` additions:**
```ts
export type VendorPaymentStatus = 'unpaid' | 'partial' | 'paid';
export interface VendorPurchase {
  id: string; vendorId: string; category: ExpenseCategory; description: string;
  amount: number; date: string; paidAmount: number; balance: number; paymentStatus: VendorPaymentStatus;
}
```

**`src/lib/mappers.ts` addition:** `mapVendorPurchase(row)` — snake_case→camelCase mapper for the new `vendor_purchases_effective` view rows.

**`src/context/AppContext.tsx` changes:**
- New state: `vendorPurchases: VendorPurchase[]`
- New `refreshVendorPurchases()` — fetches from `vendor_purchases_effective`
- **`refreshExpenses()` and the `loadAllData()` expenses query both changed** to add `.is('vendor_id', null)` — this single filter is what makes vendor purchases disappear from the general Expenses page
- **`addExpense` simplified** — no longer accepts `vendorId`/`markUnpaid` params; always inserts with `vendor_id: null, is_paid: true` (non-vendor spending only, always considered settled immediately — no partial-payment concept for rent/utilities/etc.)
- New **`addVendorPurchase(input)`** — inserts into `expenses` with the given `vendor_id` and `is_paid: false`, then refreshes vendor balances
- New **`recordVendorPayment(expenseId, amount, note)`** — inserts into `vendor_payments`, then refreshes both `vendorPurchases` and `vendors` (balances)

**`src/components/ExpenseModal.tsx` — rebuilt/simplified:** Vendor dropdown and "not yet paid" checkbox removed entirely (that logic moved to the new Vendor-specific modals below). "Raw Material" removed from the category list, since that's now always a vendor purchase in this workflow. Remaining categories: Labor, Payslips & Wages, Transport, Rent, Utilities, Maintenance.

**New `src/components/VendorPurchaseModal.tsx`:** "Record Purchase" form — Category (Raw Material/Maintenance/Transport), Description, Amount, Date. Takes `vendorId` as a prop (pre-filled, not a dropdown) since it's always opened from a specific vendor's page.

**New `src/components/VendorPaymentModal.tsx`:** "Record Payment" form against an existing purchase — shows the purchase's description and current balance due, takes an Amount + optional Note, with an overpayment guard (amount cannot exceed the outstanding balance, mirroring the invoice payment behavior).

**`src/pages/Vendors.tsx` — rebuilt** from a flat read-only list into a two-view page (list + drill-down detail), matching the existing `Customers.tsx` pattern:
- List view: unchanged vendor table (name, category, total purchased, payable), now clickable rows
- New detail view (on row click): vendor name/category/contact header, Total Purchased + Payable stat cards, full purchase history table (date, description, category, amount, paid-so-far/balance sub-line, status badge, per-row "Record Payment" button for anything not fully paid), and a "+ Record Purchase" button in the panel header
- "← All vendors" back button returns to the list

**Testing status:** all files/schema delivered in this session; final verification round (log a purchase → confirm excluded from Expenses page → partial payment → full payment → confirm status badge and vendor Payable total update correctly) was set up as the next step but **confirmation not yet received** before the conversation ended.

### 13.10 Debugging note worth preserving: file-creation mixups

During the vendor feature build, `VendorPaymentModal.tsx` was accidentally created with a duplicate copy of `VendorPurchaseModal.tsx`'s content instead of its own distinct content, causing TypeScript prop-mismatch errors. Resolved by explicitly re-supplying the correct, distinct content for each of the three vendor-related component files (`VendorModal.tsx`, `VendorPurchaseModal.tsx`, `VendorPaymentModal.tsx`) side-by-side for clarity. No code defect — purely a copy/paste mixup during manual file creation — but noted here since it's a recurring risk pattern when multiple similarly-named modal files are being created in the same session.

### 13.11 Summary of files changed or added in this session

**Modified:**
- `src/context/AppContext.tsx` — invoice creation moved off RPC to client-side inserts (§13.1); quotation functions fully rewritten for itemization (§13.8); vendor purchase/payment functions added, expense functions changed to exclude vendor rows (§13.9)
- `src/components/InvoiceModal.tsx` — tab-switch reset bug fix (§13.4)
- `src/components/PrintableDocument.tsx` — Bank Details/T&C reformatted, spacing tightened for one-page fit (§13.7)
- `src/components/ExpenseModal.tsx` — vendor dropdown/unpaid checkbox removed, simplified to non-vendor categories only (§13.9)
- `src/pages/Dashboard.tsx` — NaN%/Infinity% guard added (§13.5)
- `src/pages/Vendors.tsx` — rebuilt with detail/drill-down view (§13.9)
- `src/utils/exportLedger.ts` — item-level purchase history instead of invoice-level (§13.6)
- `src/styles/global.css` — modal scroll/overflow fixes (§13.2, §13.3), print layout tightening (§13.7)
- `src/types.ts` — added `NewQuotationItemInput`/updated quotation input types (§13.8), added `VendorPurchase`/`VendorPaymentStatus` (§13.9)
- `src/lib/mappers.ts` — added `mapVendorPurchase` (§13.9)
- `supabase/schema.sql` — RPC function renamed (dead code, §13.1); `thickness_mm` column added to `invoice_items`, new `quotation_items` table + RLS + (unused) RPC functions (§13.8); new `vendor_payments` table, `vendor_purchases_effective` view, `vendor_balances` view replaced (§13.9)

**Newly created:**
- `src/components/QuotationModal.tsx` — rebuilt from scratch as an itemized form (§13.8) — note: this replaced a much simpler pre-existing file of the same name
- `src/components/VendorPurchaseModal.tsx` (§13.9)
- `src/components/VendorPaymentModal.tsx` (§13.9)

### 13.12 Open items / not yet completed as of end of this session

1. Quotation Edit flow does not load existing saved items (§13.8) — highest-priority remaining gap
2. End-to-end itemized quotation test (save → convert → verify resulting invoice) started but not confirmed complete
3. Vendor purchase/payment end-to-end test (log purchase → exclude from Expenses → partial/full payment → status transitions) delivered but not confirmed complete
4. Pre-migration legacy quotations (no `quotation_items`) and pre-migration vendor expenses (no `vendor_payments`) will display incorrectly/incompletely until deleted and re-entered, or until a backfill is written
5. Original TESTING_CHECKLIST.md sections not yet revisited after all these changes: Section 12 (Reports page), Section 16 (Mobile/Desktop split) — worth re-running given how much underlying data-fetching logic changed this session
6. Root cause of the original RPC "No API key found" networking issue was never definitively identified — worked around, not fixed. If the same symptom reappears on a different machine/deployment, the full diagnostic trail in §13.1 documents everything already ruled out.

# Century Glass Art — Session Changelog

This documents everything built, fixed, and discussed in this working session, in the order it happened. It's meant to sit alongside `SYSTEM_DOCUMENTATION.md` as a record of what changed since that document was last updated.

**Scope of this session:** Price List catalog, invoice-level Slab/Discount redesign, a full Invoice-modal rebuild (multiple rounds of UI iteration), customer quick-create with fuzzy matching, six printed-invoice changes, and a Dashboard/Reports analytics pass.

**Important caveat, read first:** partway through this session, the client's codebase was found to have already moved ahead independently — a **Vendor Slips (DC)** feature (`vendor_slips`/`vendor_slip_items` tables, `CareOf` staff assignment, a `record_vendor_payment` / `price_vendor_slip` RPC pair) exists in `AppContext.tsx` and `types.ts` that was **not built in this session** and that this session has no visibility into (no `mappers.ts`, no components for it were ever shared). Every file below was edited against the version available at the time; anywhere that turned out to be stale is called out explicitly.

---

## 0. Initial codebase study (no changes)

Read every file in the uploaded project end to end — `AppContext.tsx`, all pages, all modals, `PrintableDocument.tsx`, `mappers.ts`, `schema.sql`, styles, the works — before touching anything.

Two things flagged at this stage:
- `supabase/schema.sql` in the repo was **stale** relative to what was actually live on Supabase — missing `quotation_items`, `vendor_payments`, `vendor_purchases_effective`, and `thickness_mm`, all of which the frontend already depended on.
- `QuotationModal.tsx`'s Edit flow didn't load a quotation's existing items (pre-existing gap, not touched this session).

A corrected, full `schema.sql` (938 lines, matching the live DB) was later provided by the client and verified line-by-line against `AppContext.tsx`/`mappers.ts` — confirmed correct, no changes made at that point.

---

## 1. Price List (glass rate catalog)

**Request:** a real product/rate catalog (Description, Rate/Sft, Polish Rate, Fixing Rate) that could be managed from its own tab, with add/edit/delete, fully separate from invoice creation.

### Files touched
| File | Change |
|---|---|
| `supabase/schema.sql` | New `price_list` table + RLS policy + seed data (13 real rates from the client's rate sheet) |
| `supabase/migrations/003_price_list.sql` | *New* — additive migration for the live DB |
| `src/types.ts` | New `PriceListItem` interface |
| `src/lib/mappers.ts` | New `mapPriceListItem` |
| `src/context/AppContext.tsx` | New `priceList` state, `refreshPriceList`, `addPriceListItem`, `updatePriceListItem`, `deletePriceListItem`; wired into `loadAllData` and the context value |
| `src/nav.ts` | New "Price List" nav item, after Invoicing |
| `src/App.tsx` | New `/price-list` route |
| `src/pages/PriceList.tsx` | *New* — list page: table + Add/Edit/Delete |
| `src/components/PriceListModal.tsx` | *New* — Add/Edit form |

### Correction made mid-phase
The first pass at `schema.sql` was built on top of the **stale** repo copy rather than the corrected 938-line version, so the file handed over was missing `quotation_items`/`vendor_payments`/etc. This was caught (client noticed the line-count drop) and fixed — `price_list` was re-merged into the correct base and the full corrected `schema.sql` was re-delivered.

---

## 2. Invoice-level Slab & Discount + Product Dropdown + Invoice Modal rebuild

**Request:** Slab A/B/C/D redefined as **invoice-level discount tiers** (A=10%, B=15%, C=20%, D=custom%) — not the old meaningless per-item reference label. One slab per bill. Discount calculated on the pre-tax subtotal; GST calculated on the **post-discount** value. A Product dropdown on glass line items, pulling from the Price List, autofilling rates but staying editable.

Decisions locked in during discussion:
- GST computed on post-discount (taxable) value.
- Rate/Polish/Fixing stay editable after autofill.
- Quotations stay discount-free for now (explicitly deferred).
- Default slab on every new invoice: **A**.

### Files touched
| File | Change |
|---|---|
| `supabase/schema.sql` | New `invoice_slab` enum (A/B/C/D) replacing the old `item_slab`; `invoices` gains `slab`, `discount_percent`, `discount_amount`; `invoice_items`/`quotation_items` lose their per-item `slab` column; dead-code RPC functions (`create_order_with_items`, `create_quotation_with_items`, `update_quotation_with_items`, `convert_quotation_to_invoice`) fixed to drop slab references; `invoices_effective`, `customer_balances`, `monthly_revenue_expense` views updated to net out `discount_amount` |
| `supabase/migrations/004_invoice_slab_discount.sql` | *New* — live migration (see §2.1 for a bug found in this file) |
| `src/types.ts` | `ItemSlab` → `InvoiceSlab` + `SLAB_DISCOUNT_PERCENT` lookup; `InvoiceItem` loses `slab`, gains `thicknessMm` (closed a previously-flagged gap where thickness was stored but never surfaced to the UI); `Invoice` gains `slab`, `discountPercent`, `discountAmount` |
| `src/lib/mappers.ts` | `mapInvoiceItem` drops slab, reads `thicknessMm`; `mapInvoice` reads the three new fields, balance fallback formula updated |
| `src/context/AppContext.tsx` | `NewInvoiceItemInput`/`NewQuotationItemInput` lose `slab`; `NewInvoiceInput` gains `slab`/`discountPercent`; `addInvoice` rewritten — discount computed on subtotal, GST on taxable value, all three fields stored on the invoice row; quotation item builders and `convertQuotationToInvoice` updated (with an explicit comment flagging the deferred quotation→invoice discount reconciliation) |
| `src/components/InvoiceModal.tsx` | Rebuilt — Slab selector (A–D, custom % field for D) added at bill level; Product dropdown added to glass items; per-item Slab field removed entirely; live totals breakdown (Subtotal → Discount → GST → Transport → Total) |
| `src/components/QuotationModal.tsx` | Per-item Slab field removed to match |
| `src/components/PrintableDocument.tsx` | Total calc made discount-aware; a "Discount (Slab X — Y%)" line added to the printed totals *(later removed again — see §5)* |
| `src/components/PaymentModal.tsx`, `src/utils/exportLedger.ts`, `src/utils/reminderMessage.ts`, `src/pages/Dashboard.tsx`, `src/pages/Invoicing.tsx`, `src/pages/Reports.tsx`, `src/pages/Customers.tsx` | Every place a total was computed as `amount + gst + transportation` updated to `amount - discountAmount + gst + transportation` (invoices only — quotation totals deliberately left untouched, since quotations carry no discount) |

### 2.1 Migration bug found and fixed
Running `004_invoice_slab_discount.sql` failed with:
```
ERROR: 42P16: cannot change name of view column "paid_amount" to "slab"
```
Root cause: `ALTER TABLE invoices ADD COLUMN slab, ...` appends new columns to the *end* of the table, but `invoices_effective`'s `SELECT i.*, ...` expands those new columns into the *middle* of the view's column list — which `CREATE OR REPLACE VIEW` doesn't allow (only pure appends are permitted). Fixed by switching that one view to `DROP VIEW` + `CREATE VIEW`. `customer_balances` and `monthly_revenue_expense` were unaffected (their column lists didn't change shape) and were left as `CREATE OR REPLACE`.

---

## 3. Invoice Modal — UI redesign (multiple rounds)

The client found the invoice-item entry UI "suffocating" and wanted the next line item to appear automatically instead of clicking "+ Add" every time. This went through several rounds of screenshot-driven iteration:

1. **Discussion** — agreed: auto-add a new row the moment the current row is fully valid; description auto-collapses when a Product is picked; open design direction otherwise.
2. **Table redesign** — replaced bordered item-cards with a compact table (`.item-table` CSS: inputs borderless until focused, so the table reads as plain text at rest); auto-add-on-valid-row logic added; description collapsed to static text + a "Custom description" override link when a Product was selected.
3. **Bug fixes** — `table-layout: fixed` + an explicit `<colgroup>` added (columns were shifting per-row without it); sticky table header; dedicated scroll area for the item table; modal widened to 960px; modal height budget increased.
4. **Bigger box** — item table's own scroll area increased 300px → 480px for 5–6 visible rows.
5. **Simplification** — client found the nested scrollbar (table scroll *inside* modal scroll) clumsy with 5+ items, and asked to drop the "Custom description" toggle entirely. Both removed: description is now always a plain, always-editable input; the item table lost its own scroll region entirely, going back to one scroll (the modal itself).
6. **"Box big from start"** — client clarified they wanted the items area to reserve a generous fixed height *immediately*, not grow as items are added. Item table given `min-height: 400px`; modal height budget pushed to near-full-viewport (`calc(100vh - 24px)`).
7. **Thickness removed, dimension rounding, typable product field** — three changes together:
   - Thickness column removed entirely (redundant — the product name already says "10mm Tuff").
   - Length/Width now round **up** to the next multiple of 6 (never nearest) before any Sft/Rft/Amount math — implemented identically in both `InvoiceModal.tsx`'s live preview and `AppContext.tsx`'s `addInvoice`, and the **rounded** dimensions are what get stored, so a printed invoice's L×W always matches its printed Sft.
   - Product dropdown + separate Description input merged into one typable field (`<input list>` + `<datalist>`) — pick a suggestion or type a custom description directly.
8. **Bug fixes from screenshots** — the dimensions/sft/rft sub-text under Amount was overflowing its column (traced to `white-space: nowrap` on the parent bleeding down to the child — fixed); native number-input spinner arrows hidden across the item table.

### Files touched across this phase
`src/components/InvoiceModal.tsx` (rebuilt multiple times), `src/styles/global.css` (extensive — new `.item-table*` rules, modal sizing, spinner-hiding, overflow fixes), `src/context/AppContext.tsx` (`roundUpTo6` helper added to `addInvoice`, matching the modal's own).

---

## 4. Customer quick-create + fuzzy matching

**Request:** the customer being invoiced isn't always already in the system — allow typing a new name directly in the invoice screen, auto-creating that customer.

Decision locked in: name-only is fine — `contact` becomes optional (not a required prompt at invoice time). The dedicated "+ New Customer" form on the Customers page still requires contact info; only this quick-create path allows a bare name.

### Files touched
| File | Change |
|---|---|
| `supabase/schema.sql` | `customers.contact` — `not null` → nullable |
| `supabase/migrations/005_customer_contact_optional.sql` | *New* — `alter table customers alter column contact drop not null;` |
| `src/types.ts` | `Customer.contact: string` → `string \| null` |
| `src/context/AppContext.tsx` | `NewCustomerInput.contact` made optional; `addCustomer` handles a missing contact |
| `src/components/InvoiceModal.tsx` | Customer field became a typable combobox (same `<datalist>` pattern as Product); `handleSave` made async — on save, matches the typed name against existing customers (case-insensitive, exact), and if nothing matches, calls `addCustomer` to create one on the spot before creating the invoice |

### 4.1 Fuzzy matching (same session, follow-up request)
Plain Levenshtein edit-distance matcher added, no new dependency. While typing a customer name, if it's *close* but not exactly equal to an existing customer (e.g. "Grand Vista Hotel" vs the real "Grand Vista Hotels"), a small "Did you mean **X**? (existing customer)" hint appears — click to snap to the real one, or ignore it and a new customer is created as normal. Verified against realistic typo cases before shipping.

**Files touched:** `src/components/InvoiceModal.tsx` (`levenshtein`, `normalizeName`, `findFuzzyCustomerMatch`, hint UI), `src/styles/global.css` (`.inline-suggest-link`).

---

## 5. Printed invoice — six changes

**Requests, in order:**
1. Remove the line below the logo (turned out to be a real CSS `border-bottom`, distinct from a teal accent line baked into the logo image itself).
2. Remove the "Exclusive . Bespoke . Quality" tagline.
3. Tidy the Subtotal/CGST/SGST/Total block.
4. Hide the discount/slab from the printed bill entirely (app screens keep showing it internally).
5. Bank Details next to Terms & Conditions, not stacked above.
6. A small slab-letter marker near the top for staff reference — meaningless to a customer, useful to whoever's holding the physical copy.

### Files touched
| File | Change |
|---|---|
| `src/assets/logo-light.png` | Cropped (900×842 → 900×680) — the teal accent line and tagline text were one baked-in graphic, so removing the tagline meant cropping both together; the "G" logomark itself is untouched |
| `src/styles/global.css` | Removed `.receipt-head`'s gold `border-bottom`; widened and tidied `.receipt-totals`/`.receipt-totals-row` (top separator, monospace tabular-aligned figures, better spacing); new `.receipt-two-col` grid class |
| `src/components/PrintableDocument.tsx` | Small "Ref {slab}" marker added near the invoice number/date block (invoices only); discount line **removed** from the printed totals — "Subtotal" now displays the post-discount taxable value directly, so CGST/SGST/Total all flow from it with zero visible trace of a discount; Bank Details + Terms & Conditions restructured into the new two-column grid |

Confirmed explicitly: this hides the discount **only on the printed document** — every in-app screen (Invoicing, Dashboard, Reports, Customer profiles) still shows real discount figures for internal bookkeeping.

---

## 6. Dashboard pie chart + Reports slab/GST breakdown

**Context:** the client's live codebase had moved ahead independently by this point (the Vendor Slips feature — see the caveat at the top of this document). Updated copies of `Dashboard.tsx`, `Reports.tsx`, `AppContext.tsx`, and `types.ts` were provided to work from. Since `mappers.ts` and the Vendor Slip components weren't shared, `AppContext.tsx` in the working sandbox was **not** replaced with the newer version — the older, already-working copy has everything `Dashboard.tsx`/`Reports.tsx` need (the `Invoice`/`Customer`/`Vendor` shapes are unchanged between versions) and avoids a cascade of compile errors from untracked files.

**Requests, clarified before building:**
- Discovered the Dashboard's chart was actually a *line* chart, not a bar chart (the bar chart lives on the Reports page) — confirmed the intended target was the Dashboard's line chart.
- Confirmed the pie's two slices: Total Revenue vs Total Expenses.
- Slab-wise figures: how many customers/invoices per slab, and how much business.
- GST vs non-GST business split.

### Files touched
| File | Change |
|---|---|
| `src/pages/Dashboard.tsx` | "Revenue vs Expenses — last 6 months" panel converted from a `LineChart` to a `PieChart` — two slices (Revenue, Expenses), summed across the last 6 months to match the panel's own label (which the old chart wasn't strictly honoring); friendly empty state if both are zero |
| `src/pages/Reports.tsx` | New "Slab breakdown" panel — per slab (A/B/C/D): invoice count, unique customer count, total business, always shows all four even at zero; new "GST vs non-GST business" panel — total amount and invoice count split by whether GST was charged, both respecting the page's existing period filter |

Aggregation logic for both new panels was sanity-checked against hand-built sample data before shipping (numbers matched exactly).

---

## Full list of migrations, in order

Run in this order against the live Supabase project:

1. `supabase/migrations/003_price_list.sql`
2. `supabase/migrations/004_invoice_slab_discount.sql` *(use the corrected version — see §2.1)*
3. `supabase/migrations/005_customer_contact_optional.sql`

`supabase/schema.sql` itself was kept in sync with all of the above throughout, but is a **fresh-install reference only** — it does not need to be run against the already-live database.

---

## Complete file reference — everything touched this session

### New files
- `supabase/migrations/003_price_list.sql`
- `supabase/migrations/004_invoice_slab_discount.sql`
- `supabase/migrations/005_customer_contact_optional.sql`
- `src/pages/PriceList.tsx`
- `src/components/PriceListModal.tsx`

### Modified files
- `supabase/schema.sql`
- `src/types.ts`
- `src/lib/mappers.ts`
- `src/context/AppContext.tsx`
- `src/nav.ts`
- `src/App.tsx`
- `src/components/InvoiceModal.tsx` *(most-touched file this session, by far)*
- `src/components/QuotationModal.tsx`
- `src/components/PrintableDocument.tsx`
- `src/components/PaymentModal.tsx`
- `src/utils/exportLedger.ts`
- `src/utils/reminderMessage.ts`
- `src/pages/Dashboard.tsx`
- `src/pages/Invoicing.tsx`
- `src/pages/Reports.tsx`
- `src/pages/Customers.tsx`
- `src/styles/global.css`
- `src/assets/logo-light.png`

---

## Known gaps / deferred items

1. **Vendor Slips (DC) feature** — exists in the client's live codebase (`AppContext.tsx`, `types.ts`) but was never built in this session and this session has no visibility into its `mappers.ts` entries or UI components. Needs a proper sync pass if further work should touch it.
2. **Quotation → Invoice discount reconciliation** — explicitly deferred per the client's own instruction. Converting a quotation currently produces an invoice with the database defaults (Slab A, `discount_amount` 0), not a recalculated discount/GST. Flagged in code comments in both `AppContext.tsx` and `schema.sql`.
3. **Round-up-to-6 dimension rule** — implemented for invoices only, not quotations (matches the discount rule's scope).
4. **Fuzzy matching** — implemented for the Customer field only. The same Levenshtein technique could be applied to the Product/Description field if typos there become a similar problem; not requested yet.
5. **Editing slab on an already-created invoice** — not built. Slab is currently set once, at invoice creation, via the modal.
6. **Quotation Edit flow** (pre-existing gap, noted at the very start of this session, not touched) — doesn't load a quotation's existing items when reopened for editing.
7. **`.env` file** — present in the repo with live Supabase credentials; excluded from every file handed over this session. Worth confirming it's `.gitignore`'d if it isn't already.

---

## What was verified vs. what wasn't

Every change in this session was checked with a full-project `tsc --noEmit --strict` type-check before being handed over, and passed clean each time. Several pieces of business logic (the slab-discount math, the fuzzy-matching thresholds, the slab/GST aggregation in Reports) were additionally sanity-checked against hand-built sample data in isolation.

**Not verified:** none of this was tested end-to-end in a live browser against the real Supabase project — that testing happened on the client's side, via screenshots fed back into this session, which is how several of the UI bugs (column collapse, overflow text, stale-cache confusion) were caught and fixed.