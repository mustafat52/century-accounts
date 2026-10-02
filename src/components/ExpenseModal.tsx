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
  const { isExpenseModalOpen, closeExpenseModal, addExpense, updateExpense, editingExpenseId, expenses } = useApp();
  const editing = editingExpenseId ? expenses.find((e) => e.id === editingExpenseId) ?? null : null;

  const [category, setCategory] = useState<ExpenseCategory>('Rent');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (!isExpenseModalOpen) return;
    if (editing) {
      setCategory(editing.category);
      setDescription(editing.description);
      setAmount(String(editing.amount));
      setDate(editing.date);
    } else {
      setCategory('Rent');
      setDescription('');
      setAmount('');
      setDate(new Date().toISOString().slice(0, 10));
    }
    // Only re-seed when the modal opens or the target changes — not on every
    // expenses refresh, which would wipe what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpenseModalOpen, editingExpenseId]);

  if (!isExpenseModalOpen) return null;

  const amountNum = parseFloat(amount) || 0;

  const handleSave = () => {
    if (!description || amountNum <= 0 || !date) return;
    if (editing) {
      updateExpense(editing.id, { category, description, amount: amountNum, date });
    } else {
      addExpense({ category, description, amount: amountNum, date });
    }
    closeExpenseModal();
  };

  return (
    <div className="modal-overlay is-open">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{editing ? 'Edit Expense' : 'Record Expense'}</h2>
          <button className="modal-close" onClick={closeExpenseModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                {CATEGORIES.filter((c) => c !== 'Raw Material' || editing?.category === 'Raw Material').map((c) => (
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
            {editing ? 'Save changes' : 'Save expense'}
          </button>
        </div>
      </div>
    </div>
  );
}