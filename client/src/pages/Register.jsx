import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth, HOME_FOR_ROLE } from '../auth.jsx';
import { TextInput, Field, Banner } from '../components/ui.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import { PLACES } from '../lib.js';

const ROLES = [['customer', 'Customer'], ['restaurant', 'Restaurant'], ['charity', 'Charity']];
const MAX_DOC = 5 * 1024 * 1024;

function validate(role, v, doc) {
  const e = {};
  if (v.name.trim().length < 2) e.name = 'Enter your name.';
  if (!/^\S+@\S+\.\S+$/.test(v.email)) e.email = 'Enter a valid email address.';
  if (v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/[0-9]/.test(v.password)) e.password = 'Use at least 8 characters with a letter and a number.';
  if (v.password !== v.confirm) e.confirm = 'Passwords do not match.';
  const phoneOk = /^\+?[0-9 ]{9,15}$/.test(v.phone.trim());
  if ((role !== 'customer' || v.phone) && !phoneOk) e.phone = 'Enter a valid phone number.';
  if (role === 'restaurant') {
    if (v.orgName.trim().length < 2) e.orgName = 'Enter the restaurant name.';
    if (v.businessRegNo.trim().length < 3) e.businessRegNo = 'Enter the business registration number.';
  }
  if (role === 'charity') {
    if (v.orgName.trim().length < 2) e.orgName = 'Enter the organisation name.';
    if (v.regNo.trim().length < 3) e.regNo = 'Enter the charity registration number.';
    if (v.contactPerson.trim().length < 2) e.contactPerson = 'Enter a contact person.';
    if (!doc) e.document = 'Upload your registration certificate.';
    else if (!/\.(pdf|jpe?g|png)$/i.test(doc.name)) e.document = 'Upload a PDF, JPG or PNG file.';
    else if (doc.size > MAX_DOC) e.document = 'The document must be 5 MB or smaller.';
  }
  if (role !== 'customer') {
    if (v.address.trim().length < 5) e.address = 'Enter the full address.';
    if (v.area.trim().length < 2) e.area = 'Enter the area, e.g. Malabe.';
  }
  return e;
}

export default function Register() {
  const [params] = useSearchParams();
  const initial = ROLES.some(([r]) => r === params.get('role')) ? params.get('role') : 'customer';
  const [role, setRole] = useState(initial);
  const [v, setV] = useState({ name: '', email: '', password: '', confirm: '', phone: '', orgName: '', businessRegNo: '', regNo: '', contactPerson: '', address: '', area: '' });
  const [loc, setLoc] = useState({ lat: PLACES[1].lat, lng: PLACES[1].lng, label: PLACES[1].name });
  const [doc, setDoc] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { register, registerCharity } = useAuth();
  const navigate = useNavigate();
  const set = (k) => (e) => { setV({ ...v, [k]: e.target.value }); setErrors((er) => ({ ...er, [k]: undefined })); };

  async function submit(e) {
    e.preventDefault();
    const fieldErrors = validate(role, v, doc);
    setErrors(fieldErrors);
    setMessage(Object.keys(fieldErrors).length ? 'Please fix the highlighted fields.' : '');
    if (Object.keys(fieldErrors).length) return;
    setBusy(true);
    try {
      let user;
      if (role === 'charity') {
        const form = new FormData();
        Object.entries({ name: v.name, email: v.email, password: v.password, orgName: v.orgName, regNo: v.regNo, address: v.address, area: v.area, contactPerson: v.contactPerson, phone: v.phone, lat: loc.lat, lng: loc.lng }).forEach(([k, val]) => form.append(k, val));
        form.append('document', doc);
        user = await registerCharity(form);
      } else {
        const body = { role, name: v.name, email: v.email, password: v.password, ...(v.phone && { phone: v.phone }) };
        if (role === 'restaurant') body.restaurant = { name: v.orgName, address: v.address, area: v.area, phone: v.phone, businessRegNo: v.businessRegNo, lat: loc.lat, lng: loc.lng };
        user = await register(body);
      }
      navigate(HOME_FOR_ROLE[user.role], { replace: true });
    } catch (err) {
      // Map server field names back to form fields.
      const f = { ...err.fields };
      for (const k of Object.keys(f)) { if (k.startsWith('restaurant.')) f[{ 'restaurant.name': 'orgName' }[k] || k.slice(11)] = f[k]; }
      setErrors(f);
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="pagehead"><div><h1>Create an account</h1><p>Restaurants and charities are verified by an administrator before they can post or claim food.</p></div></div>
      <form className="card" onSubmit={submit} noValidate>
        <div className="field">
          <span className="f">I am registering as</span>
          <div className="seg" role="group" aria-label="Account type">
            {ROLES.map(([r, label]) => <button type="button" key={r} aria-pressed={role === r} onClick={() => { setRole(r); setErrors({}); }}>{label}</button>)}
          </div>
        </div>
        {message && <Banner kind="warn">{message}</Banner>}
        <div className="row">
          <TextInput label="Your name" value={v.name} error={errors.name} onChange={set('name')} autoComplete="name" />
          <TextInput label={role === 'customer' ? 'Phone (optional)' : 'Phone'} value={v.phone} error={errors.phone} onChange={set('phone')} autoComplete="tel" />
        </div>
        <TextInput label="Email" type="email" value={v.email} error={errors.email} onChange={set('email')} autoComplete="email" />
        <div className="row">
          <TextInput label="Password" type="password" value={v.password} error={errors.password} onChange={set('password')} autoComplete="new-password" hint="At least 8 characters, with a letter and a number." />
          <TextInput label="Confirm password" type="password" value={v.confirm} error={errors.confirm} onChange={set('confirm')} autoComplete="new-password" />
        </div>

        {role !== 'customer' && (
          <>
            <h2 style={{ marginTop: 8 }}>{role === 'restaurant' ? 'Restaurant details' : 'Organisation details'}</h2>
            <div className="row">
              <TextInput label={role === 'restaurant' ? 'Restaurant name' : 'Organisation name'} value={v.orgName} error={errors.orgName} onChange={set('orgName')} />
              {role === 'restaurant'
                ? <TextInput label="Business registration no." value={v.businessRegNo} error={errors.businessRegNo} onChange={set('businessRegNo')} />
                : <TextInput label="Charity registration no." value={v.regNo} error={errors.regNo} onChange={set('regNo')} placeholder="e.g. NGO/WP/1187" />}
            </div>
            {role === 'charity' && <TextInput label="Contact person" value={v.contactPerson} error={errors.contactPerson} onChange={set('contactPerson')} />}
            <TextInput label="Address" value={v.address} error={errors.address} onChange={set('address')} autoComplete="street-address" />
            <div className="row">
              <TextInput label="Area" value={v.area} error={errors.area} onChange={set('area')} placeholder="e.g. Malabe" />
              <div style={{ flex: 1.4, minWidth: 220 }}><LocationPicker label="Map location" value={loc} onChange={setLoc} error={errors.lat || errors.lng} /></div>
            </div>
            {role === 'charity' && (
              <Field label="Registration certificate" error={errors.document} hint="PDF, JPG or PNG, up to 5 MB. Only administrators can see it.">
                {(a) => <input {...a} type="file" accept=".pdf,.jpg,.jpeg,.png" className={errors.document ? 'bad' : ''} onChange={(e) => setDoc(e.target.files[0] || null)} />}
              </Field>
            )}
          </>
        )}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
          <Link className="btn ghost" to="/login">I already have an account</Link>
        </div>
      </form>
    </div>
  );
}
