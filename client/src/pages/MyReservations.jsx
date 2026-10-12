import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { PageHead, Spinner, Empty, Banner } from '../components/ui.jsx';
import { rs, fmtTime, fmtDateTime } from '../lib.js';

const STATUS = { reserved: 's-reserved', collected: 's-collected', cancelled: 's-withdrawn', 'no-show': 's-expired' };

// F2 – FR2.3 a customer's reservations, with cancel before pickup (Abisheak S).
export default function MyReservations() {
  const { state } = useLocation();
  const just = state?.justReserved;
  const [rows, setRows] = useState(null);
  const [notice, setNotice] = useState({});

  const load = () => api('/reservations/mine').then(setRows).catch((e) => setNotice({ kind: 'warn', text: e.message }));
  useEffect(() => { load(); }, []);

  async function cancel(r) {
    if (!window.confirm(`Cancel your reservation ${r.pickupCode}? The packs will be offered to others.`)) return;
    try {
      await api(`/reservations/${r.id}/cancel`, { method: 'POST' });
      setNotice({ kind: 'ok', text: `Reservation ${r.pickupCode} was cancelled.` });
      load();
    } catch (e) {
      setNotice({ kind: 'warn', text: e.message });
    }
  }

  return (
    <>
      <PageHead title="My reservations" sub="Show the pickup code at the restaurant when you collect." owner="F2 · FR2.3 · Abisheak S" />
      {just && (
        <div className="grid g2" style={{ marginBottom: 16 }}>
          <div className="card">
            <h2>Reserved ✓</h2>
            <div className="code" aria-label="Pickup code">{just.pickupCode}</div>
            <p><b>{just.listing.item} × {just.quantity}</b> — collect {fmtTime(just.listing.pickupFrom)} – {fmtTime(just.listing.pickupTo)} at {just.listing.restaurant.name}, {just.listing.restaurant.area}.</p>
            <p>Pay at pickup: <b>{rs(just.listing.price * just.quantity)}</b></p>
          </div>
          <div className="card tint">
            <h2>Good to know</h2>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>The restaurant can see your reservation and code.</li>
              <li>Cancel before {fmtTime(just.listing.pickupFrom)} if you can’t make it — the packs go back to search.</li>
              <li>Your phone number is shared only with this restaurant.</li>
            </ul>
          </div>
        </div>
      )}
      {notice.text && <Banner kind={notice.kind}>{notice.text}</Banner>}
      <div className="card">
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <Empty title="No reservations yet"><Link to="/find">Find surplus food near you</Link></Empty>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr><th>Pickup code</th><th>Item</th><th>Restaurant</th><th>Pickup</th><th>Total</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><b className="mono">{r.pickupCode}</b></td>
                <td>{r.listing ? r.listing.item : '—'} × {r.quantity}</td>
                <td>{r.listing?.restaurant?.name}</td>
                <td>{r.listing ? `${fmtDateTime(r.listing.pickupFrom)} – ${fmtTime(r.listing.pickupTo)}` : ''}</td>
                <td>{r.listing ? rs(r.listing.price * r.quantity) : ''}</td>
                <td><span className={`chip ${STATUS[r.status]}`}>{r.status[0].toUpperCase() + r.status.slice(1)}</span></td>
                <td className="actions">{r.status === 'reserved' && r.listing && new Date(r.listing.pickupFrom) > new Date() && <button type="button" className="btn ghost small" onClick={() => cancel(r)}>Cancel</button>}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
