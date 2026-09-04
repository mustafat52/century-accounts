import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { capitalizeFirst } from '../utils/format';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AdvanceModal() {
  const { isAdvanceModalOpen, advanceModalWorkerId, closeAdvanceModal, workers, logWorkerAdvance } = useApp();

  const [workerId, setWorkerId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (isAdvanceModalOpen) {
      setWorkerId(advanceModalWorkerId ?? workers[0]?.id ?? '');
      setAmount('');
      setDate(today());
      setNote('');
    }
  }, [isAdvanceModalOpen, advanceModalWorkerId, workers]);

  if (!isAdvanceModalOpen) return null;

  const amountNum = parseFloat(amount) || 0;

  const handleSave = () => {
    if (!workerId || amountNum <= 0 || !date) return;
    logWorkerAdvance({ workerId, amount: amountNum, date, note: note || undefined });
    closeAdvanceModal();
  };

  return (
    <div className="modal-overlay is-open">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Log Advance</h2>
          <button className="modal-close" onClick={closeAdvanceModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field">
              <label>Worker</label>
              <select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Amount (₹)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Note (optional)</label>
              <input type="text" value={note} onChange={(e) => setNote(capitalizeFirst(e.target.value))} placeholder="e.g. asked for travel" />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeAdvanceModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save advance
          </button>
        </div>
      </div>
    </div>
  );
}