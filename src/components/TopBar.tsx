import {
  Bell, Camera, CloudSun, Gauge, Grid3X3, Pause,
  RadioTower, RotateCcw, Search, Settings, UserCircle, Wind
} from "lucide-react";
import type { TelemetryMode } from "../telemetry/useTelemetry";

interface TopBarProps {
  mode: TelemetryMode;
  onTogglePause: () => void;
  onReplay: () => void;
  onOpenInspector: () => void;
  onToggleBottomPanel: () => void;
  onSelectModule: (moduleId: string) => void;
  latestTimestamp?: number;
}

export default function TopBar({
  mode, onTogglePause, onReplay, onOpenInspector,
  onToggleBottomPanel, onSelectModule, latestTimestamp
}: TopBarProps) {
  const time = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Kolkata"
  }).format(latestTimestamp ?? Date.now());

  return (
    <header className="top-bar">
      <div className="brand-lockup">
        <div className="brand-mark">AP</div>
        <div>
          <h1>APTRANSCO Digital Twin</h1>
          <p>Kalikiri 400/220 kV AIS Substation</p>
        </div>
      </div>

      <div className="top-status">
        <button className={`status-pill ${mode}`} onClick={onTogglePause}>
          <span className="pulse-dot" />
          {mode === "paused" ? "Paused" : mode === "replay" ? "Replay" : "Live"}
        </button>
        <span className="scada-pill compact">
          <RadioTower size={14} /> SCADA Ready
        </span>
        <span className="timestamp">{time} IST</span>
        <span className="weather-metric">
          <CloudSun size={18} /> 36.2 C
        </span>
        <span className="weather-metric">
          <Wind size={18} /> SW 2.8 m/s
        </span>
        <span className="weather-metric">
          <Gauge size={18} /> 48%
        </span>
        <button className="ghost-button replay-command" onClick={onReplay}>
          <RotateCcw size={16} /> Replay
        </button>
        <button className="ghost-button" onClick={onTogglePause}>
          <Pause size={16} /> Pause
        </button>
        <span className="rate-chip">1x</span>
      </div>

      <div className="top-actions">
        <button className={`status-pill mobile-status ${mode}`} onClick={onTogglePause}>
          <span className="pulse-dot" />
          {mode === "paused" ? "Paused" : mode === "replay" ? "Replay" : "Live Simulation"}
        </button>
        <button className="ghost-button mobile-replay" onClick={onReplay}>
          <Gauge size={16} /> Replay
        </button>
        <button className="icon-button" aria-label="Search" onClick={() => onSelectModule("asset-ontology")}>
          <Search size={18} />
        </button>
        <button className="icon-button" aria-label="Capture" onClick={onOpenInspector}>
          <Camera size={18} />
        </button>
        <button className="icon-button" aria-label="Views" onClick={onToggleBottomPanel}>
          <Grid3X3 size={18} />
        </button>
        <button className="icon-button" aria-label="Alarms" onClick={() => onSelectModule("alarms")}>
          <Bell size={18} />
        </button>
        <button className="icon-button" aria-label="Settings" onClick={() => onSelectModule("system-settings")}>
          <Settings size={18} />
        </button>
        <button className="icon-button" aria-label="User profile" onClick={onOpenInspector}>
          <UserCircle size={22} />
        </button>
      </div>
    </header>
  );
}
