// Generic in-app confirmation dialog — replaces the browser's native
// window.confirm(), which looks jarring and inconsistent (see the Price
// List delete flow this was built for). Reusable anywhere a destructive
// or otherwise consequential action needs a yes/no gate.
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // styles the confirm button red — use for destructive actions (delete, etc.)
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay is-open" onClick={onCancel}>
      <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onCancel}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, color: 'var(--text)', fontSize: 13, lineHeight: 1.5 }}>{message}</p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}