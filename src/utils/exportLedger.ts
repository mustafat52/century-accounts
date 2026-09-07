import * as XLSX from 'xlsx';
import type { Customer, Invoice, Quotation, QuotationPayment, Worker, WorkerAdvance, WorkerPayment, Expense, VendorPurchase, Vendor } from '../types';
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
// Worker / Payslips ledger — same one-sheet narrative style as the
// customer ledger: every advance and every salary settlement payment,
// in one combined chronological table, oldest first.
// ============================================================

type WorkerLedgerRow = [string, string, number, string, string];

const WORKER_HEADER_ROW: (string | number)[] = ['Date', 'Type', 'Amount', 'For Month', 'Note'];

function workerLedgerRows(
  worker: Worker,
  advances: WorkerAdvance[],
  payments: WorkerPayment[]
): { rows: WorkerLedgerRow[]; totalAdvances: number; totalPaid: number } {
  const ownAdvances = advances.filter((a) => a.workerId === worker.id);
  const ownPayments = payments.filter((p) => p.workerId === worker.id);

  type Event = { date: string; type: string; amount: number; forMonth: string; note: string };
  const events: Event[] = [
    ...ownAdvances.map((a) => ({ date: a.date, type: 'Advance', amount: a.amount, forMonth: '', note: a.note ?? '' })),
    ...ownPayments.map((p) => ({
      date: p.paymentDate,
      type: 'Salary Settlement',
      amount: p.amount,
      forMonth: p.forMonth,
      note: p.note ?? '',
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  const rows: WorkerLedgerRow[] = events.map((e) => [e.date, e.type, e.amount, e.forMonth, e.note]);
  const totalAdvances = ownAdvances.reduce((sum, a) => sum + a.amount, 0);
  const totalPaid = ownPayments.reduce((sum, p) => sum + p.amount, 0);

  return { rows, totalAdvances, totalPaid };
}

function workerSheet(worker: Worker, advances: WorkerAdvance[], payments: WorkerPayment[]) {
  const { rows, totalAdvances, totalPaid } = workerLedgerRows(worker, advances, payments);

  const aoa: (WorkerLedgerRow | (string | number)[])[] = [
    ['Worker', worker.name],
    ['Monthly Salary', formatINR(worker.monthlySalary)],
    [],
    ['This Month — Advances', formatINR(worker.advancesThisMonth)],
    ['This Month — Paid', formatINR(worker.paidThisMonth)],
    ['This Month — Remaining', formatINR(worker.remainingThisMonth)],
    [],
    WORKER_HEADER_ROW,
    ...rows,
    [],
    ['', 'Total Advances (all time)', totalAdvances, '', ''],
    ['', 'Total Settlements Paid (all time)', totalPaid, '', ''],
  ];

  return XLSX.utils.aoa_to_sheet(aoa);
}

export function exportWorkerLedger(worker: Worker, advances: WorkerAdvance[], payments: WorkerPayment[]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, workerSheet(worker, advances, payments), 'Ledger');
  XLSX.writeFile(wb, `${worker.name.replace(/\s+/g, '_')}_Ledger.xlsx`);
}

export function exportAllWorkersLedger(workers: Worker[], advances: WorkerAdvance[], payments: WorkerPayment[]) {
  const wb = XLSX.utils.book_new();

  const overview = workers.map((w) => ({
    Worker: w.name,
    'Monthly Salary': w.monthlySalary,
    'Advances This Month': w.advancesThisMonth,
    'Paid This Month': w.paidThisMonth,
    'Remaining This Month': w.remainingThisMonth,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview), 'All Workers');

  const usedNames = new Set<string>(['All Workers']);
  workers.forEach((w) => {
    const sheetName = safeSheetName(w.name, usedNames);
    XLSX.utils.book_append_sheet(wb, workerSheet(w, advances, payments), sheetName);
  });

  XLSX.writeFile(wb, 'Century_Glass_Art_All_Worker_Ledgers.xlsx');
}

// ============================================================
// General expense report — every expense the business has recorded,
// general (Rent/Utilities/etc) AND vendor purchases together, since both
// live in the same underlying expenses table and this is meant to be the
// complete picture, not just one slice of it.
// ============================================================

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