import { AlertTriangle, CheckCircle2, CircleCheck, Info, Play, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { getAssetById } from "../domain/substation";
import type { AlarmEvent, BreakerState, InterlockState, IsolatorState, TelemetrySample } from "../domain/types";
import TrendChart from "./TrendChart";

interface BottomPanelProps {
  selectedAssetId: string;
  samples: Record<string, TelemetrySample>;
  history: TelemetrySample[];
  alarms: AlarmEvent[];
  onClose: () => void;
}

type StatusTone = "normal" | "caution" | "danger";
type SwitchField = "breakerState" | "isolatorState" | "interlockState";
type AuditCheck = { label: string; value: string; tone: StatusTone };

const HV_BAY_IDS = [
  "line-400-yerrampalem-1", "line-400-tirupati-1",
  "line-400-nellore-1", "line-400-hyderabad-1", "bay-400-bus-coupler"
];
const TRANSFORMER_BAY_IDS = ["ict-1", "ict-2"];
const LV_SWITCHGEAR_IDS = [
  "bay-220-bus-coupler",
  "feeder-220-madanapalle", "feeder-220-puttur", "feeder-220-pileru",
  "feeder-220-vempalle", "feeder-220-chittoor", "feeder-220-spare"
];
const MIMIC_FEEDERS = [
  { id: "feeder-220-madanapalle", label: "MDL", x: 60  },
  { id: "feeder-220-puttur",      label: "PUT", x: 140 },
  { id: "feeder-220-pileru",      label: "PIL", x: 220 },
  { id: "feeder-220-vempalle",    label: "VMP", x: 300 },
  { id: "feeder-220-chittoor",    label: "CHT", x: 380 },
  { id: "feeder-220-spare",       label: "SPR", x: 460 }
];

export default function BottomPanel({ selectedAssetId, samples, history, alarms, onClose }: BottomPanelProps) {
  const [expandedAlarms, setExpandedAlarms] = useState(false);
  const [ceaCheckVisible, setCeaCheckVisible] = useState(false);
  const selectedName = getAssetById(selectedAssetId)?.name ?? "Yard";
  const visibleAlarms = expandedAlarms ? alarms : alarms.slice(0, 2);

  return (
    <section className="bottom-deck panel-glass">
      <button className="deck-close icon-button" aria-label="Close telemetry deck" onClick={onClose} type="button">
        <X size={15} />
      </button>
      <div className="bottom-charts">
        <TrendChart history={history} field="mw"      label={`${selectedName} – Load`} unit="MW" />
        <TrendChart history={history} field="voltage" label="Voltage Profile" color="#7ee56b" unit="kV" />
        <TrendChart history={history} field="current" label="Current" color="#55a8ff" unit="A" />
      </div>

      <div className="event-grid">
        <div className="alarms-table">
          <div className="deck-title">
            <h2>Alarms ({alarms.length} Active)</h2>
            <button onClick={() => setExpandedAlarms((v) => !v)} type="button">
              {expandedAlarms ? "Compact" : "View All Alarms"}
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Time</th>
                <th>Asset</th>
                <th>Message</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleAlarms.map((alarm) => (
                <tr key={alarm.id}>
                  <td className={`severity ${alarm.severity}`}>
                    <SeverityIcon severity={alarm.severity} /> {alarm.severity}
                  </td>
                  <td>{formatTime(alarm.timestamp)}</td>
                  <td>{getAssetById(alarm.assetId)?.name ?? alarm.assetId}</td>
                  <td>{alarm.message}</td>
                  <td>{alarm.status}</td>
                </tr>
              ))}
              {!alarms.length && (
                <tr>
                  <td className="severity info"><CircleCheck size={15} /> normal</td>
                  <td>{formatTime(Date.now())}</td>
                  <td>System</td>
                  <td>No active telemetry alarms</td>
                  <td>clear</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="timeline-card">
          <div className="deck-title">
            <h2>400/220 kV Bay Mimic</h2>
            <button
              aria-pressed={ceaCheckVisible}
              className={ceaCheckVisible ? "active-command" : undefined}
              onClick={() => setCeaCheckVisible((v) => !v)}
              type="button"
            >
              CEA Check
            </button>
          </div>
          <SingleLineMimic alarms={alarms} samples={samples} />
          {ceaCheckVisible && <p className="mimic-note">CEA connectivity and interlock checks visible</p>}
        </div>

        <ConnectionAudit samples={samples} />
      </div>
    </section>
  );
}

function ConnectionAudit({ samples }: { samples: Record<string, TelemetrySample> }) {
  const [activeTab, setActiveTab] = useState<"hv" | "transformer" | "lv">("hv");
  const [lastRunAt, setLastRunAt] = useState<number | undefined>();
  const checks = useMemo(
    () => ({
      hv: [
        auditCheck("400 kV breaker positions",  summarizeSwitch(samples, HV_BAY_IDS, "breakerState")),
        auditCheck("400 kV isolator positions",  summarizeSwitch(samples, HV_BAY_IDS, "isolatorState")),
        auditCheck("400 kV interlocks",          summarizeSwitch(samples, HV_BAY_IDS, "interlockState"))
      ],
      transformer: [
        auditCheck("ICT breaker positions",      summarizeSwitch(samples, TRANSFORMER_BAY_IDS, "breakerState")),
        auditCheck("ICT isolator positions",     summarizeSwitch(samples, TRANSFORMER_BAY_IDS, "isolatorState")),
        auditCheck("Fire protection interlock",  summarizeSwitch(samples, ["fire-detection"], "interlockState"))
      ],
      lv: [
        auditCheck("220 kV breaker positions",   summarizeSwitch(samples, LV_SWITCHGEAR_IDS, "breakerState")),
        auditCheck("220 kV isolator positions",  summarizeSwitch(samples, LV_SWITCHGEAR_IDS, "isolatorState")),
        auditCheck("220 kV interlocks",          summarizeSwitch(samples, LV_SWITCHGEAR_IDS, "interlockState"))
      ]
    }),
    [samples]
  );

  return (
    <div className="connection-audit">
      <div className="deck-title">
        <h2>Connection Audit</h2>
        <button onClick={() => setLastRunAt(Date.now())} type="button">
          <Play size={12} /> Re-run Audit
        </button>
      </div>
      <div className="audit-tabs">
        <button className={activeTab === "hv" ? "active" : undefined} onClick={() => setActiveTab("hv")} type="button">HV</button>
        <button className={activeTab === "transformer" ? "active" : undefined} onClick={() => setActiveTab("transformer")} type="button">ICT</button>
        <button className={activeTab === "lv" ? "active" : undefined} onClick={() => setActiveTab("lv")} type="button">LV</button>
      </div>
      {lastRunAt && <p className="audit-run">Last run {formatTime(lastRunAt)} IST</p>}
      <div className="audit-list">
        {checks[activeTab].map(({ label, value, tone }) => (
          <div className="audit-row" key={label}>
            <span><CheckCircle2 size={13} /> {label}</span>
            <strong className={tone}>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function SingleLineMimic({ alarms, samples }: { alarms: AlarmEvent[]; samples: Record<string, TelemetrySample> }) {
  const alarmed = new Set(alarms.map((a) => a.assetId));
  const bayTone = (id: string) => (alarmed.has(id) ? "alarm" : "normal");

  return (
    <svg className="sld-mimic" viewBox="0 0 560 158" role="img" aria-label="400/220 kV single line mimic">
      {/* 400 kV buses */}
      <line x1="28" y1="20" x2="532" y2="20" className="sld-bus hv" />
      <line x1="28" y1="34" x2="532" y2="34" className="sld-bus hv muted" />
      {/* 220 kV bus */}
      <line x1="28" y1="108" x2="532" y2="108" className="sld-bus lv" />

      <text x="28" y="11">400 kV DOUBLE BUS</text>
      <text x="28" y="140">220 kV BUS SECTION I / II</text>

      {/* 400 kV line bays */}
      <Bay x={68}  topLabel="YERM"   tone={bayTone("line-400-yerrampalem-1")} sample={samples["line-400-yerrampalem-1"]} />
      <Bay x={148} topLabel="TIRUP"  tone={bayTone("line-400-tirupati-1")}    sample={samples["line-400-tirupati-1"]} />
      <Bay x={346} topLabel="NELL"   tone={bayTone("line-400-nellore-1")}     sample={samples["line-400-nellore-1"]} />
      <Bay x={426} topLabel="HYD"    tone={bayTone("line-400-hyderabad-1")}   sample={samples["line-400-hyderabad-1"]} />
      <Bay x={502} topLabel="CPLR"   tone={bayTone("bay-400-bus-coupler")}    sample={samples["bay-400-bus-coupler"]} />

      {/* ICTs */}
      <TransformerBay x={228} label="ICT-1 315" tone={bayTone("ict-1")} sample={samples["ict-1"]} />
      <TransformerBay x={292} label="ICT-2 315" tone={bayTone("ict-2")} sample={samples["ict-2"]} />

      {/* 220 kV feeder drops */}
      {MIMIC_FEEDERS.map((feeder) => (
        <FeederDrop key={feeder.id} {...feeder} sample={samples[feeder.id]} />
      ))}
    </svg>
  );
}

function Bay({ x, topLabel, tone, sample }: { x: number; topLabel: string; tone: string; sample?: TelemetrySample }) {
  return (
    <g className={switchClassName("sld-bay", tone, sample)}>
      <title>{statusTitle(topLabel, sample)}</title>
      <line x1={x} y1="20" x2={x} y2="78" className="sld-drop" />
      <rect x={x - 7} y="36" width="14" height="10" rx="1" className="sld-device" />
      <path d={isolatorPath(x, 53, sample?.isolatorState)} className="sld-isolator" />
      <text x={x - 32} y="92">{topLabel}</text>
      <SwitchBadges x={x} y={99} sample={sample} />
    </g>
  );
}

function TransformerBay({ x, label, tone, sample }: { x: number; label: string; tone: string; sample?: TelemetrySample }) {
  return (
    <g className={switchClassName("sld-bay", tone, sample)}>
      <title>{statusTitle(label, sample)}</title>
      <line x1={x} y1="20" x2={x} y2="108" className="sld-drop" />
      <rect x={x - 7} y="36" width="14" height="10" rx="1" className="sld-device" />
      <path d={isolatorPath(x, 52, sample?.isolatorState)} className="sld-isolator" />
      <circle cx={x - 6} cy="76" r="8" className="sld-transformer" />
      <circle cx={x + 6} cy="76" r="8" className="sld-transformer" />
      <rect x={x - 7} y="94" width="14" height="10" rx="1" className="sld-device" />
      <text x={x - 28} y="126">{label}</text>
      <SwitchBadges x={x} y={109} sample={sample} />
    </g>
  );
}

function FeederDrop({ x, label, sample }: { id: string; x: number; label: string; sample?: TelemetrySample }) {
  return (
    <g className={switchClassName("sld-feeder-drop", "normal", sample)}>
      <title>{statusTitle(label, sample)}</title>
      <line x1={x} y1="108" x2={x} y2="130" className="sld-drop feeder" />
      <circle cx={x} cy="119" r="4" className="sld-device" />
      <text x={x - 22} y="147">{label}</text>
      <SwitchBadges x={x} y={125} sample={sample} compact />
    </g>
  );
}

function SwitchBadges({ x, y, sample, compact = false }: { x: number; y: number; sample?: TelemetrySample; compact?: boolean }) {
  const offset = compact ? 12 : 25;
  return (
    <g aria-hidden="true">
      <SwitchBadge x={x - offset - 10} y={y} label="B" state={sample?.breakerState}   tone={breakerTone(sample?.breakerState)} />
      <SwitchBadge x={x - 10}           y={y} label="I" state={sample?.isolatorState}  tone={isolatorTone(sample?.isolatorState)} />
      {!compact && <SwitchBadge x={x + offset - 10} y={y} label="L" state={sample?.interlockState} tone={interlockTone(sample?.interlockState)} />}
    </g>
  );
}

function SwitchBadge({ x, y, label, state, tone }: {
  x: number; y: number; label: string;
  state?: BreakerState | IsolatorState | InterlockState; tone: StatusTone;
}) {
  return (
    <g className={`sld-switch-badge ${tone}`}>
      <rect x={x} y={y} width="20" height="11" rx="2" />
      <text x={x + 10} y={y + 8}>{label}{statusCode(state)}</text>
    </g>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function auditCheck(label: string, summary: { value: string; tone: StatusTone }): AuditCheck {
  return { label, value: summary.value, tone: summary.tone };
}

function summarizeSwitch(samples: Record<string, TelemetrySample>, assetIds: string[], field: SwitchField) {
  const states = assetIds
    .map((id) => samples[id]?.[field])
    .filter((s): s is NonNullable<TelemetrySample[SwitchField]> => Boolean(s));
  if (!states.length) return { value: "Waiting", tone: "caution" as const };
  if (field === "breakerState")  return summarizeBreaker(states as BreakerState[]);
  if (field === "isolatorState") return summarizeIsolator(states as IsolatorState[]);
  return summarizeInterlock(states as InterlockState[]);
}

function summarizeBreaker(states: BreakerState[]) {
  if (states.includes("tripped"))     return { value: countState(states, "tripped",     "trip"),  tone: "danger"  as const };
  if (states.includes("maintenance")) return { value: countState(states, "maintenance", "maint"), tone: "caution" as const };
  if (states.includes("open"))        return { value: countState(states, "open",        "open"),  tone: "caution" as const };
  return { value: "OK", tone: "normal" as const };
}

function summarizeIsolator(states: IsolatorState[]) {
  if (states.includes("intermediate")) return { value: countState(states, "intermediate", "intermediate"), tone: "danger"  as const };
  if (states.includes("maintenance"))  return { value: countState(states, "maintenance",  "maint"),       tone: "caution" as const };
  if (states.includes("earthed"))      return { value: countState(states, "earthed",      "earthed"),     tone: "caution" as const };
  if (states.includes("open"))         return { value: countState(states, "open",         "open"),        tone: "caution" as const };
  return { value: "OK", tone: "normal" as const };
}

function summarizeInterlock(states: InterlockState[]) {
  if (states.includes("bypassed"))    return { value: countState(states, "bypassed",    "bypass"),  tone: "danger"  as const };
  if (states.includes("blocked"))     return { value: countState(states, "blocked",     "blocked"), tone: "caution" as const };
  if (states.includes("maintenance")) return { value: countState(states, "maintenance", "maint"),   tone: "caution" as const };
  return { value: "OK", tone: "normal" as const };
}

function countState<T extends string>(states: T[], state: T, label: string) {
  return `${states.filter((v) => v === state).length} ${label}`;
}

function switchClassName(base: string, tone: string, sample?: TelemetrySample) {
  return [
    base, tone,
    sample ? `breaker-${sample.breakerState}`   : undefined,
    sample ? `isolator-${sample.isolatorState}` : undefined,
    sample ? `interlock-${sample.interlockState}` : undefined
  ].filter(Boolean).join(" ");
}

function isolatorPath(x: number, y: number, state?: IsolatorState) {
  if (state === "closed") return `M ${x - 10} ${y} L ${x + 10} ${y}`;
  return `M ${x - 10} ${y + 5} L ${x + 10} ${y - 5}`;
}

function statusTitle(label: string, sample?: TelemetrySample) {
  if (!sample) return `${label}: waiting for telemetry`;
  return `${label}: breaker ${sample.breakerState}, isolator ${sample.isolatorState}, interlock ${sample.interlockState}`;
}

function statusCode(state?: BreakerState | IsolatorState | InterlockState) {
  if (!state)               return "-";
  if (state === "permissive")  return "P";
  if (state === "blocked")     return "B";
  if (state === "bypassed")    return "X";
  if (state === "tripped")     return "T";
  if (state === "closed")      return "C";
  if (state === "open")        return "O";
  if (state === "earthed")     return "E";
  if (state === "intermediate") return "N";
  return "M";
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

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical" || severity === "high") return <TriangleAlert size={15} />;
  if (severity === "medium"   || severity === "low")  return <AlertTriangle  size={15} />;
  return <Info size={15} />;
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "Asia/Kolkata"
  }).format(timestamp);
}
