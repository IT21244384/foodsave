import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { PageHead, Spinner, Empty, Banner, TextInput } from '../../components/ui.jsx';
import { rs, fmtTime, fmtDateTime } from '../../lib.js';

const OPEN = ['reserved', 'claimed'];
const STATUS = { reserved: 's-reserved', claimed: 's-reserved', collected: 's-collected', cancelled: 's-withdrawn', 'no-show': 's-expired' };
const label = (s) => s[0].toUpperCase() + s.slice(1);

// F1 – FR1.5 hand-over: confirm a pickup by its code (Janahan R).
export default function Handover() {
  const [rows, setRows] = useState(null);
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [notice, setNotice] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api('/handover').then(setRows).catch((e) => setNotice({ kind: 'warn', text: e.message })), []);
  useEffect(() => { load(); }, [load]);

  async function collect(e) {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!/^(FS|DN)-\d{4}$/.test(value)) return setFieldError('Enter a code like FS-4821 or DN-5120.');
    setBusy(true);
    setFieldError('');
    try {
      const r = await api('/handover/collect', { method: 'POST', body: { code: value } });
      const pay = r.kind === 'claim' ? 'Donation, nothing to pay.' : `Collect ${rs(r.amount)}.`;
      setNotice({ kind: 'ok', text: `${r.code} confirmed: ${r.listing.item} × ${r.quantity} for ${r.person}. ${pay}` });
      setCode('');
      load();
    } catch (err) {
      setNotice({ kind: 'warn', text: err.message });
      if (err.fields.code) setFieldError(err.fields.code);
    } finally {
      setBusy(false);
    }
  }

  async function noShow(r) {
    if (!window.confirm(`Mark ${r.code} as not collected?`)) return;
    try {
      await api(`/handover/${r.kind}/${r.id}/no-show`, { method: 'POST' });
      setNotice({ kind: 'ok', text: `${r.code} was marked as not collected.` });
      load();
    } catch (err) {
      setNotice({ kind: 'warn', text: err.message });
    }
  }

  const open = (rows || []).filter((r) => OPEN.includes(r.status));
  const closed = (rows || []).filter((r) => !OPEN.includes(r.status));
  const now = new Date();

  return (
    <>
      <PageHead title="Hand-over" sub="Ask for the pickup code, enter it here, then hand over the food." owner="F1 · FR1.5 · Janahan R" />
      {notice.text && <Banner kind={notice.kind}>{notice.text}</Banner>}
      <form className="card" onSubmit={collect} style={{ marginBottom: 16 }} noValidate>
        <div className="row">
          <TextInput label="Pickup code" placeholder="FS-4821" autoComplete="off" value={code} error={fieldError} onChange={(e) => { setCode(e.target.value); setFieldError(''); }} />
          <button className="btn primary" style={{ marginBottom: 14 }} disabled={busy}>{busy ? 'Checking…' : 'Confirm collection'}</button>
        </div>
      </form>
      <div className="card">
        <h2>Waiting to be collected</h2>
        {!rows ? <Spinner /> : open.length === 0 ? <Empty title="No pickups waiting">New reservations and claims appear here.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>Item</th><th>For</th><th>Pickup</th><th>To pay</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{open.map((r) => (
              <tr key={r.id}>
                <td><b className="mono">{r.code}</b></td>
                <td>{r.listing.item} × {r.quantity}</td>
                <td>{r.person}<div className="sub">{r.phone || 'No phone given'}</div></td>
                <td>{fmtTime(r.listing.pickupFrom)} – {fmtTime(r.listing.pickupTo)}</td>
                <td>{r.kind === 'claim' ? 'Donation' : rs(r.amount)}</td>
                <td className="actions">{new Date(r.listing.pickupTo) <= now && <button type="button" className="btn ghost small" onClick={() => noShow(r)}>Mark no-show</button>}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </div>
      {closed.length > 0 && (
        <div className="card">
          <h2>Recent history</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>Item</th><th>For</th><th>Collected</th><th>Status</th></tr></thead>
            <tbody>{closed.map((r) => (
              <tr key={r.id}>
                <td><span className="mono">{r.code}</span></td>
                <td>{r.listing.item} × {r.quantity}</td>
                <td>{r.person}</td>
                <td>{r.collectedAt ? fmtDateTime(r.collectedAt) : '—'}</td>
                <td><span className={`chip ${STATUS[r.status]}`}>{label(r.status)}</span></td>
              </tr>))}
            </tbody>
          </table></div>
        </div>
      )}
    </>
  );
}
