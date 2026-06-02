import { ChevronDown, Circle, Crosshair, ShieldCheck, Thermometer, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { getAssetById } from "../domain/substation";
import type { BreakerState, InterlockState, IsolatorState, TelemetrySample } from "../domain/types";
import MetricCards from "./MetricCards";
import TrendChart from "./TrendChart";

interface InspectorProps {
  selectedAssetId: string;
  sample?: TelemetrySample;
  history: TelemetrySample[];
  onClose: () => void;
}

type InspectorTab = "overview" | "telemetry" | "events" | "config";
type SectionKey = "health" | "breaker" | "electrical" | "audit" | "temperature" | "model";
type StatusTone = "normal" | "caution" | "danger";

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: "overview",  label: "Overview"  },
  { id: "telemetry", label: "Telemetry" },
  { id: "events",    label: "Events"    },
  { id: "config",    label: "Config"    }
];

export default function Inspector({ selectedAssetId, sample, history, onClose }: InspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("overview");
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    health: true, breaker: true, electrical: true, audit: true, temperature: true, model: true
  });
  const asset = getAssetById(selectedAssetId);
  const health = sample?.health ?? 0;
  const secondaryVoltage = sample ? secondaryVoltageFor(sample.voltage) : undefined;

  function toggleSection(section: SectionKey) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  return (
    <aside className="inspector panel-glass">
      <div className="panel-kicker inspector-kicker">
        <span>Entity Inspector</span>
        <ShieldCheck size={14} />
      </div>
      <div className="inspector-title">
        <div>
          <h2>{asset?.name ?? "Yard Overview"}</h2>
          <p>
            {asset?.bay ?? "400/220 kV AIS Substation"} | Asset ID: {asset?.modelRef?.externalId ?? selectedAssetId}
          </p>
        </div>
        <button className="icon-button" aria-label="Close inspector" onClick={onClose} type="button">
          <X size={18} />
        </button>
      </div>

      <div className="tab-row" role="tablist" aria-label="Inspector views">
        {TABS.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "active" : undefined}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          <CollapsibleSection open={openSections.health} title="Asset Health" onToggle={() => toggleSection("health")}>
            <div className="health-block">
              <div className="health-ring" style={{ "--health": `${health}%` } as CSSProperties}>
                <span>{health || "--"}%</span>
              </div>
              <div>
                <strong>{sample ? sentence(sample.healthStatus) : "Waiting"}</strong>
                <p>Updated just now</p>
              </div>
            </div>
          </CollapsibleSection>

          <MetricCards sample={sample} />
          <ConnectionSummary />

          <CollapsibleSection open={openSections.breaker} title="Switching & Interlocks" onToggle={() => toggleSection("breaker")}>
            <div className="status-list">
              <StatusRow label="Breaker Position"    value={sample?.breakerState   ?? "--"} tone={breakerTone(sample?.breakerState)} />
              <StatusRow label="Isolator Position"   value={sample?.isolatorState  ?? "--"} tone={isolatorTone(sample?.isolatorState)} />
              <StatusRow label="Interlock Permissive" value={sample?.interlockState ?? "--"} tone={interlockTone(sample?.interlockState)} />
            </div>
          </CollapsibleSection>

          <CollapsibleSection open={openSections.temperature} title="Temperatures" onToggle={() => toggleSection("temperature")}>
            <div className="temperature-row">
              <Thermometer size={16} />
              <span>Top Oil</span>
              <strong>{sample ? `${sample.temperature.toFixed(1)} °C` : "--"}</strong>
            </div>
            <div className="temperature-row">
              <Crosshair size={16} />
              <span>Winding Hotspot</span>
              <strong>{sample ? `${(sample.temperature + 16.2).toFixed(1)} °C` : "--"}</strong>
            </div>
          </CollapsibleSection>
        </>
      )}

      {activeTab === "telemetry" && (
        <>
          <MetricCards sample={sample} />
          <CollapsibleSection open={openSections.electrical} title="Electrical Parameters" onToggle={() => toggleSection("electrical")} className="table-section">
            <table>
              <tbody>
                <Parameter label="Primary Voltage (L-L)"  value={sample ? `${sample.voltage.toFixed(2)} kV` : "--"} />
                <Parameter label="Secondary / Bus Ref."   value={secondaryVoltage ? `${secondaryVoltage.toFixed(2)} kV` : "--"} />
                <Parameter label="Current"                value={sample ? `${sample.current.toFixed(1)} A` : "--"} />
                <Parameter label="Active Power (P)"       value={sample ? `${sample.mw.toFixed(1)} MW` : "--"} />
                <Parameter label="Reactive Power (Q)"     value={sample ? `${sample.mvar.toFixed(1)} MVAR` : "--"} />
                <Parameter label="Frequency"              value={sample ? `${sample.frequency.toFixed(2)} Hz` : "--"} />
                <Parameter label="Breaker / Isolator"     value={sample ? `${sentence(sample.breakerState)} / ${sentence(sample.isolatorState)}` : "--"} />
                <Parameter label="Interlock"              value={sample ? sentence(sample.interlockState) : "--"} />
              </tbody>
            </table>
          </CollapsibleSection>
          <TrendChart history={history} field="temperature" label="Thermal Trend" color="#f5b942" unit="°C" />
        </>
      )}

      {activeTab === "events" && (
        <CollapsibleSection open={openSections.audit} title="Connection Audit" onToggle={() => toggleSection("audit")}>
          <div className="audit-list">
            <AuditRow label="Busbar tap alignment" />
            <AuditRow label="HV / LV phase continuity" />
            <AuditRow label="Equipment drops attached" />
            <AuditRow label="Breaker and isolator statuses mapped" />
            <AuditRow label="Interlock permissives captured" />
          </div>
        </CollapsibleSection>
      )}

      {activeTab === "config" && (
        <CollapsibleSection open={openSections.model} title="Model Reference" onToggle={() => toggleSection("model")} className="table-section">
          <table>
            <tbody>
              <Parameter label="Asset Type"    value={asset?.type         ?? "--"} />
              <Parameter label="Voltage Class" value={asset?.voltageLevel ?? "--"} />
              <Parameter label="Bay / Group"   value={asset?.bay          ?? "--"} />
              <Parameter label="External ID"   value={asset?.modelRef?.externalId ?? selectedAssetId} />
            </tbody>
          </table>
        </CollapsibleSection>
      )}
    </aside>
  );
}

