import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { PriceListItem } from '../types';

interface PriceListModalProps {
  editingItem: PriceListItem | null;
  onClose: () => void;
}

export default function PriceListModal({ editingItem, onClose }: PriceListModalProps) {
  const { addPriceListItem, updatePriceListItem } = useApp();
  const [description, setDescription] = useState('');
  const [ratePerSft, setRatePerSft] = useState('');
  const [polishRate, setPolishRate] = useState('');
  const [fixingRate, setFixingRate] = useState('');
  const [saving, setSaving] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    // Only re-populate on the open transition, not on every re-render —
    // mirrors the InvoiceModal/QuotationModal tab-switch-reset-guard pattern.
    if (!wasOpenRef.current) {
      if (editingItem) {
        setDescription(editingItem.description);
        setRatePerSft(String(editingItem.ratePerSft));
        setPolishRate(String(editingItem.polishRate));
        setFixingRate(String(editingItem.fixingRate));
      } else {
        setDescription('');
        setRatePerSft('');
        setPolishRate('');
        setFixingRate('');
      }
    }
    wasOpenRef.current = true;
    return () => {
      wasOpenRef.current = false;
    };
  }, [editingItem]);

  const handleSave = async () => {
    if (!description.trim() || !ratePerSft) return;
    setSaving(true);
    const input = {
      description: description.trim(),
      ratePerSft: Number(ratePerSft) || 0,
      polishRate: Number(polishRate) || 0,
      fixingRate: Number(fixingRate) || 0,
    };
    if (editingItem) {
      await updatePriceListItem(editingItem.id, input);
    } else {
      await addPriceListItem(input);
    }
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay is-open" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{editingItem ? 'Edit Product' : 'New Product'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-field">
            <label>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 12mm Tuff"
              autoFocus
            />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Rate per Sft (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={ratePerSft}
                onChange={(e) => setRatePerSft(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Polish Rate (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={polishRate}
                onChange={(e) => setPolishRate(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Fixing Rate (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={fixingRate}
                onChange={(e) => setFixingRate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !description.trim() || !ratePerSft}>
            {saving ? 'Saving…' : editingItem ? 'Save Changes' : 'Add Product'}
          </button>
        </div>
      </div>
    </div>
  );
}