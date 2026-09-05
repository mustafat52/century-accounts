// Quotation lifecycle status, computed live by the quotations_effective
// view — never stored/mutated directly on the frontend.
//   'due'       — pending, within the 30-day clock from creation, balance > 0
//   'overdue'   — pending, past the 30-day clock, balance > 0
//   'paid'      — pending, balance = 0, ready to Convert to an invoice
//   'converted' — already settled into an invoice
//   'expired'   — pending, past valid_until, zero payments ever recorded
// A quotation can independently be "partial" (0 < paidAmount < grandTotal)
// regardless of due/overdue — that's shown as extra badge text derived
// client-side from paidAmount, not a separate status value.
export type QuotationEffectiveStatus = 'due' | 'overdue' | 'paid' | 'converted' | 'expired';

export type InvoiceSlab = 'A' | 'B' | 'C' | 'D';
// Invoice-level discount tier — NOT a per-item label. One slab per bill.
// A = custom % (typed in, see discountPercent), B = 10% off, C = 15% off,
// D = 20% off.
export const SLAB_DISCOUNT_PERCENT: Record<Exclude<InvoiceSlab, 'A'>, number> = {
  B: 10,
  C: 15,
  D: 20,
};

// How a customer payment against a quotation was actually received.
export type PaymentMethod = 'cash' | 'upi' | 'cheque' | 'bank_transfer';
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  cheque: 'Cheque',
  bank_transfer: 'Bank Transfer',
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
  area: string | null;
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

// Same shape as InvoiceItem — used when printing a quotation's real
// itemized rows (see fetchQuotationItemsForPrint in AppContext), as
// opposed to NewQuotationItemInput which is the editable draft shape used
// by QuotationModal and has no computed sft/rft/amount fields.
export type QuotationItem = InvoiceItem;

// A single installment recorded against a quotation — the entire payment
// ledger for a bill lives here, start to finish, and is never moved even
// after the quotation converts to an invoice (see AppContext).
export interface QuotationPayment {
  id: string;
  quotationId: string;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  note: string | null;
  createdAt: string;
}

// A TERMINAL, read-only record — only ever created by converting a fully
// paid quotation (see AppContext.convertQuotationToInvoice). There is no
// due date, work status, or payment tracking here anymore; all of that
// lived, and still lives, on the source quotation. sourceQuotationId is
// what powers the "Roll back to Quotation" action.
export interface Invoice {
  id: string; // human-readable, e.g. "INV-1043"
  dbId: string; // real Supabase UUID, used for writes
  customerId: string;
  sourceQuotationId: string | null;
  description: string; // short summary for tables/lists
  amount: number; // subtotal (sum of items), before discount
  slab: InvoiceSlab;
  discountPercent: number; // e.g. 15 for slab B, or the custom % for slab D
  discountAmount: number; // amount * discountPercent / 100, stored not derived
  gst: number; // computed on (amount - discountAmount) — split 50/50 into CGST/SGST for display
  transportation: number; // added after GST, matching the business's own template
  date: string;
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

// ---- Purchase bills (GST purchase register) ----
// A pure compliance record of tax invoices RECEIVED from suppliers —
// unlike VendorSlip/expenses, this never touches payable/payments. It just
// captures what a GST return needs, exactly as printed on the bill.
// Deliberately NOT linked to vendors — suppliers and vendors are treated
// as separate concepts by the client, and there's no confirmed Suppliers
// tab yet.
export type PurchaseBillTaxType = 'cgst_sgst' | 'igst';

export interface PurchaseBillItem {
  id: string;
  hsnCode: string | null;
  description: string;
  quantity: number;
  rate: number;
  taxableAmount: number;
  gstRate: number; // 5 / 12 / 18 / 28
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  sortOrder: number;
}

export interface PurchaseBill {
  id: string; // real Supabase UUID
  supplierGstin: string;
  supplierName: string;
  supplierAddress: string | null;
  invoiceNo: string;
  invoiceDate: string;
  placeOfSupply: string;
  taxType: PurchaseBillTaxType;
  subtotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  totalAmount: number;
  items: PurchaseBillItem[];
}


export interface MonthlyFigure {
  month: string;
  revenue: number;
  expenses: number;
}

export type QuotationStatus = 'pending' | 'converted' | 'expired';

// The living document for a job's entire lifecycle — created, negotiated,
// worked, and paid (in installments, see QuotationPayment) — right up
// until balanceAmount reaches zero and it's converted to an Invoice.
export interface Quotation {
  id: string;
  dbId: string;
  customerId: string;
  description: string;
  amount: number;
  // Editable for the life of a 'pending' quotation (price negotiation) —
  // unlike an invoice's slab, which is fixed forever once converted.
  slab: InvoiceSlab;
  discountPercent: number;
  discountAmount: number;
  gst: number;
  // Cartage cost, added after GST — mirrors Invoice.transportation.
  // Carried over automatically when the quotation converts to an invoice.
  transportation: number;
  date: string;
  validUntil: string;
  status: QuotationStatus;
  convertedInvoiceId: string | null;
  // ---- Live payment tracking (from quotations_effective) ----
  grandTotal: number; // amount - discountAmount + gst + transportation
  paidAmount: number; // sum of quotation_payments
  balanceAmount: number; // grandTotal - paidAmount, floored at 0
  effectiveStatus: QuotationEffectiveStatus;
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
  customersPaidThisMonth: number;
  quotationsActive: number;
  quotationsOverdue: number;
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