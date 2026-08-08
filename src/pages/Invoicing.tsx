import { useState, useMemo } from 'react';
import Topbar from '../components/Topbar';
import StatusBadge from '../components/StatusBadge';
import PaymentModal from '../components/PaymentModal';
import CopyReminderButton from '../components/CopyReminderButton';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import type { InvoiceStatus } from '../types';

const STATUS_FILTERS: Array<{ key: InvoiceStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In Progress' },
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
    convertQuotationToInvoice,
    openEditQuotationModal,
    markJobCompleted,
    openPaymentModal,
  } = useApp();
  const [tab, setTab] = useState<'invoices' | 'quotations'>('invoices');
  const [filter, setFilter] = useState<InvoiceStatus | 'all'>('all');

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? '—';

  const filteredInvoices = useMemo(
    () => (filter === 'all' ? invoices : invoices.filter((i) => i.status === filter)),
    [invoices, filter]
  );

  const sortedQuotations = useMemo(
    () => [...quotations].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [quotations]
  );

  return (
    <>
      <Topbar title="Invoicing" subtitle="Quick sales, job-order invoices, and quotations — in one place" />
      <div className="view-body">
        <div className="chip-row">
          <button className={`chip${tab === 'invoices' ? ' is-active' : ''}`} onClick={() => setTab('invoices')}>
            Invoices
          </button>
          <button className={`chip${tab === 'quotations' ? ' is-active' : ''}`} onClick={() => setTab('quotations')}>
            Quotations
          </button>
        </div>

        {tab === 'invoices' && (
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
                  {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}
                </h3>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Due / Status</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((i) => (
                    <tr key={i.id}>
                      <td>{i.id}</td>
                      <td>{customerName(i.customerId)}</td>
                      <td className="row-sub">
                        {i.kind === 'job' ? 'Job order' : 'Quick sale'}
                        {i.items.length > 1 && <div className="row-sub">{i.items.length} items</div>}
                      </td>
                      <td className="row-sub">{i.description}</td>
                      <td className="num">
                        {formatINR(i.amount + i.gst + i.transportation)}
                        {i.gst > 0 && (
                          <div className="row-sub">
                            CGST {formatINR(i.gst / 2)} + SGST {formatINR(i.gst / 2)}
                          </div>
                        )}
                        {i.transportation > 0 && <div className="row-sub">+ Transport {formatINR(i.transportation)}</div>}
                        {i.paidAmount > 0 && i.status !== 'paid' && (
                          <div className="row-sub">Paid {formatINR(i.paidAmount)} · Bal {formatINR(i.balance)}</div>
                        )}
                      </td>
                      <td className="row-sub">{i.dueDate ?? '—'}</td>
                      <td>
                        <StatusBadge status={i.status} />
                      </td>
                      <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-small" onClick={() => openPrint('invoice', i.id)}>
                          Print
                        </button>
                        {i.status === 'in_progress' && (
                          <button
                            className="btn btn-primary btn-small desktop-only"
                            onClick={() => markJobCompleted(i.dbId)}
                          >
                            Mark Completed
                          </button>
                        )}
                        {i.status !== 'in_progress' && i.status !== 'paid' && (
                          <button
                            className="btn btn-ghost btn-small desktop-only"
                            onClick={() => openPaymentModal(i.dbId)}
                          >
                            Record Payment
                          </button>
                        )}
                        {(i.status === 'due' || i.status === 'overdue' || i.status === 'partial') && (
                          <CopyReminderButton invoice={i} customerName={customerName(i.customerId)} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'quotations' && (
          <div className="panel">
            <div className="panel-head">
              <h3>
                {sortedQuotations.length} quotation{sortedQuotations.length !== 1 ? 's' : ''}
              </h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Quotation</th>
                  <th>Customer</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Valid until</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedQuotations.map((q) => (
                  <tr key={q.id}>
                    <td>{q.id}</td>
                    <td>{customerName(q.customerId)}</td>
                    <td className="row-sub">{q.description}</td>
                    <td className="num">
                      {formatINR(q.amount + q.gst)}
                      {q.gst > 0 && <div className="row-sub">incl. {formatINR(q.gst)} GST</div>}
                    </td>
                    <td className="row-sub">{q.validUntil}</td>
                    <td>
                      <span className={`badge ${q.status === 'pending' ? 'due' : q.status === 'converted' ? 'paid' : 'overdue'}`}>
                        {q.status === 'pending' ? 'Pending' : q.status === 'converted' ? 'Converted' : 'Expired'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-small" onClick={() => openPrint('quotation', q.id)}>
                        Print
                      </button>
                      {q.status === 'pending' && (
                        <>
                          <button
                            className="btn btn-ghost btn-small desktop-only"
                            onClick={() => openEditQuotationModal(q.dbId)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-primary btn-small desktop-only"
                            onClick={() => convertQuotationToInvoice(q.dbId)}
                          >
                            Convert
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {sortedQuotations.length === 0 && (
                  <tr>
                    <td className="row-sub">No quotations yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <PaymentModal />
    </>
  );
}