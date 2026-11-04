import { useEffect, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { PageHead, Spinner, Empty, Banner, Select } from '../../components/ui.jsx';
import { rs, kg } from '../../lib.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

// Chart colours, checked with a colour-blindness validator against the white card surface.
// Sold and donated (orange matches the app's donation tag) stay apart for colour-blind readers.
// Single-measure charts use one green.
const C = { sold: '#2A78D6', donated: '#E4572E', single: '#3A8A5C', grid: '#E7EEE2', axis: '#5B6B62', surface: '#FFFFFF' };
const FONT = { family: '"Segoe UI", Calibri, Arial, sans-serif', size: 12 };
const RANGES = [{ value: '3', label: 'Last 3 months' }, { value: '6', label: 'Last 6 months' }, { value: '12', label: 'Last 12 months' }];

// Shared options: one y-axis, recessive grid, tooltips on hover.
function baseOptions({ format, titles, stacked = false, legend = false }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: legend, position: 'top', align: 'start', labels: { font: FONT, color: C.axis, boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 2 } },
      tooltip: { callbacks: { title: (items) => titles[items[0].dataIndex], label: (ctx) => `${ctx.dataset.label}: ${format(ctx.parsed.y)}` } },
    },
    scales: {
      x: { stacked, grid: { display: false }, border: { color: C.grid }, ticks: { font: FONT, color: C.axis, maxRotation: 0, autoSkipPadding: 8 } },
      y: { stacked, beginAtZero: true, grid: { color: C.grid }, border: { display: false }, ticks: { font: FONT, color: C.axis, precision: 0, callback: (v) => format(v) } },
    },
  };
}

const bar = (label, data, color, extra = {}) => ({
  label, data, backgroundColor: color, maxBarThickness: 28, borderRadius: 4, borderSkipped: 'start', ...extra,
});

export default function Reports() {
  const { profile } = useAuth();
  const [months, setMonths] = useState('6');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setReport(null);
    api(`/restaurants/me/report?months=${months}`).then((r) => { setReport(r); setError(''); }).catch((e) => setError(e.message));
  }, [months]);

  const rows = report?.months || [];
  // The last month is the current one, so it is only partly over.
  const titles = rows.map((m, i) => (i === rows.length - 1 ? `${m.label} (so far)` : m.label));
  const labels = rows.map((m, i) => (i === rows.length - 1 ? `${m.label.split(' ')[0]}*` : m.label.split(' ')[0]));
  const opts = (extra) => baseOptions({ titles, ...extra });
  const t = report?.totals;
  const hasData = t && (t.portionsSold + t.portionsDonated) > 0;
  const range = rows.length ? `${rows[0].label} – ${rows[rows.length - 1].label}` : '';

  // Stacked sold + donated. The lower segment gets a 2px white top edge so the two fills don't touch;
  // only the top segment has rounded corners.
  const portions = {
    labels,
    datasets: [
      bar('Sold', rows.map((m) => m.portionsSold), C.sold, { borderRadius: 0, borderColor: C.surface, borderWidth: { top: 2 } }),
      bar('Donated', rows.map((m) => m.portionsDonated), C.donated, { borderRadius: { topLeft: 4, topRight: 4 } }),
    ],
  };
  const kgData = { labels, datasets: [bar('Food saved', rows.map((m) => m.kgSaved), C.single)] };
  const money = {
    labels,
    datasets: [{
      label: 'Cost recovered', data: rows.map((m) => m.costRecovered), borderColor: C.single, backgroundColor: C.single,
      borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: C.surface, pointBorderWidth: 2, tension: 0,
      segment: { borderDash: (ctx) => (ctx.p1DataIndex === rows.length - 1 ? [5, 4] : undefined) }, // current month is incomplete
    }],
  };

  return (
    <>
      <PageHead title="Reports" sub={`${profile?.name || 'Your restaurant'} · food handed over${range ? `, ${range}` : ''}`} owner="F1 report · Janahan R">
        <div className="filters no-print">
          <Select label="Period" value={months} onChange={(e) => setMonths(e.target.value)} options={RANGES} />
          <button type="button" className="btn ghost" onClick={() => window.print()} disabled={!hasData}>Print</button>
        </div>
      </PageHead>
      {error && <Banner kind="warn">{error}</Banner>}
      {!report ? (!error && <Spinner />) : (
        <>
          <div className="grid g4">
            <div className="card kpi"><div className="v">{t.portionsSold + t.portionsDonated}</div><div className="l">Portions handed over</div></div>
            <div className="card kpi"><div className="v">{kg(t.kgSaved)}</div><div className="l">Food saved from the bin</div></div>
            <div className="card kpi"><div className="v">{rs(t.costRecovered)}</div><div className="l">Cost recovered from sales</div></div>
            <div className="card kpi"><div className="v">{t.portionsDonated}</div><div className="l">Portions donated to charities</div></div>
          </div>

          {!hasData ? (
            <div className="card" style={{ marginTop: 16 }}>
              <Empty title="Nothing handed over in this period">Confirm pickups on the Hand-over page and they will appear here.</Empty>
            </div>
          ) : (
            <>
              <div className="grid g3 report-charts" style={{ marginTop: 16 }}>
                <figure className="card chart">
                  <figcaption><h2>Portions per month</h2><p className="sub">Sold to customers and donated to charities</p></figcaption>
                  <div className="chart-box"><Bar data={portions} options={opts({ format: (v) => `${v}`, stacked: true, legend: true })}
                    role="img" aria-label={`Stacked bar chart of portions sold and donated per month, ${range}. Values are in the table below.`} /></div>
                </figure>
                <figure className="card chart">
                  <figcaption><h2>Kg of food saved</h2><p className="sub">Packs handed over × weight per pack</p></figcaption>
                  <div className="chart-box"><Bar data={kgData} options={opts({ format: (v) => kg(v) })}
                    role="img" aria-label={`Bar chart of kilograms of food saved per month, ${range}. Values are in the table below.`} /></div>
                </figure>
                <figure className="card chart">
                  <figcaption><h2>Cost recovered</h2><p className="sub">Money taken for discounted packs</p></figcaption>
                  <div className="chart-box"><Line data={money} options={opts({ format: (v) => rs(v) })}
                    role="img" aria-label={`Line chart of cost recovered per month, ${range}. Values are in the table below.`} /></div>
                </figure>
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <h2>Monthly figures</h2>
                <div className="table-wrap"><table>
                  <thead><tr><th>Month</th><th className="num">Sold</th><th className="num">Donated</th><th className="num">Kg saved</th><th className="num">Cost recovered</th></tr></thead>
                  <tbody>{rows.map((m, i) => (
                    <tr key={m.month}><td>{titles[i]}</td><td className="num">{m.portionsSold}</td><td className="num">{m.portionsDonated}</td><td className="num">{kg(m.kgSaved)}</td><td className="num">{rs(m.costRecovered)}</td></tr>))}
                  </tbody>
                  <tfoot><tr><th>Total</th><th className="num">{t.portionsSold}</th><th className="num">{t.portionsDonated}</th><th className="num">{kg(t.kgSaved)}</th><th className="num">{rs(t.costRecovered)}</th></tr></tfoot>
                </table></div>
                <p className="sub" style={{ marginBottom: 0 }}>* {titles[titles.length - 1]}: the current month is not over yet. Only food actually handed over is counted; cancelled and no-show bookings are left out. Months follow Sri Lanka time.</p>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
