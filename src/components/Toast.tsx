import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

// One app-wide toast, driven by AppContext.showToast(). Failed writes
// report here instead of vanishing silently.
export default function ToastHost() {
  const { toast, dismissToast } = useApp();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, toast.kind === 'error' ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.kind}`} role="alert">
      <span>{toast.message}</span>
      <button className="toast-close" onClick={dismissToast} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}