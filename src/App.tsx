import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle, BarChart3, GitBranch, MapPin,
  Network, Settings, ShieldCheck
} from "lucide-react";
import AssetTree from "./components/AssetTree";
import BottomPanel from "./components/BottomPanel";
import SubstationView from "./scene/SubstationView";
import Inspector from "./components/Inspector";
import SceneToolbar from "./components/SceneToolbar";
import TopBar from "./components/TopBar";
import { PRIMARY_ASSET_ID } from "./domain/substation";
import { useTelemetry } from "./telemetry/useTelemetry";

export default function App() {
  const [selectedAssetId, setSelectedAssetId] = useState(PRIMARY_ASSET_ID);
  const [activeModule, setActiveModule] = useState("asset-ontology");
  const [sceneMode, setSceneMode] = useState("3D");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const { samples, selectedSample, selectedHistory, alarms, mode, setMode, replayLastHour } =
    useTelemetry(selectedAssetId);

  const latestTimestamp = useMemo(() => {
    const timestamps = Object.values(samples).map((s) => s.timestamp);
    return timestamps.length ? Math.max(...timestamps) : undefined;
  }, [samples]);

  const handleSelectAsset = useCallback((assetId: string) => {
    setSelectedAssetId(assetId);
    setInspectorOpen(true);
    setActiveModule("asset-ontology");
  }, []);

  const handleModuleSelect = useCallback((moduleId: string) => {
    setActiveModule(moduleId);
    if (moduleId === "alarms" || moduleId === "telemetry-analytics") setBottomPanelOpen(true);
    if (moduleId === "asset-ontology" || moduleId === "system-settings") setInspectorOpen(true);
  }, []);

  return (
    <main className="app-shell">
      <SubstationView selectedAssetId={selectedAssetId} samples={samples} onSelectAsset={handleSelectAsset} />
      <div className="scene-vignette" />
      <OpsRail activeModule={activeModule} onSelectModule={handleModuleSelect} />

      <TopBar
        mode={mode}
        latestTimestamp={latestTimestamp}
        onReplay={replayLastHour}
        onTogglePause={() => setMode(mode === "paused" ? "live" : "paused")}
        onOpenInspector={() => setInspectorOpen(true)}
        onToggleBottomPanel={() => setBottomPanelOpen((open) => !open)}
        onSelectModule={handleModuleSelect}
      />

      <SceneToolbar activeMode={sceneMode} onChangeMode={setSceneMode} />
      <AssetTree selectedAssetId={selectedAssetId} samples={samples} onSelectAsset={handleSelectAsset} />

      {inspectorOpen ? (
        <Inspector
          selectedAssetId={selectedAssetId}
          sample={selectedSample}
          history={selectedHistory}
          onClose={() => setInspectorOpen(false)}
        />
      ) : (
        <button className="reopen-inspector panel-glass" onClick={() => setInspectorOpen(true)}>
          Inspector
        </button>
      )}

      {bottomPanelOpen ? (
        <BottomPanel
          selectedAssetId={selectedAssetId}
          samples={samples}
          history={selectedHistory}
          alarms={alarms}
          onClose={() => setBottomPanelOpen(false)}
        />
      ) : (
        <button className="reopen-bottom panel-glass" onClick={() => setBottomPanelOpen(true)}>
          Open telemetry deck
        </button>
      )}
    </main>
  );
}

const MODULES = [
  { id: "asset-ontology",       label: "Asset ontology",       icon: Network      },
  { id: "network-topology",     label: "Network topology",     icon: GitBranch    },
  { id: "telemetry-analytics",  label: "Telemetry analytics",  icon: BarChart3    },
  { id: "alarms",               label: "Alarms",               icon: AlertTriangle },
  { id: "site-map",             label: "Site map",             icon: MapPin       },
  { id: "protection",           label: "Protection",           icon: ShieldCheck  },
  { id: "system-settings",      label: "System settings",      icon: Settings     }
];

function OpsRail({
  activeModule,
  onSelectModule
}: {
  activeModule: string;
  onSelectModule: (moduleId: string) => void;
}) {
  return (
    <nav className="ops-rail" aria-label="Operational modules">
      {MODULES.map(({ id, label, icon: Icon }) => (
        <button
          aria-label={label}
          aria-pressed={activeModule === id}
          className={activeModule === id ? "active" : undefined}
          key={id}
          onClick={() => onSelectModule(id)}
          title={label}
          type="button"
        >
          <Icon size={18} />
        </button>
      ))}
    </nav>
  );
}
