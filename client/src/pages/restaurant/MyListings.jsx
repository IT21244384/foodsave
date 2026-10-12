import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { PageHead, Chip, Tag, Spinner, Empty, Banner, TextInput, Select } from '../../components/ui.jsx';
import { rs, fmtDateTime, timeLeft } from '../../lib.js';
import StatusBanner from './StatusBanner.jsx';

const STATUSES = [['all', 'All statuses'], ['active', 'Active'], ['reserved', 'Reserved'], ['collected', 'Collected'], ['expired', 'Expired'], ['withdrawn', 'Withdrawn']];
const RANGES = [['all', 'Any time'], ['today', 'Today'], ['week', 'Last 7 days'], ['month', 'Last 30 days']];

// F1 – FR1.2 manage listings and FR1.6 search own listings.
export default function MyListings() {
  const { profile } = useAuth();
  const location = useLocation();
  const [filters, setFilters] = useState({ q: '', status: 'all', range: 'all' });
  const [listings, setListings] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api(`/listings/mine?${qs(filters)}`).then((d) => { setListings(d); setError(''); }).catch((e) => setError(e.message));
    }, 250); // wait for the user to stop typing
    return () => clearTimeout(t);
  }, [filters]);

  async function withdraw(l) {
    if (!window.confirm(`Withdraw “${l.item}”? It will be removed from search straight away.`)) return;
    try {
      const updated = await api(`/listings/${l.id}/withdraw`, { method: 'POST' });
      setListings((ls) => ls.map((x) => (x.id === l.id ? updated : x)));
      setNotice(`“${l.item}” was withdrawn.`);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <PageHead title="My listings" sub="Search, edit or withdraw your surplus listings." owner="F1 · FR1.2, FR1.6 · Janahan R" />
      <StatusBanner profile={profile} />
      {notice && <Banner kind="ok">{notice}</Banner>}
      {error && <Banner kind="warn">{error}</Banner>}
      <div className="card">
        <div className="filters" style={{ marginBottom: 12 }}>
          <TextInput label="Search" type="search" placeholder="Item name" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <Select label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} options={STATUSES.map(([value, label]) => ({ value, label }))} />
          <Select label="Posted" value={filters.range} onChange={(e) => setFilters({ ...filters, range: e.target.value })} options={RANGES.map(([value, label]) => ({ value, label }))} />
          {profile?.status === 'approved' && <Link className="btn primary" to="/restaurant/new">+ Post surplus</Link>}
        </div>
        {!listings ? <Spinner /> : listings.length === 0 ? (
          <Empty title="No listings match">Try a different search or status.</Empty>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr><th>Item</th><th>Offer</th><th>Available</th><th>Pickup window</th><th>Safe until</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{listings.map((l) => (
              <tr key={l.id}>
                <td><b>{l.item}</b><div>{l.dietTags.map((t) => <Tag key={t}>{t}</Tag>)}</div></td>
                <td>{l.offerType === 'donate' ? <Tag donate>Donation</Tag> : <>{rs(l.price)}<div className="sub">was {rs(l.originalPrice)}</div></>}</td>
                <td>{l.available} / {l.quantity}</td>
                <td>{fmtDateTime(l.pickupFrom)}<div className="sub">until {fmtDateTime(l.pickupTo)}</div></td>
                <td>{fmtDateTime(l.safeUntil)}<div className="time">{l.status === 'active' ? timeLeft(l.safeUntil) : ''}</div></td>
                <td><Chip status={l.status} /></td>
                <td className="actions">{l.status === 'active' && (
                  <><Link className="btn ghost small" to={`/restaurant/listings/${l.id}/edit`}>Edit</Link> <button type="button" className="btn ghost small" onClick={() => withdraw(l)}>Withdraw</button></>
                )}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
