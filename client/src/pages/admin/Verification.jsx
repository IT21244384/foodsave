import { useCallback, useEffect, useState } from 'react';
import { api, openProtectedFile } from '../../api.js';
import { PageHead, Chip, Spinner, Empty, Banner, Select } from '../../components/ui.jsx';

const KINDS = { charities: 'Charities (FR2.1)', restaurants: 'Restaurants (FR1.1)' };

// Admin verification of charities (F2 – FR2.1) and restaurants (F1 – FR1.1).
export default function Verification() {
  const [kind, setKind] = useState('charities');
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [rejecting, setRejecting] = useState(null); // { id, reason, error }
  const [notice, setNotice] = useState({});

  const load = useCallback(() => {
    setRows(null);
    api(`/admin/${kind}?status=${status}`).then(setRows).catch((e) => setNotice({ kind: 'warn', text: e.message }));
    api('/admin/summary').then(setSummary).catch(() => {});
  }, [kind, status]);
  useEffect(load, [load]);

  async function decide(row, decision, reason) {
    try {
      await api(`/admin/${kind}/${row.id}/review`, { method: 'PATCH', body: { decision, reason } });
      setRejecting(null);
      setNotice({ kind: 'ok', text: `${row.name} was ${decision}.` });
      load();
    } catch (e) {
      if (decision === 'rejected') setRejecting((r) => ({ ...r, error: e.fields.reason || e.message }));
      else setNotice({ kind: 'warn', text: e.message });
    }
  }

  async function viewDoc(row) {
    try { await openProtectedFile(`/admin/charities/${row.id}/document`); } catch (e) { setNotice({ kind: 'warn', text: e.message }); }
  }

  return (
    <>
      <PageHead title="Verification" sub="Approve restaurants before they post and charities before they claim donations." owner="F1 · FR1.1 / F2 · FR2.1" />
      {summary && (
        <div className="grid g4" style={{ marginBottom: 16 }}>
          <div className="card kpi"><div className="v">{summary.pendingCharities}</div><div className="l">Charities waiting</div></div>
          <div className="card kpi"><div className="v">{summary.pendingRestaurants}</div><div className="l">Restaurants waiting</div></div>
          <div className="card kpi"><div className="v">{summary.approvedCharities}</div><div className="l">Approved charities</div></div>
          <div className="card kpi"><div className="v">{summary.activeListings}</div><div className="l">Active listings now</div></div>
        </div>
      )}
      {notice.text && <Banner kind={notice.kind}>{notice.text}</Banner>}
      <div className="card">
        <div className="filters" style={{ marginBottom: 12 }}>
          <div className="field" style={{ flex: 'none' }}>
            <span className="f">Show</span>
            <div className="seg" role="group" aria-label="Account type">
              {Object.entries(KINDS).map(([k, label]) => <button type="button" key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setRejecting(null); }}>{label}</button>)}
            </div>
          </div>
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' }]} />
        </div>
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty title={`No ${status === 'all' ? '' : status} ${kind}`}>Nothing to review right now.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Registration no.</th><th>Contact</th>{kind === 'charities' && <th>Certificate</th>}<th>Area</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><b>{r.name}</b><div className="sub">{r.owner?.email}</div></td>
                <td>{r.regNo || r.businessRegNo}</td>
                <td>{r.contactPerson || r.owner?.name}<div className="sub">{r.phone}</div></td>
                {kind === 'charities' && <td><button type="button" className="btn ghost small" onClick={() => viewDoc(r)}>View {r.document?.mimeType === 'application/pdf' ? 'PDF' : 'image'}</button></td>}
                <td>{r.area}</td>
                <td><Chip status={r.status} />{r.status === 'rejected' && <div className="sub">{r.rejectionReason}</div>}</td>
                <td className="actions">
                  {r.status !== 'approved' && <button type="button" className="btn green small" onClick={() => decide(r, 'approved')}>Approve</button>}{' '}
                  {r.status !== 'rejected' && <button type="button" className="btn ghost small" onClick={() => setRejecting({ id: r.id, reason: '', error: '' })}>Reject</button>}
                  {rejecting?.id === r.id && (
                    <form style={{ marginTop: 8, textAlign: 'left' }} onSubmit={(e) => { e.preventDefault(); if ((rejecting.reason || '').trim().length < 5) return setRejecting({ ...rejecting, error: 'Give a reason of at least 5 characters.' }); decide(r, 'rejected', rejecting.reason.trim()); }}>
                      <label className="f" htmlFor={`reason-${r.id}`}>Reason (sent to the applicant)</label>
                      <textarea id={`reason-${r.id}`} rows={2} maxLength={300} value={rejecting.reason} className={rejecting.error ? 'bad' : ''} onChange={(e) => setRejecting({ ...rejecting, reason: e.target.value, error: '' })} />
                      {rejecting.error && <div className="err" role="alert">{rejecting.error}</div>}
                      <div className="row" style={{ marginTop: 6 }}><button className="btn primary small">Confirm reject</button><button type="button" className="btn ghost small" onClick={() => setRejecting(null)}>Cancel</button></div>
                    </form>
                  )}
                </td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
