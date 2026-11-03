import { rs } from '../lib.js';

// The headline figures shared by the F1 monthly report and the F2 impact dashboard.
export default function Kpis({ totals }) {
  const items = [
    [totals.meals, 'Meals saved'],
    [`${totals.kg} kg`, 'Food diverted (estimated)'],
    [rs(totals.costRecovered), 'Cost recovered'],
    [totals.donatedPacks, 'Packs donated'],
  ];
  return (
    <div className="grid g4" style={{ marginBottom: 16 }}>
      {items.map(([v, l]) => <div className="card kpi" key={l}><div className="v">{v}</div><div className="l">{l}</div></div>)}
    </div>
  );
}
