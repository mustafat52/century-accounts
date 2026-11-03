import * as XLSX from 'xlsx';
import type { Customer, Invoice, Quotation, QuotationPayment, Worker, WorkerAdvance, Expense, VendorPurchase, Vendor } from '../types';
import { PAYMENT_METHOD_LABELS } from '../types';
import { formatINR } from './format';

type LedgerRow = [string, string, number | string, number | string, string, number | string];

const HEADER_ROW: LedgerRow = ['Date', 'Bill Number', 'Total Amount', 'Payment Amount', 'Mode', 'Remaining Balance'];

// One combined sheet, in a single narrative order: every active quotation
// and every settled invoice belonging to this customer, each followed
// immediately by every payment ever recorded against it (oldest first) —
// so it reads as "bill raised for X, paid Y on this date via that mode,
// Z remaining", exactly the way the business actually talks about a bill.
// Once a quotation converts, its payment history is looked up by the
// resulting invoice's sourceQuotationId — the payments themselves never
// move tables, only which bill number they're reported against here.
function customerLedgerRows(
  customer: Customer,
  invoices: Invoice[],
  quotations: Quotation[],
  quotationPayments: QuotationPayment[]
): { rows: LedgerRow[]; totalBusiness: number; totalPending: number } {
  type Bill = { date: string; billNumber: string; total: number; payments: QuotationPayment[] };

  const activeQuotations = quotations.filter((q) => q.customerId === customer.id && q.status !== 'converted');
  const customerInvoices = invoices.filter((i) => i.customerId === customer.id);

  const bills: Bill[] = [
    ...activeQuotations.map((q) => ({
      date: q.date,
      billNumber: q.id,
      total: q.grandTotal,
      payments: quotationPayments.filter((p) => p.quotationId === q.dbId),
    })),
    ...customerInvoices.map((i) => ({
      date: i.date,
      billNumber: i.id,
      total: i.amount - i.discountAmount + i.gst + i.transportation,
      // Settled invoices carry no payment tracking of their own — the
      // payments that led here were recorded against the source
      // quotation while it was still active, and are looked up that way.
      payments: i.sourceQuotationId ? quotationPayments.filter((p) => p.quotationId === i.sourceQuotationId) : [],
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  const rows: LedgerRow[] = [];
  let totalBusiness = 0;
  let totalPending = 0;

  bills.forEach((bill) => {
    let remaining = bill.total;
    rows.push([bill.date, bill.billNumber, bill.total, '', '', remaining]);
    totalBusiness += bill.total;

    [...bill.payments]
      .sort((a, b) => (a.paymentDate < b.paymentDate ? -1 : 1))
      .forEach((p) => {
        remaining = Math.max(remaining - p.amount, 0);
        rows.push([p.paymentDate, bill.billNumber, '', p.amount, PAYMENT_METHOD_LABELS[p.method], remaining]);
      });

    // Only the bill's FINAL remaining balance counts toward total pending
    // — summing every row's "Remaining Balance" would double-count each
    // intermediate step between payments.
    totalPending += remaining;
  });

  return { rows, totalBusiness, totalPending };
}

function safeSheetName(name: string, usedNames: Set<string>): string {
  let base = name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31).trim() || 'Customer';
  let candidate = base;
  let n = 2;
  while (usedNames.has(candidate)) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function customerSheet(
  customer: Customer,
  invoices: Invoice[],
  quotations: Quotation[],
  quotationPayments: QuotationPayment[]
) {
  const { rows, totalBusiness, totalPending } = customerLedgerRows(customer, invoices, quotations, quotationPayments);

  // A single sheet: customer details up top, one blank row, then the full
  // transaction table, then a totals row — no separate "summary" tab.
  const aoa: (LedgerRow | (string | number)[])[] = [
    ['Customer', customer.name],
    ['Contact', customer.contact ?? ''],
    ['Address', customer.address ?? ''],
    ['GSTIN', customer.gstin ?? ''],
    [],
    ['Active Quoted', formatINR(customer.totalBilled)],
    ['Outstanding', formatINR(customer.outstanding)],
    [],
    HEADER_ROW,
    ...rows,
    ['', 'Total', totalBusiness, '', '', totalPending],
  ];

  return XLSX.utils.aoa_to_sheet(aoa);
}

export function exportCustomerLedger(
  customer: Customer,
  invoices: Invoice[],
  quotations: Quotation[],
  quotationPayments: QuotationPayment[]
) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, customerSheet(customer, invoices, quotations, quotationPayments), 'Ledger');
  XLSX.writeFile(wb, `${customer.name.replace(/\s+/g, '_')}_Ledger.xlsx`);
}

export function exportAllCustomersLedger(
  customers: Customer[],
  invoices: Invoice[],
  quotations: Quotation[],
  quotationPayments: QuotationPayment[]
) {
  const wb = XLSX.utils.book_new();

  const overview = customers.map((c) => ({
    Customer: c.name,
    Contact: c.contact,
    Address: c.address ?? '',
    GSTIN: c.gstin ?? '',
    'Active Quoted': c.totalBilled,
    Outstanding: c.outstanding,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview), 'All Customers');

  const usedNames = new Set<string>(['All Customers']);
  customers.forEach((c) => {
    const hasActivity =
      invoices.some((i) => i.customerId === c.id) || quotations.some((q) => q.customerId === c.id);
    if (!hasActivity) return;
    const sheetName = safeSheetName(c.name, usedNames);
    XLSX.utils.book_append_sheet(wb, customerSheet(c, invoices, quotations, quotationPayments), sheetName);
  });

  XLSX.writeFile(wb, 'Century_Glass_Art_All_Customer_Ledgers.xlsx');
}

// ============================================================
// Worker advances ledger — every advance a worker has taken, oldest first,
// with this month's total. Salary payments are not tracked.
// ============================================================

type WorkerLedgerRow = [string, number, string];

const WORKER_HEADER_ROW: (string | number)[] = ['Date', 'Advance', 'Note'];

function workerSheet(worker: Worker, advances: WorkerAdvance[]) {
  const own = advances.filter((a) => a.workerId === worker.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const rows: WorkerLedgerRow[] = own.map((a) => [a.date, a.amount, a.note ?? '']);
  const totalAdvances = own.reduce((sum, a) => sum + a.amount, 0);

  // Month-by-month totals (oldest first) so the owner can read each month at a glance.
  const monthTotals = new Map<string, number>();
  own.forEach((a) => monthTotals.set(a.date.slice(0, 7), (monthTotals.get(a.date.slice(0, 7)) ?? 0) + a.amount));

  const aoa: (WorkerLedgerRow | (string | number)[])[] = [
    ['Worker', worker.name],
    ['This Month — Advances taken', formatINR(worker.advancesThisMonth)],
    [],
    WORKER_HEADER_ROW,
    ...rows,
    [],
    ['Total advances (all time)', totalAdvances, ''],
    [],
    ['Month-wise totals'],
    ...Array.from(monthTotals.entries()).map(([month, total]) => [month, total]),
  ];

  return XLSX.utils.aoa_to_sheet(aoa);
}

export function exportWorkerLedger(worker: Worker, advances: WorkerAdvance[]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, workerSheet(worker, advances), 'Advances');
  XLSX.writeFile(wb, `${worker.name.replace(/\s+/g, '_')}_Advances.xlsx`);
}

export function exportAllWorkersLedger(workers: Worker[], advances: WorkerAdvance[]) {
  const wb = XLSX.utils.book_new();

  const overview = workers.map((w) => ({
    Worker: w.name,
    'Advances This Month': w.advancesThisMonth,
    'Total Advances (all time)': advances.filter((a) => a.workerId === w.id).reduce((sum, a) => sum + a.amount, 0),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview), 'All Workers');

  const usedNames = new Set<string>(['All Workers']);
  workers.forEach((w) => {
    const sheetName = safeSheetName(w.name, usedNames);
    XLSX.utils.book_append_sheet(wb, workerSheet(w, advances), sheetName);
  });

  XLSX.writeFile(wb, 'Century_Glass_Art_All_Worker_Advances.xlsx');
}

// ============================================================
// General expense report — every expense the business has recorded,
// general (Rent/Utilities/etc) AND vendor purchases together, since both
// live in the same underlying expenses table and this is meant to be the
// complete picture, not just one slice of it.
// ============================================================

// ============================================================
// Reports snapshot — exports exactly what's on screen for whichever
// period is currently selected (preset or a custom From/To range), one
// focused sheet per panel so it reads the same way the page itself is
// laid out, rather than one dense, hard-to-scan table.
// ============================================================

interface ReportsSnapshotInput {
  periodLabel: string;
  totals: { revenue: number; expenses: number; profit: number };
  chartData: { month: string; revenue: number; expenses: number }[];
  quotationStatusBreakdown: Record<string, { count: number; amount: number }>;
  topCustomers: { name: string; amount: number }[];
  expenseByCategory: [string, number][];
  topVendors: { name: string; amount: number }[];
  slabBreakdown: { slab: string; percentLabel: string; invoiceCount: number; customerCount: number; amount: number }[];
  gstSplit: { withGst: { count: number; amount: number }; withoutGst: { count: number; amount: number } };
  quotationSummary: { pendingCount: number; pendingAmount: number; convertedCount: number; convertedAmount: number };
  receivables: { name: string; amount: number }[];
  totalReceivable: number;
  payables: { name: string; amount: number }[];
  totalPayable: number;
}

const STATUS_SHEET_LABELS: Record<string, string> = {
  due: 'Due',
  overdue: 'Overdue',
  paid: 'Paid',
  converted: 'Invoiced',
};

export function exportReportsSnapshot(input: ReportsSnapshotInput) {
  const wb = XLSX.utils.book_new();

  const summaryAoa: (string | number)[][] = [
    ['Century Glass Art — Report Snapshot'],
    ['Period', input.periodLabel],
    [],
    ['Revenue', input.totals.revenue],
    ['Expenses', input.totals.expenses],
    ['Net Profit', input.totals.profit],
    [],
    ['Pending Quotations', input.quotationSummary.pendingCount, input.quotationSummary.pendingAmount],
    ['Converted to Invoice', input.quotationSummary.convertedCount, input.quotationSummary.convertedAmount],
    [],
    ['Total Receivable (all time, as of today)', input.totalReceivable],
    ['Total Payable (all time, as of today)', input.totalPayable],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoa), 'Summary');

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      input.chartData.map((m) => ({ Month: m.month, Revenue: m.revenue, Expenses: m.expenses, Net: m.revenue - m.expenses }))
    ),
    'Monthly Trend'
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      Object.entries(input.quotationStatusBreakdown).map(([status, v]) => ({
        Status: STATUS_SHEET_LABELS[status] ?? status,
        Count: v.count,
        Amount: v.amount,
      }))
    ),
    'Quotation Status'
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(input.topCustomers.map((c) => ({ Customer: c.name, Amount: c.amount }))),
    'Top Customers'
  );

  const totalExpenseForPercent = input.expenseByCategory.reduce((sum, [, amount]) => sum + amount, 0);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      input.expenseByCategory.map(([category, amount]) => ({
        Category: category,
        Amount: amount,
        '% of Total': totalExpenseForPercent > 0 ? Math.round((amount / totalExpenseForPercent) * 1000) / 10 : 0,
      }))
    ),
    'Expenses by Category'
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(input.topVendors.map((v) => ({ Vendor: v.name, Amount: v.amount }))),
    'Top Vendors'
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      input.slabBreakdown.map((s) => ({
        Slab: s.slab,
        Discount: s.percentLabel,
        Quotations: s.invoiceCount,
        Customers: s.customerCount,
        Business: s.amount,
      }))
    ),
    'Slab Breakdown'
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Type: 'With GST', Count: input.gstSplit.withGst.count, Amount: input.gstSplit.withGst.amount },
      { Type: 'Without GST', Count: input.gstSplit.withoutGst.count, Amount: input.gstSplit.withoutGst.amount },
    ]),
    'GST Split'
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      ...input.receivables.map((r) => ({ Customer: r.name, Outstanding: r.amount })),
      { Customer: 'TOTAL', Outstanding: input.totalReceivable },
    ]),
    'Receivables'
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      ...input.payables.map((p) => ({ Vendor: p.name, Payable: p.amount })),
      { Vendor: 'TOTAL', Payable: input.totalPayable },
    ]),
    'Payables'
  );

  const safePeriod = input.periodLabel.replace(/[^a-zA-Z0-9]+/g, '_');
  XLSX.writeFile(wb, `Century_Glass_Art_Report_${safePeriod}.xlsx`);
}

