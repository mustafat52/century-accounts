import type { InvoiceStatus } from '../types';

const LABELS: Record<InvoiceStatus, string> = {
  in_progress: 'In Progress',
  due: 'Due',
  overdue: 'Overdue',
  partial: 'Partial',
  paid: 'Paid',
};

export default function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={`badge ${status}`}>{LABELS[status]}</span>;
}