import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PaymentModal() {
  const { isPaymentModalOpen, paymentModalInvoiceDbId, closePaymentModal, invoices, recordInvoicePayment, openPrint } =
    useApp();

  const invoice = paymentModalInvoiceDbId ? invoices.find((i) => i.dbId === paymentModalInvoiceDbId) : undefined;

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (isPaymentModalOpen) {
      setAmount('');
      setNote('');
    }
  }, [isPaymentModalOpen, paymentModalInvoiceDbId]);

  if (!isPaymentModalOpen || !invoice) return null;

  const amountNum = parseFloat(amount) || 0;
  const total = invoice.amount + invoice.gst + invoice.transportation;

  const handleSave = async () => {
    if (amountNum <= 0 || amountNum > invoice.balance || !paymentModalInvoiceDbId) return;
    await recordInvoicePayment(paymentModalInvoiceDbId, amountNum, note || undefined);
    closePaymentModal();
    // Immediately offer the printable receipt for this payment.
    openPrint('invoice', invoice.id);
  };

  return (
    <div className="modal-overlay is-open" onClick={closePaymentModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Record Payment</h2>
          <button className="modal-close" onClick={closePaymentModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="row-sub" style={{ marginBottom: 4 }}>
            {invoice.id} · Total {formatINR(total)} · Balance due {formatINR(invoice.balance)}
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
              <label>Note (optional)</label>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. advance for materials" />
            </div>
          </div>

          {amountNum > 0 && (
            <div className="row-sub">
              {amountNum >= invoice.balance
                ? 'This fully settles the invoice.'
                : `Remaining balance after this: ${formatINR(invoice.balance - amountNum)}`}
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