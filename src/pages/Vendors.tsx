import { useMemo, useState } from 'react';
import Topbar from '../components/Topbar';
import VendorModal from '../components/VendorModal';
import VendorPurchaseModal from '../components/VendorPurchaseModal';
import VendorPaymentModal from '../components/VendorPaymentModal';
import VendorSlipModal from '../components/VendorSlipModal';
import PriceSlipModal from '../components/PriceSlipModal';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import type { VendorPurchase, VendorSlip } from '../types';

// A unified purchase-history row — either a priced purchase (quick entry OR
// a slip that's already been priced, in which case its DC No/Care Of are
// pulled back in for display) or a slip still waiting to be priced.
interface HistoryRow {
  key: string;
  date: string;
  dcNo: string | null;
  careOf: string | null;
  description: string;
  category: string | null;
  purchase: VendorPurchase | null;
  pendingSlip: VendorSlip | null;
}

export default function Vendors() {
  const { vendors, vendorPurchases, vendorSlips, openVendorModal, openEditVendorModal, openPrint } = useApp();
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [purchaseModalVendorId, setPurchaseModalVendorId] = useState<string | null>(null);
  const [slipModalVendorId, setSlipModalVendorId] = useState<string | null>(null);
  const [paymentVendorId, setPaymentVendorId] = useState<string | null>(null);
  const [pricingSlip, setPricingSlip] = useState<VendorSlip | null>(null);
  const [search, setSearch] = useState('');

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);
  const paymentVendor = vendors.find((v) => v.id === paymentVendorId) ?? null;

  // Priced slips already show up in vendorPurchases (via their linked
  // expense row) — this just lets us reattach the DC No / Care Of to that
  // row for display, without touching how payable/payments work.
  const slipByExpenseId = useMemo(() => {
    const map = new Map<string, VendorSlip>();
    vendorSlips.forEach((s) => {
      if (s.expenseId) map.set(s.expenseId, s);
    });
    return map;
  }, [vendorSlips]);

  const history = useMemo<HistoryRow[]>(() => {
    if (!selectedVendorId) return [];

    const purchaseRows: HistoryRow[] = vendorPurchases
      .filter((p) => p.vendorId === selectedVendorId)
      .map((p) => {
        const slip = slipByExpenseId.get(p.id);
        return {
          key: `purchase-${p.id}`,
          date: p.date,
          dcNo: slip?.dcNo ?? null,
          careOf: slip?.careOf ?? null,
          description: p.description,
          category: p.category,
          purchase: p,
          pendingSlip: null,
        };
      });

    const pendingSlipRows: HistoryRow[] = vendorSlips
      .filter((s) => s.vendorId === selectedVendorId && s.status === 'pending_pricing')
      .map((s) => ({
        key: `slip-${s.id}`,
        date: s.slipDate,
        dcNo: s.dcNo,
        careOf: s.careOf,
        description: `${s.items.length} item${s.items.length !== 1 ? 's' : ''} — ${s.items
          .slice(0, 2)
          .map((it) => it.description)
          .join(', ')}${s.items.length > 2 ? '…' : ''}`,
        category: 'Raw Material',
        purchase: null,
        pendingSlip: s,
      }));

    return [...purchaseRows, ...pendingSlipRows].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [selectedVendorId, vendorPurchases, vendorSlips, slipByExpenseId]);

  if (selectedVendor) {
    return (
      <>
        <Topbar
          title={selectedVendor.name}
          subtitle={`${selectedVendor.category} · ${selectedVendor.contact}`}
        />
        <div className="view-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button className="btn btn-ghost btn-small" onClick={() => setSelectedVendorId(null)}>
              ← All vendors
            </button>
            <button className="btn btn-ghost btn-small desktop-only" onClick={() => openEditVendorModal(selectedVendor.id)}>
              Edit Vendor
            </button>
          </div>

          <div className="stat-grid" style={{ marginBottom: 24 }}>
            <div className="facet-card">
              <div className="stat-label">Total purchased</div>
              <div className="stat-value">{formatINR(selectedVendor.totalPurchased)}</div>
            </div>
            <div className="facet-card">
              <div className="stat-label">Payable</div>
              <div className="stat-value">{selectedVendor.payable > 0 ? formatINR(selectedVendor.payable) : 'Settled'}</div>
              {selectedVendor.payable > 0 && (
                <button
                  className="btn btn-primary btn-small desktop-only"
                  style={{ marginTop: 10 }}
                  onClick={() => setPaymentVendorId(selectedVendor.id)}
                >
                  Record Payment
                </button>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Purchase history</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-small desktop-only" onClick={() => setPurchaseModalVendorId(selectedVendor.id)}>
                  + Record Purchase
                </button>
                <button className="btn btn-primary btn-small desktop-only" onClick={() => setSlipModalVendorId(selectedVendor.id)}>
                  + New Slip
                </button>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>DC No.</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.key}>
                    <td className="row-sub">{row.date}</td>
                    <td>
                      {row.dcNo ? (
                        <>
                          <div className="row-name">{row.dcNo}</div>
                          {row.careOf && <div className="row-sub">C/O {row.careOf}</div>}
                        </>
                      ) : (
                        <span className="row-sub">—</span>
                      )}
                    </td>
                    <td>{row.description}</td>
                    <td className="row-sub">{row.category}</td>
                    <td className="num">
                      {row.purchase ? (
                        <>
                          {formatINR(row.purchase.amount)}
                          {row.purchase.paidAmount > 0 && row.purchase.paymentStatus !== 'paid' && (
                            <div className="row-sub">
                              Paid {formatINR(row.purchase.paidAmount)} · Bal {formatINR(row.purchase.balance)}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="row-sub">Awaiting prices</span>
                      )}
                    </td>
                    <td>
                      {row.purchase ? (
                        <span
                          className={`badge ${
                            row.purchase.paymentStatus === 'paid'
                              ? 'paid'
                              : row.purchase.paymentStatus === 'partial'
                              ? 'partial'
                              : 'due'
                          }`}
                        >
                          {row.purchase.paymentStatus === 'paid'
                            ? 'Paid'
                            : row.purchase.paymentStatus === 'partial'
                            ? 'Partial'
                            : 'Unpaid'}
                        </span>
                      ) : (
                        <span className="badge due">Pending Pricing</span>
                      )}
                    </td>
                    <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {row.pendingSlip && (
                        <>
                          <button
                            className="btn btn-ghost btn-small"
                            onClick={() => openPrint('slip', row.pendingSlip!.id)}
                          >
                            Print
                          </button>
                          <button
                            className="btn btn-primary btn-small desktop-only"
                            onClick={() => setPricingSlip(row.pendingSlip)}
                          >
                            Enter Prices
                          </button>
                        </>
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
        <VendorSlipModal vendorId={slipModalVendorId} onClose={() => setSlipModalVendorId(null)} />
        <VendorPaymentModal vendor={paymentVendor} onClose={() => setPaymentVendorId(null)} />
        <PriceSlipModal slip={pricingSlip} onClose={() => setPricingSlip(null)} />
        <VendorModal />
      </>
    );
  }

  const query = search.trim().toLowerCase();
  const filteredVendors = query
    ? vendors.filter(
        (v) =>
          v.name.toLowerCase().includes(query) ||
          v.category.toLowerCase().includes(query) ||
          v.contact.toLowerCase().includes(query)
      )
    : vendors;

  return (
    <>
      <Topbar title="Vendors" subtitle="Raw material and service suppliers, purchases and payables" />
      <div className="view-body">
        <div className="panel">
          <div className="panel-head">
            <h3>{vendors.length} vendors</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendors…"
              />
              <button className="btn btn-ghost btn-small desktop-only" onClick={openVendorModal}>
                + New Vendor
              </button>
            </div>
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
              {filteredVendors.length === 0 && (
                <tr>
                  <td className="row-sub" colSpan={4}>
                    No vendors match “{search}”.
                  </td>
                </tr>
              )}
              {filteredVendors.map((v) => (
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
    </>
  );
}