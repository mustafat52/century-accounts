import { NavLink } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import logoDark from '../assets/logo-dark.png';
import { NAV_ITEMS } from '../nav';

export default function Sidebar() {
  const { gstEnabled, toggleGst, logout, currentUserName } = useApp();

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={logoDark} alt="Century Glass Art" className="brand-logo" />
        <span className="brand-sub">Accounts &amp; Billing</span>
      </div>

      <nav className="nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
          >
            <span className="nav-seam" />
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="gst-toggle desktop-only">
          <span>GST invoicing</span>
          <label className="switch">
            <input type="checkbox" checked={gstEnabled} onChange={toggleGst} />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </label>
        </div>
        {currentUserName && (
          <span className="row-sub" style={{ fontSize: 12 }}>
            Signed in as {currentUserName}
          </span>
        )}
        <button className="btn btn-ghost btn-small" onClick={logout} style={{ width: '100%' }}>
          Log out
        </button>
        <span className="build-tag">Demo build · Phase 1</span>
      </div>
    </aside>
  );
}