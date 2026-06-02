/**
 * Simulation telemetry for Kalikiri 400/220 kV SS.
 * Base values derived from real SCADA SLD readings (03-Jun-2026 18:22 IST).
 *
 * Real readings from SLD:
 *   400 kV Bus-1 : 416.7 kV   |  400 kV Bus-2 : 417.9 kV
 *   220 kV Bus-1 : 231.2 kV   |  220 kV Bus-2 : 231.1 kV
 *   RTPP4 AG L2  :  15.4 MW  17.7 MVAR
 *   RTPP4 AG L1  :  15.9 MW  19.4 MVAR
 *   CHTR4 AT L1  :  53.7 MW  32.7 MVAR
 *   CHTR4 AT L2  :  94.5 MW  35.0 MVAR
 *   ICT-T1 HV    :  70.3 MW  17.5 MVAR  | LV : 71.6 MW 18.6 MVAR
 *   ICT-T2 HV    :  63.5 MW  21.4 MVAR  | LV : 70.8 MW 24.6 MVAR
 *   MDPL2 AT L2  :  33.2 MW  16.0 MVAR
 *   MDPL2 AT L1  :  32.7 MW  10.5 MVAR
 *   KLKR2 AT L2  :  37.2 MW   5.5 MVAR
 *   KLKR2 AT L1  :  37.4 MW   5.8 MVAR
 */
import { ALL_ASSETS } from "../domain/substation";
import type {
  AlarmEvent, AlarmSeverity, AssetHealth,
  BreakerState, InterlockState, IsolatorState,
  SubstationAsset, TelemetryAdapter, TelemetrySample
} from "../domain/types";

type Listener = (samples: TelemetrySample[]) => void;
type ActiveSev = Exclude<AlarmSeverity, "none">;

const ELECTRICAL = new Set(["busbar", "transformer", "breaker", "feeder", "auxiliary"]);

// ── Adapters ────────────────────────────────────────────────────────────────
export class SimulationTelemetryAdapter implements TelemetryAdapter {
  private listeners = new Set<Listener>();
  private timer: number | undefined;
  private connected = false;
  private tick = 0;

  async connect() {
    if (this.connected) return;
    this.connected = true;
    this.emit();
    this.timer = window.setInterval(() => this.emit(), 1000);
  }

  async disconnect() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = undefined;
    this.connected = false;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async replayWindow(startTime: number, endTime: number, stepMs = 60_000) {
    const frames: TelemetrySample[][] = [];
    for (let t = startTime; t <= endTime; t += stepMs)
      frames.push(generateSamples(t, Math.floor((t - startTime) / stepMs)));
    return frames;
  }

  private emit() {
    const samples = generateSamples(Date.now(), this.tick++);
    this.listeners.forEach((l) => l(samples));
  }
}

export class ScadaTelemetryAdapter implements TelemetryAdapter {
  async connect()   { throw new Error("SCADA adapter not configured."); }
  async disconnect(){ return undefined; }
  subscribe()       { return () => undefined; }
  async replayWindow() { return []; }
}

// ── Sample generation ────────────────────────────────────────────────────────
export function generateSamples(timestamp: number, tick: number): TelemetrySample[] {
  return ALL_ASSETS
    .filter((a) => ELECTRICAL.has(a.type))
    .map((a, i) => sampleAsset(a, timestamp, tick, i));
}

export function deriveAlarms(samples: TelemetrySample[]): AlarmEvent[] {
  return samples
    .filter((s): s is TelemetrySample & { alarmSeverity: ActiveSev } => s.alarmSeverity !== "none")
    .sort((a, b) => sevRank(b.alarmSeverity) - sevRank(a.alarmSeverity))
    .slice(0, 6)
    .map((s, i) => ({
      id: `${s.assetId}-${s.alarmSeverity}`,
      timestamp: s.timestamp - i * 180_000,
      assetId: s.assetId,
      severity: s.alarmSeverity,
      message: s.message ?? "Telemetry threshold exceeded",
      status: i === 0 ? "active" : "acknowledged"
    }));
}

