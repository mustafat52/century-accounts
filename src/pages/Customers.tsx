import { useState, useEffect, useRef } from 'react';
import Topbar from '../components/Topbar';
import StatusBadge from '../components/StatusBadge';
import CustomerModal from '../components/CustomerModal';
import CopyReminderButton from '../components/CopyReminderButton';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import { exportCustomerLedger, exportAllCustomersLedger } from '../utils/exportLedger';

export default function Customers() {
  const { customers, invoices, openInvoiceModal, openCustomerModal, openPrint } = useApp();
  const [selectedId, setSelectedId] = useState(customers[0]?.id ?? '');
  const prevCount = useRef(customers.length);

  // Auto-select a newly added customer (they're unshifted to the front of the list)
  useEffect(() => {
    if (customers.length > prevCount.current) {
      setSelectedId(customers[0]?.id ?? '');
    }
    prevCount.current = customers.length;
  }, [customers]);

  const selected = customers.find((c) => c.id === selectedId);
  const history = invoices
    .filter((i) => i.customerId === selectedId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <Topbar title="Customers" subtitle="Profiles, billing history, and outstanding dues" />
      <div className="view-body">
        <div className="two-col">
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
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    style={{ cursor: 'pointer', background: c.id === selectedId ? 'var(--surface-2)' : undefined }}
                  >
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

          <div className="panel">
            <div className="panel-head">
              <h3>{selected?.name ?? 'Select a customer'}</h3>
              {selected && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-small" onClick={() => exportCustomerLedger(selected, invoices)}>
                    Export (Excel)
                  </button>
                  <button className="btn btn-ghost btn-small desktop-only" onClick={() => openInvoiceModal(selected.id)}>
                    + New Bill
                  </button>
                </div>
              )}
            </div>
            <div style={{ padding: '16px 20px' }}>
              {selected?.gstin && (
                <p className="row-sub" style={{ marginTop: 0 }}>
                  GSTIN: {selected.gstin}
                </p>
              )}
              <p className="row-sub">{selected?.contact}</p>
              {selected?.address && <p className="row-sub">{selected.address}</p>}
              {selected && (
                <p className="row-sub">
                  Total purchased: <span className="num">{formatINR(selected.totalBilled)}</span>
                  {'  ·  '}
                  Outstanding:{' '}
                  <span className="num" style={{ color: selected.outstanding > 0 ? 'var(--warning)' : 'var(--success)' }}>
                    {selected.outstanding > 0 ? formatINR(selected.outstanding) : 'Settled'}
                  </span>
                </p>
              )}
            </div>
            <div className="section-title" style={{ padding: '0 20px' }}>
              Full purchase history
            </div>
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
                      <div className="row-name">{i.id}</div>
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
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-small" onClick={() => openPrint('invoice', i.id)}>
                        Print
                      </button>
                      {(i.status === 'due' || i.status === 'overdue' || i.status === 'partial') && (
                        <CopyReminderButton invoice={i} customerName={selected?.name ?? 'Customer'} />
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
      </div>
      <CustomerModal />
    </>
  );
}