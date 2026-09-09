import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Topbar from '../components/Topbar';
import StatusBadge from '../components/StatusBadge';
import PaymentModal from '../components/PaymentModal';
import CopyReminderButton from '../components/CopyReminderButton';
import ConfirmDialog from '../components/ConfirmDialog';
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
  const [deleteQuotationTarget, setDeleteQuotationTarget] = useState<Quotation | null>(null);
  const [search, setSearch] = useState('');
  // URL-driven (not local state) so the tab survives navigation from
  // elsewhere (e.g. Customers' "New Bill" or the print preview overlay).
  const [searchParams, setSearchParams] = useSearchParams();
  // Quotations is the default tab now — it's where all the live work
  // (payments, due/overdue, convert) actually happens. Invoices is just a
  // read-only archive of already-settled bills.
  const tab: 'invoices' | 'quotations' = searchParams.get('tab') === 'invoices' ? 'invoices' : 'quotations';
  const setTab = (t: 'invoices' | 'quotations') => setSearchParams(t === 'quotations' ? {} : { tab: t });
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

  const sortedInvoices = useMemo(
    () =>
      [...invoices]
        .filter((i) => matchesSearch(i.id, i.customerId, i.description))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, query, customers]
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div className="chip-row" style={{ marginBottom: 0 }}>
            <button className={`chip${tab === 'quotations' ? ' is-active' : ''}`} onClick={() => setTab('quotations')}>
              Quotations
            </button>
            <button className={`chip${tab === 'invoices' ? ' is-active' : ''}`} onClick={() => setTab('invoices')}>
              Invoices (settled)
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
              <table>
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
                      <td>{q.id}</td>
                      <td>{customerName(q.customerId)}</td>
                      <td className="row-sub">{q.description}</td>
                      <td className="num">
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
                      <td>
                        <StatusBadge status={q.effectiveStatus} showPartial={q.paidAmount > 0 && q.balanceAmount > 0} />
                      </td>
                      <td>
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
                            onClick={() => convertQuotationToInvoice(q.dbId)}
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
          </>
        )}

        {tab === 'invoices' && (
          <div className="panel">
            <div className="panel-head">
              <h3>
                {sortedInvoices.length} invoice{sortedInvoices.length !== 1 ? 's' : ''}
              </h3>
            </div>
            <table>
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
                    <td className="row-sub">{query ? `No invoices match “${search}”.` : 'No invoices yet — a quotation becomes one once it\'s fully paid.'}</td>
                  </tr>
                )}
                {sortedInvoices.map((i) => (
                  <tr key={i.id}>
                    <td>{i.id}</td>
                    <td>{customerName(i.customerId)}</td>
                    <td className="row-sub">
                      {i.description}
                      {i.items.length > 1 && <div className="row-sub">{i.items.length} items</div>}
                    </td>
                    <td className="num">
                      {formatINR(i.amount - i.discountAmount + i.gst + i.transportation)}
                      {i.gst > 0 && (
                        <div className="row-sub">
                          CGST {formatINR(i.gst / 2)} + SGST {formatINR(i.gst / 2)}
                        </div>
                      )}
                      {i.transportation > 0 && <div className="row-sub">+ Transport {formatINR(i.transportation)}</div>}
                    </td>
                    <td className="row-sub">{i.date}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-small" onClick={() => openPrint('invoice', i.id)}>
                        Print
                      </button>
                      {i.sourceQuotationId && (
                        <button className="btn btn-ghost btn-small desktop-only" onClick={() => setRollbackTarget(i)}>
                          Roll back to Quotation
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          if (rollbackTarget) await rollbackInvoiceToQuotation(rollbackTarget.dbId);
          setRollbackTarget(null);
        }}
        onCancel={() => setRollbackTarget(null)}
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