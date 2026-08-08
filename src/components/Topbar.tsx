import { useApp } from '../context/AppContext';

interface TopbarProps {
  title: string;
  subtitle: string;
}

export default function Topbar({ title, subtitle }: TopbarProps) {
  const { openInvoiceModal, openQuotationModal } = useApp();

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="topbar-actions desktop-only">
        <button className="btn btn-ghost" onClick={() => openQuotationModal()}>
          New Quotation
        </button>
        <button className="btn btn-primary" onClick={() => openInvoiceModal()}>
          + New Invoice
        </button>
      </div>
    </header>
  );
}