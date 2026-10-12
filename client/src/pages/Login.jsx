import { Navigate } from 'react-router-dom';
import { useAuth, HOME_FOR_ROLE } from '../auth.jsx';
import LoginForm from './LoginForm.jsx';

export default function Login() {
  const { user } = useAuth();
  if (user) return <Navigate to={HOME_FOR_ROLE[user.role]} replace />;
  return (
    <div style={{ maxWidth: 440, margin: '20px auto' }} className="card">
      <h2>Sign in to FoodSave</h2>
      <LoginForm />
    </div>
  );
}
