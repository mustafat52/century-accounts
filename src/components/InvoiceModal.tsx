import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { NewInvoiceItemInput } from '../context/AppContext';
import type { InvoiceKind, InvoiceSlab } from '../types';
import { SLAB_DISCOUNT_PERCENT } from '../types';

interface DraftItem {
  key: string;
  type: 'glass' | 'simple';
  description: string;
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

// Glass is billed in 6-inch increments — length/width round UP to the next
// multiple of 6, never to the nearest one (46in bills as 48in). Must match
// AppContext.addInvoice's identical rounding exactly, or the preview shown
// here would disagree with what actually gets saved.
const roundUpTo6 = (n: number) => (n > 0 ? Math.ceil(n / 6) * 6 : 0);

// ---- Fuzzy customer-name matching (plain Levenshtein, no dependency) ----
// Catches near-misses like "Grand Vista Hotel" vs the real "Grand Vista
// Hotels" before they silently become a duplicate customer.
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

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function InvoiceModal() {
  const {
    isInvoiceModalOpen,
    invoiceModalCustomerId,
    closeInvoiceModal,
    customers,
    addCustomer,
    addInvoice,
    gstEnabled,
    priceList,
  } = useApp();

  const [customerName, setCustomerName] = useState('');
  const [kind, setKind] = useState<InvoiceKind>('quick');
  const [dueDate, setDueDate] = useState('');
  const [slab, setSlab] = useState<InvoiceSlab>('A');
  const [customDiscount, setCustomDiscount] = useState('0');
  const [transportation, setTransportation] = useState('');
  const [items, setItems] = useState<DraftItem[]>([blankItem('simple')]);
  const [saving, setSaving] = useState(false);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isInvoiceModalOpen && !wasOpenRef.current) {
      const preset = invoiceModalCustomerId ? customers.find((c) => c.id === invoiceModalCustomerId) : null;
      setCustomerName(preset?.name ?? '');
      setKind('quick');
      setDueDate('');
      setSlab('A');
      setCustomDiscount('0');
      setTransportation('');
      setItems([blankItem('simple')]);
    }
    wasOpenRef.current = isInvoiceModalOpen;
  }, [isInvoiceModalOpen, invoiceModalCustomerId, customers]);

  // Auto-add: the moment the last row becomes fully valid, silently append
  // a fresh blank row of the same type — no clicking "+ Add" needed for the
  // common case of entering several similar items in a row. The newly
  // added row is blank (invalid), so this settles after one append and
  // won't loop.
  useEffect(() => {
    if (items.length === 0) return;
    const last = items[items.length - 1];
    if (isItemValid(last)) {
      setItems((prev) => [...prev, blankItem(last.type)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (!isInvoiceModalOpen) return null;

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const updateDescription = (key: string, value: string) => {
    // Typing a name that exactly matches a price-list entry (from picking
    // the native datalist suggestion, or just typing it out) auto-fills
    // the rate fields — same shortcut as the old dropdown, just typable.
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
  const gstAmount = gstEnabled ? taxableValue * 0.18 : 0;
  const transportNum = parseFloat(transportation) || 0;
  const grandTotal = taxableValue + gstAmount + transportNum;

  const realItems = items.filter(isItemValid);
  const fuzzyCustomerMatch = findFuzzyCustomerMatch(customerName, customers);
  const isValid = customerName.trim() && realItems.length > 0 && (kind === 'job' || dueDate);

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);

    // Match against existing customers by name (case-insensitive, exact) —
    // same shortcut pattern as the product datalist. No match means this
    // is a new/walk-in customer: create them with just the typed name,
    // contact info can be filled in later from the Customers page.
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

    const payloadItems: NewInvoiceItemInput[] = realItems.map((it) =>
      it.type === 'glass'
        ? {
            type: 'glass',
            description: it.description.trim(),
            lengthIn: roundUpTo6(parseFloat(it.lengthIn) || 0),
            widthIn: roundUpTo6(parseFloat(it.widthIn) || 0),
            qty: parseFloat(it.glassQty) || 0,
            ratePerSft: parseFloat(it.ratePerSft) || 0,
            polishRate: parseFloat(it.polishRate) || 0,
            fixingRatePerSft: parseFloat(it.fixingRatePerSft) || 0,
          }
        : {
            type: 'simple',
            description: it.description.trim(),
            quantity: parseFloat(it.quantity) || 0,
            rate: parseFloat(it.rate) || 0,
          }
    );

    await addInvoice({
      customerId,
      kind,
      dueDate: kind === 'quick' ? dueDate : null,
      transportation: transportNum,
      slab,
      discountPercent,
      items: payloadItems,
    });
    setSaving(false);
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
          {/* ---- Bill-level details: customer, type, due date, slab ---- */}
          <div className="form-row">
            <div className="form-field">
              <label>Customer</label>
              <input
                type="text"
                list="customer-options"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Pick a customer or type a new name"
              />
              <datalist id="customer-options">
                {customers.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
              {fuzzyCustomerMatch && (
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

          <div className="section-title" style={{ marginTop: 8 }}>
            Items
          </div>

          <datalist id="price-list-options">
            {priceList.map((p) => (
              <option key={p.id} value={p.description} />
            ))}
          </datalist>

          <div className="item-table-wrap">
            <table className="item-table">
              <colgroup>
                <col style={{ width: 56 }} />
                <col />
                <col style={{ width: 70 }} />
                <col style={{ width: 70 }} />
                <col style={{ width: 56 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 76 }} />
                <col style={{ width: 76 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 32 }} />
              </colgroup>
              <thead>
                <tr>
                  <th></th>
                  <th>Product / Description</th>
                  <th className="num">L (in)</th>
                  <th className="num">W (in)</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Polish</th>
                  <th className="num">Fixing</th>
                  <th className="num">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isGlass = item.type === 'glass';
                  const glassCalc = isGlass ? computeGlassAmount(item) : null;
                  const amount = computeItemAmount(item);

                  return (
                    <tr key={item.key}>
                      <td>
                        <div className="item-table-type-toggle">
                          <button
                            type="button"
                            className={`item-table-type-btn${!isGlass ? ' is-active' : ''}`}
                            title="Hardware / Simple"
                            onClick={() => updateItem(item.key, { type: 'simple' })}
                          >
                            HW
                          </button>
                          <button
                            type="button"
                            className={`item-table-type-btn${isGlass ? ' is-active' : ''}`}
                            title="Glass (by size)"
                            onClick={() => updateItem(item.key, { type: 'glass' })}
                          >
                            GL
                          </button>
                        </div>
                      </td>
                      <td>
                        <input
                          type="text"
                          list="price-list-options"
                          value={item.description}
                          onChange={(e) => updateDescription(item.key, e.target.value)}
                          placeholder={isGlass ? 'Pick a product or type a custom description' : 'e.g. Silicon sealant'}
                        />
                      </td>
                      {isGlass ? (
                        <>
                          <td className="num">
                            <input type="number" value={item.lengthIn} onChange={(e) => updateItem(item.key, { lengthIn: e.target.value })} />
                          </td>
                          <td className="num">
                            <input type="number" value={item.widthIn} onChange={(e) => updateItem(item.key, { widthIn: e.target.value })} />
                          </td>
                          <td className="num">
                            <input type="number" value={item.glassQty} onChange={(e) => updateItem(item.key, { glassQty: e.target.value })} />
                          </td>
                          <td className="num">
                            <input type="number" value={item.ratePerSft} onChange={(e) => updateItem(item.key, { ratePerSft: e.target.value })} />
                          </td>
                          <td className="num">
                            <input type="number" value={item.polishRate} onChange={(e) => updateItem(item.key, { polishRate: e.target.value })} />
                          </td>
                          <td className="num">
                            <input type="number" value={item.fixingRatePerSft} onChange={(e) => updateItem(item.key, { fixingRatePerSft: e.target.value })} />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="num"><input type="text" disabled value="—" /></td>
                          <td className="num"><input type="text" disabled value="—" /></td>
                          <td className="num">
                            <input type="number" value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: e.target.value })} />
                          </td>
                          <td className="num">
                            <input type="number" value={item.rate} onChange={(e) => updateItem(item.key, { rate: e.target.value })} />
                          </td>
                          <td className="num"><input type="text" disabled value="—" /></td>
                          <td className="num"><input type="text" disabled value="—" /></td>
                        </>
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
            <button className="btn btn-ghost btn-small" onClick={() => setItems((prev) => [...prev, blankItem('simple')])} type="button">
              + Add Hardware Item
            </button>
            <button className="btn btn-ghost btn-small" onClick={() => setItems((prev) => [...prev, blankItem('glass')])} type="button">
              + Add Glass Item
            </button>
          </div>

          {/* ---- Totals breakdown ---- */}
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
          <button className="btn btn-ghost" onClick={closeInvoiceModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!isValid || saving}>
            {saving ? 'Saving…' : 'Save invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}