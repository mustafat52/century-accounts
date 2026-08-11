import { useState } from 'react';
import Topbar from '../components/Topbar';
import VendorModal from '../components/VendorModal';
import VendorPurchaseModal from '../components/VendorPurchaseModal';
import VendorPaymentModal from '../components/VendorPaymentModal';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import type { VendorPurchase } from '../types';

export default function Vendors() {
  const { vendors, vendorPurchases, openVendorModal } = useApp();
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [purchaseModalVendorId, setPurchaseModalVendorId] = useState<string | null>(null);
  const [paymentModalPurchase, setPaymentModalPurchase] = useState<VendorPurchase | null>(null);

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);
  const history = selectedVendorId
    ? vendorPurchases.filter((p) => p.vendorId === selectedVendorId).sort((a, b) => (a.date < b.date ? 1 : -1))
    : [];

  if (selectedVendor) {
    return (
      <>
        <Topbar
          title={selectedVendor.name}
          subtitle={`${selectedVendor.category} · ${selectedVendor.contact}`}
        />
        <div className="view-body">
          <button className="btn btn-ghost btn-small" style={{ marginBottom: 16 }} onClick={() => setSelectedVendorId(null)}>
            ← All vendors
          </button>

          <div className="stat-grid" style={{ marginBottom: 24 }}>
            <div className="facet-card">
              <div className="stat-label">Total purchased</div>
              <div className="stat-value">{formatINR(selectedVendor.totalPurchased)}</div>
            </div>
            <div className="facet-card">
              <div className="stat-label">Payable</div>
              <div className="stat-value">{selectedVendor.payable > 0 ? formatINR(selectedVendor.payable) : 'Settled'}</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Purchase history</h3>
              <button className="btn btn-primary btn-small desktop-only" onClick={() => setPurchaseModalVendorId(selectedVendor.id)}>
                + Record Purchase
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id}>
                    <td className="row-sub">{p.date}</td>
                    <td>{p.description}</td>
                    <td className="row-sub">{p.category}</td>
                    <td className="num">
                      {formatINR(p.amount)}
                      {p.paidAmount > 0 && p.paymentStatus !== 'paid' && (
                        <div className="row-sub">Paid {formatINR(p.paidAmount)} · Bal {formatINR(p.balance)}</div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${p.paymentStatus === 'paid' ? 'paid' : p.paymentStatus === 'partial' ? 'partial' : 'due'}`}>
                        {p.paymentStatus === 'paid' ? 'Paid' : p.paymentStatus === 'partial' ? 'Partial' : 'Unpaid'}
                      </span>
                    </td>
                    <td>
                      {p.paymentStatus !== 'paid' && (
                        <button className="btn btn-ghost btn-small desktop-only" onClick={() => setPaymentModalPurchase(p)}>
                          Record Payment
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td className="row-sub">No purchases logged yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <VendorPurchaseModal vendorId={purchaseModalVendorId} onClose={() => setPurchaseModalVendorId(null)} />
        <VendorPaymentModal purchase={paymentModalPurchase} onClose={() => setPaymentModalPurchase(null)} />
      </>
    );
  }

  return (
    <>
      <Topbar title="Vendors" subtitle="Raw material and service suppliers, purchases and payables" />
      <div className="view-body">
        <div className="panel">
          <div className="panel-head">
            <h3>{vendors.length} vendors</h3>
            <button className="btn btn-ghost btn-small desktop-only" onClick={openVendorModal}>
              + New Vendor
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Category</th>
                <th>Total purchased</th>
                <th>Payable</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} onClick={() => setSelectedVendorId(v.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <div className="row-name">{v.name}</div>
                    <div className="row-sub">{v.contact}</div>
                  </td>
                  <td className="row-sub">{v.category}</td>
                  <td className="num">{formatINR(v.totalPurchased)}</td>
                  <td className="num" style={{ color: v.payable > 0 ? 'var(--warning)' : 'var(--success)' }}>
                    {v.payable > 0 ? formatINR(v.payable) : 'Settled'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <VendorModal />
      <VendorPurchaseModal vendorId={purchaseModalVendorId} onClose={() => setPurchaseModalVendorId(null)} />
      <VendorPaymentModal purchase={paymentModalPurchase} onClose={() => setPaymentModalPurchase(null)} />
    </>
  );
}