import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { PageHead, TextInput, Banner, Chip } from '../../components/ui.jsx';
import LocationPicker from '../../components/LocationPicker.jsx';
import StatusBanner from './StatusBanner.jsx';

// F1 – FR1.1 restaurant profile; editing a rejected profile re-submits it for verification.
export default function RestaurantProfile() {
  const { profile, setProfile } = useAuth();
  const [v, setV] = useState({ name: profile.name, address: profile.address, area: profile.area, phone: profile.phone, businessRegNo: profile.businessRegNo });
  const [loc, setLoc] = useState({ lat: profile.location.coordinates[1], lng: profile.location.coordinates[0], label: 'Saved location' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState({});
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    try {
      const updated = await api('/restaurants/me', { method: 'PUT', body: { ...v, lat: loc.lat, lng: loc.lng } });
      setProfile(updated);
      setErrors({});
      setMessage({ kind: 'ok', text: updated.status === 'pending' ? 'Saved and sent for verification again.' : 'Profile saved.' });
    } catch (err) {
      setErrors(err.fields);
      setMessage({ kind: 'warn', text: err.message });
    }
  }

  return (
    <>
      <PageHead title="Restaurant profile" sub={<>Verification status: <Chip status={profile.status} /></>} owner="F1 · FR1.1 · Janahan R" />
      <StatusBanner profile={profile} />
      <form className="card" style={{ maxWidth: 760 }} onSubmit={save} noValidate>
        {message.text && <Banner kind={message.kind}>{message.text}</Banner>}
        <div className="row">
          <TextInput label="Restaurant name" value={v.name} error={errors.name} onChange={set('name')} />
          <TextInput label="Business registration no." value={v.businessRegNo} error={errors.businessRegNo} onChange={set('businessRegNo')} />
        </div>
        <TextInput label="Address" value={v.address} error={errors.address} onChange={set('address')} />
        <div className="row">
          <TextInput label="Area" value={v.area} error={errors.area} onChange={set('area')} />
          <TextInput label="Phone" value={v.phone} error={errors.phone} onChange={set('phone')} />
        </div>
        <LocationPicker label="Map location" value={loc} onChange={setLoc} error={errors.lat || errors.lng} />
        <button className="btn green">Save profile</button>
      </form>
    </>
  );
}
