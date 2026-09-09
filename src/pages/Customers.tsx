import { useState } from 'react';
import Topbar from '../components/Topbar';
import StatusBadge from '../components/StatusBadge';
import CustomerModal from '../components/CustomerModal';
import PaymentModal from '../components/PaymentModal';
import CopyReminderButton from '../components/CopyReminderButton';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import { exportCustomerLedger, exportAllCustomersLedger } from '../utils/exportLedger';
import type { Customer } from '../types';

function CustomerDetailModal({
  customer,
  onClose,
}: {
  customer: Customer | null;
  onClose: () => void;
}) {
  const { invoices, quotations, quotationPayments, openQuotationModal, openPrint, openPaymentModal, openEditCustomerModal } = useApp();

  if (!customer) return null;

  // A combined timeline: active quotations (the live bill, still being
  // paid down) and settled invoices (the terminal, paid-in-full record).
  // Every invoice already came from one of this customer's quotations, so
  // together this is the complete purchase history.
  const quotationRows = quotations
    .filter((q) => q.customerId === customer.id && q.status !== 'converted')
    .map((q) => ({ kind: 'quotation' as const, date: q.date, quotation: q }));
  const invoiceRows = invoices
    .filter((i) => i.customerId === customer.id)
    .map((i) => ({ kind: 'invoice' as const, date: i.date, invoice: i }));
  const history = [...quotationRows, ...invoiceRows].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="modal-overlay is-open">
      <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{customer.name}</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div>
            {customer.gstin && <p className="row-sub" style={{ marginTop: 0 }}>GSTIN: {customer.gstin}</p>}
            <p className="row-sub">{customer.contact}</p>
            {customer.address && <p className="row-sub">{customer.address}</p>}
            <p className="row-sub">
              Active quotations: <span className="num">{formatINR(customer.totalBilled)}</span>
              {'  ·  '}
              Outstanding:{' '}
              <span className="num" style={{ color: customer.outstanding > 0 ? 'var(--warning)' : 'var(--success)' }}>
                {customer.outstanding > 0 ? formatINR(customer.outstanding) : 'Settled'}
              </span>
            </p>
          </div>

          <div className="section-title" style={{ marginBottom: 0 }}>
            Full purchase history
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bill</th>
                  <th>What was purchased</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  if (row.kind === 'invoice') {
                    const i = row.invoice;
                    return (
                      <tr key={`inv-${i.id}`}>
                        <td className="row-sub">{i.date}</td>
                        <td>
                          <button
                            className="row-name"
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              color: 'var(--gold-bright)',
                              textDecoration: 'underline',
                              textUnderlineOffset: 2,
                            }}
                            onClick={() => openPrint('invoice', i.id)}
                            title="Open this invoice"
                          >
                            {i.id}
                          </button>
                        </td>
                        <td className="row-sub">{i.description}</td>
                        <td className="num">
                          {formatINR(i.amount - i.discountAmount + i.gst + i.transportation)}
                          {i.gst > 0 && <div className="row-sub">incl. {formatINR(i.gst)} GST</div>}
                          {i.transportation > 0 && <div className="row-sub">+ {formatINR(i.transportation)} transport</div>}
                        </td>
                        <td>
                          <StatusBadge status="converted" />
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-small" onClick={() => openPrint('invoice', i.id)}>
                            Print
                          </button>
                        </td>
                      </tr>
                    );
                  }
                  const q = row.quotation;
                  return (
                    <tr key={`quo-${q.id}`}>
                      <td className="row-sub">{q.date}</td>
                      <td>
                        <button
                          className="row-name"
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: 'var(--gold-bright)',
                            textDecoration: 'underline',
                            textUnderlineOffset: 2,
                          }}
                          onClick={() => openPrint('quotation', q.id)}
                          title="Open this quotation"
                        >
                          {q.id}
                        </button>
                      </td>
                      <td className="row-sub">{q.description}</td>
                      <td className="num">
                        {formatINR(q.grandTotal)}
                        {q.gst > 0 && <div className="row-sub">incl. {formatINR(q.gst)} GST</div>}
                        {q.transportation > 0 && <div className="row-sub">+ {formatINR(q.transportation)} transport</div>}
                        {q.paidAmount > 0 && q.effectiveStatus !== 'paid' && (
                          <div className="row-sub">{formatINR(q.paidAmount)} paid so far</div>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={q.effectiveStatus} showPartial={q.paidAmount > 0 && q.balanceAmount > 0} />
                      </td>
                      <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-small" onClick={() => openPrint('quotation', q.id)}>
                          Print
                        </button>
                        {q.balanceAmount > 0 && (
                          <button className="btn btn-ghost btn-small desktop-only" onClick={() => openPaymentModal(q.dbId)}>
                            Record Payment
                          </button>
                        )}
                        {(q.effectiveStatus === 'due' || q.effectiveStatus === 'overdue') && (
                          <CopyReminderButton quotation={q} customerName={customer.name} />
                        )}
                      </div>
                      </td>
                    </tr>
                  );
                })}
                {history.length === 0 && (
                  <tr>
                    <td className="row-sub">No bills yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-ghost desktop-only"
            onClick={() => {
              onClose();
              openEditCustomerModal(customer.id);
            }}
          >
            Edit
          </button>
          <button className="btn btn-ghost" onClick={() => exportCustomerLedger(customer, invoices, quotations, quotationPayments)}>
            Export (Excel)
          </button>
          <button className="btn btn-primary desktop-only" onClick={() => openQuotationModal(customer.id)}>
            + New Bill
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Customers() {
  const { customers, invoices, quotations, quotationPayments, openCustomerModal } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  const query = search.trim().toLowerCase();
  const filteredCustomers = query
    ? customers.filter(
        (c) => c.name.toLowerCase().includes(query) || (c.contact ?? '').toLowerCase().includes(query)
      )
    : customers;

  return (
    <>
      <Topbar title="Customers" subtitle="Profiles, billing history, and outstanding dues" />
      <div className="view-body">
        <div className="panel">
          <div className="panel-head">
            <h3>{customers.length} customers</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers…"
              />
              <button className="btn btn-ghost btn-small" onClick={() => exportAllCustomersLedger(customers, invoices, quotations, quotationPayments)}>
                Export All (Excel)
              </button>
              <button className="btn btn-ghost btn-small desktop-only" onClick={openCustomerModal}>
                + New Customer
              </button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Active quoted</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 && (
                <tr>
                  <td className="row-sub" colSpan={3}>
                    No customers match “{search}”.
                  </td>
                </tr>
              )}
              {filteredCustomers.map((c) => (
                <tr key={c.id} onClick={() => setSelectedId(c.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <div className="row-name">{c.name}</div>
                    <div className="row-sub">{c.contact}</div>
                  </td>
                  <td className="num">{formatINR(c.totalBilled)}</td>
                  <td className="num" style={{ color: c.outstanding > 0 ? 'var(--warning)' : 'var(--success)' }}>
                    {c.outstanding > 0 ? formatINR(c.outstanding) : 'Settled'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <CustomerDetailModal customer={selected} onClose={() => setSelectedId(null)} />
      <CustomerModal />
      <PaymentModal />
    </>
  );
}