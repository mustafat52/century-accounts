import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

export default function VendorModal() {
  const { isVendorModalOpen, editingVendorId, closeVendorModal, vendors, addVendor, updateVendor } = useApp();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [contact, setContact] = useState('');
  const [saving, setSaving] = useState(false);
  const wasOpenRef = useRef(false);

  const editingVendor = editingVendorId ? vendors.find((v) => v.id === editingVendorId) : null;

  useEffect(() => {
    if (isVendorModalOpen && !wasOpenRef.current) {
      if (editingVendor) {
        setName(editingVendor.name);
        setCategory(editingVendor.category);
        setContact(editingVendor.contact);
      } else {
        setName('');
        setCategory('');
        setContact('');
      }
    }
    wasOpenRef.current = isVendorModalOpen;
  }, [isVendorModalOpen, editingVendor]);

  if (!isVendorModalOpen) return null;

  const handleSave = async () => {
    if (!name || !contact || saving) return;
    setSaving(true);
    const input = { name, category: category || 'General', contact };
    if (editingVendorId) {
      await updateVendor(editingVendorId, input);
    } else {
      await addVendor(input);
    }
    setSaving(false);
    closeVendorModal();
  };

  return (
    <div className="modal-overlay is-open" onClick={closeVendorModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{editingVendorId ? 'Edit Vendor' : 'New Vendor'}</h2>
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
          <button className="btn btn-primary" onClick={handleSave} disabled={!name || !contact || saving}>
            {saving ? 'Saving…' : editingVendorId ? 'Save changes' : 'Save vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}