import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { CareOf, VendorSlip } from '../types';
import { capitalizeFirst, formatINR } from '../utils/format';

const CARE_OF_OPTIONS: CareOf[] = ['Shabbir Bhai', 'Abdul Hussain Bhai', 'Taqi Bhai'];

// Slips no longer collect a unit at all — the field added friction for no
// real benefit, since quantities are always understood in context (pcs,
// box, etc. read naturally off the description). Every slip item still
// needs SOME unit value for the (not-null) database column, so this fixed
// default is submitted silently underneath.
const DEFAULT_UNIT = 'pcs';

interface DraftItem {
  key: string;
  id?: string; // set for items that already exist on the slip being edited
  unit?: string;
  description: string;
  quantity: string;
  rate: string; // only used when editing an already-priced slip
}

let draftKeyCounter = 0;
function blankItem(): DraftItem {
  draftKeyCounter += 1;
  return { key: `slip-item-${draftKeyCounter}`, description: '', quantity: '', rate: '' };
}

function isItemValid(it: DraftItem): boolean {
  return Boolean(it.description.trim() && (parseFloat(it.quantity) || 0) > 0);
}

// Creates a new slip (editSlip is null/undefined) or edits an existing one.
//  - A slip still waiting for prices can change freely.
//  - A priced slip (settled or not) can always change its labels and item
//    text; quantities and rates only while no payment has been recorded
//    against it, because they feed the amount the vendor is owed.
export default function VendorSlipModal({
  vendorId,
  editSlip,
  onClose,
}: {
  vendorId: string | null;
  editSlip?: VendorSlip | null;
  onClose: () => void;
}) {
  const { vendors, vendorPurchases, addVendorSlip, updateVendorSlip, openPrint } = useApp();

  const [careOf, setCareOf] = useState<CareOf>('Shabbir Bhai');
  // Optional free text — which customer this material purchase is for, if
  // any. Not tied to the customers list at all: can be anyone, including
  // someone never added as a real customer. Pure reference tag, doesn't
  // touch billing/payments in any way.
  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [saving, setSaving] = useState(false);

  const vendor = vendorId ? vendors.find((v) => v.id === vendorId) : undefined;

  const isEditing = !!editSlip;
  const isPriced = !!editSlip && editSlip.status !== 'pending_pricing';
  const purchase = editSlip?.expenseId ? vendorPurchases.find((p) => p.id === editSlip.expenseId) : undefined;
  const moneyLocked = isPriced && !!purchase && purchase.paidAmount > 0;

  useEffect(() => {
    if (!vendorId) return;
    if (editSlip) {
      setCareOf(editSlip.careOf);
      setCustomerName(editSlip.customerName ?? '');
      setItems(
        editSlip.items.map((it) => {
          draftKeyCounter += 1;
          return {
            key: `slip-item-${draftKeyCounter}`,
            id: it.id,
            unit: it.unit,
            description: it.description,
            quantity: String(it.quantity),
            rate: it.rate != null ? String(it.rate) : '',
          };
        })
      );
    } else {
      setCareOf('Shabbir Bhai');
      setCustomerName('');
      setItems([blankItem()]);
    }
  }, [vendorId, editSlip]);

  // Auto-add: the moment the last row becomes fully valid, silently
  // append a fresh blank row — same pattern as Invoice/Quotation items,
  // so entering several products in a row never requires clicking
  // "+ Add Item" in between. Not for priced slips (their item list is fixed).
  useEffect(() => {
    if (isPriced || items.length === 0) return;
    const last = items[items.length - 1];
    if (isItemValid(last)) {
      setItems((prev) => {
        const prevLast = prev[prev.length - 1];
        if (prevLast && prevLast.key === last.key) {
          return [...prev, blankItem()];
        }
        return prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (!vendorId) return null;

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  };

  const realItems = items.filter(isItemValid);
  const ratesOk = !isPriced || moneyLocked || realItems.every((it) => (parseFloat(it.rate) || 0) > 0);
  const isValid = realItems.length > 0 && ratesOk;
  const pricedTotal = realItems.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0), 0);

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);

    if (editSlip) {
      const ok = await updateVendorSlip({
        slipId: editSlip.id,
        careOf,
        customerName: customerName.trim() || null,
        items: realItems.map((it) => ({
          id: it.id,
          description: it.description.trim(),
          quantity: parseFloat(it.quantity) || 0,
          unit: it.unit ?? DEFAULT_UNIT,
          rate: isPriced ? parseFloat(it.rate) || 0 : undefined,
        })),
      });
      setSaving(false);
      if (ok) onClose();
      return;
    }

    const slip = await addVendorSlip({
      vendorId,
      careOf,
      customerName: customerName.trim() || null,
      items: realItems.map((it) => ({
        description: it.description.trim(),
        quantity: parseFloat(it.quantity) || 0,
        unit: DEFAULT_UNIT,
      })),
    });
    setSaving(false);
    if (!slip) return;
    onClose();
    // Straight into the printable slip — this is what gets handed to the vendor.
    openPrint('slip', slip.id);
  };

  return (
    <div className="modal-overlay is-open">
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{isEditing ? `Edit Slip — ${editSlip!.dcNo}` : 'New Slip (DC)'}</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="row-sub" style={{ marginBottom: 12 }}>
            {!isEditing &&
              'A DC number is assigned automatically. No prices are entered here — this slip is for requesting quantities, to be printed and sent to the vendor. Prices get entered later, once the vendor writes them on the returned slip.'}
            {isEditing && !isPriced && 'This slip is still waiting for prices, so everything on it can be changed.'}
            {isEditing && isPriced && !moneyLocked &&
              'This slip has been priced. You can change names, quantities and rates — the amount owed to the vendor updates to match.'}
            {isEditing && isPriced && moneyLocked &&
              'A payment has already been recorded against this slip, so quantities and rates are locked to keep the vendor’s account correct. You can still change the names and descriptions.'}
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Vendor</label>
              <input type="text" disabled value={vendor?.name ?? '—'} />
            </div>
            <div className="form-field">
              <label>Care of</label>
              <select value={careOf} onChange={(e) => setCareOf(e.target.value as CareOf)}>
                {CARE_OF_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Customer (optional)</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(capitalizeFirst(e.target.value))}
                placeholder="e.g. Alekhya, or any name — not tied to the customers list"
              />
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 8 }}>
            Items
          </div>

          <div className="item-table-wrap">
            <table className="item-table">
              <colgroup>
                <col />
                <col style={{ width: 120 }} />
                {isPriced && <col style={{ width: 130 }} />}
                {!isPriced && <col style={{ width: 32 }} />}
              </colgroup>
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Quantity</th>
                  {isPriced && <th className="num">Rate (₹)</th>}
                  {!isPriced && <th></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.key}>
                    <td>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(item.key, { description: capitalizeFirst(e.target.value) })}
                        placeholder="e.g. Hinges, 4 inch"
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        value={item.quantity}
                        disabled={moneyLocked}
                        onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                        placeholder="0"
                      />
                    </td>
                    {isPriced && (
                      <td className="num">
                        <input
                          type="number"
                          value={item.rate}
                          disabled={moneyLocked}
                          onChange={(e) => updateItem(item.key, { rate: e.target.value })}
                          placeholder="0.00"
                        />
                      </td>
                    )}
                    {!isPriced && (
                      <td>
                        <button className="item-table-remove" type="button" onClick={() => removeItem(item.key)} title="Remove">
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isPriced && !moneyLocked && (
            <div className="row-sub" style={{ marginBottom: 12, textAlign: 'right' }}>
              New total: <strong>{formatINR(pricedTotal)}</strong>
            </div>
          )}

          {!isPriced && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-ghost btn-small" onClick={() => setItems((prev) => [...prev, blankItem()])} type="button">
                + Add Item
              </button>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!isValid || saving}>
            {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Save & Print Slip'}
          </button>
        </div>
      </div>
    </div>
  );
}