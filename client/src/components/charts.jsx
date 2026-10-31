import { useState } from 'react';

const valueOf = (d) => Number(d.value ?? d.count ?? 0);
const fmtDay = (s) => new Date(s + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const compact = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n));

/** Smallest 1 / 2 / 5 × 10^k at or above n, so axis ticks are round numbers. */
function niceMax(n) {
  if (n <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= n);
}

/**
 * Single-series column chart (one hue, no legend — the card title names the series).
 * Hairline gridlines at 0 / half / max, the peak labelled on its cap, and a hover/focus
 * tooltip on every column (the hit target is the full column slot).
 */
export function ColumnChart({ data, unit = '', height = 120, color = 'var(--ng-navy-2)', axis = false }) {
  const [hover, setHover] = useState(null);
  const values = data.map(valueOf);
  const peak = Math.max(...values, 0);
  const max = axis ? niceMax(peak) : Math.max(1, peak);
  const peakIndex = peak > 0 ? values.lastIndexOf(peak) : -1;
  return (
    <figure className={`m-0 ng-colchart ${axis ? 'with-axis' : ''}`}>
      {axis && (
        <div className="ng-colchart-grid" style={{ height: height - 18 }} aria-hidden="true">
          {[max, max / 2, 0].map((v) => <div key={v}><span>{compact(v)}</span></div>)}
        </div>
      )}
      <div className="ng-bars" style={{ height }} role="img" aria-label={data.map((d, i) => `${fmtDay(d.day)}: ${values[i]} ${unit}`).join(', ')}>
        {data.map((d, i) => {
          const pct = (values[i] / max) * 100;
          return (
            <div key={d.day} tabIndex={0} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} style={{ position: 'relative', cursor: 'default' }}>
              {hover === i && (
                <div className="ng-tip" style={{ bottom: `calc((100% - 18px) * ${pct / 100} + 24px)` }}>
                  <strong>{values[i]}</strong> {unit}<br /><span>{fmtDay(d.day)}</span>
                </div>
              )}
              {axis && i === peakIndex && hover === null && <span className="ng-bar-cap" style={{ bottom: `calc((100% - 18px) * ${pct / 100} + 20px)` }}>{values[i]}</span>}
              <div className="bar" style={{ height: `calc((100% - 18px) * ${pct / 100})`, minHeight: values[i] ? 2 : 0, background: color, opacity: hover === null || hover === i ? 1 : 0.55 }} />
              <small>{i % 2 === (data.length - 1) % 2 ? new Date(d.day + 'T00:00').getDate() : ' '}</small>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/** Ranked horizontal bars with the value printed in text ink beside each bar. */
export function BarList({ items, color = 'var(--ng-saffron)', empty = 'No data yet.' }) {
  const max = Math.max(1, ...items.map((i) => Number(i.value)));
  if (!items.length) return <div className="small text-muted py-3">{empty}</div>;
  return (
    <div>
      {items.map((i) => (
        <div className="ng-hbar" key={i.label} title={`${i.label}: ${i.value}`}>
          <span className="lbl">{i.label}</span>
          <span className="track"><span className="fill d-block" style={{ width: `${(Number(i.value) / max) * 100}%`, background: color }} /></span>
          <span className="num">{i.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Trend line for a stat tile: 2px line, a 10% wash under it and a ringed dot on the latest value. */
export function Sparkline({ data, color = 'var(--ng-navy-2)', height = 36, label }) {
  const values = data.map(valueOf);
  if (values.length < 2) return null;
  const w = 240; // about the rendered width, so the dot and stroke stay near true size
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - 5 - (v / max) * (height - 10)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts.at(-1);
  return (
    <svg className="ng-spark" viewBox={`-6 0 ${w + 12} ${height}`} role="img" aria-label={label}>
      <polygon points={`0,${height} ${line} ${w},${height}`} fill={color} opacity=".1" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="4" fill={color} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
