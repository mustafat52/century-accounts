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
  const { invoices, openInvoiceModal, openPrint, openPaymentModal } = useApp();

  if (!customer) return null;

  const history = invoices
    .filter((i) => i.customerId === customer.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="modal-overlay is-open" onClick={onClose}>
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
              Total purchased: <span className="num">{formatINR(customer.totalBilled)}</span>
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
                  <th>Invoice</th>
                  <th>What was purchased</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((i) => (
                  <tr key={i.id}>
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
                      <div className="row-sub">{i.kind === 'job' ? 'Job order' : 'Quick sale'}</div>
                    </td>
                    <td className="row-sub">{i.description}</td>
                    <td className="num">
                      {formatINR(i.amount - i.discountAmount + i.gst + i.transportation)}
                      {i.gst > 0 && <div className="row-sub">incl. {formatINR(i.gst)} GST</div>}
                      {i.transportation > 0 && <div className="row-sub">+ {formatINR(i.transportation)} transport</div>}
                    </td>
                    <td>
                      <StatusBadge status={i.status} />
                    </td>
                    <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-small" onClick={() => openPrint('invoice', i.id)}>
                        Print
                      </button>
                      {i.status !== 'in_progress' && i.status !== 'paid' && (
                        <button className="btn btn-ghost btn-small desktop-only" onClick={() => openPaymentModal(i.dbId)}>
                          Record Payment
                        </button>
                      )}
                      {(i.status === 'due' || i.status === 'overdue' || i.status === 'partial') && (
                        <CopyReminderButton invoice={i} customerName={customer.name} />
                      )}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td className="row-sub">No invoices yet.</td>
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
          <button className="btn btn-ghost" onClick={() => exportCustomerLedger(customer, invoices)}>
            Export (Excel)
          </button>
          <button className="btn btn-primary desktop-only" onClick={() => openInvoiceModal(customer.id)}>
            + New Bill
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Customers() {
  const { customers, invoices, openCustomerModal } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  return (
    <>
      <Topbar title="Customers" subtitle="Profiles, billing history, and outstanding dues" />
      <div className="view-body">
        <div className="panel">
          <div className="panel-head">
            <h3>{customers.length} customers</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-small" onClick={() => exportAllCustomersLedger(customers, invoices)}>
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
                <th>Total billed</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
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