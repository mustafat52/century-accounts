import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { NewQuotationItemInput } from '../context/AppContext';
import type { InvoiceSlab } from '../types';
import { SLAB_DISCOUNT_PERCENT } from '../types';

interface DraftItem {
  key: string;
  type: 'glass' | 'simple';
  description: string;
  area: string;
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

// Reload an existing quotation's saved items (from fetchQuotationItems)
// back into editable draft rows — this is what makes Edit actually start
// from what's really saved instead of an empty form.
function itemInputToDraft(i: NewQuotationItemInput): DraftItem {
  draftKeyCounter += 1;
  if (i.type === 'glass') {
    return {
      key: `qitem-${draftKeyCounter}`,
      type: 'glass',
      description: i.description,
      area: i.area ?? '',
      thicknessMm: i.thicknessMm ?? '',
      quantity: '1',
      rate: '',
      lengthIn: String(i.lengthIn),
      widthIn: String(i.widthIn),
      glassQty: String(i.qty),
      ratePerSft: String(i.ratePerSft),
      polishRate: i.polishRate ? String(i.polishRate) : '',
      fixingRatePerSft: i.fixingRatePerSft ? String(i.fixingRatePerSft) : '',
    };
  }
  return {
    key: `qitem-${draftKeyCounter}`,
    type: 'simple',
    description: i.description,
    area: i.area ?? '',
    thicknessMm: '',
    quantity: String(i.quantity),
    rate: String(i.rate),
    lengthIn: '',
    widthIn: '',
    glassQty: '1',
    ratePerSft: '',
    polishRate: '',
    fixingRatePerSft: '',
  };
}

// Glass is billed in 6-inch increments — length/width round UP to the next
// multiple of 6, never to the nearest one (46in bills as 48in). Must match
// AppContext's quotation math exactly (same rule invoices use), or the
// preview shown here would disagree with what actually gets saved.
const roundUpTo6 = (n: number) => (n > 0 ? Math.ceil(n / 6) * 6 : 0);

function computeGlassAmount(it: DraftItem) {
  const len = roundUpTo6(parseFloat(it.lengthIn) || 0);
  const wid = roundUpTo6(parseFloat(it.widthIn) || 0);
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

// ---- Fuzzy customer-name matching (plain Levenshtein, no dependency) ----
// Same helper as InvoiceModal — duplicated rather than shared, since it's
// small and each modal's usage needs to stay independently correct. Catches
// near-misses like "Grand Vista Hotel" vs the real "Grand Vista Hotels"
// before they silently become a duplicate customer.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function findFuzzyCustomerMatch(typed: string, customers: { id: string; name: string }[]) {
  const norm = normalizeName(typed);
  if (norm.length < 3) return null; // too short to mean anything, avoid noisy hints while typing
  let best: { id: string; name: string } | null = null;
  let bestDist = Infinity;
  for (const c of customers) {
    const cn = normalizeName(c.name);
    if (cn === norm) return null; // exact match — no hint needed, this is handled elsewhere
    const dist = levenshtein(norm, cn);
    const threshold = Math.max(2, Math.floor(cn.length * 0.25)); // allow ~25% of the name to differ
    if (dist <= threshold && dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

export default function QuotationModal() {
  const {
    isQuotationModalOpen,
    quotationModalCustomerId,
    editingQuotationId,
    closeQuotationModal,
    customers,
    addCustomer,
    quotations,
    addQuotation,
    updateQuotation,
    fetchQuotationItems,
    gstEnabled,
    priceList,
  } = useApp();

  const [customerName, setCustomerName] = useState('');
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [slab, setSlab] = useState<InvoiceSlab>('A');
  const [customDiscount, setCustomDiscount] = useState('0');
  const [transportation, setTransportation] = useState('');
  const [items, setItems] = useState<DraftItem[]>([blankItem('simple')]);
  const [saving, setSaving] = useState(false);
  const wasOpenRef = useRef(false);

  const editingQuotation = editingQuotationId ? quotations.find((q) => q.dbId === editingQuotationId) : null;

  useEffect(() => {
    if (isQuotationModalOpen && !wasOpenRef.current) {
      if (editingQuotation) {
        const existing = customers.find((c) => c.id === editingQuotation.customerId);
        setCustomerName(existing?.name ?? '');
        setValidUntil(editingQuotation.validUntil);
        setSlab(editingQuotation.slab);
        setCustomDiscount(editingQuotation.slab === 'D' ? String(editingQuotation.discountPercent) : '0');
        setTransportation(editingQuotation.transportation > 0 ? String(editingQuotation.transportation) : '');
        // Reload the quotation's real saved items into the form — without
        // this, "Edit" opens with no items at all.
        fetchQuotationItems(editingQuotation.dbId).then((loaded) => {
          setItems(loaded.length > 0 ? loaded.map(itemInputToDraft) : [blankItem('simple')]);
        });
      } else {
        const preset = quotationModalCustomerId ? customers.find((c) => c.id === quotationModalCustomerId) : null;
        setCustomerName(preset?.name ?? '');
        setValidUntil(defaultValidUntil());
        setSlab('A');
        setCustomDiscount('0');
        setTransportation('');
        setItems([blankItem('simple')]);
      }
    }
    wasOpenRef.current = isQuotationModalOpen;
  }, [isQuotationModalOpen, quotationModalCustomerId, editingQuotation, customers, fetchQuotationItems]);

  if (!isQuotationModalOpen) return null;

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const updateDescription = (key: string, value: string) => {
    // Same shortcut as InvoiceModal: typing a name that exactly matches a
    // price-list entry auto-fills the rate fields.
    const match = priceList.find((p) => p.description.trim().toLowerCase() === value.trim().toLowerCase());
    if (match) {
      updateItem(key, {
        description: value,
        ratePerSft: String(match.ratePerSft),
        polishRate: String(match.polishRate),
        fixingRatePerSft: String(match.fixingRate),
      });
    } else {
      updateItem(key, { description: value });
    }
  };

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  };

  const subtotal = items.reduce((sum, it) => sum + computeItemAmount(it), 0);
  const discountPercent = slab === 'D' ? parseFloat(customDiscount) || 0 : SLAB_DISCOUNT_PERCENT[slab];
  const discountAmount = subtotal * (discountPercent / 100);
  const taxableValue = subtotal - discountAmount;
  const gstAmount = gstEnabled ? Math.round(taxableValue * 0.18) : 0;
  const transportNum = parseFloat(transportation) || 0;
  const grandTotal = taxableValue + gstAmount + transportNum;

  const isItemValid = (it: DraftItem) =>
    it.description.trim() &&
    (it.type === 'simple'
      ? (parseFloat(it.quantity) || 0) > 0 && (parseFloat(it.rate) || 0) > 0
      : (parseFloat(it.lengthIn) || 0) > 0 &&
        (parseFloat(it.widthIn) || 0) > 0 &&
        (parseFloat(it.glassQty) || 0) > 0 &&
        (parseFloat(it.ratePerSft) || 0) > 0);

  const fuzzyCustomerMatch = findFuzzyCustomerMatch(customerName, customers);
  const isValid = customerName.trim() && validUntil && items.every(isItemValid);

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);

    // Match against existing customers by name (case-insensitive, exact) —
    // same shortcut pattern as InvoiceModal and the product datalist. No
    // match means this is a new customer: create them with just the typed
    // name, contact info can be filled in later from the Customers page.
    // The customer field is disabled while editing, so this always
    // resolves back to the same existing customer in that case.
    const trimmedName = customerName.trim();
    const existing = customers.find((c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase());
    let customerId = existing?.id ?? null;

    if (!customerId) {
      const created = await addCustomer({ name: trimmedName });
      if (!created) {
        setSaving(false);
        return;
      }
      customerId = created.id;
    }

    const payloadItems: NewQuotationItemInput[] = items.map((it) =>
      it.type === 'glass'
        ? {
            type: 'glass',
            description: it.description.trim(),
            area: it.area.trim() || null,
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
            quantity: parseFloat(it.quantity) || 0,
            rate: parseFloat(it.rate) || 0,
          }
    );

    if (editingQuotationId) {
      await updateQuotation(editingQuotationId, { validUntil, slab, discountPercent, transportation: transportNum, items: payloadItems });
    } else {
      await addQuotation({ customerId, validUntil, slab, discountPercent, transportation: transportNum, items: payloadItems });
    }
    setSaving(false);
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
              <input
                type="text"
                list="customer-options"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Pick a customer or type a new name"
                disabled={!!editingQuotationId}
              />
              <datalist id="customer-options">
                {customers.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
              {fuzzyCustomerMatch && !editingQuotationId && (
                <div className="row-sub" style={{ marginTop: 4 }}>
                  Did you mean{' '}
                  <button
                    type="button"
                    className="inline-suggest-link"
                    onClick={() => setCustomerName(fuzzyCustomerMatch.name)}
                  >
                    {fuzzyCustomerMatch.name}
                  </button>
                  ? (existing customer)
                </div>
              )}
            </div>
            <div className="form-field">
              <label>Valid until</label>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
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
            <div className="form-field">
              <label>Transportation (₹, optional)</label>
              <input type="number" value={transportation} onChange={(e) => setTransportation(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="row-sub" style={{ marginBottom: 8 }}>
            Stays editable while this quotation is pending — adjust the slab as the price gets
            negotiated with the customer.
          </div>

          <div className="section-title" style={{ marginTop: 8 }}>
            Items
          </div>

          <datalist id="price-list-options">
            {priceList.map((p) => (
              <option key={p.id} value={p.description} />
            ))}
          </datalist>

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
                    <label>Area</label>
                    <input
                      type="text"
                      value={item.area}
                      onChange={(e) => updateItem(item.key, { area: e.target.value })}
                      placeholder="e.g. Bar Counter, MBR Shower"
                    />
                  </div>
                  <div className="form-field span-2">
                    <label>Description of Goods</label>
                    <input
                      type="text"
                      list="price-list-options"
                      value={item.description}
                      onChange={(e) => updateDescription(item.key, e.target.value)}
                      placeholder={isGlass ? 'e.g. Grey mirror + CP' : 'e.g. Silicon sealant'}
                    />
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
            {discountPercent > 0 && <> · Slab {slab} discount ({discountPercent}%): −₹{discountAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</>}
            {gstEnabled && <> · CGST+SGST (18%): ₹{gstAmount.toLocaleString('en-IN')}</>}
            {transportNum > 0 && <> · Transport: ₹{transportNum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</>}
            {' · '}
            <strong style={{ color: 'var(--text)' }}>Total: ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeQuotationModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!isValid || saving}>
            {saving ? 'Saving…' : editingQuotationId ? 'Save changes' : 'Save quotation'}
          </button>
        </div>
      </div>
    </div>
  );
}