function sampleAsset(a: SubstationAsset, ts: number, tick: number, idx: number): TelemetrySample {
  const wave  = Math.sin(tick / 8  + idx * 0.73);
  const slow  = Math.sin(tick / 37 + idx * 0.41);
  const noise = seededNoise(tick, idx);

  const voltage       = round(voltBase(a.voltageLevel) + wave * voltSwing(a.voltageLevel), 2);
  const current       = round(currentBase(a) + slow * 48 + noise * 16, 1);
  const mw            = round(mwBase(a) + wave * (mwBase(a) * 0.06) + noise * 2, 1);
  const mvar          = isReactive(a) ? round(14.8 + slow * 0.5, 1) : round(Math.max(0.4, mw * 0.22 + slow * 2), 1);
  const temperature   = round(tempBase(a) + slow * 7 + noise * 2, 1);
  const frequency     = round(49.97 + Math.sin(tick / 18) * 0.03, 2);
  const powerFactor   = round(Math.min(0.99, Math.max(0.88, 0.97 + slow * 0.01)), 2);
  const breakerState  = breakerStateFor(a, tick, idx);
  const isolatorState = isolatorStateFor(a, tick, idx);
  const interlockState= interlockStateFor(a, tick, idx, breakerState, isolatorState);
  const health        = healthScore(a, temperature, current, tick, idx);
  const healthStatus  = healthStatusFor(health);
  const alarmSeverity = alarmFor(a, temperature, current, breakerState, isolatorState, interlockState, health);

  return {
    timestamp: ts, assetId: a.id,
    voltage, current, mw, mvar, temperature, frequency, powerFactor,
    breakerState, isolatorState, interlockState, health, healthStatus, alarmSeverity,
    message: messageFor(a, alarmSeverity, temperature, current, breakerState, isolatorState, interlockState)
  };
}

// ── Real base values from SLD ─────────────────────────────────────────────────
function currentBase(a: SubstationAsset) {
  // ICTs 315 MVA — real HV-side current from SLD
  if (a.id === "ict-1") return 105;   // 70.3 MW / (√3×400) ≈ 101 A → ~105A
  if (a.id === "ict-2") return  97;   // 63.5 MW / (√3×400) ≈  92 A → ~97A
  if (a.id === "ict-3") return  90;   // estimated similar loading
  // 400 kV incoming lines — real values from SLD
  if (a.id === "line-400-rtpp4-ag-2") return 34;   // 15.4 MW → 22 MVA → 32A
  if (a.id === "line-400-rtpp4-ag-1") return 36;   // 15.9 MW → 24 MVA → 35A
  if (a.id === "line-400-chtr4-at-1") return 91;   // 53.7 MW → 63 MVA → 91A
  if (a.id === "line-400-chtr4-at-2") return 146;  // 94.5 MW → 101 MVA → 146A
  if (a.id.startsWith("future-bay"))  return 0;
  // 400 kV buses
  if (a.id.startsWith("bus-400"))     return 320;
  // 220 kV feeders — real values from SLD
  if (a.id === "feeder-220-mdpl2-l2") return 97;   // 33.2 MW → 37 MVA → 97A
  if (a.id === "feeder-220-mdpl2-l1") return 90;   // 32.7 MW → 34 MVA → 90A
  if (a.id === "feeder-220-klkr2-l2") return 99;   // 37.2 MW → 38 MVA → 99A
  if (a.id === "feeder-220-klkr2-l1") return 99;   // 37.4 MW → 38 MVA → 99A
  if (a.id.startsWith("feeder-220-future")) return 0;
  if (a.id.startsWith("bus-220"))     return 380;
  if (a.id === "bay-220-bus-coupler") return 200;
  if (a.id === "bay-400-bus-coupler") return 280;
  if (a.id === "reactor-400-bus")     return 20;
  if (a.id === "cap-bank-220-1")      return 82;
  return 30;
}

function mwBase(a: SubstationAsset) {
  // Real MW from SLD
  if (a.id === "ict-1")               return 70.3;
  if (a.id === "ict-2")               return 63.5;
  if (a.id === "ict-3")               return 58.0;  // estimated
  if (a.id === "line-400-rtpp4-ag-2") return 15.4;
  if (a.id === "line-400-rtpp4-ag-1") return 15.9;
  if (a.id === "line-400-chtr4-at-1") return 53.7;
  if (a.id === "line-400-chtr4-at-2") return 94.5;
  if (a.id.startsWith("future-bay"))  return 0;
  if (a.id.startsWith("bus-400"))     return 190;
  if (a.id === "feeder-220-mdpl2-l2") return 33.2;
  if (a.id === "feeder-220-mdpl2-l1") return 32.7;
  if (a.id === "feeder-220-klkr2-l2") return 37.2;
  if (a.id === "feeder-220-klkr2-l1") return 37.4;
  if (a.id.startsWith("feeder-220-future")) return 0;
  if (a.id.startsWith("bus-220"))     return 120;
  if (a.id === "reactor-400-bus" || a.id === "cap-bank-220-1") return 0;
  return 5;
}

function tempBase(a: SubstationAsset) {
  if (a.id.startsWith("ict-"))        return 62;
  if (a.id.startsWith("line-400"))    return 38;
  if (a.id.startsWith("feeder-220"))  return 36;
  if (a.id === "reactor-400-bus")     return 46;
  if (a.type === "transformer")       return 58;
  if (a.type === "breaker")           return 36;
  return 32;
}

function voltBase(vl: SubstationAsset["voltageLevel"]) {
  // Real measured voltages from SLD
  if (vl === "400kV") return 417.0;   // avg of 416.7 and 417.9
  if (vl === "220kV") return 231.2;
  if (vl === "132kV") return 132.1;
  if (vl === "33kV")  return 33.15;
  return 0.22;
}

