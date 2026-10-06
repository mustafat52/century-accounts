import { formatINR } from '../utils/format';

// One row of public.activity_log (written automatically by database
// triggers; see supabase/migrations/007_activity_log.sql).
export interface ActivityEntry {
  id: number;
  createdAt: string;
  actorId: string | null;
  actorName: string;
  action: 'insert' | 'update' | 'delete';
  tableName: string;
  recordId: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  rowData: Record<string, any> | null;
}

export function mapActivity(row: any): ActivityEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    actorId: row.actor_id ?? null,
    actorName: row.actor_name ?? 'System',
    action: row.action,
    tableName: row.table_name,
    recordId: row.record_id ?? null,
    changes: row.changes ?? null,
    rowData: row.row_data ?? null,
  };
}

// Lookups built from data the app already has loaded, used to turn ids
// (customer_id, quotation_id...) into readable names.
export interface ActivityLookups {
  quotations: Map<string, string>;
  customers: Map<string, string>;
  vendors: Map<string, string>;
  workers: Map<string, string>;
  invoices: Map<string, string>;
}

export const AREAS: Array<{ key: string; label: string; tables: string[] }> = [
  { key: 'all', label: 'Everything', tables: [] },
  { key: 'sales', label: 'Quotations, payments & invoices', tables: ['quotations', 'quotation_payments', 'quotation_changes', 'invoices'] },
  { key: 'customers', label: 'Customers', tables: ['customers'] },
  { key: 'purchasing', label: 'Vendors, purchases & expenses', tables: ['vendors', 'vendor_payments', 'vendor_slips', 'purchase_bills', 'expenses'] },
  { key: 'workers', label: 'Workers & salaries', tables: ['workers', 'worker_advances', 'worker_payments'] },
  { key: 'pricelist', label: 'Price list', tables: ['price_list'] },
  { key: 'inventory', label: 'Inventory', tables: ['inv_categories', 'inv_stock', 'inv_waste', 'inv_cutting_jobs'] },
  { key: 'admin', label: 'Settings, links & logins', tables: ['business_settings', 'important_links', 'profiles'] },
];

const TABLE_LABELS: Record<string, string> = {
  quotations: 'Quotation',
  quotation_payments: 'Customer payment',
  quotation_changes: 'Quotation items',
  invoices: 'Invoice',
  customers: 'Customer',
  vendors: 'Vendor',
  vendor_payments: 'Vendor payment',
  vendor_slips: 'Vendor slip',
  purchase_bills: 'Purchase bill',
  expenses: 'Expense',
  workers: 'Worker',
  worker_advances: 'Worker advance',
  worker_payments: 'Worker salary payment',
  price_list: 'Price list item',
  important_links: 'Link',
  business_settings: 'Settings',
  profiles: 'Employee login',
  inv_categories: 'Glass category',
  inv_stock: 'Stock line',
  inv_waste: 'Waste line',
  inv_cutting_jobs: 'Cutting job',
};

export function tableLabel(t: string): string {
  return TABLE_LABELS[t] ?? t;
}

const FIELD_LABELS: Record<string, string> = {
  quotation_no: 'Quotation no.',
  invoice_no: 'Invoice no.',
  dc_no: 'DC no.',
  quotation_date: 'Date',
  expense_date: 'Date',
  payment_date: 'Payment date',
  advance_date: 'Date',
  valid_until: 'Valid until',
  rate_per_sft: 'Rate / sft',
  polish_rate: 'Polish rate',
  fixing_rate_per_sft: 'Fixing rate / sft',
  fixing_rate: 'Fixing rate',
  glass_qty: 'Qty',
  length_in: 'Length (in)',
  width_in: 'Width (in)',
  gst: 'GST',
  gst_enabled: 'GST invoicing',
  is_active: 'Active',
  is_paid: 'Paid',
  discount_percent: 'Discount %',
  discount_amount: 'Discount',
  monthly_salary: 'Monthly salary',
  display_name: 'Name',
  for_month: 'For month',
  customer_name: 'Customer name',
  care_of: 'Care of',
  gstin: 'GSTIN',
  supplier_gstin: 'Supplier GSTIN',
  place_of_supply: 'Place of supply',
};

