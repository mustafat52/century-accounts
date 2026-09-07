import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { CareOf } from '../types';
import { capitalizeFirst } from '../utils/format';

const CARE_OF_OPTIONS: CareOf[] = ['Shabbir Bhai', 'Abdul Hussain Bhai', 'Taqi Bhai'];

// Slips no longer collect a unit at all — the field added friction for no
// real benefit, since quantities are always understood in context (pcs,
// box, etc. read naturally off the description). Every slip item still
// needs SOME unit value for the (not-null) database column, so this fixed
// default is submitted silently underneath.
const DEFAULT_UNIT = 'pcs';

interface DraftItem {
  key: string;
  description: string;
  quantity: string;
}

let draftKeyCounter = 0;
function blankItem(): DraftItem {
  draftKeyCounter += 1;
  return { key: `slip-item-${draftKeyCounter}`, description: '', quantity: '' };
}

function isItemValid(it: DraftItem): boolean {
  return Boolean(it.description.trim() && (parseFloat(it.quantity) || 0) > 0);
}

export default function VendorSlipModal({ vendorId, onClose }: { vendorId: string | null; onClose: () => void }) {
  const { vendors, addVendorSlip, openPrint } = useApp();

  const [careOf, setCareOf] = useState<CareOf>('Shabbir Bhai');
  // Optional free text — which customer this material purchase is for, if
  // any. Not tied to the customers list at all: can be anyone, including
  // someone never added as a real customer. Pure reference tag, doesn't
  // touch billing/payments in any way.
  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [saving, setSaving] = useState(false);

  const vendor = vendorId ? vendors.find((v) => v.id === vendorId) : undefined;

  useEffect(() => {
    if (vendorId) {
      setCareOf('Shabbir Bhai');
      setCustomerName('');
      setItems([blankItem()]);
    }
  }, [vendorId]);

  // Auto-add: the moment the last row becomes fully valid, silently
  // append a fresh blank row — same pattern as Invoice/Quotation items,
  // so entering several products in a row never requires clicking
  // "+ Add Item" in between.
  useEffect(() => {
    if (items.length === 0) return;
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
  const isValid = realItems.length > 0;

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
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
          <h2>New Slip (DC)</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="row-sub" style={{ marginBottom: 12 }}>
            A DC number is assigned automatically. No prices are entered here — this slip is for
            requesting quantities, to be printed and sent to the vendor. Prices get entered later,
            once the vendor writes them on the returned slip.
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
                <col style={{ width: 32 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Quantity</th>
                  <th></th>
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
                        onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                        placeholder="0"
                      />
                    </td>
                    <td>
                      <button className="item-table-remove" type="button" onClick={() => removeItem(item.key)} title="Remove">
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-ghost btn-small" onClick={() => setItems((prev) => [...prev, blankItem()])} type="button">
              + Add Item
            </button>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!isValid || saving}>
            {saving ? 'Saving…' : 'Save & Print Slip'}
          </button>
        </div>
      </div>
    </div>
  );
}