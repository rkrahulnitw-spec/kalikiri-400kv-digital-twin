import { ALL_ASSETS } from "../domain/substation";
import type {
  AlarmEvent,
  AlarmSeverity,
  AssetHealth,
  BreakerState,
  InterlockState,
  IsolatorState,
  SubstationAsset,
  TelemetryAdapter,
  TelemetrySample
} from "../domain/types";

type Listener = (samples: TelemetrySample[]) => void;
type ActiveAlarmSeverity = Exclude<AlarmSeverity, "none">;

const ELECTRICAL_TYPES = new Set(["busbar", "transformer", "breaker", "feeder", "auxiliary"]);

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
    for (let time = startTime; time <= endTime; time += stepMs) {
      frames.push(generateSamples(time, Math.floor((time - startTime) / stepMs)));
    }
    return frames;
  }

  private emit() {
    const samples = generateSamples(Date.now(), this.tick);
    this.tick += 1;
    this.listeners.forEach((listener) => listener(samples));
  }
}

export class ScadaTelemetryAdapter implements TelemetryAdapter {
  async connect() {
    throw new Error("SCADA telemetry adapter is not configured yet.");
  }
  async disconnect() {
    return undefined;
  }
  subscribe() {
    return () => undefined;
  }
  async replayWindow() {
    return [];
  }
}

export function generateSamples(timestamp: number, tick: number): TelemetrySample[] {
  return ALL_ASSETS.filter((asset) => ELECTRICAL_TYPES.has(asset.type)).map((asset, index) =>
    sampleAsset(asset, timestamp, tick, index)
  );
}

export function deriveAlarms(samples: TelemetrySample[]): AlarmEvent[] {
  return samples
    .filter((s): s is TelemetrySample & { alarmSeverity: ActiveAlarmSeverity } => s.alarmSeverity !== "none")
    .sort((a, b) => severityRank(b.alarmSeverity) - severityRank(a.alarmSeverity))
    .slice(0, 6)
    .map((sample, index) => ({
      id: `${sample.assetId}-${sample.alarmSeverity}`,
      timestamp: sample.timestamp - index * 180_000,
      assetId: sample.assetId,
      severity: sample.alarmSeverity,
      message: sample.message ?? "Telemetry threshold exceeded",
      status: index === 0 ? "active" : "acknowledged"
    }));
}

function sampleAsset(asset: SubstationAsset, timestamp: number, tick: number, index: number): TelemetrySample {
  const wave = Math.sin(tick / 8 + index * 0.73);
  const slow = Math.sin(tick / 37 + index * 0.41);
  const noise = seededNoise(tick, index);

  const baseVoltage = voltageBase(asset.voltageLevel);
  const voltage = round(baseVoltage + wave * voltageSwing(asset.voltageLevel), 2);
  const current = round(currentBase(asset) + slow * 52 + noise * 18, 1);
  const mw = round(mwBase(asset) + wave * 12.4 + noise * 3.8, 1);
  const mvar = (asset.id === "cap-bank-220-1" || asset.id === "reactor-400-1")
    ? round(14.6 + slow * 0.4, 1)
    : round(Math.max(0.4, mw * 0.18 + slow * 2.4), 1);
  const temperature = round(tempBase(asset) + slow * 8.2 + noise * 2.2, 1);
  const frequency = round(49.98 + Math.sin(tick / 18) * 0.035, 2);
  const powerFactor = round(Math.min(0.99, Math.max(0.88, 0.97 + slow * 0.012)), 2);
  const breakerState = breakerStateFor(asset, tick, index);
  const isolatorState = isolatorStateFor(asset, tick, index);
  const interlockState = interlockStateFor(asset, tick, index, breakerState, isolatorState);
  const health = healthScore(asset, temperature, current, tick, index);
  const healthStatus = healthStatusFor(health);
  const alarmSeverity = alarmFor(asset, temperature, current, breakerState, isolatorState, interlockState, health);

  return {
    timestamp,
    assetId: asset.id,
    voltage,
    current,
    mw,
    mvar,
    temperature,
    breakerState,
    isolatorState,
    interlockState,
    frequency,
    powerFactor,
    health,
    healthStatus,
    alarmSeverity,
    message: messageFor(asset, alarmSeverity, temperature, current, breakerState, isolatorState, interlockState)
  };
}