function voltSwing(vl: SubstationAsset["voltageLevel"]) {
  if (vl === "400kV") return 1.2;
  if (vl === "220kV") return 0.8;
  if (vl === "132kV") return 0.45;
  if (vl === "33kV")  return 0.14;
  return 0.01;
}

function isReactive(a: SubstationAsset) {
  return a.id === "cap-bank-220-1" || a.id === "reactor-400-bus";
}

// ── Switching state simulation ─────────────────────────────────────────────────
function breakerStateFor(a: SubstationAsset, tick: number, idx: number): BreakerState {
  if (a.id.startsWith("future-bay") || a.id.startsWith("feeder-220-future")) return "open";
  if (a.id === "line-400-chtr4-at-2" && tick % 200 > 183) return "open";
  if (a.id === "feeder-220-klkr2-l2" && tick % 155 > 138) return "open";
  if (a.type === "breaker" && (tick + idx) % 193 === 0) return "tripped";
  return "closed";
}

function isolatorStateFor(a: SubstationAsset, tick: number, idx: number): IsolatorState {
  if (a.id.startsWith("future-bay") || a.id.startsWith("feeder-220-future")) return "open";
  if (a.id === "cap-bank-220-1" && tick % 260 > 242) return "maintenance";
  if (a.id === "line-400-chtr4-at-2" && tick % 200 > 183) return "open";
  if (a.id === "bay-400-bus-coupler" && (tick + idx) % 193 === 0) return "intermediate";
  return "closed";
}

function interlockStateFor(a: SubstationAsset, tick: number, idx: number, bs: BreakerState, is: IsolatorState): InterlockState {
  if (bs === "tripped" || is === "intermediate") return "blocked";
  if (is === "maintenance") return "maintenance";
  if (a.id === "fire-detection") return "permissive";
  if (a.id === "feeder-220-klkr2-l2" && tick % 155 > 138) return "blocked";
  if (a.id === "cap-bank-220-1" && tick % 380 > 366 + (idx % 2)) return "bypassed";
  return "permissive";
}

// ── Health & alarms ───────────────────────────────────────────────────────────
function healthScore(a: SubstationAsset, temp: number, curr: number, tick: number, idx: number) {
  const tP = Math.max(0, temp - 64) * 1.2;
  const cP = Math.max(0, curr - currentBase(a) - 25) * 0.08;
  const aP = Math.abs(hash(a.id) % 12);
  const pP = Math.max(0, Math.sin(tick / 29 + idx) * 5);
  return Math.round(Math.max(42, Math.min(98, 96 - tP - cP - aP - pP)));
}

function healthStatusFor(h: number): AssetHealth {
  if (h >= 88) return "excellent";
  if (h >= 74) return "good";
  if (h >= 62) return "watch";
  if (h >= 48) return "warning";
  return "critical";
}

function alarmFor(a: SubstationAsset, temp: number, curr: number, bs: BreakerState, is: IsolatorState, il: InterlockState, h: number): AlarmSeverity {
  if (bs === "tripped")       return "critical";
  if (il === "bypassed")      return "high";
  if (is === "intermediate")  return "high";
  if (il === "blocked")       return "medium";
  if (a.id === "ict-2" && temp > 68) return "medium";
  if (a.id === "cap-bank-220-1" && h < 70) return "low";
  if (curr > currentBase(a) + 50 && curr > 5) return "low";
  if (h < 55) return "high";
  if (is === "open" || is === "maintenance" || il === "maintenance") return "info";
  if (bs === "open") return "info";
  return "none";
}

function messageFor(a: SubstationAsset, sev: AlarmSeverity, temp: number, curr: number, bs: BreakerState, is: IsolatorState, il: InterlockState) {
  if (sev === "none")           return undefined;
  if (bs === "tripped")         return `${a.name} breaker trip detected`;
  if (il === "bypassed")        return `${a.name} interlock bypass detected`;
  if (il === "blocked")         return `${a.name} interlock permissive blocked`;
  if (is === "intermediate")    return `${a.name} isolator intermediate`;
  if (is === "maintenance")     return `${a.name} isolator under maintenance`;
  if (is === "open")            return `${a.name} isolator open`;
  if (bs === "open")            return `${a.name} breaker open`;
  if (temp > 70)                return `Top oil temperature high (${temp.toFixed(1)} °C)`;
  if (curr > currentBase(a)+50 && curr > 5) return `High current warning (${curr.toFixed(1)} A)`;
  return `${a.name} asset health degraded`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function seededNoise(tick: number, idx: number) {
  const x = Math.sin(tick * 12.9898 + idx * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

function hash(v: string) {
  return v.split("").reduce((a, c) => (a << 5) - a + c.charCodeAt(0), 0);
}

function round(v: number, d: number) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function sevRank(s: AlarmSeverity) {
  return ["none","info","low","medium","high","critical"].indexOf(s);
}
