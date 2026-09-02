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
  VendorPurchase,
  PriceListItem,
  VendorSlip,
  VendorSlipItem,
  PurchaseBill,
  PurchaseBillItem,
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
    area: row.area ?? null,
    thicknessMm: row.thickness_mm ?? null,
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

// quotation_items has the identical column layout to invoice_items, so the
// same mapping applies — used when printing a quotation's real itemized
// rows (see fetchQuotationItemsForPrint in AppContext).
export const mapQuotationItem = mapInvoiceItem;

// `items` must be pre-grouped by invoice_id and passed in (see AppContext).
export function mapInvoice(row: any, items: InvoiceItem[] = []): Invoice {
  const amount = Number(row.amount);
  const discountAmount = Number(row.discount_amount ?? 0);
  const gst = Number(row.gst);
  const transportation = Number(row.transportation ?? 0);
  return {
    id: row.invoice_no,
    dbId: row.id,
    customerId: row.customer_id,
    kind: row.kind,
    description: row.description,
    amount,
    slab: row.slab ?? 'A',
    discountPercent: Number(row.discount_percent ?? 0),
    discountAmount,
    gst,
    transportation,
    date: row.invoice_date,
    dueDate: row.due_date ?? null,
    status: row.effective_status ?? row.status,
    workStatus: row.work_status ?? null,
    completedAt: row.completed_at ?? null,
    paidAmount: Number(row.paid_amount ?? 0),
    balance: Number(row.balance ?? (amount - discountAmount + gst + transportation)),
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
    slab: row.slab ?? 'A',
    discountPercent: Number(row.discount_percent ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    gst: Number(row.gst),
    transportation: Number(row.transportation ?? 0),
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


export function mapVendorPurchase(row: any): VendorPurchase {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    category: row.category,
    description: row.description,
    amount: Number(row.amount),
    date: row.expense_date,
    paidAmount: Number(row.paid_amount),
    balance: Number(row.balance),
    paymentStatus: row.payment_status,
  };
}

export function mapPriceListItem(row: any): PriceListItem {
  return {
    id: row.id,
    description: row.description,
    ratePerSft: Number(row.rate_per_sft),
    polishRate: Number(row.polish_rate),
    fixingRate: Number(row.fixing_rate),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function mapVendorSlipItem(row: any): VendorSlipItem {
  return {
    id: row.id,
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit,
    rate: row.rate === null || row.rate === undefined ? null : Number(row.rate),
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

// `items` must be pre-grouped by slip_id and passed in (see AppContext).
export function mapVendorSlip(row: any, items: VendorSlipItem[] = []): VendorSlip {
  return {
    id: row.id,
    dcNo: row.dc_no,
    vendorId: row.vendor_id,
    careOf: row.care_of,
    status: row.status,
    slipDate: row.slip_date,
    pricedAt: row.priced_at ?? null,
    expenseId: row.expense_id ?? null,
    items,
  };
}

export function mapPurchaseBillItem(row: any): PurchaseBillItem {
  return {
    id: row.id,
    hsnCode: row.hsn_code ?? null,
    description: row.description,
    quantity: Number(row.quantity),
    rate: Number(row.rate),
    taxableAmount: Number(row.taxable_amount),
    gstRate: Number(row.gst_rate),
    cgstAmount: Number(row.cgst_amount),
    sgstAmount: Number(row.sgst_amount),
    igstAmount: Number(row.igst_amount),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

// `items` must be pre-grouped by bill_id and passed in (see AppContext).
export function mapPurchaseBill(row: any, items: PurchaseBillItem[] = []): PurchaseBill {
  return {
    id: row.id,
    supplierGstin: row.supplier_gstin,
    supplierName: row.supplier_name,
    supplierAddress: row.supplier_address ?? null,
    invoiceNo: row.invoice_no,
    invoiceDate: row.invoice_date,
    placeOfSupply: row.place_of_supply,
    taxType: row.tax_type,
    subtotal: Number(row.subtotal),
    cgstTotal: Number(row.cgst_total),
    sgstTotal: Number(row.sgst_total),
    igstTotal: Number(row.igst_total),
    totalAmount: Number(row.total_amount),
    items,
  };
}