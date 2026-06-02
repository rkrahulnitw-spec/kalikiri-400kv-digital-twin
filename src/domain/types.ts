export type AssetType =
  | "yard"
  | "busbar"
  | "transformer"
  | "breaker"
  | "isolator"
  | "feeder"
  | "ctpt"
  | "arrester"
  | "building"
  | "fence"
  | "auxiliary";

export type VoltageLevel = "400kV" | "220kV" | "132kV" | "33kV" | "aux";
export type BreakerState = "closed" | "open" | "tripped" | "maintenance";
export type IsolatorState = "closed" | "open" | "earthed" | "intermediate" | "maintenance";
export type InterlockState = "permissive" | "blocked" | "bypassed" | "maintenance";
export type AlarmSeverity = "none" | "info" | "low" | "medium" | "high" | "critical";
export type AssetHealth = "excellent" | "good" | "watch" | "warning" | "critical";

export interface LocalPosition {
  east: number;
  north: number;
  up?: number;
}

export interface AssetGeometry {
  kind: "box" | "line" | "compound" | "point";
  dimensions?: { x: number; y: number; z: number };
  linePoints?: LocalPosition[];
  headingDeg?: number;
}

export interface SubstationAsset {
  id: string;
  name: string;
  type: AssetType;
  voltageLevel: VoltageLevel;
  bay?: string;
  parentId?: string;
  children?: string[];
  position: LocalPosition;
  geometry: AssetGeometry;
  modelRef?: {
    futureTilesetUrl?: string;
    externalId?: string;
  };
}

export interface TelemetrySample {
  timestamp: number;
  assetId: string;
  voltage: number;
  current: number;
  mw: number;
  mvar: number;
  temperature: number;
  breakerState: BreakerState;
  isolatorState: IsolatorState;
  interlockState: InterlockState;
  frequency: number;
  powerFactor: number;
  health: number;
  healthStatus: AssetHealth;
  alarmSeverity: AlarmSeverity;
  message?: string;
}

export interface AlarmEvent {
  id: string;
  timestamp: number;
  assetId: string;
  severity: Exclude<AlarmSeverity, "none">;
  message: string;
  status: "active" | "acknowledged" | "cleared";
}

export interface TelemetryAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(listener: (samples: TelemetrySample[]) => void): () => void;
  replayWindow(startTime: number, endTime: number, stepMs?: number): Promise<TelemetrySample[][]>;
}
