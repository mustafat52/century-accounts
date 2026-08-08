import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function CustomerModal() {
  const { isCustomerModalOpen, closeCustomerModal, addCustomer } = useApp();

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');

  useEffect(() => {
    if (isCustomerModalOpen) {
      setName('');
      setContact('');
      setAddress('');
      setGstin('');
    }
  }, [isCustomerModalOpen]);

  if (!isCustomerModalOpen) return null;

  const handleSave = () => {
    if (!name || !contact) return;
    addCustomer({ name, contact, address: address || undefined, gstin: gstin || undefined });
    closeCustomerModal();
  };

  return (
    <div className="modal-overlay is-open" onClick={closeCustomerModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New Customer</h2>
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
                onChange={(e) => setName(e.target.value)}
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
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop / building, street, area, city"
              />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeCustomerModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save customer
          </button>
        </div>
      </div>
    </div>
  );
}