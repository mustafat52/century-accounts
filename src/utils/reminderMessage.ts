import type { Invoice } from '../types';
import { formatINR } from './format';

export function buildReminderMessage(invoice: Invoice, customerName: string): string {
  const total = invoice.amount - invoice.discountAmount + invoice.gst + invoice.transportation;
  const lines: string[] = [];

  lines.push(`Dear ${customerName},`);
  lines.push('');
  lines.push(`This is a reminder regarding Invoice ${invoice.id} dated ${invoice.date} for ${formatINR(total)}.`);

  if (invoice.paidAmount > 0) {
    lines.push(
      `We have received ${formatINR(invoice.paidAmount)} towards this bill. The remaining balance of ${formatINR(
        invoice.balance
      )} is still due.`
    );
  } else {
    lines.push('The full amount is currently outstanding.');
  }

  if (invoice.status === 'overdue' && invoice.dueDate) {
    lines.push(`This invoice was due on ${invoice.dueDate} and is now overdue.`);
  } else if (invoice.dueDate) {
    lines.push(`Due date: ${invoice.dueDate}.`);
  }

  lines.push('');
  lines.push('We kindly request you to clear the payment at your earliest convenience.');
  lines.push('');
  lines.push('Thank you,');
  lines.push('Century Glass Art');

  return lines.join('\n');
}