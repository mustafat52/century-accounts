import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import ConfirmDialog from '../components/ConfirmDialog';
import EmployeeModal from '../components/EmployeeModal';
import { useApp } from '../context/AppContext';
import type { EmployeeProfile } from '../types';

// Owner-only — see migrations/002_employee_control.sql. A non-owner who
// somehow lands on /employees (typed URL, old bookmark, role changed
// under them) gets bounced straight back to the dashboard; the nav link
// itself is already hidden for them in Sidebar/MobileNav.
export default function EmployeeControl() {
  const { currentUserRole, currentUserId, employees, setEmployeeActive, deleteEmployee } = useApp();
  const [isAddOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeProfile | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (currentUserRole !== 'owner') return <Navigate to="/" replace />;

  const handleToggle = async (emp: EmployeeProfile) => {
    setBusyId(emp.id);
    setError('');
    const err = await setEmployeeActive(emp.id, !emp.isActive);
    setBusyId(null);
    if (err) setError(err);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const err = await deleteEmployee(deleteTarget.id);
    setBusyId(null);
    if (err) {
      setError(err);
    } else {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <Topbar title="Employee Control" subtitle="Add, remove, or temporarily switch off staff logins" />
      <div className="view-body">
        {error && (
          <p style={{ margin: '0 0 14px', color: 'var(--danger)', fontSize: 13 }}>{error}</p>
        )}

        <div className="panel">
          <div className="panel-head">
            <h3>
              {employees.length} login{employees.length !== 1 ? 's' : ''}
            </h3>
            <button className="btn btn-primary btn-small desktop-only" onClick={() => setAddOpen(true)}>
              + Add Employee
            </button>
          </div>

          <div className="table-scroll">
            <table className="table-cards">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Access</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const isSelf = emp.id === currentUserId;
                  const isOwnerRow = emp.role === 'owner';
                  return (
                    <tr key={emp.id}>
                      <td className="card-main">
                        <div className="row-name">
                          {emp.displayName}
                          {isSelf && <span className="row-sub"> (you)</span>}
                        </div>
                      </td>
                      <td className="card-meta">
                        <span className="mobile-label">Email</span>
                        {emp.email}
                      </td>
                      <td className="card-meta">
                        <span className="mobile-label">Role</span>
                        {isOwnerRow ? 'Owner' : 'Employee'}
                      </td>
                      <td className="card-badge-right">
                        {isOwnerRow ? (
                          <span className="badge paid">Always on</span>
                        ) : (
                          <label
                            className="switch"
                            title={emp.isActive ? 'Active — switch off to lock them out' : 'Switched off — they cannot sign in'}
                          >
                            <input
                              type="checkbox"
                              checked={emp.isActive}
                              disabled={busyId === emp.id}
                              onChange={() => handleToggle(emp)}
                            />
                            <span className="switch-track">
                              <span className="switch-thumb" />
                            </span>
                          </label>
                        )}
                      </td>
                      <td className="card-actions">
                        {!isOwnerRow && (
                          <button
                            className="btn btn-ghost btn-small desktop-only"
                            onClick={() => setDeleteTarget(emp)}
                            disabled={busyId === emp.id}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {employees.length === 0 && (
                  <tr>
                    <td className="row-sub" colSpan={5}>
                      Loading…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <EmployeeModal isOpen={isAddOpen} onClose={() => setAddOpen(false)} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this login?"
        message={
          deleteTarget
            ? `Permanently delete ${deleteTarget.displayName}'s login (${deleteTarget.email})? They won't be able to sign in again, and this can't be undone. To just pause their access instead, use the toggle rather than deleting.`
            : ''
        }
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}