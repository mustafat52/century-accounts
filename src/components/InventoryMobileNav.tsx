import { NavLink, useNavigate } from 'react-router-dom';
import { INVENTORY_NAV_ITEMS } from '../inventoryNav';
import { useApp } from '../context/AppContext';

// Sibling of MobileNav.tsx, deliberately not merged into it — same
// reasoning as InventorySidebar vs Sidebar: a separate nav list for a
// separate shell, built against the same CSS contract so it's visually
// indistinguishable in style.
export default function InventoryMobileNav() {
  const { logout } = useApp();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="mobile-nav">
      <div className="mobile-nav-tabs">
        {INVENTORY_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `mobile-nav-tab${isActive ? ' is-active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
        <button type="button" className="mobile-nav-tab" onClick={() => navigate('/')}>
          Switch to Accounts
        </button>
      </div>
      <div className="mobile-nav-foot">
        <span className="mobile-nav-banner">
          View only on mobile — Categories &amp; Stock, Waste, and Cutting History can be viewed here; the Cutting
          Plan tool needs a computer.
        </span>
        <button type="button" className="mobile-nav-logout" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </div>
  );
}