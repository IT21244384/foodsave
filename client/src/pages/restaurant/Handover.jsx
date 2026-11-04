import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { PageHead, Tag, Spinner, Empty, Banner, TextInput } from '../../components/ui.jsx';
import { rs, kg, fmtTime, timeLeft } from '../../lib.js';
import StatusBanner from './StatusBanner.jsx';

// F1 – FR1.5 hand-over confirmation. Staff type the code the customer or charity shows them.
export default function Handover() {
  const { profile } = useAuth();
  const approved = profile?.status === 'approved';
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const inputRef = useRef(null);

  const loadPending = useCallback(() => {
    api('/handover/pending').then(setPending).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!approved) return undefined;
    loadPending();
    const t = setInterval(loadPending, 30000); // new bookings appear without a reload
    return () => clearInterval(t);
  }, [approved, loadPending]);

  async function submit(e) {
    e.preventDefault();
    if (!/^(fs[-\s]?)?\d{4}$/i.test(code.trim())) {
      setFieldError('A pickup code looks like FS-1234.');
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api('/handover/confirm', { method: 'POST', body: { code: code.trim() } }));
      setCode('');
      loadPending();
    } catch (err) {
      setFieldError(err.fields.code || '');
      setError(err.message);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      <PageHead title="Hand-over" sub="Confirm each pickup with the code the customer or charity shows you." owner="F1 · FR1.5 · Janahan R" />
      <StatusBanner profile={profile} />
      <div className="grid split">
        <div className="card">
          <h2>Confirm a pickup</h2>
          <form onSubmit={submit} noValidate>
            <div className="row">
              <TextInput label="Pickup code" placeholder="FS-1234" autoComplete="off" autoFocus maxLength={8} value={code} error={fieldError}
                ref={inputRef} disabled={!approved}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setFieldError(''); }} />
              <button className="btn primary" disabled={busy || !approved || !code.trim()}>{busy ? 'Checking…' : 'Confirm hand-over'}</button>
            </div>
          </form>
          {error && <Banner kind="warn">{error}</Banner>}
          {result && (
            <Banner kind="ok" title={`Handed over: ${result.code}.`}>
              {result.quantity} × {result.item} · {kg(result.kgSaved)} saved ·{' '}
              {result.type === 'claim' ? 'donation, nothing to collect' : <>collect <b>{rs(result.amountDue)}</b></>}
              {result.listingStatus === 'collected' && ' · This listing is now fully collected.'}
            </Banner>
          )}
        </div>
        <aside className="card tint">
          <h2>At the counter</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Ask for the pickup code. It is shown on the customer’s reservation.</li>
            <li>Codes are not listed here, so only the person who booked can collect.</li>
            <li>Food past its safe-until time cannot be handed over.</li>
            <li>Each code works once. Portions and kg saved go into your monthly report.</li>
          </ul>
        </aside>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Waiting for pickup</h2>
        {!approved ? <Empty title="Not available yet">Hand-over opens once your restaurant is verified.</Empty>
          : !pending ? <Spinner /> : pending.length === 0 ? (
            <Empty title="No pickups waiting">Reservations and charity claims on your listings will appear here.</Empty>
          ) : (
            <div className="table-wrap"><table>
              <thead><tr><th>Collected by</th><th>Item</th><th>Packs</th><th>Pickup window</th><th>Safe until</th><th>To collect</th></tr></thead>
              <tbody>{pending.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b><div>{p.type === 'claim' ? <Tag donate>Charity claim</Tag> : <Tag>Reservation</Tag>}</div></td>
                  <td>{p.item}</td>
                  <td>{p.quantity}<div className="sub">{kg(p.kg)}</div></td>
                  <td>{fmtTime(p.pickupFrom)} – {fmtTime(p.pickupTo)}</td>
                  <td>{fmtTime(p.safeUntil)}<div className="time">{timeLeft(p.safeUntil)}</div></td>
                  <td>{p.type === 'claim' ? 'Free' : rs(p.amountDue)}</td>
                </tr>))}
              </tbody>
            </table></div>
          )}
      </div>
    </>
  );
}
