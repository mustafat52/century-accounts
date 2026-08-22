import { useMemo, useState, Fragment } from 'react';
import Topbar from '../components/Topbar';
import PurchaseBillModal from '../components/PurchaseBillModal';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';

export default function PurchaseBills() {
  const { purchaseBills } = useApp();
  const [isModalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sortedBills = useMemo(
    () => [...purchaseBills].sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1)),
    [purchaseBills]
  );

  const total = purchaseBills.reduce((sum, b) => sum + b.totalAmount, 0);

  return (
    <>
      <Topbar
        title="Purchase Bills"
        subtitle="GST purchase register — a record of tax invoices received from suppliers, for filing reference"
      />
      <div className="view-body">
        <div className="panel">
          <div className="panel-head">
            <h3>{purchaseBills.length} bills logged · {formatINR(total)} total</h3>
            <button className="btn btn-primary btn-small desktop-only" onClick={() => setModalOpen(true)}>
              + New Purchase Bill
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Supplier</th>
                <th>GSTIN</th>
                <th>Place of Supply</th>
                <th>Tax</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedBills.map((b) => {
                const isExpanded = expandedId === b.id;
                return (
                  <Fragment key={b.id}>
                    <tr>
                      <td>
                        <div className="row-name">{b.invoiceNo}</div>
                        <div className="row-sub">{b.invoiceDate}</div>
                      </td>
                      <td>{b.supplierName}</td>
                      <td className="row-sub">{b.supplierGstin}</td>
                      <td className="row-sub">{b.placeOfSupply}</td>
                      <td className="row-sub">{b.taxType === 'cgst_sgst' ? 'CGST+SGST' : 'IGST'}</td>
                      <td className="num">
                        {formatINR(b.totalAmount)}
                        <div className="row-sub">
                          Taxable {formatINR(b.subtotal)}
                        </div>
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-small" onClick={() => setExpandedId(isExpanded ? null : b.id)}>
                          {isExpanded ? 'Hide items' : 'View items'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <table style={{ margin: '4px 0' }}>
                            <thead>
                              <tr>
                                <th>HSN/SAC</th>
                                <th>Description</th>
                                <th className="num">Qty</th>
                                <th className="num">Rate</th>
                                <th className="num">Taxable</th>
                                <th>GST %</th>
                                <th className="num">CGST</th>
                                <th className="num">SGST</th>
                                <th className="num">IGST</th>
                              </tr>
                            </thead>
                            <tbody>
                              {b.items.map((it) => (
                                <tr key={it.id}>
                                  <td className="row-sub">{it.hsnCode || '—'}</td>
                                  <td>{it.description}</td>
                                  <td className="num">{it.quantity}</td>
                                  <td className="num">{formatINR(it.rate)}</td>
                                  <td className="num">{formatINR(it.taxableAmount)}</td>
                                  <td className="row-sub">{it.gstRate}%</td>
                                  <td className="num">{it.cgstAmount > 0 ? formatINR(it.cgstAmount) : '—'}</td>
                                  <td className="num">{it.sgstAmount > 0 ? formatINR(it.sgstAmount) : '—'}</td>
                                  <td className="num">{it.igstAmount > 0 ? formatINR(it.igstAmount) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {b.supplierAddress && <div className="row-sub" style={{ padding: '0 4px 8px' }}>{b.supplierAddress}</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {sortedBills.length === 0 && (
                <tr>
                  <td className="row-sub">No purchase bills logged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <PurchaseBillModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}