import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function VendorModal() {
  const { isVendorModalOpen, closeVendorModal, addVendor } = useApp();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [contact, setContact] = useState('');

  useEffect(() => {
    if (isVendorModalOpen) {
      setName('');
      setCategory('');
      setContact('');
    }
  }, [isVendorModalOpen]);

  if (!isVendorModalOpen) return null;

  const handleSave = () => {
    if (!name || !contact) return;
    addVendor({ name, category: category || 'General', contact });
    closeVendorModal();
  };

  return (
    <div className="modal-overlay is-open" onClick={closeVendorModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New Vendor</h2>
          <button className="modal-close" onClick={closeVendorModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field">
              <label>Vendor name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Prism Glass Supplies"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Raw Material — Sheet Glass"
              />
            </div>
            <div className="form-field">
              <label>Contact number</label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="+91 90000 00000"
              />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeVendorModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save vendor
          </button>
        </div>
      </div>
    </div>
  );
}