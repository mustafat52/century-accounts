import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { ExpenseCategory } from '../types';

const CATEGORIES: ExpenseCategory[] = [
  'Raw Material',
  'Labor',
  'Payslips & Wages',
  'Transport',
  'Rent',
  'Utilities',
  'Maintenance',
];

export default function ExpenseModal() {
  const { isExpenseModalOpen, closeExpenseModal, addExpense, vendors } = useApp();

  const [category, setCategory] = useState<ExpenseCategory>('Raw Material');
  const [vendorId, setVendorId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [markUnpaid, setMarkUnpaid] = useState(false);

  useEffect(() => {
    if (isExpenseModalOpen) {
      setCategory('Raw Material');
      setVendorId('');
      setDescription('');
      setAmount('');
      setDate(new Date().toISOString().slice(0, 10));
      setMarkUnpaid(false);
    }
  }, [isExpenseModalOpen]);

  if (!isExpenseModalOpen) return null;

  const amountNum = parseFloat(amount) || 0;

  const handleSave = () => {
    if (!description || amountNum <= 0 || !date) return;
    addExpense({
      category,
      vendorId: vendorId || undefined,
      description,
      amount: amountNum,
      date,
      markUnpaid: vendorId ? markUnpaid : false,
    });
    closeExpenseModal();
  };

  return (
    <div className="modal-overlay is-open" onClick={closeExpenseModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Record Expense</h2>
          <button className="modal-close" onClick={closeExpenseModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Vendor (optional)</label>
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">None</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Sheet glass restock — 150 units"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {vendorId && (
            <div className="form-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={markUnpaid}
                  onChange={(e) => setMarkUnpaid(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Not yet paid — add to vendor payable
              </label>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeExpenseModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save expense
          </button>
        </div>
      </div>
    </div>
  );
}