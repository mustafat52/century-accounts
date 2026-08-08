import * as XLSX from 'xlsx';
import type { Customer, Invoice } from '../types';
import { formatINR } from './format';

function customerLedgerRows(customer: Customer, invoices: Invoice[]) {
  const history = invoices
    .filter((i) => i.customerId === customer.id)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return history.map((i) => ({
    Date: i.date,
    Invoice: i.id,
    Type: i.kind === 'job' ? 'Job Order' : 'Quick Sale',
    Description: i.description,
    Amount: i.amount,
    GST: i.gst,
    Transportation: i.transportation,
    Total: i.amount + i.gst + i.transportation,
    'Paid So Far': i.paidAmount,
    Balance: i.balance,
    Status: i.status,
  }));
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

export function exportCustomerLedger(customer: Customer, invoices: Invoice[]) {
  const rows = customerLedgerRows(customer, invoices);
  const summary = [
    { Field: 'Customer', Value: customer.name },
    { Field: 'Contact', Value: customer.contact },
    { Field: 'Address', Value: customer.address ?? '' },
    { Field: 'GSTIN', Value: customer.gstin ?? '' },
    { Field: 'Total Billed', Value: formatINR(customer.totalBilled) },
    { Field: 'Outstanding', Value: formatINR(customer.outstanding) },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary, { skipHeader: true }), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Ledger');

  XLSX.writeFile(wb, `${customer.name.replace(/\s+/g, '_')}_Ledger.xlsx`);
}

export function exportAllCustomersLedger(customers: Customer[], invoices: Invoice[]) {
  const wb = XLSX.utils.book_new();

  const overview = customers.map((c) => ({
    Customer: c.name,
    Contact: c.contact,
    Address: c.address ?? '',
    GSTIN: c.gstin ?? '',
    'Total Billed': c.totalBilled,
    Outstanding: c.outstanding,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview), 'All Customers');

  const usedNames = new Set<string>(['All Customers']);
  customers.forEach((c) => {
    const rows = customerLedgerRows(c, invoices);
    if (rows.length === 0) return;
    const sheetName = safeSheetName(c.name, usedNames);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
  });

  XLSX.writeFile(wb, 'Century_Glass_Art_All_Customer_Ledgers.xlsx');
}