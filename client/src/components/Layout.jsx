import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

// [label, path] – a null path marks a screen planned for a later sprint (shown, but disabled).
const TABS = {
  restaurant: [['Dashboard', '/restaurant'], ['Post surplus', '/restaurant/new'], ['My listings', '/restaurant/listings'], ['Profile', '/restaurant/profile'], ['Hand-over', null, 'Sprint 2 (FR1.5)'], ['Reports', null, 'Sprint 3 (FR1.6 report)']],
  customer: [['Find surplus', '/find'], ['My reservations', '/reservations']],
  charity: [['Overview', '/charity'], ['Donations near us', '/charity/donations'], ['Claim history', null, 'Sprint 2 (FR2.4)']],
  admin: [['Verification', '/admin'], ['Impact dashboard', null, 'Sprint 3 (FR2.6)']],
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const tabs = (user && TABS[user.role]) || [];
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="app">
        <Link to="/" className="logo" aria-label="FoodSave home"><span className="dot" aria-hidden="true" />FoodSave</Link>
        <nav className="tabs" aria-label="Main">
          {tabs.map(([label, to, later]) => (to
            ? <NavLink key={label} to={to} end>{label}</NavLink>
            : <span key={label} className="soon" title={`Planned for ${later}`}>{label}<small>soon</small></span>))}
        </nav>
        <div className="who">
          {user ? (
            <>
              <span className="who-name">{user.name}</span>
              <span className="avatar" aria-hidden="true">{user.name[0]}</span>
              <button type="button" className="btn ghost small on-dark" onClick={() => { logout(); navigate('/'); }}>Sign out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn ghost small on-dark">Sign in</Link>
              <Link to="/register" className="btn primary small">Register</Link>
            </>
          )}
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="foot">FoodSave · IT2150 IT Project · Janahan R &amp; Abisheak S · sample data for demonstration</footer>
    </>
  );
}
