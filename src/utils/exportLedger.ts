import * as XLSX from 'xlsx';
import type { Customer, Invoice, Quotation, QuotationPayment } from '../types';
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