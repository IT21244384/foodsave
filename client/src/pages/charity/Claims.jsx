import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHead, Spinner, Empty, Banner } from '../../components/ui.jsx';
import { fmtTime, fmtDateTime } from '../../lib.js';

const STATUS = { claimed: 's-reserved', collected: 's-collected', cancelled: 's-withdrawn', 'no-show': 's-expired' };

// F2 – FR2.4 a charity's claim history, with cancel before pickup (Abisheak S).
export default function Claims() {
  const { state } = useLocation();
  const just = state?.justClaimed;
  const [data, setData] = useState(null);
  const [notice, setNotice] = useState({});

  const load = () => api('/claims/mine').then(setData).catch((e) => setNotice({ kind: 'warn', text: e.message }));
  useEffect(() => { load(); }, []);

  async function cancel(c) {
    if (!window.confirm(`Cancel your claim ${c.pickupCode}? The packs will be offered to other charities.`)) return;
    try {
      await api(`/claims/${c.id}/cancel`, { method: 'POST' });
      setNotice({ kind: 'ok', text: `Claim ${c.pickupCode} was cancelled.` });
      load();
    } catch (e) {
      setNotice({ kind: 'warn', text: e.message });
    }
  }

  return (
    <>
      <PageHead title="Claim history" sub="Show the pickup code at the restaurant when you collect." owner="F2 · FR2.4 · Abisheak S" />
      {just && (
        <div className="grid g2" style={{ marginBottom: 16 }}>
          <div className="card">
            <h2>Claimed ✓</h2>
            <div className="code" aria-label="Pickup code">{just.pickupCode}</div>
            <p><b>{just.listing.item} × {just.quantity}</b> — collect {fmtTime(just.listing.pickupFrom)} – {fmtTime(just.listing.pickupTo)} at {just.listing.restaurant.name}, {just.listing.restaurant.area}.</p>
            <p>Restaurant phone: <b>{just.listing.restaurant.phone}</b></p>
          </div>
          <div className="card tint">
            <h2>Good to know</h2>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Donations are always free.</li>
              <li>Cancel before {fmtTime(just.listing.pickupFrom)} if you can’t make it, so another charity can claim the food.</li>
              <li>Food must be collected before {fmtTime(just.listing.safeUntil)}.</li>
            </ul>
          </div>
        </div>
      )}
      {notice.text && <Banner kind={notice.kind}>{notice.text}</Banner>}
      {data && (
        <Banner kind="info" title="Today’s fair share:">{data.today.used} of {data.today.limit} packs claimed, {data.today.left} left.</Banner>
      )}
      <div className="card">
        {!data ? (notice.text ? null : <Spinner />) : data.claims.length === 0 ? (
          <Empty title="No claims yet"><Link to="/charity/donations">Find donations near you</Link></Empty>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr><th>Pickup code</th><th>Item</th><th>Restaurant</th><th>Pickup</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{data.claims.map((c) => (
              <tr key={c.id}>
                <td><b className="mono">{c.pickupCode}</b></td>
                <td>{c.listing ? c.listing.item : '—'} × {c.quantity}</td>
                <td>{c.listing?.restaurant?.name}</td>
                <td>{c.listing ? `${fmtDateTime(c.listing.pickupFrom)} – ${fmtTime(c.listing.pickupTo)}` : ''}</td>
                <td><span className={`chip ${STATUS[c.status]}`}>{c.status[0].toUpperCase() + c.status.slice(1)}</span>{c.closedReason && <div className="sub">{c.closedReason}</div>}</td>
                <td className="actions">{c.status === 'claimed' && c.listing && new Date(c.listing.pickupFrom) > new Date() && <button type="button" className="btn ghost small" onClick={() => cancel(c)}>Cancel</button>}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
