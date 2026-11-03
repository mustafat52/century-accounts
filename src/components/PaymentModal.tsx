import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { PaymentMethod } from '../types';
import { PAYMENT_METHOD_LABELS } from '../types';
import { formatINR, capitalizeFirst, todayLocal } from '../utils/format';

// Records one installment against a quotation's running balance — this IS
// the payment ledger (see quotation_payments in schema.sql), shown in
// full on the Ledger printable. Invoices never hold payments themselves:
// an invoice's "Record Payment" (Invoicing page) opens this modal for its
// SOURCE quotation, so converted bills with a balance are collected here too.
export default function PaymentModal() {
  const { isPaymentModalOpen, paymentModalQuotationDbId, closePaymentModal, quotations, recordQuotationPayment } = useApp();

  const quotation = paymentModalQuotationDbId ? quotations.find((q) => q.dbId === paymentModalQuotationDbId) : undefined;

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isPaymentModalOpen) {
      setAmount('');
      setDate(todayLocal());
      setMethod('cash');
      setNote('');
      setSaving(false);
    }
  }, [isPaymentModalOpen, paymentModalQuotationDbId]);

  if (!isPaymentModalOpen || !quotation) return null;

  const amountNum = parseFloat(amount) || 0;

  const handleSave = async () => {
    if (amountNum <= 0 || amountNum > quotation.balanceAmount || !date || !paymentModalQuotationDbId || saving) return;
    setSaving(true);
    const receipt = await recordQuotationPayment(paymentModalQuotationDbId, amountNum, method, note || undefined, date);
    setSaving(false);
    // Only close when the payment was really recorded — on a failure
    // (already toasted) the modal stays open with the entry intact. The
    // ledger / receipt can still be printed later from the bill's row.
    if (!receipt) return;
    closePaymentModal();
  };

  return (
    <div className="modal-overlay is-open">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Record Payment</h2>
          <button className="modal-close" onClick={closePaymentModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="row-sub" style={{ marginBottom: 4 }}>
            {quotation.id} · Total {formatINR(quotation.grandTotal)} · Balance due {formatINR(quotation.balanceAmount)}
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Amount received (₹)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="form-field">
              <label>Date received</label>
              <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Mode of payment</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Note (optional)</label>
              <input type="text" value={note} onChange={(e) => setNote(capitalizeFirst(e.target.value))} placeholder="e.g. advance for materials" />
            </div>
          </div>

          {amountNum > 0 && (
            <div className="row-sub">
              {amountNum >= quotation.balanceAmount
                ? quotation.status === 'converted'
                  ? 'This fully settles the bill.'
                  : 'This fully settles the bill — it can then be converted to an invoice.'
                : `Remaining balance after this: ${formatINR(quotation.balanceAmount - amountNum)}`}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closePaymentModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !date}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}