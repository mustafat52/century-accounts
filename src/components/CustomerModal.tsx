import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { capitalizeFirst } from '../utils/format';

export default function CustomerModal() {
  const { isCustomerModalOpen, editingCustomerId, closeCustomerModal, customers, addCustomer, updateCustomer } = useApp();

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [saving, setSaving] = useState(false);
  const wasOpenRef = useRef(false);

  const editingCustomer = editingCustomerId ? customers.find((c) => c.id === editingCustomerId) : null;

  useEffect(() => {
    if (isCustomerModalOpen && !wasOpenRef.current) {
      if (editingCustomer) {
        setName(editingCustomer.name);
        setContact(editingCustomer.contact ?? '');
        setAddress(editingCustomer.address ?? '');
        setGstin(editingCustomer.gstin ?? '');
      } else {
        setName('');
        setContact('');
        setAddress('');
        setGstin('');
      }
    }
    wasOpenRef.current = isCustomerModalOpen;
  }, [isCustomerModalOpen, editingCustomer]);

  if (!isCustomerModalOpen) return null;

  const handleSave = async () => {
    if (!name || !contact || saving) return;
    setSaving(true);
    const input = { name, contact, address: address || undefined, gstin: gstin || undefined };
    if (editingCustomerId) {
      await updateCustomer(editingCustomerId, input);
    } else {
      await addCustomer(input);
    }
    setSaving(false);
    closeCustomerModal();
  };

  return (
    // No onClick here anymore — a stray click outside the modal used to
    // wipe out everything typed so far. Now the modal only closes via the
    // explicit × or Cancel button below.
    <div className="modal-overlay is-open">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{editingCustomerId ? 'Edit Customer' : 'New Customer'}</h2>
          <button className="modal-close" onClick={closeCustomerModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field">
              <label>Customer / business name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(capitalizeFirst(e.target.value))}
                placeholder="e.g. Riverside Interiors"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Contact number</label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="+91 90000 00000"
              />
            </div>
            <div className="form-field">
              <label>GSTIN (optional)</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="27ABCDE1234F1Z5"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Address (optional)</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(capitalizeFirst(e.target.value))}
                placeholder="Shop / building, street, area, city"
              />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeCustomerModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!name || !contact || saving}>
            {saving ? 'Saving…' : editingCustomerId ? 'Save changes' : 'Save customer'}
          </button>
        </div>
      </div>
    </div>
  );
}
