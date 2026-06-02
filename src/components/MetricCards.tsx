import type { TelemetrySample } from "../domain/types";

export default function MetricCards({ sample }: { sample?: TelemetrySample }) {
  const metrics = [
    { label: "Voltage",      value: sample ? `${sample.voltage.toFixed(2)} kV` : "--", tone: "cyan"    },
    { label: "Current",      value: sample ? `${sample.current.toFixed(1)} A`  : "--", tone: "green"   },
    { label: "Load",         value: sample ? `${sample.mw.toFixed(1)} MW`      : "--", tone: "amber"   },
    { label: "Power Factor", value: sample ? sample.powerFactor.toFixed(2)     : "--", tone: "neutral" }
  ];

  return (
    <div className="metric-grid">
      {metrics.map((metric) => (
        <div className={`metric-card ${metric.tone}`} key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}
    </div>
  );
}
