import { useApp } from '../context/AppContext';

interface TopbarProps {
  title: string;
  subtitle: string;
  // Only Dashboard and Invoicing pass this — every other page was
  // inheriting these two buttons for free just by rendering Topbar at all,
  // which made "New Quotation"/"+ New Invoice" show up on Vendors,
  // Expenses, Purchase Bills, etc. where they don't belong.
  showInvoiceActions?: boolean;
}

export default function Topbar({ title, subtitle, showInvoiceActions = false }: TopbarProps) {
  const { openInvoiceModal, openQuotationModal } = useApp();

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {showInvoiceActions && (
        <div className="topbar-actions desktop-only">
          <button className="btn btn-ghost" onClick={() => openQuotationModal()}>
            New Quotation
          </button>
          <button className="btn btn-primary" onClick={() => openInvoiceModal()}>
            + New Invoice
          </button>
        </div>
      )}
    </header>
  );
}