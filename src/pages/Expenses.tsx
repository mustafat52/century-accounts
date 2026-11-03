import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Topbar from '../components/Topbar';
import StatCard from '../components/StatCard';
import ExpenseModal from '../components/ExpenseModal';
import WorkerModal from '../components/WorkerModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { formatINR, todayLocal } from '../utils/format';
import { exportAllExpenses, exportExpenseCloseReport, exportWorkerLedger, exportAllWorkersLedger } from '../utils/exportLedger';
import type { Expense, Worker } from '../types';

type Tab = 'expenses' | 'advances';

// Staff advances are saved under this category in the database (and reports
// group by it). On screen it reads as plain English.
const CATEGORY_LABEL: Record<string, string> = { 'Payslips & Wages': 'Staff advance' };
const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? c;

// What the worker is still to be paid this month: salary minus the advances
// already taken. Salary payments are NOT tracked, so this is the only
// "remaining" figure — it never goes below zero.
function salaryToPay(w: Worker): number {
  return Math.max(0, w.monthlySalary - w.advancesThisMonth);
}
function advancesOverSalary(w: Worker): number {
  return Math.max(0, w.advancesThisMonth - w.monthlySalary);
}

function monthLabel(): string {
  return new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// One worker: their salary, what they've taken in advance this month, what's
// left to pay, a single "Give advance" form, and the advance history (each
// with a Delete). Nothing here records salary payments.
function WorkerDetailModal({ worker, onClose }: { worker: Worker | null; onClose: () => void }) {
  const { workerAdvances, logWorkerAdvance, deleteWorkerAdvance, openEditWorkerModal } = useApp();

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!worker) return null;

  const advances = workerAdvances
    .filter((a) => a.workerId === worker.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const deleteTarget = advances.find((a) => a.id === deleteId) ?? null;

  const amountNum = parseFloat(amount) || 0;
  const thisMonth = todayLocal().slice(0, 7);
  const toPay = salaryToPay(worker);
  const over = advancesOverSalary(worker);

  // Only meaningful when the advance is dated this month — the totals above
  // are for the current month.
  const countsThisMonth = date.slice(0, 7) === thisMonth;
  const afterThis = Math.max(0, worker.monthlySalary - (worker.advancesThisMonth + amountNum));

  const handleSave = async () => {
    if (amountNum <= 0 || !date || saving) return;
    setSaving(true);
    const ok = await logWorkerAdvance({ workerId: worker.id, amount: amountNum, date, note: note.trim() || undefined });
    setSaving(false);
    if (ok) {
      setAmount('');
      setNote('');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const ok = await deleteWorkerAdvance(deleteTarget.id);
    setDeleting(false);
    if (ok) setDeleteId(null);
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
            <StatCard label={`Advances taken — ${monthLabel()}`} value={formatINR(worker.advancesThisMonth)} />
            <StatCard
              label="Salary to pay (after advances)"
              value={formatINR(toPay)}
              delta={over > 0 ? `Advances are ${formatINR(over)} more than salary` : `${formatINR(worker.monthlySalary)} − ${formatINR(worker.advancesThisMonth)}`}
              deltaDirection={over > 0 ? 'down' : 'up'}
            />
          </div>

          <div className="desktop-only">
            <div className="section-title">Give an advance</div>
            <div className="form-row">
              <div className="form-field">
                <label>Amount (₹)</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-field">
                <label>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="form-field">
                <label>Note (optional)</label>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Medical, festival" />
              </div>
            </div>
            {amountNum > 0 && countsThisMonth && (
              <div className="row-sub" style={{ marginBottom: 8 }}>
                After this advance, salary to pay will be <strong>{formatINR(afterThis)}</strong>.
              </div>
            )}
            {amountNum > 0 && !countsThisMonth && (
              <div className="row-sub" style={{ marginBottom: 8 }}>
                This date is not in {monthLabel()}, so it won't change this month's salary-to-pay.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
              <button className="btn btn-primary btn-small" onClick={handleSave} disabled={amountNum <= 0 || !date || saving}>
                {saving ? 'Saving…' : 'Save advance'}
              </button>
            </div>
          </div>

          <div className="section-title">Advances taken</div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {advances.length === 0 && (
                  <tr>
                    <td className="row-sub" colSpan={4}>
                      No advances recorded yet.
                    </td>
                  </tr>
                )}
                {advances.map((a) => (
                  <tr key={a.id}>
                    <td className="row-sub">
                      {a.date}
                      {a.date.slice(0, 7) === thisMonth && (
                        <span className="badge due" style={{ marginLeft: 8 }}>
                          This month
                        </span>
                      )}
                    </td>
                    <td className="num">{formatINR(a.amount)}</td>
                    <td className="row-sub">{a.note || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-small desktop-only"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => setDeleteId(a.id)}
                      >
                        Delete
                      </button>
                    </td>
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
            className="btn btn-ghost desktop-only"
            onClick={() => {
              onClose();
              openEditWorkerModal(worker.id);
            }}
          >
            Edit Salary
          </button>
          <button className="btn btn-primary" onClick={() => exportWorkerLedger(worker, workerAdvances)}>
            Export (Excel)
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        zIndex={1000}
        title="Delete this advance?"
        message={
          deleteTarget
            ? `${formatINR(deleteTarget.amount)} given to ${worker.name} on ${deleteTarget.date} will be removed, together with its entry in Expenses. ${worker.name}'s salary-to-pay will go back up. This can't be undone.`
            : ''
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete advance'}
        onConfirm={handleDelete}
        onCancel={() => !deleting && setDeleteId(null)}
      />
    </div>
  );
}

export default function Expenses() {
  const {
    expenses: allExpenses,
    vendorPurchases,
    vendors,
    workers,
    workerAdvances,
    openExpenseModal,
    openWorkerModal,
    archiveExpenses,
    deleteExpense,
    showToast,
  } = useApp();

  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'advances' ? 'advances' : 'expenses';
  const setTab = (t: Tab) => setSearchParams(t === 'expenses' ? {} : { tab: t });

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const selectedWorker = workers.find((w) => w.id === selectedWorkerId) ?? null;
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Archived rows (see "Close Month") are hidden from this page only —
  // Reports and the dashboard still read the full list from context, so
  // closing a month never changes any historical figure.
  const expenses = useMemo(
    () =>
      allExpenses
        .filter((e) => !e.archivedAt)
        .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1)),
    [allExpenses]
  );

  // Every closed month, newest first. Rows closed in one click share the
  // exact same archivedAt value, so that timestamp is the group key.
  const archivedMonths = useMemo(() => {
    const groups = new Map<string, Expense[]>();
    allExpenses.forEach((e) => {
      if (!e.archivedAt) return;
      const list = groups.get(e.archivedAt) ?? [];
      list.push(e);
      groups.set(e.archivedAt, list);
    });
    return Array.from(groups.entries())
      .map(([archivedAt, items]) => {
        const dates = items.map((i) => i.date).sort();
        return {
          archivedAt,
          items,
          from: dates[0],
          to: dates[dates.length - 1],
          total: items.reduce((sum, i) => sum + i.amount, 0),
        };
      })
      .sort((a, b) => (a.archivedAt < b.archivedAt ? 1 : -1));
  }, [allExpenses]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => map.set(categoryLabel(e.category), (map.get(categoryLabel(e.category)) ?? 0) + e.amount));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const totalGeneral = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalAdvances = workers.reduce((sum, w) => sum + w.advancesThisMonth, 0);
  const totalToPay = workers.reduce((sum, w) => sum + salaryToPay(w), 0);

  // Which expense rows are really a worker's advance (so the delete warning
  // can say so).
  const advanceByExpenseId = useMemo(() => {
    const map = new Map<string, string>();
    workerAdvances.forEach((a) => {
      if (!a.linkedExpenseId) return;
      map.set(a.linkedExpenseId, workers.find((w) => w.id === a.workerId)?.name ?? 'a worker');
    });
    return map;
  }, [workerAdvances, workers]);

  // Download first, archive second: if the report can't even be generated
  // nothing is archived. (A browser can't confirm the file was actually
  // saved, which is why every closed month stays re-downloadable below.)
  const handleCloseMonth = async () => {
    const toClose = expenses;
    if (toClose.length === 0) {
      setConfirmCloseOpen(false);
      return;
    }
    setClosing(true);
    try {
      exportExpenseCloseReport(toClose);
    } catch (err) {
      console.error('[Close month] report failed', err);
      showToast('Could not generate the report, so nothing was cleared.', 'error');
      setClosing(false);
      setConfirmCloseOpen(false);
      return;
    }
    const archivedAt = await archiveExpenses(toClose.map((e) => e.id));
    setClosing(false);
    setConfirmCloseOpen(false);
    if (archivedAt) showToast(`Month closed — ${toClose.length} expenses archived. The report was downloaded.`, 'success');
  };

  const handleDeleteExpense = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const ok = await deleteExpense(deleteTarget.id);
    setDeleting(false);
    if (ok) {
      showToast('Expense deleted.', 'success');
      setDeleteTarget(null);
    }
  };

  const deleteAdvanceOwner = deleteTarget ? advanceByExpenseId.get(deleteTarget.id) : undefined;

  return (
    <>
      <Topbar title="Expenses" subtitle="Business costs and staff advances" />
      <div className="view-body">
        <div className="stat-grid">
          <StatCard label="Expenses so far" value={formatINR(totalGeneral)} delta={`${expenses.length} open entr${expenses.length === 1 ? 'y' : 'ies'}`} />
          <StatCard label={`Staff advances — ${monthLabel()}`} value={formatINR(totalAdvances)} />
          <StatCard label="Salaries still to pay (after advances)" value={formatINR(totalToPay)} />
        </div>

        <div className="chip-row">
          <button className={`chip${tab === 'expenses' ? ' is-active' : ''}`} onClick={() => setTab('expenses')}>
            Expenses
          </button>
          <button className={`chip${tab === 'advances' ? ' is-active' : ''}`} onClick={() => setTab('advances')}>
            Staff advances
          </button>
        </div>

        {tab === 'expenses' && (
          <>
            <div className="panel">
              <div className="panel-head">
                <h3>Expenses — {formatINR(totalGeneral)}</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() => exportAllExpenses(allExpenses, vendorPurchases, vendors)}
                  >
                    Export Full Report (Excel)
                  </button>
                  <button
                    className="btn btn-ghost btn-small desktop-only"
                    onClick={() => setConfirmCloseOpen(true)}
                    disabled={expenses.length === 0}
                  >
                    Close Month
                  </button>
                  <button className="btn btn-primary btn-small desktop-only" onClick={openExpenseModal}>
                    + New Expense
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table className="table-cards">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>What it was for</th>
                      <th>Category</th>
                      <th>Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length === 0 && (
                      <tr>
                        <td className="row-sub" colSpan={5}>
                          {archivedMonths.length > 0
                            ? 'No open expenses — the last month was closed. New expenses will appear here.'
                            : 'No expenses recorded yet. Click “+ New Expense” to add one.'}
                        </td>
                      </tr>
                    )}
                    {expenses.map((e) => (
                      <tr key={e.id}>
                        <td className="row-sub card-meta">{e.date}</td>
                        <td className="card-main">{e.description}</td>
                        <td className="row-sub card-meta">
                          <span className="mobile-label">Category</span>
                          {categoryLabel(e.category)}
                        </td>
                        <td className="num card-amount">{formatINR(e.amount)}</td>
                        <td className="card-actions" style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-ghost btn-small desktop-only"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => setDeleteTarget(e)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {byCategory.length > 0 && (
              <div className="panel">
                <div className="panel-head">
                  <h3>Where the money went</h3>
                </div>
                <div className="table-scroll">
                  <table>
                    <tbody>
                      {byCategory.map(([cat, amount]) => (
                        <tr key={cat}>
                          <td>{cat}</td>
                          <td className="num">{formatINR(amount)}</td>
                          <td className="row-sub" style={{ width: 70, textAlign: 'right' }}>
                            {totalGeneral > 0 ? `${Math.round((amount / totalGeneral) * 100)}%` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {archivedMonths.length > 0 && (
              <div className="panel">
                <div className="panel-head">
                  <h3>Closed months</h3>
                </div>
                <div className="table-scroll">
                  <table className="table-cards">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Closed on</th>
                        <th>Expenses</th>
                        <th>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedMonths.map((m) => (
                        <tr key={m.archivedAt}>
                          <td className="card-main">
                            {m.from} to {m.to}
                          </td>
                          <td className="row-sub card-meta">
                            <span className="mobile-label">Closed</span>
                            {new Date(m.archivedAt).toLocaleDateString('en-IN')}
                          </td>
                          <td className="row-sub card-meta">
                            <span className="mobile-label">Count</span>
                            {m.items.length}
                          </td>
                          <td className="num card-amount">{formatINR(m.total)}</td>
                          <td className="card-actions">
                            <button
                              className="btn btn-ghost btn-small"
                              onClick={() => exportExpenseCloseReport(m.items, m.archivedAt)}
                            >
                              Download Report
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'advances' && (
          <div className="panel">
            <div className="panel-head">
              <h3>Staff advances — {monthLabel()}</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-small" onClick={() => exportAllWorkersLedger(workers, workerAdvances)}>
                  Export All (Excel)
                </button>
                <button className="btn btn-primary btn-small desktop-only" onClick={openWorkerModal}>
                  + New Worker
                </button>
              </div>
            </div>
            <div className="row-sub" style={{ padding: '12px 20px 0' }}>
              Note down every advance a worker takes during the month. At month end, pay them{' '}
              <strong>salary minus advances</strong>. Click a worker to give an advance or see their history.
            </div>
            <div className="table-scroll">
              <table className="table-cards">
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Monthly salary</th>
                    <th>Advances taken</th>
                    <th>Salary to pay</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {workers.length === 0 && (
                    <tr>
                      <td className="row-sub" colSpan={5}>
                        No workers added yet. Click “+ New Worker” to add one.
                      </td>
                    </tr>
                  )}
                  {workers.map((w) => {
                    const over = advancesOverSalary(w);
                    return (
                      <tr key={w.id} onClick={() => setSelectedWorkerId(w.id)} style={{ cursor: 'pointer' }}>
                        <td className="row-name card-main">{w.name}</td>
                        <td className="num card-meta">
                          <span className="mobile-label">Salary</span>
                          {formatINR(w.monthlySalary)}
                        </td>
                        <td className="num card-meta" style={{ color: w.advancesThisMonth > 0 ? 'var(--warning)' : undefined }}>
                          <span className="mobile-label">Advances</span>
                          {formatINR(w.advancesThisMonth)}
                        </td>
                        <td className="num card-amount">
                          <span className="mobile-label">To pay</span>
                          {formatINR(salaryToPay(w))}
                          {over > 0 && (
                            <div className="row-sub" style={{ color: 'var(--warning)' }}>
                              Advances exceed salary by {formatINR(over)}
                            </div>
                          )}
                        </td>
                        <td className="card-actions" style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-primary btn-small desktop-only"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelectedWorkerId(w.id);
                            }}
                          >
                            Give advance
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmCloseOpen}
        title="Close this month's expenses?"
        message={`This downloads a final report of ${expenses.length} expense${expenses.length !== 1 ? 's' : ''} (${formatINR(totalGeneral)}, staff advances included) and then clears them from this page so new ones can be recorded. Nothing is deleted: Reports and the dashboard keep counting them, and the report can be downloaded again from Closed months.`}
        confirmLabel={closing ? 'Closing…' : 'Download & Close Month'}
        onConfirm={handleCloseMonth}
        onCancel={() => !closing && setConfirmCloseOpen(false)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title="Delete this expense?"
        message={
          deleteTarget
            ? `${formatINR(deleteTarget.amount)} — ${deleteTarget.description} (${deleteTarget.date}) will be permanently removed and will no longer count in Reports or totals.${
                deleteAdvanceOwner
                  ? ` This is an advance given to ${deleteAdvanceOwner}, so it will also be removed from their advances and their salary-to-pay will go back up.`
                  : ''
              } This can't be undone.`
            : ''
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete expense'}
        onConfirm={handleDeleteExpense}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
      <ExpenseModal />
      <WorkerModal />
      <WorkerDetailModal worker={selectedWorker} onClose={() => setSelectedWorkerId(null)} />
    </>
  );
}