const label = (k: string) => FIELD_LABELS[k] ?? k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

// Never useful to show as a field line.
const HIDDEN_FIELDS = new Set(['id', 'created_at', 'updated_at', 'updated_by', 'sort_order', 'quotation_no', 'invoice_no', 'dc_no']);

const shortId = (v: string) => `#${String(v).slice(0, 8)}`;

function formatValue(key: string, v: unknown, lk: ActivityLookups): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);

  if (key.endsWith('_id')) {
    const maps: Record<string, Map<string, string>> = {
      customer_id: lk.customers,
      vendor_id: lk.vendors,
      worker_id: lk.workers,
      quotation_id: lk.quotations,
      source_quotation_id: lk.quotations,
      converted_invoice_id: lk.invoices,
      invoice_id: lk.invoices,
    };
    return maps[key]?.get(s) ?? shortId(s);
  }
  if (key.includes('percent')) return `${s}%`;
  if (/(amount|total|gst|rate|salary|transportation|balance|price)/.test(key) && key !== 'gst_enabled' && s !== '' && !isNaN(Number(s))) {
    return formatINR(Number(s));
  }
  if (/^\d{4}-\d\d-\d\dT/.test(s)) return new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  return s;
}

function entityName(e: ActivityEntry, lk: ActivityLookups): string {
  const rd = e.rowData ?? {};
  switch (e.tableName) {
    case 'quotations':
      return rd.quotation_no ?? lk.quotations.get(String(e.recordId)) ?? '';
    case 'invoices':
      return rd.invoice_no ?? lk.invoices.get(String(e.recordId)) ?? '';
    case 'quotation_payments':
    case 'quotation_changes':
      return lk.quotations.get(String(rd.quotation_id)) ?? '';
    case 'customers':
    case 'vendors':
    case 'workers':
    case 'inv_categories':
      return rd.name ?? '';
    case 'vendor_slips':
      return rd.dc_no ?? '';
    case 'purchase_bills':
      return [rd.invoice_no, rd.supplier_name].filter(Boolean).join(' · ');
    case 'expenses':
    case 'price_list':
      return rd.description ?? '';
    case 'vendor_payments':
      return lk.vendors.get(String(rd.vendor_id)) ?? '';
    case 'worker_advances':
    case 'worker_payments':
      return lk.workers.get(String(rd.worker_id)) ?? '';
    case 'important_links':
      return rd.label ?? '';
    case 'profiles':
      return rd.display_name || rd.email || '';
    default:
      return '';
  }
}

export function describeTitle(e: ActivityEntry, lk: ActivityLookups): string {
  const rd = e.rowData ?? {};
  const ent = entityName(e, lk);
  const withEnt = (s: string) => (ent ? `${s}: ${ent}` : s);

  if (e.tableName === 'quotation_payments') {
    const amt = rd.amount !== undefined ? formatINR(Number(rd.amount)) : '';
    if (e.action === 'insert') return `Recorded payment ${amt} on ${ent || 'a quotation'}`;
    if (e.action === 'delete') return `Deleted payment ${amt} on ${ent || 'a quotation'}`;
    return `Changed payment on ${ent || 'a quotation'}`;
  }
  if (e.tableName === 'quotation_changes') return `Edited quotation ${ent}`.trim();
  if (e.tableName === 'quotations') {
    if (e.action === 'insert') return `Created quotation ${ent}`.trim();
    if (e.action === 'delete') return `Deleted quotation ${ent}`.trim();
    if (e.changes?.status?.to === 'converted') return `Converted quotation ${ent} to invoice`.trim();
    if (e.changes?.status?.from === 'converted') return `Rolled back ${ent} to quotation`.trim();
    return `Changed quotation ${ent}`.trim();
  }
  if (e.tableName === 'business_settings') return 'Changed business settings';
  const verb = e.action === 'insert' ? 'Added' : e.action === 'delete' ? 'Deleted' : 'Changed';
  return withEnt(`${verb} ${tableLabel(e.tableName).toLowerCase()}`);
}

