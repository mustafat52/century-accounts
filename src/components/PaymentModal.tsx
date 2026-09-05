import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { PaymentMethod } from '../types';
import { PAYMENT_METHOD_LABELS } from '../types';
import { formatINR, capitalizeFirst } from '../utils/format';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Records one installment against a quotation's running balance — this IS
// the payment ledger (see quotation_payments in schema.sql), shown in
// full on the Ledger printable. Nothing gets recorded against an invoice
// anymore; by the time something becomes an invoice it's already settled.
export default function PaymentModal() {
  const { isPaymentModalOpen, paymentModalQuotationDbId, closePaymentModal, quotations, recordQuotationPayment, openPrint } =
    useApp();

  const quotation = paymentModalQuotationDbId ? quotations.find((q) => q.dbId === paymentModalQuotationDbId) : undefined;

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (isPaymentModalOpen) {
      setAmount('');
      setMethod('cash');
      setNote('');
    }
  }, [isPaymentModalOpen, paymentModalQuotationDbId]);

  if (!isPaymentModalOpen || !quotation) return null;

  const amountNum = parseFloat(amount) || 0;

  const handleSave = async () => {
    if (amountNum <= 0 || amountNum > quotation.balanceAmount || !paymentModalQuotationDbId) return;
    await recordQuotationPayment(paymentModalQuotationDbId, amountNum, method, note || undefined);
    closePaymentModal();
    // Immediately offer the printable ledger showing this payment.
    openPrint('quotation', quotation.id);
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
              <label>Date</label>
              <input type="text" disabled value={today()} />
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
                ? 'This fully settles the bill — it can then be converted to an invoice.'
                : `Remaining balance after this: ${formatINR(quotation.balanceAmount - amountNum)}`}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closePaymentModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save & print receipt
          </button>
        </div>
      </div>
    </div>
  );
}
