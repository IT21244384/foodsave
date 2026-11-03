import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const TABS = {
  restaurant: [['Dashboard', '/restaurant'], ['Post surplus', '/restaurant/new'], ['My listings', '/restaurant/listings'], ['Hand-over', '/restaurant/handover'], ['Reports', '/restaurant/reports'], ['Profile', '/restaurant/profile']],
  customer: [['Find surplus', '/find'], ['My reservations', '/reservations']],
  charity: [['Overview', '/charity'], ['Donations near us', '/charity/donations'], ['Claim history', '/charity/claims']],
  admin: [['Verification', '/admin'], ['Impact dashboard', '/admin/impact']],
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [unread, setUnread] = useState(0);
  const tabs = (user && TABS[user.role]) || [];

  useEffect(() => {
    if (!user) { setUnread(0); return undefined; }
    const check = () => api('/notifications').then((d) => setUnread(d.unread)).catch(() => {});
    check();
    window.addEventListener('foodsave:notifications', check);
    return () => window.removeEventListener('foodsave:notifications', check);
  }, [user, pathname]);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="app">
        <Link to="/" className="logo" aria-label="FoodSave home"><span className="dot" aria-hidden="true" />FoodSave</Link>
        <nav className="tabs" aria-label="Main">
          {tabs.map(([label, to]) => <NavLink key={label} to={to} end>{label}</NavLink>)}
        </nav>
        <div className="who">
          {user ? (
            <>
              <Link to="/notifications" className="note-link">Notifications{unread > 0 && <span className="note-count">{unread}<span className="sr-only"> unread</span></span>}</Link>
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
