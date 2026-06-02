import type { TelemetrySample } from "../domain/types";

interface TrendChartProps {
  history: TelemetrySample[];
  field: "mw" | "voltage" | "current" | "temperature";
  label: string;
  color?: string;
  unit: string;
}

export default function TrendChart({ history, field, label, color = "#16d6ff", unit }: TrendChartProps) {
  const values = history.map((s) => s[field]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = Math.max(1, max - min);
  const points = values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 52 - ((value - min) / range) * 42;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="trend-card">
      <div className="chart-head">
        <span>{label}</span>
        <small>Last 48 samples</small>
      </div>
      <svg viewBox="0 0 100 58" preserveAspectRatio="none" role="img" aria-label={`${label} trend`}>
        <defs>
          <linearGradient id={`fill-${field}-${label.replace(/\W/g, "")}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.38" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d="M0 52 H100" className="chart-grid-line" />
        <path d="M0 31 H100" className="chart-grid-line" />
        <path d="M0 10 H100" className="chart-grid-line" />
        {points && <polyline points={points} fill="none" stroke={color} strokeWidth="1.7" vectorEffect="non-scaling-stroke" />}
        {points && (
          <polygon
            points={`0,58 ${points} 100,58`}
            fill={`url(#fill-${field}-${label.replace(/\W/g, "")})`}
          />
        )}
      </svg>
      <div className="chart-foot">
        <span>Min {min.toFixed(1)} {unit}</span>
        <span>Max {max.toFixed(1)} {unit}</span>
      </div>
    </div>
  );
}
