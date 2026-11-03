import { useEffect, useState } from 'react';
import { api, downloadProtectedFile, qs } from '../../api.js';
import { PageHead, Spinner, Banner, Select } from '../../components/ui.jsx';
import Bars from '../../components/Bars.jsx';
import Kpis from '../../components/Kpis.jsx';
import { lastMonths, rs } from '../../lib.js';

// F2 – FR2.6 platform impact dashboard and monthly PDF (Abisheak S).
export default function Impact() {
  const months = lastMonths();
  const [month, setMonth] = useState(months[0].value);
  const [area, setArea] = useState('');
  const [areas, setAreas] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const query = qs({ month, area });

  useEffect(() => {
    setData(null);
    api(`/admin/impact?${query}`).then((d) => { setData(d); setAreas(d.areas); setError(''); }).catch((e) => setError(e.message));
  }, [query]);

  async function download() {
    try { await downloadProtectedFile(`/admin/impact/report.pdf?${query}`, `foodsave-impact-${month}.pdf`); } catch (e) { setError(e.message); }
  }

  return (
    <>
      <PageHead title="Impact dashboard" sub="Totals come from collected reservations and claims." owner="F2 · FR2.6 · Abisheak S" />
      {error && <Banner kind="warn">{error}</Banner>}
      <div className="card" style={{ marginBottom: 16, paddingBottom: 6 }}>
        <div className="filters">
          <Select label="Month" value={month} onChange={(e) => setMonth(e.target.value)} options={months} />
          <Select label="Area" value={area} onChange={(e) => setArea(e.target.value)} options={[{ value: '', label: 'All areas' }, ...areas.map((a) => ({ value: a, label: a }))]} />
          <button type="button" className="btn ghost" style={{ marginBottom: 14 }} onClick={download}>Download PDF</button>
        </div>
      </div>
      {!data ? (error ? null : <Spinner />) : (
        <>
          <Kpis totals={data.totals} />
          <div className="grid g3">
            <Bars title="Meals saved by week" rows={data.byWeek} />
            <Bars title="Top restaurants" rows={data.topRestaurants} />
            <Bars title="Donations per charity" rows={data.perCharity} unit="packs" />
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            Customers saved {rs(data.totals.customerSavings)}. Food donated was worth {rs(data.totals.donationValue)}. Weight is an estimate: cooked 0.4 kg, bakery and packaged 0.3 kg per pack.
          </p>
        </>
      )}
    </>
  );
}
