import { useApp } from '../context/AppContext';

interface TopbarProps {
  title: string;
  subtitle: string;
  // Only Dashboard and Invoicing pass this — every other page was
  // inheriting this button for free just by rendering Topbar at all,
  // which made "New Quotation" show up on Vendors, Expenses, Purchase
  // Bills, etc. where it doesn't belong.
  showInvoiceActions?: boolean;
}

// "New Invoice" is gone for good — invoices are never created directly
// anymore, only via converting a fully-paid quotation (see Invoicing.tsx).
export default function Topbar({ title, subtitle, showInvoiceActions = false }: TopbarProps) {
  const { openQuotationModal } = useApp();

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {showInvoiceActions && (
        <div className="topbar-actions desktop-only">
          <button className="btn btn-primary" onClick={() => openQuotationModal()}>
            + New Quotation
          </button>
        </div>
      )}
    </header>
  );
}
