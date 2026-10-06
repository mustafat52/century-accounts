import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { capitalizeFirst } from '../utils/format';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Password is a plain text input on purpose, not type="password" — the
// owner is setting a login for someone else and needs to actually read
// back what they typed so they can pass it on (verbally, by chat, etc.),
// not confirm-type it blind the way you would for your own account.
export default function EmployeeModal({ isOpen, onClose }: EmployeeModalProps) {
  const { createEmployee } = useApp();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const reset = () => {
    setDisplayName('');
    setEmail('');
    setPassword('');
    setError('');
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const canSave = displayName.trim() !== '' && email.trim() !== '' && password.length >= 6 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    const err = await createEmployee({
      displayName: displayName.trim(),
      email: email.trim(),
      password,
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    reset();
    onClose();
  };

  return (
    <div className="modal-overlay is-open">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>New Employee Login</h3>
          <button className="modal-close" onClick={handleClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.5 }}>
            Creates a real login this person can sign in with right away, with full access. Switch it off
            from the list any time without deleting them — deleting is permanent.
          </p>

          <div className="form-row">
            <div className="form-field">
              <label>Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(capitalizeFirst(e.target.value))}
                placeholder="e.g. Taqi Bhai"
                autoFocus
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@accounts.com"
              />
            </div>
            <div className="form-field">
              <label>Password</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
          </div>

          {error && (
            <p style={{ margin: '10px 0 0', color: 'var(--danger)', fontSize: 12.5 }}>{error}</p>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
            {saving ? 'Creating…' : 'Create login'}
          </button>
        </div>
      </div>
    </div>
  );
}