// One quotation edit is saved as two writes: the line items (logged as a
// quotation_changes entry, which already lists the header changes too) and
// the quotation's totals row. They describe the same edit, so show one.
// The totals row is hidden only when the same person saved it within 30s of
// the matching edit entry AND it changed nothing the edit entry doesn't
// already show (anything else, such as a status change, stays visible).
const EDIT_COVERED_FIELDS = new Set(['amount', 'slab', 'discount_percent', 'discount_amount', 'gst', 'transportation', 'valid_until', 'description']);
const EDIT_PAIR_WINDOW_MS = 30_000;

export function collapseEditPairs(entries: ActivityEntry[]): ActivityEntry[] {
  const edits = entries.filter((e) => e.tableName === 'quotation_changes');
  if (edits.length === 0) return entries;
  return entries.filter((e) => {
    if (e.tableName !== 'quotations' || e.action !== 'update' || !e.changes) return true;
    const onlyCovered = Object.keys(e.changes).every((k) => EDIT_COVERED_FIELDS.has(k));
    if (!onlyCovered) return true;
    const t = new Date(e.createdAt).getTime();
    const hasPartner = edits.some(
      (c) =>
        c.actorId === e.actorId &&
        String(c.rowData?.quotation_id) === String(e.recordId) &&
        Math.abs(new Date(c.createdAt).getTime() - t) <= EDIT_PAIR_WINDOW_MS
    );
    return !hasPartner;
  });
}

const ITEM_KEYS = ['description', 'length_in', 'width_in', 'glass_qty', 'rate_per_sft', 'polish_rate', 'fixing_rate_per_sft', 'quantity', 'rate', 'amount'];
const EDIT_HEADER_KEYS = ['amount', 'slab', 'discount_percent', 'discount_amount', 'gst', 'transportation', 'valid_until'];

function describeQuotationEdit(e: ActivityEntry, lk: ActivityLookups): string[] {
  const before = e.rowData?.before_state ?? {};
  const after = e.rowData?.after_state ?? {};
  const lines: string[] = [];
  const hb = before.header ?? {};
  const ha = after.header ?? {};
  EDIT_HEADER_KEYS.forEach((k) => {
    if (String(hb[k] ?? '') !== String(ha[k] ?? '')) lines.push(`${label(k)}: ${formatValue(k, hb[k], lk)} → ${formatValue(k, ha[k], lk)}`);
  });
  const bi: any[] = before.items ?? [];
  const ai: any[] = after.items ?? [];
  const n = Math.min(bi.length, ai.length);
  for (let i = 0; i < n; i++) {
    ITEM_KEYS.forEach((k) => {
      if (String(bi[i][k] ?? '') !== String(ai[i][k] ?? '')) {
        lines.push(`Item ${i + 1} (${ai[i].description ?? ''}) ${label(k).toLowerCase()}: ${formatValue(k, bi[i][k], lk)} → ${formatValue(k, ai[i][k], lk)}`);
      }
    });
  }
  for (let i = n; i < ai.length; i++) lines.push(`Added item ${i + 1}: ${ai[i].description ?? ''} (${formatValue('amount', ai[i].amount, lk)})`);
  for (let i = n; i < bi.length; i++) lines.push(`Removed item ${i + 1}: ${bi[i].description ?? ''} (${formatValue('amount', bi[i].amount, lk)})`);
  return lines.length ? lines : ['Saved with no visible differences'];
}

// The "what changed" lines under each log entry.
export function describeDetails(e: ActivityEntry, lk: ActivityLookups): string[] {
  if (e.tableName === 'quotation_changes') return describeQuotationEdit(e, lk);

  if (e.action === 'update' && e.changes) {
    return Object.entries(e.changes)
      .filter(([k]) => !HIDDEN_FIELDS.has(k))
      .map(([k, c]) => `${label(k)}: ${formatValue(k, c.from, lk)} → ${formatValue(k, c.to, lk)}`);
  }

  const rd = e.rowData ?? {};
  // For payments the quotation number is already in the title.
  const hideQuotationRef = e.tableName === 'quotation_payments';
  return Object.entries(rd)
    .filter(([k, v]) => !HIDDEN_FIELDS.has(k) && !(hideQuotationRef && k === 'quotation_id') && v !== null && v !== '' && typeof v !== 'object')
    .slice(0, 10)
    .map(([k, v]) => `${label(k)}: ${formatValue(k, v, lk)}`);
}