import ConfirmDialog from './ConfirmDialog';
import { formatINR } from '../utils/format';
import type { Quotation } from '../types';

interface Props {
  quotation: Quotation | null;
  onConfirm: () => void;
  onCancel: () => void;
  zIndex?: number;
}

// Shared by the Invoicing page and the Ledger printable, so the
// "Convert to Invoice" step always shows the same numbers first.
export default function ConvertConfirmDialog({ quotation, onConfirm, onCancel, zIndex }: Props) {
  if (!quotation) return null;
  const message =
    `${quotation.id}: total ${formatINR(quotation.grandTotal)}, paid ${formatINR(quotation.paidAmount)}, ` +
    `balance ${formatINR(quotation.balanceAmount)}. ` +
    (quotation.balanceAmount > 0
      ? 'A balance is still outstanding. Converting makes this a final, read-only invoice (it can be rolled back later). Continue?'
      : 'Converting makes this a final, read-only invoice (it can be rolled back later). Continue?');
  return (
    <ConfirmDialog
      open
      title="Convert to Invoice?"
      message={message}
      confirmLabel="Convert"
      onConfirm={onConfirm}
      onCancel={onCancel}
      zIndex={zIndex}
    />
  );
}