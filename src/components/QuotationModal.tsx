import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
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

  const editingQuotation = editingQuotationId ? quotations.find((q) => q.dbId === editingQuotationId) : undefined;
  const isEditing = Boolean(editingQuotation);

  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [validUntil, setValidUntil] = useState(defaultValidUntil());

  useEffect(() => {
    if (!isQuotationModalOpen) return;
    if (editingQuotation) {
      setCustomerId(editingQuotation.customerId);
      setDescription(editingQuotation.description);
      setAmount(String(editingQuotation.amount));
      setValidUntil(editingQuotation.validUntil);
    } else {
      setCustomerId(quotationModalCustomerId ?? customers[0]?.id ?? '');
      setDescription('');
      setAmount('');
      setValidUntil(defaultValidUntil());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuotationModalOpen, editingQuotationId, quotationModalCustomerId]);

  if (!isQuotationModalOpen) return null;

  const amountNum = parseFloat(amount) || 0;
  const gstAmount = gstEnabled ? Math.round(amountNum * 0.18) : 0;

  const handleSave = () => {
    if (!description || amountNum <= 0 || !validUntil) return;
    if (isEditing && editingQuotationId) {
      updateQuotation(editingQuotationId, { description, amount: amountNum, validUntil });
    } else {
      if (!customerId) return;
      addQuotation({ customerId, description, amount: amountNum, validUntil });
    }
    closeQuotationModal();
  };

  return (
    <div className="modal-overlay is-open" onClick={closeQuotationModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{isEditing ? 'Edit Quotation' : 'New Quotation'}</h2>
          <button className="modal-close" onClick={closeQuotationModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field">
              <label>Customer</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                disabled={isEditing}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Balcony glass railing — 18 ft run"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Quoted amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="form-field">
              <label>GST (18%){!gstEnabled && ' — disabled'}</label>
              <input type="text" disabled value={gstEnabled ? `₹${gstAmount.toLocaleString('en-IN')}` : '—'} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Valid until</label>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>

          {isEditing && (
            <div className="row-sub">Prices can shift before the customer confirms — update the amount here anytime while it's still pending.</div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeQuotationModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            {isEditing ? 'Save changes' : 'Save quotation'}
          </button>
        </div>
      </div>
    </div>
  );
}