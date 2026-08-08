import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function LinkModal() {
  const { isLinkModalOpen, closeLinkModal, addLink } = useApp();

  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (isLinkModalOpen) {
      setLabel('');
      setUrl('');
      setCategory('');
    }
  }, [isLinkModalOpen]);

  if (!isLinkModalOpen) return null;

  const handleSave = () => {
    if (!label || !url) return;
    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    addLink({ label, url: normalizedUrl, category: category || undefined });
    closeLinkModal();
  };

  return (
    <div className="modal-overlay is-open" onClick={closeLinkModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New Link</h2>
          <button className="modal-close" onClick={closeLinkModal}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field">
              <label>Label</label>
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. GST Portal" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>URL</label>
              <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="e.g. gst.gov.in" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Category (optional)</label>
              <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Government / Supplier / Banking" />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={closeLinkModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save link
          </button>
        </div>
      </div>
    </div>
  );
}