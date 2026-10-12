import { Link, Navigate } from 'react-router-dom';
import { useAuth, HOME_FOR_ROLE } from '../auth.jsx';
import LoginForm from './LoginForm.jsx';

export default function Home() {
  const { user } = useAuth();
  if (user) return <Navigate to={HOME_FOR_ROLE[user.role]} replace />;
  return (
    <div className="hero">
      <div>
        <h1>Good food shouldn’t end up in the bin.</h1>
        <p className="lead">Restaurants post their end-of-day surplus. Nearby customers buy it at a steep discount, and verified charities claim donations for free — collected before it is no longer safe.</p>
        <div className="rolecards">
          <Link className="rolecard" to="/register?role=restaurant"><b>Restaurant</b><span>Post surplus and recover part of the cost</span></Link>
          <Link className="rolecard" to="/find"><b>Customer</b><span>Find discounted meals near you</span></Link>
          <Link className="rolecard" to="/register?role=charity"><b>Charity</b><span>Register to claim free food for your home</span></Link>
          <Link className="rolecard" to="/login"><b>Administrator</b><span>Verify restaurants and charities</span></Link>
        </div>
      </div>
      <div className="card"><h2>Sign in</h2><LoginForm /></div>
    </div>
  );
}
