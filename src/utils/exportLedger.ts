import * as XLSX from 'xlsx';
import type { Customer, Invoice, InvoiceItem } from '../types';
import { formatINR } from './format';

function itemDetail(item: InvoiceItem): string {
  if (item.itemType === 'glass') {
    const size = `${item.lengthIn ?? '-'}in × ${item.widthIn ?? '-'}in × ${item.glassQty ?? '-'} pcs`;
    const sft = item.sft != null ? `${item.sft} sft` : '';
    const rft = item.rft != null ? `${item.rft} rft` : '';
    return [size, sft, rft].filter(Boolean).join(' · ');
  }
  return `Qty ${item.quantity ?? '-'} × ₹${item.rate ?? '-'}`;
}

function customerLedgerRows(customer: Customer, invoices: Invoice[]) {
  const history = invoices
    .filter((i) => i.customerId === customer.id)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const rows: Record<string, string | number>[] = [];

  history.forEach((inv) => {
    const items = [...inv.items].sort((a, b) => a.sortOrder - b.sortOrder);
    if (items.length === 0) {
      // Fallback for any invoice with no line items on record
      rows.push({
        Date: inv.date,
        Invoice: inv.id,
        Type: inv.kind === 'job' ? 'Job Order' : 'Quick Sale',
        Item: inv.description,
        Details: '',
        'Item Amount': inv.amount,
        'Invoice Total': inv.amount - inv.discountAmount + inv.gst + inv.transportation,
        'Invoice Status': inv.status,
      });
      return;
    }
    items.forEach((item, idx) => {
      rows.push({
        Date: inv.date,
        Invoice: inv.id,
        Type: inv.kind === 'job' ? 'Job Order' : 'Quick Sale',
        Item: item.description,
        Details: itemDetail(item),
        'Item Amount': item.amount,
        // Only show invoice-level totals on the first row of that invoice,
        // to avoid implying each item carries the full invoice total.
        'Invoice Total': idx === 0 ? inv.amount - inv.discountAmount + inv.gst + inv.transportation : '',
        'Invoice Status': idx === 0 ? inv.status : '',
      });
    });
  });

  return rows;
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
    { Field: '', Value: '' },
    { Field: 'Total Billed (lifetime)', Value: formatINR(customer.totalBilled) },
    { Field: 'Outstanding (as of today)', Value: formatINR(customer.outstanding) },
  ];

  const wb = XLSX.utils.book_new();
  // Purchase history first — it's what the business actually wants to see.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Purchase History');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary, { skipHeader: true }), 'Summary');

  XLSX.writeFile(wb, `${customer.name.replace(/\s+/g, '_')}_Ledger.xlsx`);
}

export function exportAllCustomersLedger(customers: Customer[], invoices: Invoice[]) {
  const wb = XLSX.utils.book_new();

  const overview = customers.map((c) => ({
    Customer: c.name,
    Contact: c.contact,
    Address: c.address ?? '',
    GSTIN: c.gstin ?? '',
    'Total Billed (lifetime)': c.totalBilled,
    'Outstanding (as of today)': c.outstanding,
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