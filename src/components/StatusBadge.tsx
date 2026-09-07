import type { QuotationEffectiveStatus } from '../types';

const LABELS: Record<QuotationEffectiveStatus, string> = {
  due: 'Due',
  overdue: 'Overdue',
  paid: 'Paid',
  converted: 'Invoiced',
};

// "Partial" is deliberately not a status value here — it's an independent
// signal (0 < paidAmount < grandTotal) that can coexist with 'due',
// 'overdue', or even 'converted' (Convert no longer requires full
// payment). Pass showPartial to layer a small extra label on top instead
// of a mutually-exclusive status.
export default function StatusBadge({
  status,
  showPartial,
}: {
  status: QuotationEffectiveStatus;
  showPartial?: boolean;
}) {
  return (
    <span className={`badge ${status}`}>
      {LABELS[status]}
      {showPartial && status !== 'paid' ? ' · Partial' : ''}
    </span>
  );
}