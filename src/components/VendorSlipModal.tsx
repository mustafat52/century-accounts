import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { CareOf } from '../types';

const CARE_OF_OPTIONS: CareOf[] = ['Shabbir Bhai', 'Abdul Hussain Bhai', 'Taqi Bhai'];

interface DraftItem {
  key: string;
  description: string;
  quantity: string;
  unit: string;
}

let draftKeyCounter = 0;
function blankItem(): DraftItem {
  draftKeyCounter += 1;
  return { key: `slip-item-${draftKeyCounter}`, description: '', quantity: '', unit: '' };
}

export default function VendorSlipModal({ vendorId, onClose }: { vendorId: string | null; onClose: () => void }) {
  const { addVendorSlip, openPrint } = useApp();

  const [careOf, setCareOf] = useState<CareOf>('Shabbir Bhai');
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vendorId) {
      setCareOf('Shabbir Bhai');
      setItems([blankItem()]);
    }
  }, [vendorId]);

  if (!vendorId) return null;

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  };

  const isItemValid = (it: DraftItem) => it.description.trim() && (parseFloat(it.quantity) || 0) > 0 && it.unit.trim();
  const realItems = items.filter(isItemValid);
  const isValid = realItems.length > 0;

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    const slip = await addVendorSlip({
      vendorId,
      careOf,
      items: realItems.map((it) => ({
        description: it.description.trim(),
        quantity: parseFloat(it.quantity) || 0,
        unit: it.unit.trim(),
      })),
    });
    setSaving(false);
    if (!slip) return;
    onClose();
    // Straight into the printable slip — this is what gets handed to the vendor.
    openPrint('slip', slip.id);
  };

  return (
    <div className="modal-overlay is-open" onClick={onClose}>
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
              <label>Care of</label>
              <select value={careOf} onChange={(e) => setCareOf(e.target.value as CareOf)}>
                {CARE_OF_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 8 }}>
            Items
          </div>

          <div className="item-table-wrap">
            <table className="item-table">
              <colgroup>
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 32 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Quantity</th>
                  <th>Unit</th>
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
                        onChange={(e) => updateItem(item.key, { description: e.target.value })}
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
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => updateItem(item.key, { unit: e.target.value })}
                        placeholder="e.g. pcs, box"
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