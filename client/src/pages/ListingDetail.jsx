import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead, Tag, Spinner, Banner } from '../components/ui.jsx';
import { rs, fmtTime, timeLeft } from '../lib.js';

const LIMIT = 2; // packs per person (FR2.3)

// F2 – listing detail with FR2.3 reservation, FR2.4 claim and FR2.5 stock lock (Abisheak S).
export default function ListingDetail() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [l, setL] = useState(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const [reserveError, setReserveError] = useState('');
  const [busy, setBusy] = useState(false);

  const [fairShare, setFairShare] = useState(null);

  const load = useCallback(() => api(`/listings/${id}`).then(setL).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (user?.role === 'charity') api('/claims/mine').then((d) => setFairShare(d.today)).catch(() => {});
  }, [user]);

  if (error) return <><Link to="/find">← Back to results</Link><Banner kind="warn">{error}</Banner></>;
  if (!l) return <Spinner />;
  const live = l.status === 'active' && l.available > 0 && new Date(l.safeUntil) > new Date() && new Date(l.pickupTo) > new Date();
  const maxQty = Math.max(1, Math.min(LIMIT, l.available));
  const maxClaim = Math.min(l.available, fairShare ? fairShare.left : l.available);
  const rows = [
    ['Pickup window', `${fmtTime(l.pickupFrom)} – ${fmtTime(l.pickupTo)}`],
    ['Safe to eat until', `${fmtTime(l.safeUntil)} (${timeLeft(l.safeUntil)})`],
    ['Available now', `${l.available} of ${l.quantity} packs`],
    ['Hygiene', l.hygieneDeclared ? 'Declared by the restaurant' : 'Not declared'],
    ['Restaurant', `${l.restaurant.name}, ${l.restaurant.address}`],
  ];

  async function reserve() {
    setBusy(true);
    setReserveError('');
    try {
      const r = await api(`/listings/${l.id}/reservations`, { method: 'POST', body: { quantity: qty } });
      navigate('/reservations', { state: { justReserved: r } });
    } catch (e) {
      setReserveError(e.message);
      if (e.status === 409) { await load(); setQty(1); } // show the fresh stock after a lost race
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    setBusy(true);
    setReserveError('');
    try {
      const c = await api(`/listings/${l.id}/claims`, { method: 'POST', body: { quantity: qty } });
      navigate('/charity/claims', { state: { justClaimed: c } });
    } catch (e) {
      setReserveError(e.message);
      if (e.status === 409) { await load(); setQty(1); }
    } finally {
      setBusy(false);
    }
  }

  let action;
  if (!live) {
    action = <Banner kind="warn">This listing is no longer available.</Banner>;
  } else if (l.offerType === 'donate') {
    if (user?.role !== 'charity') {
      action = <Banner kind="info" title="Charities only.">Only verified charities can claim donations.</Banner>;
    } else if (profile?.status !== 'approved') {
      action = <Banner kind="info" title="Waiting for verification.">You can claim donations once an administrator approves your charity.</Banner>;
    } else if (fairShare && fairShare.left === 0) {
      action = <Banner kind="warn" title="Daily limit reached.">You have claimed your fair share of {fairShare.limit} packs today. Please try again tomorrow.</Banner>;
    } else {
      action = (
        <>
          {reserveError && <Banner kind="warn">{reserveError}</Banner>}
          <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
            <span>Packs</span>
            <div className="stepper" role="group" aria-label="Number of packs">
              <button type="button" aria-label="One fewer" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
              <output aria-live="polite">{qty}</output>
              <button type="button" aria-label="One more" disabled={qty >= maxClaim} onClick={() => setQty(qty + 1)}>+</button>
            </div>
            {fairShare && <span className="hint">{fairShare.left} left in today’s fair share</span>}
          </div>
          <button type="button" className="btn primary block" disabled={busy} onClick={claim}>{busy ? 'Claiming…' : 'Claim and get pickup code'}</button>
          <p className="hint">Free. Cancel until {fmtTime(l.pickupFrom)} if plans change. Your packs are locked the moment you claim.</p>
        </>
      );
    }
  } else if (!user) {
    action = <><p>Sign in as a customer to reserve up to {LIMIT} packs.</p><Link className="btn primary block" to="/login">Sign in to reserve</Link></>;
  } else if (user.role !== 'customer') {
    action = <Banner kind="info">Only customer accounts can reserve discounted food.</Banner>;
  } else {
    action = (
      <>
        {reserveError && <Banner kind="warn">{reserveError}</Banner>}
        <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
          <span>Packs</span>
          <div className="stepper" role="group" aria-label="Number of packs">
            <button type="button" aria-label="One fewer" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
            <output aria-live="polite">{qty}</output>
            <button type="button" aria-label="One more" disabled={qty >= maxQty} onClick={() => setQty(qty + 1)}>+</button>
          </div>
          <span className="hint">limit {LIMIT} per person</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 17, marginBottom: 12 }}><span>Pay at pickup</span><b>{rs(l.price * qty)}</b></div>
        <button type="button" className="btn primary block" disabled={busy} onClick={reserve}>{busy ? 'Reserving…' : 'Reserve and get pickup code'}</button>
        <p className="hint">Free cancellation until {fmtTime(l.pickupFrom)}. Your packs are locked the moment you reserve.</p>
      </>
    );
  }

  return (
    <>
      <Link to={user?.role === 'charity' ? '/charity/donations' : '/find'}>← Back to results</Link>
      <PageHead title={l.item} sub={`${l.restaurant.name} · ${l.restaurant.area}`} owner="F2 · FR2.3, FR2.5 · Abisheak S" />
      <div className="grid split">
        <div className="card">
          <div className="row" style={{ alignItems: 'center' }}>
            <div className="thumb" style={{ width: 84, height: 84, fontSize: 34 }} aria-hidden="true">{l.item[0]}</div>
            <div>
              <div>{l.offerType === 'donate' ? <Tag donate>Donation · charities only</Tag> : <Tag>{Math.round(100 - (l.price / l.originalPrice) * 100)}% off</Tag>}{l.dietTags.map((t) => <Tag key={t}>{t}</Tag>)}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)' }}>
                {l.offerType === 'donate' ? 'Free for charities' : <>{rs(l.price)} <span style={{ fontSize: 15, color: 'var(--muted)', textDecoration: 'line-through', fontWeight: 400 }}>{rs(l.originalPrice)}</span></>}
              </div>
            </div>
          </div>
          <table style={{ marginTop: 12 }}><tbody>{rows.map(([k, val]) => <tr key={k}><td className="sub" style={{ width: 190 }}>{k}</td><td><b>{val}</b></td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h2>{l.offerType === 'donate' ? 'Claim this donation' : 'Reserve'}</h2>
          {action}
        </div>
      </div>
    </>
  );
}
