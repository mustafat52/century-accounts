import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../nav';

export default function MobileNav() {
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
      <div className="mobile-nav-banner">View only on mobile — add or edit records from a computer</div>
    </div>
  );
}