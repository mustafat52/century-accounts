import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { NAV_ITEMS } from '../nav';
import { useApp } from '../context/AppContext';

export default function MobileNav() {
  const { logout, currentUserRole } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // These pages can be edited from a phone; everything else stays view-only.
  const editableHere = ['/expenses', '/links', '/employees'].some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="mobile-nav">
      <div className="mobile-nav-tabs">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `mobile-nav-tab${isActive ? ' is-active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
        {currentUserRole === 'owner' && (
          <NavLink to="/employees" className={({ isActive }) => `mobile-nav-tab${isActive ? ' is-active' : ''}`}>
            Employees
          </NavLink>
        )}
        {currentUserRole === 'owner' && (
          <NavLink to="/activity-log" className={({ isActive }) => `mobile-nav-tab${isActive ? ' is-active' : ''}`}>
            Log
          </NavLink>
        )}
      </div>
      <div className="mobile-nav-foot">
        <span className="mobile-nav-banner">
          {editableHere
            ? 'You can add and edit on this page from your phone'
            : 'View only on mobile — add or edit records from a computer (Expenses, Employees and Links can be edited here)'}
        </span>
        <button type="button" className="mobile-nav-logout" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}