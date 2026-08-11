import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import type { VendorPurchase } from '../types';

export default function VendorPaymentModal({ purchase, onClose }: { purchase: VendorPurchase | null; onClose: () => void }) {
  const { recordVendorPayment } = useApp();

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (purchase) {
      setAmount('');
      setNote('');
    }
  }, [purchase]);

  if (!purchase) return null;

  const amountNum = parseFloat(amount) || 0;
  const overpaying = amountNum > purchase.balance;

  const handleSave = async () => {
    if (amountNum <= 0 || overpaying) return;
    await recordVendorPayment(purchase.id, amountNum, note || undefined);
    onClose();
  };

  return (
    <div className="modal-overlay is-open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Record Payment</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="row-sub">{purchase.description}</div>
          <div className="row-sub" style={{ marginBottom: 8 }}>
            Balance due: <strong style={{ color: 'var(--text)' }}>{formatINR(purchase.balance)}</strong>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Amount (₹)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          {overpaying && (
            <div className="row-sub" style={{ color: 'var(--danger)' }}>
              Amount can't exceed the balance due ({formatINR(purchase.balance)}).
            </div>
          )}

          <div className="form-row">
            <div className="form-field">
              <label>Note (optional)</label>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Paid via UPI" />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={amountNum <= 0 || overpaying}>
            Save payment
          </button>
        </div>
      </div>
    </div>
  );
}