function currentBase(asset: SubstationAsset) {
  // ICTs (315 MVA, 400/220 kV): primary ~455 A at full load, typical ~300 A
  if (asset.id.startsWith("ict-")) return 312;
  // 400 kV lines: typically 450-550 A
  if (asset.id.startsWith("line-400")) return 480;
  // 400 kV bus: aggregated, ~900 A
  if (asset.id.startsWith("bus-400")) return 880;
  // 220 kV bus: ~650 A
  if (asset.id.startsWith("bus-220")) return 640;
  // 220 kV feeders
  if (asset.id.startsWith("feeder-220")) return 220 + Math.abs(hash(asset.id) % 180);
  // 220 kV bus coupler
  if (asset.id === "bay-220-bus-coupler") return 360;
  // 400 kV bus coupler
  if (asset.id === "bay-400-bus-coupler") return 540;
  // Reactor/cap bank
  if (asset.id === "reactor-400-1") return 72;
  if (asset.id === "cap-bank-220-1") return 82;
  // Generic fallback
  if (asset.voltageLevel === "400kV") return asset.type === "transformer" ? 312 : 480;
  if (asset.voltageLevel === "220kV") return asset.type === "feeder" ? 280 : 420;
  return 60;
}

function mwBase(asset: SubstationAsset) {
  if (asset.id === "ict-1") return 210;
  if (asset.id === "ict-2") return 188;
  if (asset.id.startsWith("line-400")) return 168 + Math.abs(hash(asset.id) % 40);
  if (asset.id.startsWith("bus-400")) return 420;
  if (asset.id.startsWith("bus-220")) return 195;
  if (asset.id.startsWith("feeder-220")) return 28 + Math.abs(hash(asset.id) % 80);
  if (asset.id === "bay-400-bus-coupler") return 52;
  if (asset.id === "bay-220-bus-coupler") return 34;
  if (asset.id === "reactor-400-1" || asset.id === "cap-bank-220-1") return 0;
  if (asset.voltageLevel === "400kV") return asset.type === "transformer" ? 200 : 170;
  if (asset.voltageLevel === "220kV") return asset.type === "feeder" ? 55 : 120;
  return 2;
}

function tempBase(asset: SubstationAsset) {
  // 315 MVA ICTs run hotter
  if (asset.id.startsWith("ict-")) return 62;
  if (asset.id.startsWith("line-400")) return 38;
  if (asset.id.startsWith("feeder-220")) return 36;
  if (asset.id === "reactor-400-1") return 46;
  if (asset.id === "cap-bank-220-1") return 41;
  if (asset.type === "transformer") return 58;
  if (asset.type === "feeder") return 40;
  if (asset.type === "breaker") return 36;
  return 32;
}

function breakerStateFor(asset: SubstationAsset, tick: number, index: number): BreakerState {
  if (asset.id === "feeder-220-spare") return "open";
  if (asset.id === "line-400-hyderabad-1" && tick % 200 > 182) return "open";
  if (asset.id === "feeder-220-vempalle" && tick % 155 > 138) return "open";
  if (asset.type === "breaker" && (tick + index) % 193 === 0) return "tripped";
  return "closed";
}

function isolatorStateFor(asset: SubstationAsset, tick: number, index: number): IsolatorState {
  if (asset.id === "feeder-220-spare") return "open";
  if (asset.id === "cap-bank-220-1" && tick % 260 > 242) return "maintenance";
  if (asset.id === "line-400-hyderabad-1" && tick % 200 > 182) return "open";
  if (asset.id === "bay-400-bus-coupler" && (tick + index) % 193 === 0) return "intermediate";
  return "closed";
}

