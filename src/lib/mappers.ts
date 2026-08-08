import type {
  Customer,
  Vendor,
  Invoice,
  InvoiceItem,
  Quotation,
  Expense,
  MonthlyFigure,
  ExpenseCategory,
  Worker,
  ImportantLink,
  DashboardSummary,
} from '../types';

// These mirror the Supabase table/view column names (snake_case).
// Kept loose on purpose — this is the one file that should change if the schema changes.

export function mapCustomerBalance(row: any): Customer {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    address: row.address ?? undefined,
    gstin: row.gstin ?? undefined,
    totalBilled: Number(row.total_billed),
    outstanding: Number(row.outstanding),
  };
}

export function mapVendorBalance(row: any): Vendor {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    contact: row.contact,
    totalPurchased: Number(row.total_purchased),
    payable: Number(row.payable),
  };
}

const numOrNull = (v: any): number | null => (v === null || v === undefined ? null : Number(v));

export function mapInvoiceItem(row: any): InvoiceItem {
  return {
    id: row.id,
    itemType: row.item_type,
    description: row.description,
    slab: row.slab ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    amount: Number(row.amount),
    quantity: numOrNull(row.quantity),
    rate: numOrNull(row.rate),
    lengthIn: numOrNull(row.length_in),
    widthIn: numOrNull(row.width_in),
    glassQty: numOrNull(row.glass_qty),
    ratePerSft: numOrNull(row.rate_per_sft),
    sft: numOrNull(row.sft),
    workGlassAmount: numOrNull(row.work_glass_amount),
    rft: numOrNull(row.rft),
    polishRate: numOrNull(row.polish_rate),
    polishAmount: numOrNull(row.polish_amount),
    fixingRatePerSft: numOrNull(row.fixing_rate_per_sft),
    fixingAmount: numOrNull(row.fixing_amount),
  };
}

// `items` must be pre-grouped by invoice_id and passed in (see AppContext).
export function mapInvoice(row: any, items: InvoiceItem[] = []): Invoice {
  return {
    id: row.invoice_no,
    dbId: row.id,
    customerId: row.customer_id,
    kind: row.kind,
    description: row.description,
    amount: Number(row.amount),
    gst: Number(row.gst),
    transportation: Number(row.transportation ?? 0),
    date: row.invoice_date,
    dueDate: row.due_date ?? null,
    status: row.effective_status ?? row.status,
    workStatus: row.work_status ?? null,
    completedAt: row.completed_at ?? null,
    paidAmount: Number(row.paid_amount ?? 0),
    balance: Number(row.balance ?? Number(row.amount) + Number(row.gst) + Number(row.transportation ?? 0)),
    items,
  };
}

export function mapQuotation(row: any): Quotation {
  return {
    id: row.quotation_no,
    dbId: row.id,
    customerId: row.customer_id,
    description: row.description,
    amount: Number(row.amount),
    gst: Number(row.gst),
    date: row.quotation_date,
    validUntil: row.valid_until,
    status: row.status,
  };
}

export function mapExpense(row: any): Expense {
  return {
    id: row.id,
    category: row.category as ExpenseCategory,
    vendorId: row.vendor_id ?? undefined,
    description: row.description,
    amount: Number(row.amount),
    date: row.expense_date,
  };
}

export function mapMonthlyFigure(row: any): MonthlyFigure {
  return {
    month: row.month,
    revenue: Number(row.revenue),
    expenses: Number(row.expenses),
  };
}

export function mapWorker(row: any): Worker {
  return {
    id: row.id,
    name: row.name,
    monthlySalary: Number(row.monthly_salary),
    advancesThisMonth: Number(row.advances_this_month ?? 0),
    remainingThisMonth: Number(row.remaining_this_month ?? row.monthly_salary),
  };
}

export function mapImportantLink(row: any): ImportantLink {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    category: row.category ?? undefined,
  };
}

export function mapDashboardSummary(row: any): DashboardSummary {
  return {
    customersBilledThisMonth: Number(row.customers_billed_this_month ?? 0),
    jobsInProgress: Number(row.jobs_in_progress ?? 0),
    jobsCompletedThisMonth: Number(row.jobs_completed_this_month ?? 0),
  };
}