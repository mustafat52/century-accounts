import { useMemo } from 'react';
import Topbar from '../components/Topbar';
import ExpenseModal from '../components/ExpenseModal';
import WorkerModal from '../components/WorkerModal';
import AdvanceModal from '../components/AdvanceModal';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';

export default function Expenses() {
  const { expenses, vendors, workers, openExpenseModal, openWorkerModal, openAdvanceModal } = useApp();

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amount));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const vendorName = (id?: string) => (id ? vendors.find((v) => v.id === id)?.name : undefined);

  const sortedExpenses = useMemo(
    () => [...expenses].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [expenses]
  );

  return (
    <>
      <Topbar title="Expenses" subtitle="Categorized spending across the workshop" />
      <div className="view-body">
        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <h3>Expense log</h3>
              <button className="btn btn-ghost btn-small desktop-only" onClick={openExpenseModal}>
                + Record Expense
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {sortedExpenses.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="row-name">{e.description}</div>
                      {vendorName(e.vendorId) && <div className="row-sub">{vendorName(e.vendorId)}</div>}
                    </td>
                    <td className="row-sub">{e.category}</td>
                    <td className="row-sub">{e.date}</td>
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
                {byCategory.map(([category, amount]) => (
                  <tr key={category}>
                    <td>{category}</td>
                    <td className="num">{formatINR(amount)}</td>
                    <td className="row-sub" style={{ width: 60, textAlign: 'right' }}>
                      {total > 0 ? ((amount / total) * 100).toFixed(0) : 0}%
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="row-name">Total</td>
                  <td className="num row-name">{formatINR(total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Payslips & Wages — this month</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-small desktop-only" onClick={openWorkerModal}>
                + New Worker
              </button>
              <button className="btn btn-primary btn-small desktop-only" onClick={() => openAdvanceModal()}>
                + Log Advance
              </button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Worker</th>
                <th>Monthly salary</th>
                <th>Advances taken</th>
                <th>Remaining to pay</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id}>
                  <td className="row-name">{w.name}</td>
                  <td className="num">{formatINR(w.monthlySalary)}</td>
                  <td className="num" style={{ color: w.advancesThisMonth > 0 ? 'var(--warning)' : undefined }}>
                    {formatINR(w.advancesThisMonth)}
                  </td>
                  <td className="num" style={{ color: 'var(--success)' }}>{formatINR(w.remainingThisMonth)}</td>
                  <td>
                    <button className="btn btn-ghost btn-small desktop-only" onClick={() => openAdvanceModal(w.id)}>
                      Log Advance
                    </button>
                  </td>
                </tr>
              ))}
              {workers.length === 0 && (
                <tr>
                  <td className="row-sub">No workers added yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ExpenseModal />
      <WorkerModal />
      <AdvanceModal />
    </>
  );
}