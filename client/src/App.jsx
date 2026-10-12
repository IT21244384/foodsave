import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useAuth, HOME_FOR_ROLE } from './auth.jsx';
import { Spinner } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import RestaurantDashboard from './pages/restaurant/Dashboard.jsx';
import ListingEditor from './pages/restaurant/ListingEditor.jsx';
import MyListings from './pages/restaurant/MyListings.jsx';
import RestaurantProfile from './pages/restaurant/Profile.jsx';
import FindSurplus from './pages/FindSurplus.jsx';
import ListingDetail from './pages/ListingDetail.jsx';
import MyReservations from './pages/MyReservations.jsx';
import CharityOverview from './pages/charity/Overview.jsx';
import Verification from './pages/admin/Verification.jsx';

function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={HOME_FOR_ROLE[user.role]} replace />;
  return children;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* F1 – Restaurant & Surplus Listing Management (Janahan R) */}
        <Route path="/restaurant" element={<RequireRole roles={['restaurant']}><RestaurantDashboard /></RequireRole>} />
        <Route path="/restaurant/new" element={<RequireRole roles={['restaurant']}><ListingEditor /></RequireRole>} />
        <Route path="/restaurant/listings" element={<RequireRole roles={['restaurant']}><MyListings /></RequireRole>} />
        <Route path="/restaurant/listings/:id/edit" element={<RequireRole roles={['restaurant']}><ListingEditor /></RequireRole>} />
        <Route path="/restaurant/profile" element={<RequireRole roles={['restaurant']}><RestaurantProfile /></RequireRole>} />

        {/* F2 – Reservation, Charity Claims & Impact Reporting (Abisheak S) */}
        <Route path="/find" element={<FindSurplus />} />
        <Route path="/listing/:id" element={<ListingDetail />} />
        <Route path="/reservations" element={<RequireRole roles={['customer']}><MyReservations /></RequireRole>} />
        <Route path="/charity" element={<RequireRole roles={['charity']}><CharityOverview /></RequireRole>} />
        <Route path="/charity/donations" element={<RequireRole roles={['charity']}><FindSurplus forCharity /></RequireRole>} />
        <Route path="/admin" element={<RequireRole roles={['admin']}><Verification /></RequireRole>} />

        <Route path="*" element={<div className="card"><h2>Page not found</h2><p>That page does not exist.</p></div>} />
      </Routes>
    </Layout>
  );
}
