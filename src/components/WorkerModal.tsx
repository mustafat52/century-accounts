import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { capitalizeFirst } from '../utils/format';

export default function WorkerModal() {
  const { isWorkerModalOpen, closeWorkerModal, addWorker } = useApp();

  const [name, setName] = useState('');
  const [salary, setSalary] = useState('');

  useEffect(() => {
    if (isWorkerModalOpen) {
      setName('');
      setSalary('');
    }
  }, [isWorkerModalOpen]);

  if (!isWorkerModalOpen) return null;

  const handleSave = () => {
    const salaryNum = parseFloat(salary) || 0;
    if (!name || salaryNum <= 0) return;
    addWorker({ name, monthlySalary: salaryNum });
    closeWorkerModal();
  };

  return (
    <div className="modal-overlay is-open">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New Worker</h2>
          <button className="modal-close" onClick={closeWorkerModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field">
              <label>Worker name</label>
              <input type="text" value={name} onChange={(e) => setName(capitalizeFirst(e.target.value))} placeholder="e.g. Ramesh" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Monthly salary (₹)</label>
              <input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeWorkerModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save worker
          </button>
        </div>
      </div>
    </div>
  );
}