// Final report for a "Close Month": general expenses only (payroll rows
// included — they're ordinary expense rows), exactly the set about to be
// archived. Throws if the file can't be generated, so the caller can stop
// before archiving anything.
export function exportExpenseCloseReport(expenses: Expense[], archivedAt?: string) {
  if (expenses.length === 0) throw new Error('No expenses to export.');
  const rows = [...expenses].sort((a, b) => (a.date < b.date ? 1 : -1));
  const from = rows[rows.length - 1].date;
  const to = rows[0].date;

  const totalsByCategory = new Map<string, number>();
  rows.forEach((r) => totalsByCategory.set(r.category, (totalsByCategory.get(r.category) ?? 0) + r.amount));
  const grandTotal = rows.reduce((sum, r) => sum + r.amount, 0);

  const wb = XLSX.utils.book_new();
  const summaryAoa: (string | number)[][] = [
    ['Century Glass Art — Expense Report'],
    ['Period', `${from} to ${to}`],
    ['Closed on', (archivedAt ? new Date(archivedAt) : new Date()).toLocaleDateString('en-IN')],
    ['Number of expenses', rows.length],
    [],
    ['Category', 'Total'],
    ...Array.from(totalsByCategory.entries()).sort((a, b) => b[1] - a[1]),
    [],
    ['Grand Total', grandTotal],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoa), 'Summary');

  const detailData = rows.map((r) => ({
    Date: r.date,
    Category: r.category,
    Description: r.description,
    Amount: r.amount,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailData), 'Expenses');

  XLSX.writeFile(wb, `Century_Glass_Art_Expenses_${from}_to_${to}.xlsx`);
}

