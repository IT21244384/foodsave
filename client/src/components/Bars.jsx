// Simple horizontal bar chart for one measure. Every bar shows its value as text, so the chart
// needs no axis, works with a screen reader and doubles as its own data table.
export default function Bars({ title, rows, unit = 'meals', emptyText = 'No records for this period.' }) {
  const max = Math.max(...rows.map((r) => r.meals), 0);
  return (
    <div className="card">
      <h2>{title}</h2>
      {max === 0 ? <div className="sub">{emptyText}</div> : (
        <table className="bars">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label || r.name} title={`${r.label || r.name}: ${r.meals} ${unit}`}>
                <th scope="row">{r.label || r.name}</th>
                <td className="bar-cell"><span className="bar" style={{ width: `${(r.meals / max) * 100}%` }} /></td>
                <td className="bar-value">{r.meals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
