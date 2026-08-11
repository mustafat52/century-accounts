import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { NewQuotationItemInput } from '../context/AppContext';
import type { ItemSlab } from '../types';

interface DraftItem {
  key: string;
  type: 'glass' | 'simple';
  description: string;
  area: string;
  slab: ItemSlab | '';
  thicknessMm: string;
  // simple
  quantity: string;
  rate: string;
  // glass
  lengthIn: string;
  widthIn: string;
  glassQty: string;
  ratePerSft: string;
  polishRate: string;
  fixingRatePerSft: string;
}

let draftKeyCounter = 0;
function blankItem(type: 'glass' | 'simple' = 'simple'): DraftItem {
  draftKeyCounter += 1;
  return {
    key: `qitem-${draftKeyCounter}`,
    type,
    description: '',
    area: '',
    slab: '',
    thicknessMm: '',
    quantity: '1',
    rate: '',
    lengthIn: '',
    widthIn: '',
    glassQty: '1',
    ratePerSft: '',
    polishRate: '',
    fixingRatePerSft: '',
  };
}

function computeGlassAmount(it: DraftItem) {
  const len = parseFloat(it.lengthIn) || 0;
  const wid = parseFloat(it.widthIn) || 0;
  const qty = parseFloat(it.glassQty) || 0;
  const ratePerSft = parseFloat(it.ratePerSft) || 0;
  const polishRate = parseFloat(it.polishRate) || 0;
  const fixingRate = parseFloat(it.fixingRatePerSft) || 0;

  const sft = ((len * wid) / 144) * qty;
  const workGlass = sft * ratePerSft;
  const rft = ((2 * (len + wid)) / 12) * qty;
  const polish = rft * polishRate;
  const fixing = sft * fixingRate;

  return { sft, rft, amount: workGlass + polish + fixing };
}

function computeSimpleAmount(it: DraftItem) {
  return (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
}

function computeItemAmount(it: DraftItem): number {
  return it.type === 'glass' ? computeGlassAmount(it).amount : computeSimpleAmount(it);
}

function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2); // matches "Quotation Validity - 2 days" T&C
  return d.toISOString().slice(0, 10);
}

