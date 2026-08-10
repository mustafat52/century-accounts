import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { NewInvoiceItemInput } from '../context/AppContext';
import type { InvoiceKind, ItemSlab } from '../types';

interface DraftItem {
  key: string;
  type: 'glass' | 'simple';
  description: string;
  slab: ItemSlab | '';
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
    key: `item-${draftKeyCounter}`,
    type,
    description: '',
    slab: '',
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

export default function InvoiceModal() {
  const { isInvoiceModalOpen, invoiceModalCustomerId, closeInvoiceModal, customers, addInvoice, gstEnabled } =
    useApp();

  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [kind, setKind] = useState<InvoiceKind>('quick');
  const [dueDate, setDueDate] = useState('');
  const [transportation, setTransportation] = useState('');
  const [items, setItems] = useState<DraftItem[]>([blankItem('simple')]);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isInvoiceModalOpen && !wasOpenRef.current) {
      setCustomerId(invoiceModalCustomerId ?? customers[0]?.id ?? '');
      setKind('quick');
      setDueDate('');
      setTransportation('');
      setItems([blankItem('simple')]);
    }
    wasOpenRef.current = isInvoiceModalOpen;
  }, [isInvoiceModalOpen, invoiceModalCustomerId, customers]);

  if (!isInvoiceModalOpen) return null;

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  };

  const subtotal = items.reduce((sum, it) => sum + computeItemAmount(it), 0);
  const gstAmount = gstEnabled ? Math.round(subtotal * 0.18) : 0;
  const transportNum = parseFloat(transportation) || 0;
  const grandTotal = subtotal + gstAmount + transportNum;

  const isItemValid = (it: DraftItem) =>
    it.description.trim() &&
    (it.type === 'simple'
      ? (parseFloat(it.quantity) || 0) > 0 && (parseFloat(it.rate) || 0) > 0
      : (parseFloat(it.lengthIn) || 0) > 0 &&
        (parseFloat(it.widthIn) || 0) > 0 &&
        (parseFloat(it.glassQty) || 0) > 0 &&
        (parseFloat(it.ratePerSft) || 0) > 0);

  const isValid = customerId && items.every(isItemValid) && (kind === 'job' || dueDate);

  const handleSave = () => {
    if (!isValid) return;

    const payloadItems: NewInvoiceItemInput[] = items.map((it) =>
      it.type === 'glass'
        ? {
            type: 'glass',
            description: it.description.trim(),
            slab: it.slab || null,
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
            slab: it.slab || null,
            quantity: parseFloat(it.quantity) || 0,
            rate: parseFloat(it.rate) || 0,
          }
    );

    addInvoice({
      customerId,
      kind,
      dueDate: kind === 'quick' ? dueDate : null,
      transportation: transportNum,
      items: payloadItems,
    });
    closeInvoiceModal();
  };

  return (
    <div className="modal-overlay is-open" onClick={closeInvoiceModal}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New Invoice</h2>
          <button className="modal-close" onClick={closeInvoiceModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field">
              <label>Customer</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Invoice type</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as InvoiceKind)}>
                <option value="quick">Quick sale</option>
                <option value="job">Job order</option>
              </select>
            </div>
            {kind === 'quick' ? (
              <div className="form-field">
                <label>Due date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            ) : (
              <div className="form-field">
                <label>Due date</label>
                <input type="text" disabled value="Set when marked Completed" />
              </div>
            )}
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
                  <div className="form-field span-2">
                    <label>Description</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(item.key, { description: e.target.value })}
                      placeholder={isGlass ? 'e.g. Shower Cubical — 10mm toughened' : 'e.g. Silicon sealant'}
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

          <div className="form-row">
            <div className="form-field">
              <label>Transportation (₹, optional)</label>
              <input type="number" value={transportation} onChange={(e) => setTransportation(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="row-sub" style={{ marginTop: 6, textAlign: 'right' }}>
            Subtotal: ₹{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            {gstEnabled && <> · CGST+SGST (18%): ₹{gstAmount.toLocaleString('en-IN')}</>}
            {transportNum > 0 && <> · Transport: ₹{transportNum.toLocaleString('en-IN')}</>}
            {' · '}
            <strong style={{ color: 'var(--text)' }}>Total: ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeInvoiceModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!isValid}>
            Save invoice
          </button>
        </div>
      </div>
    </div>
  );
}