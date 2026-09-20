import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import logoDark from '../assets/logo-dark.png';

const WELCOME_DURATION_MS = 2200;

type AppMode = 'accounts' | 'inventory';

export default function Login() {
  const { login, accessDeniedMessage, clearAccessDeniedMessage } = useApp();
  const navigate = useNavigate();

  const [mode, setMode] = useState<AppMode>('accounts');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);

  // Landing here right after being force-signed-out mid-session because
  // an owner switched this login off (see AppContext's periodic check) —
  // show that as the reason rather than a silent redirect to a blank
  // login form.
  useEffect(() => {
    if (accessDeniedMessage) {
      setError(accessDeniedMessage);
      clearAccessDeniedMessage();
    }
  }, [accessDeniedMessage, clearAccessDeniedMessage]);

  useEffect(() => {
    if (!welcomeName) return;
    const timer = setTimeout(() => {
      // The toggle only decides where this same authenticated session
      // lands — Inventory shares the same login, just a different shell.
      navigate(mode === 'inventory' ? '/inventory/stock' : '/', { replace: true });
    }, WELCOME_DURATION_MS);
    return () => clearTimeout(timer);
  }, [welcomeName, navigate, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if ('name' in result) {
      setError('');
      setWelcomeName(result.name);
    } else {
      setError(result.error);
    }
  };

  if (welcomeName) {
    return (
      <div className="welcome-overlay">
        <img src={logoDark} alt="Century Glass Art" className="welcome-mark" style={{ width: 200, height: 'auto' }} />
        <div className="welcome-label">Welcome back</div>
        <div className="welcome-name">{welcomeName}</div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 20,
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="panel"
        style={{ width: 380, maxWidth: '100%', padding: '32px 32px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
          <img src={logoDark} alt="Century Glass Art" style={{ width: 220, height: 'auto' }} />
        </div>

        <div className="chip-row" role="tablist" aria-label="Choose which app to sign into" style={{ marginBottom: 0 }}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'accounts'}
            className={`chip${mode === 'accounts' ? ' is-active' : ''}`}
            style={{ flex: 1, textAlign: 'center' }}
            onClick={() => setMode('accounts')}
          >
            Accounts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'inventory'}
            className={`chip${mode === 'inventory' ? ' is-active' : ''}`}
            style={{ flex: 1, textAlign: 'center' }}
            onClick={() => setMode('inventory')}
          >
            Inventory
          </button>
        </div>

        <div className="form-field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@accounts.com"
            autoFocus
          />
        </div>
        <div className="form-field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

        <button type="submit" className="btn btn-primary" style={{ marginTop: 4 }} disabled={submitting}>
          {submitting ? 'Signing in…' : `Sign in to ${mode === 'inventory' ? 'Inventory' : 'Accounts'}`}
        </button>
      </form>
    </div>
  );
}