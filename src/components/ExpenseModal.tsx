import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { ExpenseCategory } from '../types';
import { capitalizeFirst } from '../utils/format';

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
  const { isExpenseModalOpen, closeExpenseModal, addExpense } = useApp();

  const [category, setCategory] = useState<ExpenseCategory>('Rent');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (isExpenseModalOpen) {
      setCategory('Rent');
      setDescription('');
      setAmount('');
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [isExpenseModalOpen]);

  if (!isExpenseModalOpen) return null;

  const amountNum = parseFloat(amount) || 0;

  const handleSave = () => {
    if (!description || amountNum <= 0 || !date) return;
    addExpense({ category, description, amount: amountNum, date });
    closeExpenseModal();
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
                {CATEGORIES.filter((c) => c !== 'Raw Material').map((c) => (
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
                placeholder="e.g. Monthly workshop rent"
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
          <button className="btn btn-primary" onClick={handleSave}>
            Save expense
          </button>
        </div>
      </div>
    </div>
  );
}