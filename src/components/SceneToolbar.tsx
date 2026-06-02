import { Box, Crosshair, Layers3, LocateFixed, Map, Maximize2, Ruler, Satellite } from "lucide-react";

interface SceneToolbarProps {
  activeMode: string;
  onChangeMode: (mode: string) => void;
}

const TOOLS = [
  { id: "2D",       label: "2D",         text: "2D" },
  { id: "3D",       label: "3D",         icon: Box },
  { id: "map",      label: "Map",        icon: Map },
  { id: "satellite",label: "Satellite",  icon: Satellite },
  { id: "locate",   label: "Locate",     icon: LocateFixed },
  { id: "measure",  label: "Measure",    icon: Ruler },
  { id: "layers",   label: "Layers",     icon: Layers3 },
  { id: "maximize", label: "Maximize",   icon: Maximize2 },
  { id: "crosshair",label: "Crosshair",  icon: Crosshair }
];

export default function SceneToolbar({ activeMode, onChangeMode }: SceneToolbarProps) {
  return (
    <div className="scene-toolbar panel-glass" aria-label="Scene controls">
      {TOOLS.map(({ id, label, icon: Icon, text }) => (
        <button
          aria-label={label}
          aria-pressed={activeMode === id}
          className={activeMode === id ? "active" : undefined}
          key={id}
          onClick={() => onChangeMode(id)}
          title={label}
          type="button"
        >
          {Icon ? <Icon size={16} /> : text}
        </button>
      ))}
    </div>
  );
}
