import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { capitalizeFirst } from '../utils/format';

export default function WorkerModal() {
  const { isWorkerModalOpen, editingWorkerId, closeWorkerModal, addWorker, updateWorker, workers } = useApp();

  const [name, setName] = useState('');
  const [salary, setSalary] = useState('');

  const editingWorker = editingWorkerId ? workers.find((w) => w.id === editingWorkerId) : null;

  useEffect(() => {
    if (isWorkerModalOpen) {
      setName(editingWorker?.name ?? '');
      setSalary(editingWorker ? String(editingWorker.monthlySalary) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkerModalOpen, editingWorkerId]);

  if (!isWorkerModalOpen) return null;

  const handleSave = async () => {
    const salaryNum = parseFloat(salary) || 0;
    if (!name || salaryNum <= 0) return;
    if (editingWorkerId) {
      await updateWorker(editingWorkerId, { name, monthlySalary: salaryNum });
    } else {
      await addWorker({ name, monthlySalary: salaryNum });
    }
    closeWorkerModal();
  };

  return (
    <div className="modal-overlay is-open">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{editingWorkerId ? 'Edit Worker' : 'New Worker'}</h2>
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
            {editingWorkerId ? 'Save changes' : 'Save worker'}
          </button>
        </div>
      </div>
    </div>
  );
}