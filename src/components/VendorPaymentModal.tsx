import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatINR, capitalizeFirst } from '../utils/format';
import type { Vendor } from '../types';

export default function VendorPaymentModal({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const { recordVendorPayment } = useApp();

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vendor) {
      setAmount('');
      setNote('');
    }
  }, [vendor]);

  if (!vendor) return null;

  const amountNum = parseFloat(amount) || 0;
  const overpaying = amountNum > vendor.payable;

  const handleSave = async () => {
    if (amountNum <= 0 || overpaying || saving) return;
    setSaving(true);
    await recordVendorPayment(vendor.id, amountNum, note || undefined);
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay is-open">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Record Payment</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="row-sub">{vendor.name}</div>
          <div className="row-sub" style={{ marginBottom: 8 }}>
            Total payable: <strong style={{ color: 'var(--text)' }}>{formatINR(vendor.payable)}</strong>
          </div>
          <div className="row-sub" style={{ marginBottom: 8 }}>
            This is applied across their outstanding bills automatically, oldest first — no need to
            pick which one.
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Amount (₹)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          {overpaying && (
            <div className="row-sub" style={{ color: 'var(--danger)' }}>
              Amount can't exceed the total payable ({formatINR(vendor.payable)}).
            </div>
          )}

          <div className="form-row">
            <div className="form-field">
              <label>Note (optional)</label>
              <input type="text" value={note} onChange={(e) => setNote(capitalizeFirst(e.target.value))} placeholder="e.g. Paid via UPI" />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={amountNum <= 0 || overpaying || saving}>
            {saving ? 'Saving…' : 'Save payment'}
          </button>
        </div>
      </div>
    </div>
  );
}