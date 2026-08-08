export type InvoiceStatus = 'in_progress' | 'due' | 'overdue' | 'partial' | 'paid';
export type InvoiceKind = 'quick' | 'job';
export type WorkStatus = 'in_progress' | 'completed';
export type ItemSlab = 'A' | 'B' | 'C';
// A = B2C retail rate, B = B2B rate, C = special family rate.
// Kept for internal reference only — never shown on the printed bill.

export interface Customer {
  id: string;
  name: string;
  contact: string;
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
  slab: ItemSlab | null;
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
  amount: number; // subtotal (sum of items)
  gst: number; // total GST — split 50/50 into CGST/SGST for display
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