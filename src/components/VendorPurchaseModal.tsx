import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { ExpenseCategory } from '../types';
import { capitalizeFirst } from '../utils/format';

const VENDOR_CATEGORIES: ExpenseCategory[] = ['Raw Material', 'Maintenance', 'Transport'];

export default function VendorPurchaseModal({ vendorId, onClose }: { vendorId: string | null; onClose: () => void }) {
  const { addVendorPurchase } = useApp();

  const [category, setCategory] = useState<ExpenseCategory>('Raw Material');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (vendorId) {
      setCategory('Raw Material');
      setDescription('');
      setAmount('');
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [vendorId]);

  if (!vendorId) return null;

  const amountNum = parseFloat(amount) || 0;

  const handleSave = async () => {
    if (!description || amountNum <= 0 || !date) return;
    await addVendorPurchase({ vendorId, category, description, amount: amountNum, date });
    onClose();
  };

  return (
    <div className="modal-overlay is-open">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Record Purchase</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(capitalizeFirst(e.target.value))}
                placeholder="e.g. Sheet glass restock — 150 units"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Amount (₹)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save purchase
          </button>
        </div>
      </div>
    </div>
  );
}