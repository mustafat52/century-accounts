import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import type { InvoiceSlab } from '../types';
import { SLAB_DISCOUNT_PERCENT } from '../types';

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function ConvertQuotationModal() {
  const {
    isConvertQuotationModalOpen,
    convertQuotationModalId,
    closeConvertQuotationModal,
    quotations,
    customers,
    gstEnabled,
    convertQuotationToInvoice,
  } = useApp();
  const navigate = useNavigate();

  const quotation = convertQuotationModalId ? quotations.find((q) => q.dbId === convertQuotationModalId) : null;

  const [slab, setSlab] = useState<InvoiceSlab>('A');
  const [customDiscount, setCustomDiscount] = useState('0');
  const [saving, setSaving] = useState(false);

  // Defaults to whatever slab was last negotiated/saved on the quotation —
  // but stays editable here in case the final agreed price ended up
  // different, without having to go back and re-save the quotation first.
  useEffect(() => {
    if (isConvertQuotationModalOpen && quotation) {
      setSlab(quotation.slab);
      setCustomDiscount(quotation.slab === 'D' ? String(quotation.discountPercent) : '0');
    }
  }, [isConvertQuotationModalOpen, quotation]);

  if (!isConvertQuotationModalOpen || !quotation) return null;

  const customerName = customers.find((c) => c.id === quotation.customerId)?.name ?? '—';
  const discountPercent = slab === 'D' ? parseFloat(customDiscount) || 0 : SLAB_DISCOUNT_PERCENT[slab];
  const discountAmount = quotation.amount * (discountPercent / 100);
  const taxableValue = quotation.amount - discountAmount;
  const gstAmount = gstEnabled ? Math.round(taxableValue * 0.18) : 0;
  const grandTotal = taxableValue + gstAmount;

  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    await convertQuotationToInvoice(quotation.dbId, slab, discountPercent);
    setSaving(false);
    closeConvertQuotationModal();
    // Land on the Invoices tab so the newly created invoice is immediately
    // visible, regardless of which tab/screen Convert was triggered from.
    navigate('/invoicing?tab=invoices');
  };

  return (
    <div className="modal-overlay is-open">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Convert to Invoice</h2>
          <button className="modal-close" onClick={closeConvertQuotationModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="row-sub">{quotation.id}</div>
          <div className="row-sub" style={{ marginBottom: 8 }}>
            {customerName} · {quotation.description}
          </div>
          <div className="row-sub" style={{ marginBottom: 16 }}>
            Confirm the discount slab before this becomes an invoice — pre-filled from the
            quotation, but changeable here in case the final price differs.
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Slab (discount)</label>
              <select value={slab} onChange={(e) => setSlab(e.target.value as InvoiceSlab)}>
                <option value="A">A · 10% off</option>
                <option value="B">B · 15% off</option>
                <option value="C">C · 20% off</option>
                <option value="D">D · Custom %</option>
              </select>
            </div>
            {slab === 'D' && (
              <div className="form-field">
                <label>Custom discount (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={customDiscount}
                  onChange={(e) => setCustomDiscount(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="row-sub" style={{ marginTop: 10, textAlign: 'right' }}>
            Subtotal: {money(quotation.amount)}
            {discountPercent > 0 && <> · Slab {slab} discount ({discountPercent}%): −{money(discountAmount)}</>}
            {gstEnabled && <> · CGST+SGST (18%): {money(gstAmount)}</>}
            {' · '}
            <strong style={{ color: 'var(--text)' }}>Total: {money(grandTotal)}</strong>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeConvertQuotationModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Converting…' : 'Confirm & Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}