export function exportAllExpenses(expenses: Expense[], vendorPurchases: VendorPurchase[], vendors: Vendor[]) {
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? 'Unknown vendor';

  type Row = { date: string; category: string; description: string; vendor: string; amount: number };
  const rows: Row[] = [
    ...expenses.map((e) => ({ date: e.date, category: e.category, description: e.description, vendor: '—', amount: e.amount })),
    ...vendorPurchases.map((p) => ({
      date: p.date,
      category: p.category,
      description: p.description,
      vendor: vendorName(p.vendorId),
      amount: p.amount,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const totalsByCategory = new Map<string, number>();
  rows.forEach((r) => totalsByCategory.set(r.category, (totalsByCategory.get(r.category) ?? 0) + r.amount));
  const grandTotal = rows.reduce((sum, r) => sum + r.amount, 0);

  const wb = XLSX.utils.book_new();

  const summaryAoa: (string | number)[][] = [
    ['Category', 'Total'],
    ...Array.from(totalsByCategory.entries()).sort((a, b) => b[1] - a[1]),
    [],
    ['Grand Total', grandTotal],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoa), 'Summary');

  const detailData = rows.map((r) => ({
    Date: r.date,
    Category: r.category,
    Description: r.description,
    Vendor: r.vendor,
    Amount: r.amount,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailData), 'All Expenses');

  XLSX.writeFile(wb, 'Century_Glass_Art_Expense_Report.xlsx');
}