export default function QuotationModal() {
  const {
    isQuotationModalOpen,
    quotationModalCustomerId,
    editingQuotationId,
    closeQuotationModal,
    customers,
    quotations,
    addQuotation,
    updateQuotation,
    gstEnabled,
  } = useApp();

  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [items, setItems] = useState<DraftItem[]>([blankItem('simple')]);
  const wasOpenRef = useRef(false);

  const editingQuotation = editingQuotationId ? quotations.find((q) => q.dbId === editingQuotationId) : null;

  useEffect(() => {
    if (isQuotationModalOpen && !wasOpenRef.current) {
      if (editingQuotation) {
        setCustomerId(editingQuotation.customerId);
        setValidUntil(editingQuotation.validUntil);
        // Note: editingQuotation from context doesn't carry items — those load separately below.
      } else {
        setCustomerId(quotationModalCustomerId ?? customers[0]?.id ?? '');
        setValidUntil(defaultValidUntil());
        setItems([blankItem('simple')]);
      }
    }
    wasOpenRef.current = isQuotationModalOpen;
  }, [isQuotationModalOpen, quotationModalCustomerId, editingQuotation, customers]);

  if (!isQuotationModalOpen) return null;

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  };

  const subtotal = items.reduce((sum, it) => sum + computeItemAmount(it), 0);
  const gstAmount = gstEnabled ? Math.round(subtotal * 0.18) : 0;
  const grandTotal = subtotal + gstAmount;

  const isItemValid = (it: DraftItem) =>
    it.description.trim() &&
    (it.type === 'simple'
      ? (parseFloat(it.quantity) || 0) > 0 && (parseFloat(it.rate) || 0) > 0
      : (parseFloat(it.lengthIn) || 0) > 0 &&
        (parseFloat(it.widthIn) || 0) > 0 &&
        (parseFloat(it.glassQty) || 0) > 0 &&
        (parseFloat(it.ratePerSft) || 0) > 0);

  const isValid = customerId && validUntil && items.every(isItemValid);

  const handleSave = async () => {
    if (!isValid) return;

    const payloadItems: NewQuotationItemInput[] = items.map((it) =>
      it.type === 'glass'
        ? {
            type: 'glass',
            description: it.description.trim(),
            area: it.area.trim() || null,
            slab: it.slab || null,
            thicknessMm: it.thicknessMm.trim() || null,
            lengthIn: parseFloat(it.lengthIn) || 0,
            widthIn: parseFloat(it.widthIn) || 0,
            qty: parseFloat(it.glassQty) || 0,
            ratePerSft: parseFloat(it.ratePerSft) || 0,
            polishRate: parseFloat(it.polishRate) || 0,
            fixingRatePerSft: parseFloat(it.fixingRatePerSft) || 0,
          }
        : {
            type: 'simple',
            description: it.description.trim(),
            area: it.area.trim() || null,
            slab: it.slab || null,
            quantity: parseFloat(it.quantity) || 0,
            rate: parseFloat(it.rate) || 0,
          }
    );

    if (editingQuotationId) {
      await updateQuotation(editingQuotationId, { validUntil, items: payloadItems });
    } else {
      await addQuotation({ customerId, validUntil, items: payloadItems });
    }
    closeQuotationModal();
  };

  return (
    <div className="modal-overlay is-open" onClick={closeQuotationModal}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{editingQuotationId ? 'Edit Quotation' : 'New Quotation'}</h2>
          <button className="modal-close" onClick={closeQuotationModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field">
              <label>Customer</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!!editingQuotationId}>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Valid until</label>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 8 }}>
            Items
          </div>

          {items.map((item) => {
            const isGlass = item.type === 'glass';
            const glassCalc = isGlass ? computeGlassAmount(item) : null;
            const amount = computeItemAmount(item);

            return (
              <div className="item-card" key={item.key}>
                <div className="item-card-head">
                  <div className="item-type-toggle">
                    <button
                      type="button"
                      className={`chip${item.type === 'simple' ? ' is-active' : ''}`}
                      onClick={() => updateItem(item.key, { type: 'simple' })}
                    >
                      Hardware / Simple
                    </button>
                    <button
                      type="button"
                      className={`chip${isGlass ? ' is-active' : ''}`}
                      onClick={() => updateItem(item.key, { type: 'glass' })}
                    >
                      Glass (by size)
                    </button>
                  </div>
                  <button className="item-card-remove" onClick={() => removeItem(item.key)} type="button">
                    Remove
                  </button>
                </div>

                <div className="item-fields">
                  <div className="form-field">
                    <label>Area / Location</label>
                    <input
                      type="text"
                      value={item.area}
                      onChange={(e) => updateItem(item.key, { area: e.target.value })}
                      placeholder="e.g. Bar Counter, MBR Shower"
                    />
                  </div>
                  <div className="form-field span-2">
                    <label>Description</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(item.key, { description: e.target.value })}
                      placeholder={isGlass ? 'e.g. Grey mirror + CP' : 'e.g. Silicon sealant'}
                    />
                  </div>
                  <div className="form-field">
                    <label>Slab</label>
                    <select value={item.slab} onChange={(e) => updateItem(item.key, { slab: e.target.value as ItemSlab | '' })}>
                      <option value="">—</option>
                      <option value="A">A · B2C</option>
                      <option value="B">B · B2B</option>
                      <option value="C">C · Family</option>
                    </select>
                  </div>

                  {isGlass ? (
                    <>
                      <div className="form-field">
                        <label>Thickness (mm)</label>
                        <input
                          type="text"
                          value={item.thicknessMm}
                          onChange={(e) => updateItem(item.key, { thicknessMm: e.target.value })}
                          placeholder="e.g. 12MM"
                        />
                      </div>
                      <div className="form-field">
                        <label>Length (in)</label>
                        <input type="number" value={item.lengthIn} onChange={(e) => updateItem(item.key, { lengthIn: e.target.value })} />
                      </div>
                      <div className="form-field">
                        <label>Width (in)</label>
                        <input type="number" value={item.widthIn} onChange={(e) => updateItem(item.key, { widthIn: e.target.value })} />
                      </div>
                      <div className="form-field">
                        <label>Qty (pieces)</label>
                        <input type="number" value={item.glassQty} onChange={(e) => updateItem(item.key, { glassQty: e.target.value })} />
                      </div>
                      <div className="form-field">
                        <label>Rate / Sft (₹)</label>
                        <input type="number" value={item.ratePerSft} onChange={(e) => updateItem(item.key, { ratePerSft: e.target.value })} />
                      </div>
                      <div className="form-field">
                        <label>Polish rate / Rft (₹, optional)</label>
                        <input type="number" value={item.polishRate} onChange={(e) => updateItem(item.key, { polishRate: e.target.value })} />
                      </div>
                      <div className="form-field">
                        <label>Fixing rate / Sft (₹, optional)</label>
                        <input type="number" value={item.fixingRatePerSft} onChange={(e) => updateItem(item.key, { fixingRatePerSft: e.target.value })} />
                      </div>
                      <div className="form-field span-2">
                        <label>Computed</label>
                        <input
                          type="text"
                          disabled
                          value={`${glassCalc!.sft.toFixed(2)} sft · ${glassCalc!.rft.toFixed(2)} rft`}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="form-field">
                        <label>Qty</label>
                        <input type="number" value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: e.target.value })} />
                      </div>
                      <div className="form-field">
                        <label>Rate (₹)</label>
                        <input type="number" value={item.rate} onChange={(e) => updateItem(item.key, { rate: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>

                <div className="item-card-total">
                  Line total: <strong>₹{amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
                </div>
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn btn-ghost btn-small" onClick={() => setItems((prev) => [...prev, blankItem('simple')])} type="button">
              + Add Hardware Item
            </button>
            <button className="btn btn-ghost btn-small" onClick={() => setItems((prev) => [...prev, blankItem('glass')])} type="button">
              + Add Glass Item
            </button>
          </div>

          <div className="row-sub" style={{ marginTop: 6, textAlign: 'right' }}>
            Subtotal: ₹{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            {gstEnabled && <> · CGST+SGST (18%): ₹{gstAmount.toLocaleString('en-IN')}</>}
            {' · '}
            <strong style={{ color: 'var(--text)' }}>Total: ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeQuotationModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!isValid}>
            {editingQuotationId ? 'Save changes' : 'Save quotation'}
          </button>
        </div>
      </div>
    </div>
  );
}