import { useMemo, useState } from 'react';
import Topbar from '../components/Topbar';
import StatCard from '../components/StatCard';
import ExpenseModal from '../components/ExpenseModal';
import WorkerModal from '../components/WorkerModal';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import { exportAllExpenses, exportWorkerLedger, exportAllWorkersLedger } from '../utils/exportLedger';
import type { Worker } from '../types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// The full picture for one worker: editable salary, every advance ever
// taken, every salary settlement ever paid, and a single "Record Payment"
// action — same spirit as CustomerDetailModal on the billing side. There
// is deliberately only ONE input here, not a choice between "advance" or
// "settlement": whether an amount counts as one or the other is decided
// automatically based on what's still owed for the month, not by the
// person typing it in.
function WorkerDetailModal({ worker, onClose }: { worker: Worker | null; onClose: () => void }) {
  const { workerAdvances, workerPayments, logWorkerAdvance, recordWorkerPayment, openEditWorkerModal } = useApp();

  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(today());
  const [payNote, setPayNote] = useState('');
  const [saving, setSaving] = useState(false);

  if (!worker) return null;

  const advances = workerAdvances
    .filter((a) => a.workerId === worker.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const payments = workerPayments
    .filter((p) => p.workerId === worker.id)
    .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1));

  const payAmountNum = parseFloat(payAmount) || 0;
  // This is the actual classification rule, applied automatically —
  // never a choice the person makes: an amount that doesn't fully cover
  // what's left owed this month is an advance; an amount that covers (or
  // exceeds) it settles the month.
  const willSettle = payAmountNum > 0 && payAmountNum >= worker.remainingThisMonth;

  const handleRecordPayment = async () => {
    if (payAmountNum <= 0 || saving) return;
    setSaving(true);
    if (willSettle) {
      await recordWorkerPayment(worker.id, payAmountNum, payDate, currentMonthStart(), payNote || undefined);
    } else {
      await logWorkerAdvance({ workerId: worker.id, amount: payAmountNum, date: payDate, note: payNote || undefined });
    }
    setSaving(false);
    setPayAmount('');
    setPayNote('');
  };

  return (
    <div className="modal-overlay is-open">
      <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{worker.name}</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="stat-grid">
            <StatCard label="Monthly salary" value={formatINR(worker.monthlySalary)} />
            <StatCard label="Advances this month" value={formatINR(worker.advancesThisMonth)} />
            <StatCard label="Paid this month" value={formatINR(worker.paidThisMonth)} />
            <StatCard
              label="Remaining this month"
              value={formatINR(worker.remainingThisMonth)}
              delta={worker.remainingThisMonth > 0 ? 'Still owed' : 'Settled'}
              deltaDirection={worker.remainingThisMonth > 0 ? 'down' : 'up'}
            />
          </div>

          <div className="section-title">Record Payment</div>
          <div className="row-sub" style={{ marginBottom: 8 }}>
            Just type the amount — it's automatically counted as an <strong>Advance</strong> if it
            doesn't cover everything still owed this month, or a <strong>Salary Settlement</strong> if
            it covers (or exceeds) what's left.
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Amount (₹)</label>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={String(worker.remainingThisMonth)}
              />
            </div>
            <div className="form-field">
              <label>Date paid</label>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Note (optional)</label>
              <input type="text" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. Paid via bank transfer" />
            </div>
          </div>
          {payAmountNum > 0 && (
            <div className="row-sub" style={{ marginBottom: 8 }}>
              This will be recorded as {willSettle ? <strong>a Salary Settlement</strong> : <strong>an Advance</strong>}.
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary btn-small" onClick={handleRecordPayment} disabled={payAmountNum <= 0 || saving}>
              {saving ? 'Saving…' : 'Record Payment'}
            </button>
          </div>

          <div className="section-title">Advance history</div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {advances.length === 0 && (
                  <tr>
                    <td className="row-sub">No advances recorded yet.</td>
                  </tr>
                )}
                {advances.map((a) => (
                  <tr key={a.id}>
                    <td className="row-sub">{a.date}</td>
                    <td className="num">{formatINR(a.amount)}</td>
                    <td className="row-sub">{a.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-title">Salary settlement history</div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date Paid</th>
                  <th>For Month</th>
                  <th>Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 && (
                  <tr>
                    <td className="row-sub">No settlements recorded yet.</td>
                  </tr>
                )}
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="row-sub">{p.paymentDate}</td>
                    <td className="row-sub">{p.forMonth}</td>
                    <td className="num">{formatINR(p.amount)}</td>
                    <td className="row-sub">{p.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              onClose();
              openEditWorkerModal(worker.id);
            }}
          >
            Edit Salary
          </button>
          <button className="btn btn-primary" onClick={() => exportWorkerLedger(worker, workerAdvances, workerPayments)}>
            Export (Excel)
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Expenses() {
  const { expenses, vendorPurchases, vendors, workers, workerAdvances, workerPayments, openExpenseModal, openWorkerModal } =
    useApp();
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const selectedWorker = workers.find((w) => w.id === selectedWorkerId) ?? null;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amount));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const totalGeneral = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <>
      <Topbar title="Expenses" subtitle="General business costs and payroll" />
      <div className="view-body">
        <div className="panel">
          <div className="panel-head">
            <h3>General expenses — {formatINR(totalGeneral)}</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-ghost btn-small"
                onClick={() => exportAllExpenses(expenses, vendorPurchases, vendors)}
              >
                Export Full Report (Excel)
              </button>
              <button className="btn btn-primary btn-small desktop-only" onClick={openExpenseModal}>
                + New Expense
              </button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 && (
                <tr>
                  <td className="row-sub">No general expenses recorded yet.</td>
                </tr>
              )}
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="row-sub">{e.date}</td>
                  <td className="row-sub">{e.category}</td>
                  <td>{e.description}</td>
                  <td className="num">{formatINR(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>By category</h3>
          </div>
          <table>
            <tbody>
              {byCategory.map(([cat, amount]) => (
                <tr key={cat}>
                  <td>{cat}</td>
                  <td className="num">{formatINR(amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Payslips &amp; Wages — this month</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-ghost btn-small"
                onClick={() => exportAllWorkersLedger(workers, workerAdvances, workerPayments)}
              >
                Export All (Excel)
              </button>
              <button className="btn btn-primary btn-small desktop-only" onClick={openWorkerModal}>
                + New Worker
              </button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Worker</th>
                <th>Monthly Salary</th>
                <th>Advances Taken</th>
                <th>Remaining to Pay</th>
              </tr>
            </thead>
            <tbody>
              {workers.length === 0 && (
                <tr>
                  <td className="row-sub">No workers added yet.</td>
                </tr>
              )}
              {workers.map((w) => (
                <tr key={w.id} onClick={() => setSelectedWorkerId(w.id)} style={{ cursor: 'pointer' }}>
                  <td className="row-name">{w.name}</td>
                  <td className="num">{formatINR(w.monthlySalary)}</td>
                  <td className="num" style={{ color: w.advancesThisMonth > 0 ? 'var(--warning)' : undefined }}>
                    {formatINR(w.advancesThisMonth)}
                  </td>
                  <td className="num" style={{ color: w.remainingThisMonth > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    {formatINR(w.remainingThisMonth)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ExpenseModal />
      <WorkerModal />
      <WorkerDetailModal worker={selectedWorker} onClose={() => setSelectedWorkerId(null)} />
    </>
  );
}