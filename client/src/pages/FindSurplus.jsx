import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead, Select, Tag, Spinner, Empty, Banner } from '../components/ui.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import SurplusMap from '../components/SurplusMap.jsx';
import { PLACES, rs, fmtTime, timeLeft } from '../lib.js';

const DISTANCES = [1, 3, 5, 10].map((k) => ({ value: k, label: `Within ${k} km` }));
const DIETS = [{ value: '', label: 'Any' }, ...['Veg', 'Non-veg', 'Halal', 'Contains nuts'].map((d) => ({ value: d, label: d }))];
const PRICES = [{ value: '', label: 'Any price' }, ...[200, 300, 500, 1000].map((p) => ({ value: p, label: `Up to ${rs(p)}` }))];
const LEFT = [{ value: 0, label: 'Any' }, { value: 60, label: 'Over 1 hour' }, { value: 120, label: 'Over 2 hours' }];

// F2 – FR2.2 "near me" search with map and list (Abisheak S). Also used by charities for donations.
export default function FindSurplus({ forCharity = false }) {
  const { profile } = useAuth();
  const start = forCharity && profile
    ? { lat: profile.location.coordinates[1], lng: profile.location.coordinates[0], label: profile.name }
    : { lat: PLACES[0].lat, lng: PLACES[0].lng, label: PLACES[0].name };
  const [place, setPlace] = useState(start);
  const [f, setF] = useState({ km: forCharity ? 10 : 5, diet: '', maxPrice: '', offer: forCharity ? 'donate' : 'all', minLeft: 0 });
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [hl, setHl] = useState(null);

  useEffect(() => {
    let live = true;
    setResults(null);
    api(`/listings/nearby?${qs({ lat: place.lat, lng: place.lng, ...f })}`)
      .then((d) => { if (live) { setResults(d); setError(''); } })
      .catch((e) => { if (live) { setResults([]); setError(e.message); } });
    return () => { live = false; };
  }, [place, f]);

  const center = useMemo(() => [place.lat, place.lng], [place.lat, place.lng]);
  const set = (k) => (e) => setF({ ...f, [k]: k === 'diet' || k === 'offer' ? e.target.value : e.target.value === '' ? '' : Number(e.target.value) });

  return (
    <>
      <PageHead
        title={forCharity ? 'Donations near you' : 'Surplus food near you'}
        sub="Sorted by time left — collect before the pickup window closes."
        owner="F2 · FR2.2 · Abisheak S"
      />
      {forCharity && profile && profile.status !== 'approved' && (
        <Banner kind="info" title="You can browse, but not claim yet.">Claiming opens once an administrator approves your charity.</Banner>
      )}
      <div className="card" style={{ marginBottom: 16, paddingBottom: 6 }}>
        <div className="filters">
          <div style={{ flex: 2, minWidth: 240 }}><LocationPicker label="Search near" value={place} onChange={setPlace} /></div>
          <Select label="Distance" value={f.km} onChange={set('km')} options={DISTANCES} />
          <Select label="Food type" value={f.diet} onChange={set('diet')} options={DIETS} />
          {!forCharity && <Select label="Max price" value={f.maxPrice} onChange={set('maxPrice')} options={PRICES} />}
          {!forCharity && <Select label="Offer" value={f.offer} onChange={set('offer')} options={[{ value: 'all', label: 'Sale and donation' }, { value: 'sale', label: 'Discounted only' }, { value: 'donate', label: 'Donations only' }]} />}
          <Select label="Time left" value={f.minLeft} onChange={set('minLeft')} options={LEFT} />
        </div>
      </div>
      {error && <Banner kind="warn">{error}</Banner>}
      <div className="grid g2">
        <div>
          <SurplusMap center={center} km={f.km} listings={results || []} highlight={hl} onPick={(id) => { setHl(id); document.getElementById(`lc-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }} />
          <div className="legend"><span><i style={{ background: '#1F4D3A' }} />Discounted sale</span><span><i style={{ background: '#E4572E' }} />Donation (verified charities only)</span><span><i style={{ background: '#2F7DD1' }} />Search centre</span></div>
        </div>
        <div className="results" aria-live="polite">
          {!results ? <Spinner label="Finding surplus near you…" /> : results.length === 0 ? (
            <div className="card"><Empty title="No offers match">Try a wider distance or fewer filters.</Empty></div>
          ) : (
            <>
              <div className="sub"><b style={{ color: 'var(--green)' }}>{results.length}</b> offer{results.length > 1 ? 's' : ''} found near {place.label}</div>
              {results.map((l) => (
                <Link key={l.id} id={`lc-${l.id}`} className={`lc ${hl === l.id ? 'hl' : ''}`} to={`/listing/${l.id}`} onMouseEnter={() => setHl(l.id)}>
                  <div className="thumb" aria-hidden="true">{l.item[0]}</div>
                  <div>
                    <b>{l.item}</b>
                    <div className="sub">{l.restaurant.name} · {l.distanceKm} km</div>
                    <div>{l.offerType === 'donate' ? <Tag donate>Donation</Tag> : <Tag>{Math.round(100 - (l.price / l.originalPrice) * 100)}% off</Tag>}{l.dietTags.map((t) => <Tag key={t}>{t}</Tag>)}</div>
                    <div className="time">{timeLeft(l.safeUntil)} · pickup {fmtTime(l.pickupFrom)} – {fmtTime(l.pickupTo)}</div>
                  </div>
                  <div className="price">
                    {l.offerType === 'donate' ? <div className="now" style={{ color: 'var(--orange)' }}>Free</div> : <><div className="now">{rs(l.price)}</div><div className="was">{rs(l.originalPrice)}</div></>}
                    <div className="sub">{l.available} left</div>
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
