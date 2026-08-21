import { useState } from 'react';
import Topbar from '../components/Topbar';
import PriceListModal from '../components/PriceListModal';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import type { PriceListItem } from '../types';

export default function PriceList() {
  const { priceList, deletePriceListItem } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PriceListItem | null>(null);

  const openAdd = () => {
    setEditingItem(null);
    setModalOpen(true);
  };

  const openEdit = (item: PriceListItem) => {
    setEditingItem(item);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
  };

  const handleDelete = (item: PriceListItem) => {
    if (window.confirm(`Remove "${item.description}" from the price list? This won't affect any past invoices.`)) {
      deletePriceListItem(item.id);
    }
  };

  return (
    <>
      <Topbar
        title="Price List"
        subtitle="Glass rate catalog — used to auto-fill items on new invoices"
      />
      <div className="view-body">
        <div className="panel">
          <div className="panel-head">
            <h3>Products</h3>
            <button className="btn btn-primary btn-small desktop-only" onClick={openAdd}>
              + Add Product
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Rate per Sft</th>
                <th>Polish Rate</th>
                <th>Fixing Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {priceList.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td className="num">{formatINR(item.ratePerSft)}</td>
                  <td className="num">{formatINR(item.polishRate)}</td>
                  <td className="num">{formatINR(item.fixingRate)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-small desktop-only" onClick={() => openEdit(item)}>Edit</button>
                      <button className="btn btn-ghost btn-small desktop-only" onClick={() => handleDelete(item)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {priceList.length === 0 && (
            <div style={{ padding: 20 }} className="row-sub">
              No products yet — add your first rate to start using the dropdown on invoices.
            </div>
          )}
        </div>
      </div>
      {modalOpen && <PriceListModal editingItem={editingItem} onClose={closeModal} />}
    </>
  );
}