function interlockStateFor(
  asset: SubstationAsset,
  tick: number,
  index: number,
  breakerState: BreakerState,
  isolatorState: IsolatorState
): InterlockState {
  if (breakerState === "tripped" || isolatorState === "intermediate") return "blocked";
  if (isolatorState === "maintenance") return "maintenance";
  if (asset.id === "fire-detection") return "permissive";
  if (asset.id === "feeder-220-vempalle" && tick % 155 > 138) return "blocked";
  if (asset.id === "cap-bank-220-1" && tick % 380 > 366 + (index % 2)) return "bypassed";
  return "permissive";
}

function healthScore(asset: SubstationAsset, temperature: number, current: number, tick: number, index: number) {
  const thermalPenalty = Math.max(0, temperature - 64) * 1.2;
  const currentPenalty = Math.max(0, current - currentBase(asset) - 30) * 0.07;
  const agePenalty = Math.abs(hash(asset.id) % 14);
  const pulsePenalty = Math.max(0, Math.sin(tick / 29 + index) * 5);
  return Math.round(Math.max(42, Math.min(98, 96 - thermalPenalty - currentPenalty - agePenalty - pulsePenalty)));
}

function healthStatusFor(health: number): AssetHealth {
  if (health >= 88) return "excellent";
  if (health >= 74) return "good";
  if (health >= 62) return "watch";
  if (health >= 48) return "warning";
  return "critical";
}

function alarmFor(
  asset: SubstationAsset,
  temperature: number,
  current: number,
  breakerState: BreakerState,
  isolatorState: IsolatorState,
  interlockState: InterlockState,
  health: number
): AlarmSeverity {
  if (breakerState === "tripped") return "critical";
  if (interlockState === "bypassed") return "high";
  if (isolatorState === "intermediate") return "high";
  if (interlockState === "blocked") return "medium";
  if (asset.id === "ict-2" && temperature > 68) return "medium";
  if (asset.id === "cap-bank-220-1" && health < 70) return "low";
  if (current > currentBase(asset) + 58) return "low";
  if (health < 55) return "high";
  if (isolatorState === "open" || isolatorState === "maintenance" || interlockState === "maintenance") return "info";
  if (breakerState === "open") return "info";
  return "none";
}

function voltageBase(voltageLevel: SubstationAsset["voltageLevel"]) {
  if (voltageLevel === "400kV") return 401.8;
  if (voltageLevel === "220kV") return 220.6;
  if (voltageLevel === "132kV") return 132.1;
  if (voltageLevel === "33kV") return 33.15;
  return 0.22;
}

function voltageSwing(voltageLevel: SubstationAsset["voltageLevel"]) {
  if (voltageLevel === "400kV") return 1.85;
  if (voltageLevel === "220kV") return 0.96;
  if (voltageLevel === "132kV") return 0.45;
  if (voltageLevel === "33kV") return 0.14;
  return 0.01;
}

function messageFor(
  asset: SubstationAsset,
  severity: AlarmSeverity,
  temperature: number,
  current: number,
  breakerState: BreakerState,
  isolatorState: IsolatorState,
  interlockState: InterlockState
) {
  if (severity === "none") return undefined;
  if (breakerState === "tripped") return `${asset.name} breaker trip detected`;
  if (interlockState === "bypassed") return `${asset.name} interlock bypass detected`;
  if (interlockState === "blocked") return `${asset.name} interlock permissive blocked`;
  if (isolatorState === "intermediate") return `${asset.name} isolator intermediate`;
  if (isolatorState === "maintenance") return `${asset.name} isolator under maintenance`;
  if (isolatorState === "open") return `${asset.name} isolator open`;
  if (breakerState === "open") return `${asset.name} breaker open`;
  if (temperature > 70) return `Top oil temperature high (${temperature.toFixed(1)} °C)`;
  if (current > currentBase(asset) + 58) return `High current warning (${current.toFixed(1)} A)`;
  return `${asset.name} asset health degraded`;
}

function seededNoise(tick: number, index: number) {
  const x = Math.sin(tick * 12.9898 + index * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

function hash(value: string) {
  return value.split("").reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0);
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function severityRank(severity: AlarmSeverity) {
  return ["none", "info", "low", "medium", "high", "critical"].indexOf(severity);
}
