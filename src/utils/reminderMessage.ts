import type { Quotation } from '../types';
import { formatINR } from './format';

// The 30-day due/overdue clock always runs from the quotation's creation
// date (quotations_effective in schema.sql) — computed the same way here
// purely for the reminder text, never stored.
function dueDateFor(quotation: Quotation): string {
  const d = new Date(quotation.date);
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function buildReminderMessage(quotation: Quotation, customerName: string): string {
  const lines: string[] = [];

  lines.push(`Dear ${customerName},`);
  lines.push('');
  lines.push(`This is a reminder regarding ${quotation.id} dated ${quotation.date} for ${formatINR(quotation.grandTotal)}.`);

  if (quotation.paidAmount > 0) {
    lines.push(
      `We have received ${formatINR(quotation.paidAmount)} towards this bill. The remaining balance of ${formatINR(
        quotation.balanceAmount
      )} is still due.`
    );
  } else {
    lines.push('The full amount is currently outstanding.');
  }

  if (quotation.effectiveStatus === 'overdue') {
    lines.push(`This bill was due on ${dueDateFor(quotation)} and is now overdue.`);
  } else {
    lines.push(`Due date: ${dueDateFor(quotation)}.`);
  }

  lines.push('');
  lines.push('We kindly request you to clear the payment at your earliest convenience.');
  lines.push('');
  lines.push('Thank you,');
  lines.push('Century Glass Art');

  return lines.join('\n');
}