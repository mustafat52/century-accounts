import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Topbar from '../components/Topbar';
import StatusBadge from '../components/StatusBadge';
import PaymentModal from '../components/PaymentModal';
import CopyReminderButton from '../components/CopyReminderButton';
import ConfirmDialog from '../components/ConfirmDialog';
import ConvertConfirmDialog from '../components/ConvertConfirmDialog';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import type { Invoice, QuotationEffectiveStatus, Quotation } from '../types';

// 'partial' isn't a real effectiveStatus value (see types.ts) — it's a
// filter layered on top, matching any quotation with 0 < paidAmount <
// grandTotal regardless of whether it's also due or overdue.
type QuotationFilter = QuotationEffectiveStatus | 'partial' | 'all';

const STATUS_FILTERS: Array<{ key: QuotationFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'due', label: 'Due' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'partial', label: 'Partial' },
  { key: 'paid', label: 'Paid' },
];

type InvoiceFilter = 'all' | 'outstanding';

const INVOICE_FILTERS: Array<{ key: InvoiceFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'outstanding', label: 'Balance due' },
];

export default function Invoicing() {
  const {
    invoices,
    quotations,
    customers,
    openPrint,
    openEditQuotationModal,
    convertQuotationToInvoice,
    openPaymentModal,
    rollbackInvoiceToQuotation,
    deleteQuotation,
  } = useApp();
  const [rollbackTarget, setRollbackTarget] = useState<Invoice | null>(null);
  const [rollbackError, setRollbackError] = useState('');
  const [deleteQuotationTarget, setDeleteQuotationTarget] = useState<Quotation | null>(null);
  const [convertTarget, setConvertTarget] = useState<Quotation | null>(null);
  const [search, setSearch] = useState('');
  // URL-driven (not local state) so the tab survives navigation from
  // elsewhere (e.g. Customers' "New Bill" or the print preview overlay).
  const [searchParams, setSearchParams] = useSearchParams();
  // Quotations is the default tab now — it's where all the live work
  // (payments, due/overdue, convert) actually happens. Invoices is just a
  // read-only archive of invoiced bills — any balance still owed on them
  // is collected here too (it posts to the source quotation's ledger).
  const tab: 'invoices' | 'quotations' = searchParams.get('tab') === 'invoices' ? 'invoices' : 'quotations';
  const setTab = (t: 'invoices' | 'quotations') => setSearchParams(t === 'quotations' ? {} : { tab: t });
  const invFilter: InvoiceFilter = searchParams.get('inv') === 'outstanding' ? 'outstanding' : 'all';
  const setInvFilter = (f: InvoiceFilter) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'invoices');
    if (f === 'all') next.delete('inv');
    else next.set('inv', f);
    setSearchParams(next);
  };
  const filter = (searchParams.get('status') as QuotationFilter) || 'all';
  const setFilter = (f: QuotationFilter) => {
    const next = new URLSearchParams(searchParams);
    if (f === 'all') next.delete('status');
    else next.set('status', f);
    setSearchParams(next);
  };

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? '—';

  const query = search.trim().toLowerCase();

  // Search matches the invoice/quotation number itself, its description,
  // or — the main use case — the customer's name, so typing a customer
  // pulls up every invoice/quotation for them regardless of which tab or
  // status filter is currently active.
  const matchesSearch = (id: string, custId: string, description: string) =>
    !query ||
    id.toLowerCase().includes(query) ||
    customerName(custId).toLowerCase().includes(query) ||
    description.toLowerCase().includes(query);

  // Payments live on the SOURCE quotation (quotation_payments), so every
  // invoice resolves its payment state through this lookup, and every
  // converted quotation resolves its invoice number through the other.
  const quotationByDbId = useMemo(() => new Map(quotations.map((q) => [q.dbId, q])), [quotations]);
  const invoiceByDbId = useMemo(() => new Map(invoices.map((i) => [i.dbId, i])), [invoices]);

  const sortedInvoices = useMemo(
    () =>
      [...invoices]
        .filter((i) => {
          const src = i.sourceQuotationId ? quotationByDbId.get(i.sourceQuotationId) : undefined;
          if (invFilter === 'outstanding' && !(src && src.balanceAmount > 0)) return false;
          // Also match the source quotation's number, so either number
          // finds the bill.
          return matchesSearch(i.id, i.customerId, i.description) || (!!query && !!src && src.id.toLowerCase().includes(query));
        })
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, quotationByDbId, invFilter, query, customers]
  );

  const filteredQuotations = useMemo(
    () =>
      [...quotations]
        .filter((q) => {
          if (filter === 'all') return true;
          if (filter === 'partial') return q.paidAmount > 0 && q.balanceAmount > 0;
          return q.effectiveStatus === filter;
        })
        .filter((q) => matchesSearch(q.id, q.customerId, q.description))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quotations, filter, query, customers]
  );

  return (
    <>
      <Topbar title="Invoicing" subtitle="Quotations carry every job from creation to full payment" showInvoiceActions />
      <div className="view-body">
        {rollbackError && (
          <div
            style={{
              color: 'var(--danger)',
              fontSize: 13,
              marginBottom: 14,
              padding: '10px 12px',
              background: 'var(--danger-dim)',
              borderRadius: 8,
            }}
          >
            Roll back failed: {rollbackError}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div className="chip-row" style={{ marginBottom: 0 }}>
            <button className={`chip${tab === 'quotations' ? ' is-active' : ''}`} onClick={() => setTab('quotations')}>
              Quotations
            </button>
            <button className={`chip${tab === 'invoices' ? ' is-active' : ''}`} onClick={() => setTab('invoices')}>
              Invoices
            </button>
          </div>
          <input
            type="text"
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, number or description…"
          />
        </div>

        {tab === 'quotations' && (
          <>
            <div className="chip-row">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`chip${filter === f.key ? ' is-active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>
                  {filteredQuotations.length} quotation{filteredQuotations.length !== 1 ? 's' : ''}
                </h3>
              </div>
              <div className="table-scroll">
                <table className="table-cards">
                <thead>
                  <tr>
                    <th>Quotation</th>
                    <th>Customer</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotations.length === 0 && (
                    <tr>
                      <td className="row-sub">{query ? `No quotations match “${search}”.` : 'No quotations yet.'}</td>
                    </tr>
                  )}
                  {filteredQuotations.map((q) => (
                    <tr key={q.id}>
                      <td className="card-tag">
                        {q.id}
                        {q.convertedInvoiceId && invoiceByDbId.get(q.convertedInvoiceId) && (
                          <div className="row-sub">Invoiced as {invoiceByDbId.get(q.convertedInvoiceId)!.id}</div>
                        )}
                      </td>
                      <td className="card-tag-muted">{customerName(q.customerId)}</td>
                      <td className="num card-amount">
                        {formatINR(q.grandTotal)}
                        {q.discountAmount > 0 && (
                          <div className="row-sub">
                            Slab {q.slab} · −{formatINR(q.discountAmount)}
                          </div>
                        )}
                        {q.gst > 0 && <div className="row-sub">incl. {formatINR(q.gst)} GST</div>}
                        {q.transportation > 0 && <div className="row-sub">+ Transport {formatINR(q.transportation)}</div>}
                        {q.paidAmount > 0 && q.balanceAmount > 0 && (
                          <div className="row-sub">Paid {formatINR(q.paidAmount)} · Bal {formatINR(q.balanceAmount)}</div>
                        )}
                      </td>
                      <td className="row-sub card-line">{q.description}</td>
                      <td className="card-badge-right">
                        <StatusBadge status={q.effectiveStatus} showPartial={q.paidAmount > 0 && q.balanceAmount > 0} />
                      </td>
                      <td className="card-actions">
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-small" onClick={() => openPrint('quotation', q.id)}>
                          Quotation
                        </button>
                        <button className="btn btn-ghost btn-small" onClick={() => openPrint('ledger', q.id)}>
                          Ledger
                        </button>
                        {q.status === 'pending' && (
                          <button
                            className="btn btn-ghost btn-small desktop-only"
                            onClick={() => openEditQuotationModal(q.dbId)}
                          >
                            Edit
                          </button>
                        )}
                        {q.balanceAmount > 0 && (
                          <button className="btn btn-ghost btn-small desktop-only" onClick={() => openPaymentModal(q.dbId)}>
                            Record Payment
                          </button>
                        )}
                        {q.status === 'pending' && (
                          <button
                            className="btn btn-primary btn-small desktop-only"
                            onClick={() => setConvertTarget(q)}
                          >
                            Convert to Invoice
                          </button>
                        )}
                        {(q.effectiveStatus === 'due' || q.effectiveStatus === 'overdue') && (
                          <CopyReminderButton quotation={q} customerName={customerName(q.customerId)} />
                        )}
                        {q.status === 'pending' && q.paidAmount === 0 && (
                          <button className="btn btn-ghost btn-small desktop-only" onClick={() => setDeleteQuotationTarget(q)}>
                            Delete
                          </button>
                        )}
                      </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          </>
        )}

        {tab === 'invoices' && (
          <>
          <div className="chip-row">
            {INVOICE_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`chip${invFilter === f.key ? ' is-active' : ''}`}
                onClick={() => setInvFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="panel">
            <div className="panel-head">
              <h3>
                {sortedInvoices.length} invoice{sortedInvoices.length !== 1 ? 's' : ''}
              </h3>
            </div>
            <div className="table-scroll">
              <table className="table-cards">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedInvoices.length === 0 && (
                  <tr>
                    <td className="row-sub">{query ? `No invoices match “${search}”.` : 'No invoices yet — a quotation becomes one when you convert it.'}</td>
                  </tr>
                )}
                {sortedInvoices.map((i) => {
                  const src = i.sourceQuotationId ? quotationByDbId.get(i.sourceQuotationId) : undefined;
                  const hasBalance = !!src && src.balanceAmount > 0;
                  return (
                  <tr key={i.id}>
                    <td className="card-tag">
                      {i.id}
                      {src && <div className="row-sub">From {src.id}</div>}
                    </td>
                    <td className="card-tag-muted">{customerName(i.customerId)}</td>
                    <td className="num card-amount">
                      {formatINR(i.amount - i.discountAmount + i.gst + i.transportation)}
                      {i.gst > 0 && (
                        <div className="row-sub">
                          CGST {formatINR(i.gst / 2)} + SGST {formatINR(i.gst / 2)}
                        </div>
                      )}
                      {i.transportation > 0 && <div className="row-sub">+ Transport {formatINR(i.transportation)}</div>}
                      {src && (
                        <div style={{ marginTop: 4 }}>
                          <span className={`badge ${hasBalance ? 'due' : 'paid'}`}>
                            {hasBalance ? (src.paidAmount > 0 ? 'Balance due · Partial' : 'Balance due') : 'Paid'}
                          </span>
                          <div className="row-sub">
                            Paid {formatINR(src.paidAmount)}
                            {hasBalance && ` · Bal ${formatINR(src.balanceAmount)}`}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="row-sub card-line">
                      {i.description}
                      {i.items.length > 1 && <div className="row-sub">{i.items.length} items</div>}
                    </td>
                    <td className="row-sub card-meta">
                      <span className="mobile-label">Date</span>
                      {i.date}
                    </td>
                    <td className="card-actions">
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-small" onClick={() => openPrint('invoice', i.id)}>
                        Print
                      </button>
                      {src && (
                        <button className="btn btn-ghost btn-small" onClick={() => openPrint('ledger', src.id)}>
                          Ledger
                        </button>
                      )}
                      {src && hasBalance && (
                        <button className="btn btn-primary btn-small desktop-only" onClick={() => openPaymentModal(src.dbId)}>
                          Record Payment
                        </button>
                      )}
                      {i.sourceQuotationId && (
                        <button className="btn btn-ghost btn-small desktop-only" onClick={() => setRollbackTarget(i)}>
                          Roll back to Quotation
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
          </>
        )}
      </div>
      <PaymentModal />
      <ConfirmDialog
        open={rollbackTarget !== null}
        title="Roll back to quotation?"
        message={`This deletes ${rollbackTarget?.id} completely and reopens its source quotation as pending — its payment history stays exactly as it is, so nothing recorded is lost. Use this only to fix a mistake found after settlement.`}
        confirmLabel="Roll back"
        danger
        onConfirm={async () => {
          if (!rollbackTarget) return;
          const err = await rollbackInvoiceToQuotation(rollbackTarget.dbId);
          if (err) {
            // Leave the dialog target as-is context aside — close it and
            // show the real reason on the page instead of pretending it
            // worked. This is exactly the case that used to fail with
            // zero feedback.
            setRollbackTarget(null);
            setRollbackError(err);
            return;
          }
          setRollbackTarget(null);
          setRollbackError('');
          setTab('quotations');
          setFilter('all');
        }}
        onCancel={() => setRollbackTarget(null)}
      />
      <ConvertConfirmDialog
        quotation={convertTarget}
        onCancel={() => setConvertTarget(null)}
        onConfirm={async () => {
          const target = convertTarget;
          setConvertTarget(null);
          // Failure is toasted by the context, so nothing is silent anymore.
          if (target) await convertQuotationToInvoice(target.dbId);
        }}
      />
      <ConfirmDialog
        open={deleteQuotationTarget !== null}
        title="Delete quotation?"
        message={`Delete ${deleteQuotationTarget?.id}? This can't be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (deleteQuotationTarget) await deleteQuotation(deleteQuotationTarget.dbId);
          setDeleteQuotationTarget(null);
        }}
        onCancel={() => setDeleteQuotationTarget(null)}
      />
    </>
  );
}