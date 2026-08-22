import { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { PurchaseBillTaxType } from '../types';

const GST_RATES = [5, 12, 18, 28];

interface DraftItem {
  key: string;
  hsnCode: string;
  description: string;
  quantity: string;
  rate: string;
  gstRate: number;
}

let draftKeyCounter = 0;
function blankItem(): DraftItem {
  draftKeyCounter += 1;
  return { key: `pbitem-${draftKeyCounter}`, hsnCode: '', description: '', quantity: '', rate: '', gstRate: 18 };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Home state for CGST+SGST vs IGST auto-detection — matches the business
// address on the invoice/quotation printable (Hyderabad, Telangana).
const BUSINESS_STATE = 'Telangana';

export default function PurchaseBillModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { addPurchaseBill } = useApp();

  const [supplierGstin, setSupplierGstin] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [placeOfSupply, setPlaceOfSupply] = useState(BUSINESS_STATE);
  const [taxTypeOverride, setTaxTypeOverride] = useState<PurchaseBillTaxType | null>(null);
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [saving, setSaving] = useState(false);

  // Same state as the business (Telangana) → CGST+SGST; different state →
  // IGST. Auto-decided from Place of Supply, but the person can flip it
  // manually below in case of an edge case (SEZ, etc.).
  const autoTaxType: PurchaseBillTaxType = placeOfSupply.trim().toLowerCase() === BUSINESS_STATE.toLowerCase() ? 'cgst_sgst' : 'igst';
  const taxType = taxTypeOverride ?? autoTaxType;

  if (!isOpen) return null;

  const reset = () => {
    setSupplierGstin('');
    setSupplierName('');
    setSupplierAddress('');
    setInvoiceNo('');
    setInvoiceDate(todayISO());
    setPlaceOfSupply(BUSINESS_STATE);
    setTaxTypeOverride(null);
    setItems([blankItem()]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  };

  const computeLine = (it: DraftItem) => {
    const qty = parseFloat(it.quantity) || 0;
    const rate = parseFloat(it.rate) || 0;
    const taxable = qty * rate;
    const gstAmount = taxable * (it.gstRate / 100);
    const cgst = taxType === 'cgst_sgst' ? gstAmount / 2 : 0;
    const sgst = taxType === 'cgst_sgst' ? gstAmount / 2 : 0;
    const igst = taxType === 'igst' ? gstAmount : 0;
    return { taxable, gstAmount, cgst, sgst, igst };
  };

  const subtotal = items.reduce((sum, it) => sum + computeLine(it).taxable, 0);
  const cgstTotal = items.reduce((sum, it) => sum + computeLine(it).cgst, 0);
  const sgstTotal = items.reduce((sum, it) => sum + computeLine(it).sgst, 0);
  const igstTotal = items.reduce((sum, it) => sum + computeLine(it).igst, 0);
  const grandTotal = subtotal + cgstTotal + sgstTotal + igstTotal;

  const isItemValid = (it: DraftItem) =>
    it.description.trim() && (parseFloat(it.quantity) || 0) > 0 && (parseFloat(it.rate) || 0) >= 0;

  const isValid =
    supplierGstin.trim() &&
    supplierName.trim() &&
    invoiceNo.trim() &&
    invoiceDate &&
    placeOfSupply.trim() &&
    items.every(isItemValid);

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    await addPurchaseBill({
      supplierGstin: supplierGstin.trim(),
      supplierName: supplierName.trim(),
      supplierAddress: supplierAddress.trim(),
      invoiceNo: invoiceNo.trim(),
      invoiceDate,
      placeOfSupply: placeOfSupply.trim(),
      taxType,
      items: items.filter(isItemValid).map((it) => ({
        hsnCode: it.hsnCode.trim(),
        description: it.description.trim(),
        quantity: parseFloat(it.quantity) || 0,
        rate: parseFloat(it.rate) || 0,
        gstRate: it.gstRate,
      })),
    });
    setSaving(false);
    handleClose();
  };

  return (
    <div className="modal-overlay is-open" onClick={handleClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New Purchase Bill</h2>
          <button className="modal-close" onClick={handleClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="row-sub" style={{ marginBottom: 12 }}>
            A pure record for GST filing — logging a tax invoice already received from a supplier.
            This is independent of Vendors and doesn't affect anything else in the app.
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Supplier GSTIN</label>
              <input
                type="text"
                value={supplierGstin}
                onChange={(e) => setSupplierGstin(e.target.value.toUpperCase())}
                placeholder="e.g. 36AIRPJ6598D1ZO"
              />
            </div>
            <div className="form-field">
              <label>Supplier name</label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Rajneesh Glass Agencies"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field span-2">
              <label>Supplier address (optional)</label>
              <input
                type="text"
                value={supplierAddress}
                onChange={(e) => setSupplierAddress(e.target.value)}
                placeholder="e.g. #6-4-63/1 Part, Shivrampally Station Road, Kattedan, Hyderabad"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Invoice number</label>
              <input type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="e.g. 650" />
            </div>
            <div className="form-field">
              <label>Invoice date</label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Place of supply (state)</label>
              <input type="text" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder="e.g. Telangana" />
            </div>
            <div className="form-field">
              <label>Tax type</label>
              <div className="item-type-toggle">
                <button
                  type="button"
                  className={`chip${taxType === 'cgst_sgst' ? ' is-active' : ''}`}
                  onClick={() => setTaxTypeOverride('cgst_sgst')}
                >
                  CGST + SGST
                </button>
                <button
                  type="button"
                  className={`chip${taxType === 'igst' ? ' is-active' : ''}`}
                  onClick={() => setTaxTypeOverride('igst')}
                >
                  IGST
                </button>
              </div>
              {taxTypeOverride === null && (
                <div className="row-sub" style={{ marginTop: 4 }}>
                  Auto-set from Place of Supply — override above if needed.
                </div>
              )}
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 8 }}>
            Items
          </div>

          <div className="item-table-wrap">
            <table className="item-table">
              <colgroup>
                <col style={{ width: 90 }} />
                <col />
                <col style={{ width: 80 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 32 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>HSN/SAC</th>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th>GST %</th>
                  <th className="num">Taxable</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const calc = computeLine(item);
                  return (
                    <tr key={item.key}>
                      <td>
                        <input type="text" value={item.hsnCode} onChange={(e) => updateItem(item.key, { hsnCode: e.target.value })} placeholder="7005" />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(item.key, { description: e.target.value })}
                          placeholder="e.g. 8MM Clear Plain Glass"
                        />
                      </td>
                      <td className="num">
                        <input type="number" value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: e.target.value })} placeholder="0" />
                      </td>
                      <td className="num">
                        <input type="number" value={item.rate} onChange={(e) => updateItem(item.key, { rate: e.target.value })} placeholder="0.00" />
                      </td>
                      <td>
                        <select value={item.gstRate} onChange={(e) => updateItem(item.key, { gstRate: Number(e.target.value) })}>
                          {GST_RATES.map((r) => (
                            <option key={r} value={r}>
                              {r}%
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="num item-table-amount">{money(calc.taxable)}</td>
                      <td>
                        <button className="item-table-remove" type="button" onClick={() => removeItem(item.key)} title="Remove">
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => setItems((prev) => [...prev, blankItem()])}>
              + Add Item
            </button>
          </div>

          <div className="row-sub" style={{ textAlign: 'right' }}>
            Taxable value: {money(subtotal)}
            {taxType === 'cgst_sgst' ? (
              <>
                {' '}
                · CGST: {money(cgstTotal)} · SGST: {money(sgstTotal)}
              </>
            ) : (
              <> · IGST: {money(igstTotal)}</>
            )}
            {' · '}
            <strong style={{ color: 'var(--text)' }}>Total: {money(grandTotal)}</strong>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={handleClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!isValid || saving}>
            {saving ? 'Saving…' : 'Save purchase bill'}
          </button>
        </div>
      </div>
    </div>
  );
}