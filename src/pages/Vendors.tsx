import { useMemo, useState } from 'react';
import Topbar from '../components/Topbar';
import VendorModal from '../components/VendorModal';
import VendorPaymentModal from '../components/VendorPaymentModal';
import VendorSlipModal from '../components/VendorSlipModal';
import PriceSlipModal from '../components/PriceSlipModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import type { Vendor, VendorPurchase, VendorSlip } from '../types';

// A unified purchase-history row — either a priced purchase (quick entry OR
// a slip that's already been priced, in which case its DC No/Care Of are
// pulled back in for display) or a slip still waiting to be priced.
interface HistoryRow {
  key: string;
  date: string;
  dcNo: string | null;
  careOf: string | null;
  customerName: string | null;
  description: string;
  category: string | null;
  purchase: VendorPurchase | null;
  pendingSlip: VendorSlip | null;
  // The slip behind this row, whether still pending or already priced/settled
  // (null for a quick purchase that never had a slip).
  slip: VendorSlip | null;
}

type HistoryFilter = 'all' | 'pending' | 'unpaid' | 'settled';
const HISTORY_FILTERS: Array<{ key: HistoryFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending pricing' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'settled', label: 'Settled' },
];

export default function Vendors() {
  const {
    vendors,
    vendorPurchases,
    vendorPayments,
    vendorSlips,
    openVendorModal,
    openEditVendorModal,
    openPrint,
    deleteVendor,
    showToast,
  } = useApp();
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [slipModalVendorId, setSlipModalVendorId] = useState<string | null>(null);
  const [paymentVendorId, setPaymentVendorId] = useState<string | null>(null);
  const [pricingSlip, setPricingSlip] = useState<VendorSlip | null>(null);
  const [editSlip, setEditSlip] = useState<VendorSlip | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState(false);

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
          customerName: slip?.customerName ?? null,
          description: p.description,
          category: p.category,
          purchase: p,
          pendingSlip: null,
          slip: slip ?? null,
        };
      });

    const pendingSlipRows: HistoryRow[] = vendorSlips
      .filter((s) => s.vendorId === selectedVendorId && s.status === 'pending_pricing')
      .map((s) => ({
        key: `slip-${s.id}`,
        date: s.slipDate,
        dcNo: s.dcNo,
        careOf: s.careOf,
        customerName: s.customerName,
        description: `${s.items.length} item${s.items.length !== 1 ? 's' : ''} — ${s.items
          .slice(0, 2)
          .map((it) => it.description)
          .join(', ')}${s.items.length > 2 ? '…' : ''}`,
        category: 'Raw Material',
        purchase: null,
        pendingSlip: s,
        slip: s,
      }));

    return [...purchaseRows, ...pendingSlipRows].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [selectedVendorId, vendorPurchases, vendorSlips, slipByExpenseId]);

  const visibleHistory = useMemo(
    () =>
      history.filter((row) => {
        if (historyFilter === 'all') return true;
        if (historyFilter === 'pending') return !!row.pendingSlip;
        if (historyFilter === 'settled') return !!row.purchase && row.purchase.paymentStatus === 'paid';
        return !!row.purchase && row.purchase.paymentStatus !== 'paid'; // unpaid / partly paid
      }),
    [history, historyFilter]
  );
  const settledCount = history.filter((r) => r.purchase && r.purchase.paymentStatus === 'paid').length;

  // vendor_payments rows only carry an expense_id, not a vendor_id
  // directly — vendorPurchases (already vendor-scoped) gives us the
  // expense-id -> vendor mapping to filter by without a separate query.
  const vendorPaymentHistory = useMemo(() => {
    if (!selectedVendorId) return [];
    const expenseIds = new Set(vendorPurchases.filter((p) => p.vendorId === selectedVendorId).map((p) => p.id));
    return vendorPayments
      .filter((p) => expenseIds.has(p.expenseId))
      .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1));
  }, [selectedVendorId, vendorPurchases, vendorPayments]);

  // What deleting the vendor would take with it — shown in the confirmation
  // so nobody wipes a vendor's purchase history by accident.
  const deleteSummary = useMemo(() => {
    if (!deleteTarget) return null;
    const purchases = vendorPurchases.filter((p) => p.vendorId === deleteTarget.id);
    const ids = new Set(purchases.map((p) => p.id));
    const payments = vendorPayments.filter((p) => ids.has(p.expenseId));
    return {
      purchaseCount: purchases.length,
      purchaseTotal: purchases.reduce((sum, p) => sum + p.amount, 0),
      paymentCount: payments.length,
      paidTotal: payments.reduce((sum, p) => sum + p.amount, 0),
      slipCount: vendorSlips.filter((s) => s.vendorId === deleteTarget.id).length,
    };
  }, [deleteTarget, vendorPurchases, vendorPayments, vendorSlips]);

  const hasHistory = !!deleteSummary && (deleteSummary.purchaseCount > 0 || deleteSummary.slipCount > 0);

  const handleDeleteVendor = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const ok = await deleteVendor(deleteTarget.id);
    setDeleting(false);
    if (ok) {
      showToast(`${deleteTarget.name} deleted.`, 'success');
      setSelectedVendorId(null);
      setDeleteTarget(null);
    }
  };

  const deleteDialog = (
    <ConfirmDialog
      open={deleteTarget !== null}
      danger
      title={deleteTarget ? `Delete ${deleteTarget.name}?` : 'Delete vendor?'}
      message={
        deleteTarget && deleteSummary
          ? hasHistory
            ? `${deleteTarget.name} has ${deleteSummary.purchaseCount} purchase${deleteSummary.purchaseCount !== 1 ? 's' : ''} (${formatINR(deleteSummary.purchaseTotal)}), ${deleteSummary.paymentCount} payment${deleteSummary.paymentCount !== 1 ? 's' : ''} (${formatINR(deleteSummary.paidTotal)} paid) and ${deleteSummary.slipCount} slip${deleteSummary.slipCount !== 1 ? 's' : ''}. Deleting the vendor permanently removes ALL of these, so your total expenses and Reports will go down by ${formatINR(deleteSummary.purchaseTotal)}. This can't be undone.`
            : `${deleteTarget.name} has no purchases, payments or slips recorded. This can't be undone.`
          : ''
      }
      confirmLabel={deleting ? 'Deleting…' : hasHistory ? 'Delete vendor and records' : 'Delete vendor'}
      onConfirm={handleDeleteVendor}
      onCancel={() => !deleting && setDeleteTarget(null)}
    />
  );

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
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-small desktop-only" onClick={() => openEditVendorModal(selectedVendor.id)}>
                Edit Vendor
              </button>
              <button
                className="btn btn-ghost btn-small desktop-only"
                style={{ color: 'var(--danger)' }}
                onClick={() => setDeleteTarget(selectedVendor)}
              >
                Delete Vendor
              </button>
            </div>
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
                <button className="btn btn-primary btn-small desktop-only" onClick={() => setSlipModalVendorId(selectedVendor.id)}>
                  + New Slip
                </button>
              </div>
            </div>
            <div className="chip-row" style={{ padding: '12px 20px 4px' }}>
              {HISTORY_FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`chip${historyFilter === f.key ? ' is-active' : ''}`}
                  onClick={() => setHistoryFilter(f.key)}
                >
                  {f.label}
                  {f.key === 'settled' ? ` (${settledCount})` : ''}
                </button>
              ))}
            </div>
            <div className="table-scroll">
              <table className="table-cards">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>DC No.</th>
                  <th>Customer</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleHistory.map((row) => (
                  <tr key={row.key}>
                    <td className="card-main">
                      {row.dcNo ? (
                        <>
                          <div className="row-name">{row.dcNo}</div>
                          {row.careOf && <div className="row-sub">C/O {row.careOf}</div>}
                        </>
                      ) : (
                        <span className="row-sub">—</span>
                      )}
                    </td>
                    <td className="row-sub card-meta">
                      <span className="mobile-label">Date</span>
                      {row.date}
                    </td>
                    <td className="row-sub card-meta">
                      <span className="mobile-label">Customer</span>
                      {row.customerName || '—'}
                    </td>
                    <td className="row-sub card-hide">{row.category}</td>
                    <td className="num card-amount">
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
                    <td className="card-badge-right">
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
                    <td className="card-actions">
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {row.slip && (
                        <>
                          <button className="btn btn-ghost btn-small" onClick={() => openPrint('slip', row.slip!.id)}>
                            {row.pendingSlip ? 'Print' : 'View'}
                          </button>
                          <button className="btn btn-ghost btn-small desktop-only" onClick={() => setEditSlip(row.slip)}>
                            Edit
                          </button>
                          {row.pendingSlip && (
                            <button
                              className="btn btn-primary btn-small desktop-only"
                              onClick={() => setPricingSlip(row.pendingSlip)}
                            >
                              Enter Prices
                            </button>
                          )}
                        </>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleHistory.length === 0 && (
                  <tr>
                    <td className="row-sub">
                      {history.length === 0 ? 'No purchases logged yet.' : 'Nothing in this view — try another filter above.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Payment history</h3>
            </div>
            <div className="table-scroll">
              <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {vendorPaymentHistory.length === 0 && (
                  <tr>
                    <td className="row-sub">No payments recorded yet.</td>
                  </tr>
                )}
                {vendorPaymentHistory.map((p) => (
                  <tr key={p.id}>
                    <td className="row-sub">{p.paymentDate}</td>
                    <td className="num">{formatINR(p.amount)}</td>
                    <td className="row-sub">{p.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </div>

        <VendorSlipModal
          vendorId={editSlip ? editSlip.vendorId : slipModalVendorId}
          editSlip={editSlip}
          onClose={() => {
            setSlipModalVendorId(null);
            setEditSlip(null);
          }}
        />
        <VendorPaymentModal vendor={paymentVendor} onClose={() => setPaymentVendorId(null)} />
        <PriceSlipModal slip={pricingSlip} onClose={() => setPricingSlip(null)} />
        <VendorModal />
        {deleteDialog}
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
          <div className="table-scroll">
            <table className="table-cards">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Category</th>
                <th>Total purchased</th>
                <th>Payable</th>
                <th className="desktop-only"></th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.length === 0 && (
                <tr>
                  <td className="row-sub" colSpan={5}>
                    No vendors match “{search}”.
                  </td>
                </tr>
              )}
              {filteredVendors.map((v) => (
                <tr key={v.id} onClick={() => setSelectedVendorId(v.id)} style={{ cursor: 'pointer' }}>
                  <td className="card-main">
                    <div className="row-name">{v.name}</div>
                    <div className="row-sub">{v.contact}</div>
                  </td>
                  <td className="row-sub card-meta">
                    <span className="mobile-label">Category</span>
                    {v.category}
                  </td>
                  <td className="num card-meta">
                    <span className="mobile-label">Total purchased</span>
                    {formatINR(v.totalPurchased)}
                  </td>
                  <td className="num card-amount" style={{ color: v.payable > 0 ? 'var(--warning)' : 'var(--success)' }}>
                    <span className="mobile-label">Payable</span>
                    {v.payable > 0 ? formatINR(v.payable) : 'Settled'}
                  </td>
                  <td className="card-actions desktop-only" style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-ghost btn-small"
                      style={{ color: 'var(--danger)' }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setDeleteTarget(v);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </div>
      <VendorModal />
      {deleteDialog}
    </>
  );
}