import Topbar from '../components/Topbar';
import VendorModal from '../components/VendorModal';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';

export default function Vendors() {
  const { vendors, openVendorModal } = useApp();

  return (
    <>
      <Topbar title="Vendors" subtitle="Raw material and service suppliers, purchases and payables" />
      <div className="view-body">
        <div className="panel">
          <div className="panel-head">
            <h3>{vendors.length} vendors</h3>
            <button className="btn btn-ghost btn-small desktop-only" onClick={openVendorModal}>
              + New Vendor
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Category</th>
                <th>Total purchased</th>
                <th>Payable</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div className="row-name">{v.name}</div>
                    <div className="row-sub">{v.contact}</div>
                  </td>
                  <td className="row-sub">{v.category}</td>
                  <td className="num">{formatINR(v.totalPurchased)}</td>
                  <td className="num" style={{ color: v.payable > 0 ? 'var(--warning)' : 'var(--success)' }}>
                    {v.payable > 0 ? formatINR(v.payable) : 'Settled'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <VendorModal />
    </>
  );
}