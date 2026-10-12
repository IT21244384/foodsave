import { useState } from 'react';
import { PLACES } from '../lib.js';

// Lets a user pick a preset area or use the browser's location. Calls onChange({ lat, lng, label }).
export default function LocationPicker({ value, onChange, label = 'Location', error }) {
  const [status, setStatus] = useState('');
  const presetIndex = PLACES.findIndex((p) => p.lat === value.lat && p.lng === value.lng);

  function useMine() {
    if (!navigator.geolocation) return setStatus('Location is not available in this browser.');
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { onChange({ lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), label: 'My location' }); setStatus(''); },
      () => setStatus('Could not get your location. Choose an area instead.'),
      { timeout: 8000 }
    );
  }

  return (
    <div className="field">
      <label className="f" htmlFor="loc-preset">{label}</label>
      <div className="row" style={{ alignItems: 'center' }}>
        <select id="loc-preset" style={{ flex: 1, minWidth: 160 }} value={presetIndex} onChange={(e) => { const p = PLACES[e.target.value]; if (p) onChange({ lat: p.lat, lng: p.lng, label: p.name }); }}>
          {presetIndex === -1 && <option value={-1}>{value.label || 'Custom location'}</option>}
          {PLACES.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
        </select>
        <button type="button" className="btn ghost small" onClick={useMine}>Use my location</button>
      </div>
      {error ? <div className="err">{error}</div> : <div className="hint">{status || `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`}</div>}
    </div>
  );
}
