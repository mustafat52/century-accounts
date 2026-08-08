# Century Glass Art — Accounts

React + TypeScript + Vite frontend, backed by a real Supabase (Postgres) database.

## 1. Set up Supabase (one-time)

1. Create a free project at [supabase.com](https://supabase.com) (the free tier is plenty for
   this business: 500 MB database, 50k monthly active users, 5 GB file storage).
2. Open **SQL Editor** in the Supabase dashboard, paste in the entire contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates every table, view,
   and function the app needs, sets up Row Level Security, and adds a little seed data (a few
   sample customers/vendors — delete these once you're on real data).

   > If you already ran an earlier version of this file against a live project: this version
   > replaces it (adds line items, payments, workers/payslips, links, and reworks how
   > due/overdue is computed). Easiest is to drop the old objects and re-run this in full —
   > there's no real business data riding on it yet at this stage.
3. Go to **Authentication → Users** and manually create the two logins:
   - `Shabbir@accounts.com` — set a password
   - `AbdulHussain@accounts.com` — set a password
4. Go to **Table Editor → profiles** and add one row per user you just created:
   - `id` = that user's UUID (copy from the Users list)
   - `display_name` = `Shabbir Bhai` / `Abdul Hussain Bhai`
   - `email` = same email as their login
5. Go to **Project Settings → API** and copy the **Project URL** and **anon public** key.

## 2. Connect the frontend

```bash
cp .env.example .env.local
```

Fill in the two values from step 1.5, then:

```bash
npm install
npm run dev
```

(`npm install` picks up two new dependencies this round: `xlsx` for the Excel ledger export, no
other changes to how you run it.)

## 3. Deploy

**Frontend (Vercel):** push to GitHub, import into Vercel (Vite preset auto-detected), add the
two `VITE_SUPABASE_*` env vars in Project Settings, deploy.

**Backend (Supabase):** nothing to deploy — already live once the schema's been run. The free
tier pauses a project after 7 days with zero API requests; the first request after a pause takes
a few extra seconds to wake it back up.

## How data flows

- `src/lib/supabaseClient.ts` — the Supabase client.
- `src/lib/mappers.ts` — converts Supabase's snake_case rows into the app's camelCase types.
- `src/context/AppContext.tsx` — loads all business data on login, exposes `add*`/`update*`
  functions backed by real Supabase inserts/updates and a few RPC calls for multi-step writes.
- Running totals (customer outstanding, vendor payable, monthly revenue/expense, dashboard
  counts, worker advances) are **computed by Postgres views**, never stored — so they can't
  drift out of sync with the underlying data.

## What's new in this round (the 9 client-requested changes)

1. **Dashboard stats** — customers billed this month, jobs in progress, jobs completed this
   month (`dashboard_summary` view).
2. **Job lifecycle** — job-order invoices start `In Progress` with no due date at all. Clicking
   **Mark Completed** sets the due date to +1 month from that moment; it becomes `Overdue`
   automatically once that passes, all computed live in the `invoices_effective` view — nothing
   is stored and mutated directly.
3. **Multi-item invoices with pricing slabs** — each invoice can hold several line items, each
   with its own **A/B/C** slab (B2C / B2B / family rate). The slab is stored for the business's
   own reference and deliberately left off the printed bill. There's no product catalog yet (that
   arrives later with the Stock module) — items are typed in freehand each time for now.
4. **Excel ledger export** — a "Export (Excel)" button on each customer's profile, plus
   "Export All (Excel)" on the Customers page for a bulk workbook (one sheet per customer).
   See `src/utils/exportLedger.ts`.
5. **Customer address** — added to the New Customer form and shown on their profile and on
   printed bills.
6. **Vendors vs. Expenses** — Vendors stays supplier-only. Expenses gained a **Payslips & Wages**
   section: add a worker once (name + fixed monthly salary), log cash advances as they're taken
   through the month, and the page shows salary − advances-this-month = remaining payout automatically.
   Every advance also drops a matching row into the regular expense log, so Reports stays accurate.
7. **Advance/partial payment slip** — "Record Payment" on any due/overdue/partial invoice opens a
   small form, then immediately opens the same printable invoice document with a Paid / Balance
   Due summary added — same document, no separate receipt type to keep track of.
8. **GST split** — printed bills now show CGST (9%) and SGST (9%) as two lines instead of one 18%
   line. Same total either way.
9. **Important Links** — a new page for frequently used business links, visible read-only on
   mobile too, add/edit on desktop.

## Dimension-based glass pricing (from the client's Excel workflow)

Reviewed the business's own Excel template (per-customer estimate sheets) and rebuilt invoice line
items to match how they actually price a job, instead of flat qty×rate for everything:

- **Glass items** are priced by size: enter length, width, quantity, and rate per square foot —
  the app computes Sft `(L×W/144)×qty`, the running-foot perimeter (`Rft`) for edge/profile work,
  and optional polish (`Rft × polish rate`) and fixing/installation (`Sft × fixing rate`) charges.
  Line total = Work+Glass + Polish + Fixing, same formula as their sheet.
- **Hardware/simple items** (silicon, hinges, misc.) stay flat qty×rate, same as before.
- Both kinds can appear on the same invoice; the A/B/C slab still applies to either.
- **Transportation** is a separate optional charge added after GST, matching their template's
  Grand Total = (Glass + Hardware + GST) + Transportation.
- The printed bill now shows Glass Work and Architectural Hardware as two separate tables (plus
  Transportation as its own line) when both are present — same layout as their Excel.
- Real business details from that sheet are now on the printed documents: GSTIN
  `36AMJPH2003H1ZI`, email `centuryglassart@gmail.com`, bank details (Kotak Mahindra Bank), and
  their standard Terms & Conditions text.

There's still no product/rate catalog — length, width, and rates are typed in per item each time.
That's intentionally deferred to the future Stock Management module (see below), which will track
raw sheet glass by size (cut vs. remaining in the godown) and can eventually feed rates into the
item picker instead of manual entry.

## Desktop vs. mobile
Full create/edit access on screens wider than 860px. Below that, the app shows a mobile nav bar
and every mutating action is hidden — mobile is a read-only view of the business (including the
new Payslips section and Important Links). Printing still works on mobile since it doesn't change
any data.

## Still worth doing next
- **Realtime sync** — right now each user needs to refresh to see the other's changes. Supabase
  supports realtime subscriptions as a follow-up to `AppContext.tsx`.
- **Stock/product catalog module** — once built, it'll feed the A/B/C rates into the invoice item
  picker instead of typing each item by hand.
- **Salary payout action** — right now Payslips shows what's owed; actually recording "salary
  paid" as its own event (separate from advances) is a natural next step.
- Swap the placeholder business phone in `PrintableDocument.tsx` for the real one once you have it
  (email, GSTIN, address, and bank details are already the real ones).

## WhatsApp payment reminders
A **Copy Reminder** button now appears next to any Due, Overdue, or Partial invoice — in
Invoicing and in a customer's purchase history. Clicking it builds a formal reminder message
(invoice number, amount, and remaining balance if partially paid) and copies it to the clipboard,
ready to paste straight into WhatsApp. See `src/utils/reminderMessage.ts` for the template and
`src/components/CopyReminderButton.tsx` for the button. No WhatsApp API/integration involved —
it's a copy-paste aid, not auto-sending.