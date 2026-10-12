import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { PageHead, Chip, Spinner, Empty, Banner } from '../../components/ui.jsx';
import { rs, fmtTime, timeLeft } from '../../lib.js';
import StatusBanner from './StatusBanner.jsx';

export default function RestaurantDashboard() {
  const { user, profile } = useAuth();
  const [listings, setListings] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/listings/mine?range=month').then(setListings).catch((e) => setError(e.message));
  }, []);

  const active = (listings || []).filter((l) => l.status === 'active');
  const packs = active.reduce((a, l) => a + l.available, 0);
  const tonight = (listings || []).filter((l) => ['active', 'reserved', 'expired'].includes(l.status)).slice(0, 6);

  return (
    <>
      <PageHead title={`Hello, ${user.name.split(' ')[0]}`} sub={profile ? `${profile.name} · ${profile.area}` : ''} owner="F1 · Janahan R" />
      <StatusBanner profile={profile} />
      {error && <Banner kind="warn">{error}</Banner>}
      <div className="grid g4">
        <div className="card kpi"><div className="v">{active.length}</div><div className="l">Active listings now</div></div>
        <div className="card kpi"><div className="v">{packs}</div><div className="l">Packs still available</div></div>
        <div className="card kpi"><div className="v">{(listings || []).length}</div><div className="l">Listings in the last month</div></div>
        <div className="card kpi"><div className="v">{(listings || []).filter((l) => l.offerType === 'donate').length}</div><div className="l">Donation listings this month</div></div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ margin: 0, marginRight: 'auto' }}>Latest listings</h2>
          {profile?.status === 'approved' && <Link className="btn primary small" to="/restaurant/new">+ Post surplus</Link>}
        </div>
        {!listings ? <Spinner /> : tonight.length === 0 ? (
          <Empty title="No listings yet">Post your first surplus listing at closing time.</Empty>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr><th>Item</th><th>Available</th><th>Pickup</th><th>Safe until</th><th>Status</th></tr></thead>
            <tbody>{tonight.map((l) => (
              <tr key={l.id}>
                <td><b>{l.item}</b><div className="sub">{l.offerType === 'donate' ? 'Donation' : `${rs(l.price)} (was ${rs(l.originalPrice)})`}</div></td>
                <td>{l.available} / {l.quantity}</td>
                <td>{fmtTime(l.pickupFrom)} – {fmtTime(l.pickupTo)}</td>
                <td>{fmtTime(l.safeUntil)}<div className="time">{l.status === 'active' ? timeLeft(l.safeUntil) : ''}</div></td>
                <td><Chip status={l.status} /></td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