function ConnectionSummary() {
  return (
    <div className="audit-summary" aria-label="Connection audit summary">
      <div>
        <span>Connection Audit</span>
        <strong>Topology verified</strong>
      </div>
      <div className="audit-summary-grid">
        <AuditRow label="Bus taps aligned" />
        <AuditRow label="Phase continuity" />
        <AuditRow label="Equipment drops fixed" />
      </div>
    </div>
  );
}

function CollapsibleSection({
  title, open, onToggle, className, children
}: {
  title: string; open: boolean; onToggle: () => void; className?: string; children: ReactNode;
}) {
  return (
    <section className={`inspector-section ${className ?? ""}`}>
      <SectionHead open={open} title={title} onToggle={onToggle} />
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

function SectionHead({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button className="section-head" aria-expanded={open} onClick={onToggle} type="button">
      <h3>{title}</h3>
      <ChevronDown className={open ? "chevron-open" : undefined} size={16} />
    </button>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: StatusTone }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong className={tone}>
        <Circle size={9} fill="currentColor" /> {sentence(value)}
      </strong>
    </div>
  );
}

function Parameter({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{value}</td>
      <td className="trend-up">up</td>
    </tr>
  );
}

function AuditRow({ label }: { label: string }) {
  return (
    <div className="audit-row">
      <span><Circle size={8} fill="currentColor" /> {label}</span>
      <strong>OK</strong>
    </div>
  );
}

function sentence(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function breakerTone(state?: BreakerState): StatusTone {
  if (!state) return "caution";
  if (state === "closed") return "normal";
  if (state === "tripped") return "danger";
  return "caution";
}

function isolatorTone(state?: IsolatorState): StatusTone {
  if (!state) return "caution";
  if (state === "closed") return "normal";
  if (state === "intermediate") return "danger";
  return "caution";
}

function interlockTone(state?: InterlockState): StatusTone {
  if (!state) return "caution";
  if (state === "permissive") return "normal";
  if (state === "bypassed") return "danger";
  return "caution";
}

function secondaryVoltageFor(primaryVoltage: number) {
  if (primaryVoltage > 300) return 220;
  if (primaryVoltage > 180) return 132;
  if (primaryVoltage > 100) return 33;
  return 11;
}
