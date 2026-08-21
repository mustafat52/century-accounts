export type InvoiceStatus = 'in_progress' | 'due' | 'overdue' | 'partial' | 'paid';
export type InvoiceKind = 'quick' | 'job';
export type WorkStatus = 'in_progress' | 'completed';

export type InvoiceSlab = 'A' | 'B' | 'C' | 'D';
// Invoice-level discount tier — NOT a per-item label. One slab per bill.
// A = 10% off, B = 15% off, C = 20% off, D = custom % (see discountPercent).
export const SLAB_DISCOUNT_PERCENT: Record<Exclude<InvoiceSlab, 'D'>, number> = {
  A: 10,
  B: 15,
  C: 20,
};

export interface Customer {
  id: string;
  name: string;
  contact: string | null;
  address?: string;
  gstin?: string;
  totalBilled: number;
  outstanding: number;
}

export interface Vendor {
  id: string;
  name: string;
  category: string;
  contact: string;
  totalPurchased: number;
  payable: number;
}

export type InvoiceItemType = 'glass' | 'simple';

export interface InvoiceItem {
  id: string;
  itemType: InvoiceItemType;
  description: string;
  thicknessMm: string | null;
  sortOrder: number;
  amount: number; // final line total, either kind

  // 'simple' item fields
  quantity: number | null;
  rate: number | null;

  // 'glass' item fields — length/width in inches, rft in feet
  lengthIn: number | null;
  widthIn: number | null;
  glassQty: number | null;
  ratePerSft: number | null;
  sft: number | null;
  workGlassAmount: number | null;
  rft: number | null;
  polishRate: number | null;
  polishAmount: number | null;
  fixingRatePerSft: number | null;
  fixingAmount: number | null;
}

export interface Invoice {
  id: string; // human-readable, e.g. "INV-1043"
  dbId: string; // real Supabase UUID, used for writes
  customerId: string;
  kind: InvoiceKind;
  description: string; // short summary for tables/lists
  amount: number; // subtotal (sum of items), before discount
  slab: InvoiceSlab;
  discountPercent: number; // e.g. 15 for slab B, or the custom % for slab D
  discountAmount: number; // amount * discountPercent / 100, stored not derived
  gst: number; // computed on (amount - discountAmount) — split 50/50 into CGST/SGST for display
  transportation: number; // added after GST, matching the business's own template
  date: string;
  dueDate: string | null; // null while a job order is still in_progress
  status: InvoiceStatus; // computed live server-side, never stored/mutated directly
  workStatus: WorkStatus | null; // null for quick-sale invoices
  completedAt: string | null;
  paidAmount: number;
  balance: number;
  items: InvoiceItem[];
}

export type ExpenseCategory =
  | 'Raw Material'
  | 'Labor'
  | 'Payslips & Wages'
  | 'Transport'
  | 'Rent'
  | 'Utilities'
  | 'Maintenance';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  vendorId?: string;
  description: string;
  amount: number;
  date: string;
}


export type VendorPaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface VendorPurchase {
  id: string; // expense row id
  vendorId: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: string;
  paidAmount: number;
  balance: number;
  paymentStatus: VendorPaymentStatus;
}

// ---- Vendor purchase slips (DC) ----
// A slip replicates the shop's paper workflow: created with quantities
// only, printed and sent to the vendor, then priced (and locked) once the
// vendor's handwritten rates come back. Once priced, it has a matching
// `expenses` row (via expenseId) and behaves like any other vendor
// purchase for payment tracking.
export type VendorSlipStatus = 'pending_pricing' | 'priced';
export type CareOf = 'Shabbir Bhai' | 'Abdul Hussain Bhai' | 'Taqi Bhai';

export interface VendorSlipItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number | null; // null until priced
  amount: number | null; // null until priced
  sortOrder: number;
}

export interface VendorSlip {
  id: string; // real Supabase UUID
  dcNo: string; // e.g. "DC-501" — one sequence shared across all vendors
  vendorId: string;
  careOf: CareOf;
  status: VendorSlipStatus;
  slipDate: string;
  pricedAt: string | null;
  expenseId: string | null; // set once priced — links to the expenses/vendor_purchases row
  items: VendorSlipItem[];
}


export interface MonthlyFigure {
  month: string;
  revenue: number;
  expenses: number;
}

export type QuotationStatus = 'pending' | 'converted' | 'expired';

export interface Quotation {
  id: string;
  dbId: string;
  customerId: string;
  description: string;
  amount: number;
  // Editable for the life of a 'pending' quotation (price negotiation) —
  // unlike an invoice's slab, which is fixed once the invoice is created.
  slab: InvoiceSlab;
  discountPercent: number;
  discountAmount: number;
  gst: number;
  date: string;
  validUntil: string;
  status: QuotationStatus;
}

export interface Worker {
  id: string;
  name: string;
  monthlySalary: number;
  advancesThisMonth: number;
  remainingThisMonth: number;
}

export interface WorkerAdvance {
  id: string;
  workerId: string;
  amount: number;
  date: string;
  note?: string;
}

export interface ImportantLink {
  id: string;
  label: string;
  url: string;
  category?: string;
}

export interface DashboardSummary {
  customersBilledThisMonth: number;
  jobsInProgress: number;
  jobsCompletedThisMonth: number;
}

export interface PriceListItem {
  id: string;
  description: string;
  ratePerSft: number;
  polishRate: number;
  fixingRate: number;
  sortOrder: number;
}