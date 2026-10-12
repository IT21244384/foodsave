import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, HOME_FOR_ROLE } from '../auth.jsx';
import { TextInput, Banner } from '../components/ui.jsx';

export default function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const fieldErrors = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) fieldErrors.email = 'Enter a valid email address.';
    if (!form.password) fieldErrors.password = 'Enter your password.';
    setErrors(fieldErrors);
    setMessage('');
    if (Object.keys(fieldErrors).length) return;
    setBusy(true);
    try {
      const user = await login(form.email.trim(), form.password);
      navigate(HOME_FOR_ROLE[user.role], { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {message && <Banner kind="warn">{message}</Banner>}
      <TextInput label="Email" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <TextInput label="Password" type="password" autoComplete="current-password" value={form.password} error={errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <button className="btn green block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="hint" style={{ textAlign: 'center' }}>New here? <Link to="/register">Create an account</Link></p>
      <p className="demo-accounts">Demo accounts are listed in the project README.</p>
    </form>
  );
}
