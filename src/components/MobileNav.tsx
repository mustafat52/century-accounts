import { NavLink } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { NAV_ITEMS } from '../nav';
import { useApp } from '../context/AppContext';

export default function MobileNav() {
  const { logout } = useApp();
  const navigate = useNavigate();

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
      </div>
      <div className="mobile-nav-foot">
        <span className="mobile-nav-banner">View only on mobile — add or edit records from a computer</span>
        <button type="button" className="mobile-nav-logout" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}