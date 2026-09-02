import { NavLink, useNavigate } from 'react-router-dom';
import { INVENTORY_NAV_ITEMS } from '../inventoryNav';
import { useApp } from '../context/AppContext';
import logoDark from '../assets/logo-dark.png';

// Structurally separate from Sidebar.tsx (spec section 5: "a new, separate
// nav list — not reusing the accounting one"), but built against the same
// CSS contract (.sidebar/.brand/.nav/.nav-item/.nav-seam/.sidebar-foot) so
// it's visually indistinguishable in style from the accounting sidebar.
export default function InventorySidebar() {
  const { logout, currentUserName } = useApp();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={logoDark} alt="Century Glass Art" className="brand-logo" />
        <div className="brand-sub">Inventory</div>
      </div>

      <nav className="nav">
        {INVENTORY_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
          >
            <span className="nav-seam" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        {currentUserName && <div className="build-tag">Signed in as {currentUserName}</div>}
        <button type="button" className="nav-item" style={{ padding: '8px 0' }} onClick={() => navigate('/')}>
          Switch to Accounts
        </button>
        <button type="button" className="nav-item" style={{ padding: '8px 0' }} onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
