import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { ExpenseCategory } from '../types';
import { capitalizeFirst, todayLocal } from '../utils/format';

const CATEGORIES: ExpenseCategory[] = [
  'Raw Material',
  'Labor',
  'Payslips & Wages',
  'Transport',
  'Rent',
  'Utilities',
  'Maintenance',
  'Other',
];

export default function ExpenseModal() {
  const { isExpenseModalOpen, closeExpenseModal, addExpense } = useApp();

  const [category, setCategory] = useState<ExpenseCategory>('Rent');
  const [customCategory, setCustomCategory] = useState('');
  const [description, setDescription] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (isExpenseModalOpen) {
      setCategory('Rent');
      setCustomCategory('');
      setDescription('');
      setPaidTo('');
      setAmount('');
      setDate(todayLocal());
    }
  }, [isExpenseModalOpen]);

  if (!isExpenseModalOpen) return null;

  const amountNum = parseFloat(amount) || 0;

  const handleSave = async () => {
    if (!description || amountNum <= 0 || !date) return;
    if (category === 'Other' && !customCategory.trim()) return;
    const ok = await addExpense({
      category,
      customCategory: category === 'Other' ? customCategory.trim() : undefined,
      paidTo: paidTo.trim() || undefined,
      description,
      amount: amountNum,
      date,
    });
    if (ok) closeExpenseModal();
  };

  return (
    <div className="modal-overlay is-open">
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
                {/* Staff advances are recorded from the "Staff advances" tab (they create
                    their own expense entry), and salary payments aren't tracked — so
                    neither is offered as a manual category. */}
                {CATEGORIES.filter((c) => c !== 'Raw Material' && c !== 'Payslips & Wages').map((c) => (
                  <option key={c} value={c}>
                    {c === 'Other' ? 'Other (write your own)' : c}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {category === 'Other' && (
            <div className="form-row">
              <div className="form-field">
                <label>Your category name</label>
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(capitalizeFirst(e.target.value))}
                  placeholder="e.g. Packaging, Tea & snacks, Insurance"
                  autoFocus
                />
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-field">
              <label>Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(capitalizeFirst(e.target.value))}
                placeholder="e.g. Monthly workshop rent"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Paid to (optional)</label>
              <input
                type="text"
                value={paidTo}
                onChange={(e) => setPaidTo(capitalizeFirst(e.target.value))}
                placeholder="e.g. Mohammed Bhai, Landlord, Courier"
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
          <button className="btn btn-ghost" onClick={closeExpenseModal}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={category === 'Other' && !customCategory.trim()}
          >
            Save expense
          </button>
        </div>
      </div>
    </div>
  );
}