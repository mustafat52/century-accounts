import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { NewQuotationItemInput } from '../context/AppContext';
import type { InvoiceSlab } from '../types';
import { SLAB_DISCOUNT_PERCENT } from '../types';
import { capitalizeFirst } from '../utils/format';

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

  return { len, wid, sft, rft, amount: workGlass + polish + fixing };
}

function computeSimpleAmount(it: DraftItem) {
  return (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
}

function computeItemAmount(it: DraftItem): number {
  return it.type === 'glass' ? computeGlassAmount(it).amount : computeSimpleAmount(it);
}

function isItemValid(it: DraftItem): boolean {
  return Boolean(
    it.description.trim() &&
      (it.type === 'simple'
        ? (parseFloat(it.quantity) || 0) > 0 && (parseFloat(it.rate) || 0) > 0
        : (parseFloat(it.lengthIn) || 0) > 0 &&
          (parseFloat(it.widthIn) || 0) > 0 &&
          (parseFloat(it.glassQty) || 0) > 0 &&
          (parseFloat(it.ratePerSft) || 0) > 0)
  );
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

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

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
  const [slab, setSlab] = useState<InvoiceSlab>('D');
  const [customDiscount, setCustomDiscount] = useState('0');
  const [transportation, setTransportation] = useState('');
  const [items, setItems] = useState<DraftItem[]>([blankItem('simple')]);
  // Which item-type table is currently shown while editing. Purely a
  // display filter — the saved quotation always combines items of both
  // types from the underlying `items` array regardless of which tab is
  // active when it's saved. Mirrors InvoiceModal exactly.
  const [activeTab, setActiveTab] = useState<'glass' | 'simple'>('simple');
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
        setActiveTab('simple');
        // Reload the quotation's real saved items into the form — without
        // this, "Edit" opens with no items at all.
        fetchQuotationItems(editingQuotation.dbId).then((loaded) => {
          setItems(loaded.length > 0 ? loaded.map(itemInputToDraft) : [blankItem('simple')]);
        });
      } else {
        const preset = quotationModalCustomerId ? customers.find((c) => c.id === quotationModalCustomerId) : null;
        setCustomerName(preset?.name ?? '');
        setValidUntil(defaultValidUntil());
        setSlab('D');
        setCustomDiscount('0');
        setTransportation('');
        setItems([blankItem('simple')]);
        setActiveTab('simple');
      }
    }
    wasOpenRef.current = isQuotationModalOpen;
  }, [isQuotationModalOpen, quotationModalCustomerId, editingQuotation, customers, fetchQuotationItems]);

  // Auto-add: the moment the last row OF A GIVEN TYPE becomes fully valid,
  // silently append a fresh blank row of that same type. Tracked
  // independently per type (glass vs simple), matching InvoiceModal — this
  // is new behavior for Quotation, which previously required clicking
  // "+ Add" for every single row.
  useEffect(() => {
    (['glass', 'simple'] as const).forEach((t) => {
      const ofType = items.filter((i) => i.type === t);
      if (ofType.length === 0) return;
      const last = ofType[ofType.length - 1];
      if (isItemValid(last)) {
        setItems((prev) => {
          const prevOfType = prev.filter((i) => i.type === t);
          const prevLast = prevOfType[prevOfType.length - 1];
          if (prevLast && prevLast.key === last.key) {
            return [...prev, blankItem(t)];
          }
          return prev;
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (!isQuotationModalOpen) return null;

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const updateDescription = (key: string, rawValue: string) => {
    const value = capitalizeFirst(rawValue);
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

  // Keep at least one row of whichever type is being removed from —
  // removing the last row of the tab you're looking at is blocked, but
  // doesn't block removal just because the other tab still has rows.
  const removeItem = (key: string) => {
    setItems((prev) => {
      const item = prev.find((it) => it.key === key);
      if (!item) return prev;
      const sameTypeCount = prev.filter((it) => it.type === item.type).length;
      if (sameTypeCount <= 1) return prev;
      return prev.filter((it) => it.key !== key);
    });
  };

  // Switching to a tab with zero items of that type auto-adds one blank
  // row immediately, so the tab is never empty and typing can start right away.
  const switchTab = (t: 'glass' | 'simple') => {
    setActiveTab(t);
    setItems((prev) => (prev.some((it) => it.type === t) ? prev : [...prev, blankItem(t)]));
  };

  const subtotal = items.reduce((sum, it) => sum + computeItemAmount(it), 0);
  const discountPercent = slab === 'D' ? parseFloat(customDiscount) || 0 : SLAB_DISCOUNT_PERCENT[slab];
  const discountAmount = subtotal * (discountPercent / 100);
  const taxableValue = subtotal - discountAmount;
  const gstAmount = gstEnabled ? Math.round(taxableValue * 0.18) : 0;
  const transportNum = parseFloat(transportation) || 0;
  const grandTotal = taxableValue + gstAmount + transportNum;

  // Only rows that are actually filled in count toward validity/saving —
  // the trailing auto-added blank draft row of each type is expected to be
  // invalid and must NOT block saving (unlike the old item-card version,
  // which never auto-added rows so requiring every row to be valid was
  // safe there).
  const realItems = items.filter(isItemValid);
  const fuzzyCustomerMatch = findFuzzyCustomerMatch(customerName, customers);
  const isValid = customerName.trim() && validUntil && realItems.length > 0;

  // Counts shown on the tab labels — valid/filled items only, so the
  // trailing auto-added blank draft row of each type never counts.
  const simpleCount = items.filter((it) => it.type === 'simple' && isItemValid(it)).length;
  const glassCount = items.filter((it) => it.type === 'glass' && isItemValid(it)).length;
  const visibleItems = items.filter((it) => it.type === activeTab);

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

    const payloadItems: NewQuotationItemInput[] = realItems.map((it) =>
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
    // No onClick here anymore — a stray click outside the modal used to
    // wipe out a whole in-progress quotation. Now it only closes via the
    // explicit × or Cancel button below.
    <div className="modal-overlay is-open">
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
                onChange={(e) => setCustomerName(capitalizeFirst(e.target.value))}
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

          {/* ---- Type tabs: purely a display filter over `items` ---- */}
          <div className="chip-row">
            <button
              type="button"
              className={`chip${activeTab === 'simple' ? ' is-active' : ''}`}
              onClick={() => switchTab('simple')}
            >
              Hardware / Simple ({simpleCount})
            </button>
            <button
              type="button"
              className={`chip${activeTab === 'glass' ? ' is-active' : ''}`}
              onClick={() => switchTab('glass')}
            >
              Glass (by size) ({glassCount})
            </button>
          </div>

          <div className="item-table-wrap">
            <table className="item-table">
              {activeTab === 'glass' ? (
                <colgroup>
                  <col style={{ width: 100 }} />
                  <col />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 56 }} />
                  <col style={{ width: 84 }} />
                  <col style={{ width: 76 }} />
                  <col style={{ width: 76 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 32 }} />
                </colgroup>
              ) : (
                <colgroup>
                  <col style={{ width: 120 }} />
                  <col />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 32 }} />
                </colgroup>
              )}
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Description of Goods</th>
                  {activeTab === 'glass' && <th>Thickness (mm)</th>}
                  {activeTab === 'glass' && <th className="num">L (in)</th>}
                  {activeTab === 'glass' && <th className="num">W (in)</th>}
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  {activeTab === 'glass' && <th className="num">Polish</th>}
                  {activeTab === 'glass' && <th className="num">Fixing</th>}
                  <th className="num">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const isGlass = item.type === 'glass';
                  const glassCalc = isGlass ? computeGlassAmount(item) : null;
                  const amount = computeItemAmount(item);

                  return (
                    <tr key={item.key}>
                      <td>
                        <input
                          type="text"
                          value={item.area}
                          onChange={(e) => updateItem(item.key, { area: capitalizeFirst(e.target.value) })}
                          placeholder="e.g. Bar Counter, MBR Shower"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          list="price-list-options"
                          value={item.description}
                          onChange={(e) => updateDescription(item.key, e.target.value)}
                          placeholder={isGlass ? 'e.g. Grey mirror + CP' : 'e.g. Silicon sealant'}
                        />
                      </td>
                      {isGlass && (
                        <td>
                          <input
                            type="text"
                            value={item.thicknessMm}
                            onChange={(e) => updateItem(item.key, { thicknessMm: capitalizeFirst(e.target.value) })}
                            placeholder="e.g. 12mm"
                          />
                        </td>
                      )}
                      {isGlass && (
                        <td className="num">
                          <input type="number" value={item.lengthIn} onChange={(e) => updateItem(item.key, { lengthIn: e.target.value })} />
                        </td>
                      )}
                      {isGlass && (
                        <td className="num">
                          <input type="number" value={item.widthIn} onChange={(e) => updateItem(item.key, { widthIn: e.target.value })} />
                        </td>
                      )}
                      <td className="num">
                        <input
                          type="number"
                          value={isGlass ? item.glassQty : item.quantity}
                          onChange={(e) => updateItem(item.key, isGlass ? { glassQty: e.target.value } : { quantity: e.target.value })}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          value={isGlass ? item.ratePerSft : item.rate}
                          onChange={(e) => updateItem(item.key, isGlass ? { ratePerSft: e.target.value } : { rate: e.target.value })}
                        />
                      </td>
                      {isGlass && (
                        <td className="num">
                          <input type="number" value={item.polishRate} onChange={(e) => updateItem(item.key, { polishRate: e.target.value })} />
                        </td>
                      )}
                      {isGlass && (
                        <td className="num">
                          <input type="number" value={item.fixingRatePerSft} onChange={(e) => updateItem(item.key, { fixingRatePerSft: e.target.value })} />
                        </td>
                      )}
                      <td className="num item-table-amount">
                        {money(amount)}
                        {isGlass && glassCalc && (glassCalc.len > 0 || glassCalc.wid > 0) && (
                          <span className="item-table-sub">
                            {glassCalc.len}×{glassCalc.wid}in · {glassCalc.sft.toFixed(2)} sft · {glassCalc.rft.toFixed(2)} rft
                          </span>
                        )}
                      </td>
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

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn btn-ghost btn-small" onClick={() => setItems((prev) => [...prev, blankItem(activeTab)])} type="button">
              + Add Item
            </button>
          </div>

          <div className="row-sub" style={{ marginTop: 6, textAlign: 'right', lineHeight: 1.8 }}>
            Subtotal: {money(subtotal)}
            {discountPercent > 0 && <> · Slab {slab} discount ({discountPercent}%): −{money(discountAmount)}</>}
            {gstEnabled && <> · CGST+SGST (18%): {money(gstAmount)}</>}
            {transportNum > 0 && <> · Transport: {money(transportNum)}</>}
            <br />
            <strong style={{ color: 'var(--text)', fontSize: 16 }}>Total: {money(grandTotal)}</strong>
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
