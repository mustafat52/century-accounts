import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import type { VendorSlip } from '../types';

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function PriceSlipModal({ slip, onClose }: { slip: VendorSlip | null; onClose: () => void }) {
  const { priceVendorSlip } = useApp();
  const [rates, setRates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (slip) {
      const initial: Record<string, string> = {};
      slip.items.forEach((it) => {
        initial[it.id] = '';
      });
      setRates(initial);
    }
  }, [slip]);

  if (!slip) return null;

  const lineAmount = (itemId: string, quantity: number) => (parseFloat(rates[itemId]) || 0) * quantity;
  const total = slip.items.reduce((sum, it) => sum + lineAmount(it.id, it.quantity), 0);
  const isValid = slip.items.every((it) => (parseFloat(rates[it.id]) || 0) > 0);

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    await priceVendorSlip(
      slip.id,
      slip.items.map((it) => ({ itemId: it.id, rate: parseFloat(rates[it.id]) || 0 }))
    );
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay is-open">
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Enter Prices — {slip.dcNo}</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="row-sub" style={{ marginBottom: 12 }}>
            Enter the rate the vendor wrote against each item. Saving locks this slip — it can't be
            edited afterward.
          </div>

          <div className="item-table-wrap">
            <table className="item-table">
              <colgroup>
                <col />
                <col style={{ width: 90 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Quantity</th>
                  <th>Unit</th>
                  <th className="num">Rate (₹)</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {slip.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td className="num">{item.quantity}</td>
                    <td>{item.unit}</td>
                    <td className="num">
                      <input
                        type="number"
                        value={rates[item.id] ?? ''}
                        onChange={(e) => setRates((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="num item-table-amount">{money(lineAmount(item.id, item.quantity))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row-sub" style={{ marginTop: 10, textAlign: 'right' }}>
            <strong style={{ color: 'var(--text)', fontSize: 16 }}>Total: {formatINR(total)}</strong>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!isValid || saving}>
            {saving ? 'Saving…' : 'Save & Lock'}
          </button>
        </div>
      </div>
    </div>
  );
}