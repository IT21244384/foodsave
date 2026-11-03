import { useEffect, useState } from 'react';
import { api, downloadProtectedFile } from '../../api.js';
import { PageHead, Spinner, Banner, Select } from '../../components/ui.jsx';
import Bars from '../../components/Bars.jsx';
import Kpis from '../../components/Kpis.jsx';
import { lastMonths, rs } from '../../lib.js';

// F1 – FR1.6 monthly report with charts and a PDF (Janahan R).
export default function Reports() {
  const months = lastMonths();
  const [month, setMonth] = useState(months[0].value);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api(`/restaurants/me/report?month=${month}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [month]);

  async function download() {
    try { await downloadProtectedFile(`/restaurants/me/report.pdf?month=${month}`, `foodsave-report-${month}.pdf`); } catch (e) { setError(e.message); }
  }

  return (
    <>
      <PageHead title="Monthly report" sub="Only food that was actually collected is counted." owner="F1 · FR1.6 · Janahan R" />
      {error && <Banner kind="warn">{error}</Banner>}
      <div className="card" style={{ marginBottom: 16, paddingBottom: 6 }}>
        <div className="filters">
          <Select label="Month" value={month} onChange={(e) => setMonth(e.target.value)} options={months} />
          <button type="button" className="btn ghost" style={{ marginBottom: 14 }} onClick={download}>Download PDF</button>
        </div>
      </div>
      {!data ? (error ? null : <Spinner />) : (
        <>
          <Kpis totals={data.totals} />
          <div className="grid g2">
            <Bars title="Meals saved by week" rows={data.byWeek} />
            <Bars title="Top items" rows={data.topItems} />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Listings this month</h2>
            <table><tbody>
              {[['Listings posted', data.listings.posted], ['Packs offered', data.listings.packsOffered], ['Packs not collected', data.listings.packsUncollected], ['Saved by customers', rs(data.totals.customerSavings)]].map(([k, v]) => <tr key={k}><td className="sub">{k}</td><td><b>{v}</b></td></tr>)}
            </tbody></table>
            <p className="hint">Weight is an estimate: cooked 0.4 kg, bakery and packaged 0.3 kg per pack.</p>
          </div>
        </>
      )}
    </>
  );
}
