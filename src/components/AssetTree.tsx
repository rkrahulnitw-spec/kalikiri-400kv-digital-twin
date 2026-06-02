import {
  BatteryCharging, Boxes, Building2, Cable, ChevronDown,
  Filter, Search, ShieldCheck, Zap
} from "lucide-react";
import { useMemo, useState } from "react";
import { ASSET_GROUPS, PRIMARY_ASSET_ID, SUBSTATION_ASSETS } from "../domain/substation";
import type { BreakerState, InterlockState, IsolatorState, SubstationAsset, TelemetrySample } from "../domain/types";

interface AssetTreeProps {
  selectedAssetId: string;
  samples: Record<string, TelemetrySample>;
  onSelectAsset: (assetId: string) => void;
}

export default function AssetTree({ selectedAssetId, samples, onSelectAsset }: AssetTreeProps) {
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState(() => new Set(ASSET_GROUPS));
  const normalizedQuery = query.trim().toLowerCase();

  const groupedAssets = useMemo(
    () =>
      ASSET_GROUPS.map((group) => {
        const assets = assetsForGroup(group).filter((asset) => {
          if (!normalizedQuery) return true;
          return `${asset.name} ${asset.id} ${asset.voltageLevel}`.toLowerCase().includes(normalizedQuery);
        });
        return { group, assets };
      }),
    [normalizedQuery]
  );

  function toggleGroup(group: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  return (
    <aside className="asset-tree panel-glass">
      <div className="panel-kicker">
        <span>Asset Ontology</span>
        <ShieldCheck size={14} />
      </div>
      <label className="search-box">
        <Search size={15} />
        <input
          aria-label="Search equipment"
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search equipment..."
          value={query}
        />
        <Filter size={15} />
      </label>

      <div className="tree-section">
        <button
          className={`tree-row root ${selectedAssetId === PRIMARY_ASSET_ID ? "selected" : ""}`}
          onClick={() => onSelectAsset(PRIMARY_ASSET_ID)}
        >
          <Boxes size={15} /> Kalikiri 400/220 kV AIS
        </button>
      </div>

      {groupedAssets.map(({ group, assets }) => (
        <div className="tree-section" key={group}>
          <button
            aria-expanded={openGroups.has(group)}
            className="tree-heading"
            onClick={() => toggleGroup(group)}
            type="button"
          >
            <ChevronDown className={openGroups.has(group) ? "chevron-open" : undefined} size={13} />
            <span>{group}</span>
            <em>{assets.length}</em>
          </button>
          {openGroups.has(group) &&
            assets.map((asset) => (
              <button
                className={`tree-row ${asset.id === selectedAssetId ? "selected" : ""}`}
                data-testid={`asset-${asset.id}`}
                key={`${group}-${asset.id}`}
                onClick={() => onSelectAsset(asset.id)}
                type="button"
              >
                <TreeIcon asset={asset} />
                <span>{asset.name}</span>
                <SwitchStatus sample={samples[asset.id]} />
              </button>
            ))}
        </div>
      ))}
      {normalizedQuery && groupedAssets.every(({ assets }) => assets.length === 0) && (
        <p className="tree-empty">No matching equipment</p>
      )}
    </aside>
  );
}

function assetsForGroup(group: string) {
  return SUBSTATION_ASSETS.filter((asset) => asset.bay === group && asset.type !== "yard");
}

function TreeIcon({ asset }: { asset: SubstationAsset }) {
  if (asset.type === "transformer") return <Zap size={14} />;
  if (asset.type === "feeder" || asset.type === "busbar" || asset.type === "breaker") return <Cable size={14} />;
  if (asset.type === "building") return <Building2 size={14} />;
  if (asset.type === "auxiliary") return <BatteryCharging size={14} />;
  if (asset.type === "fence") return <ShieldCheck size={14} />;
  return <Boxes size={14} />;
}

function SwitchStatus({ sample }: { sample?: TelemetrySample }) {
  if (!sample) return <span className="asset-dot none" />;
  const label = `Breaker ${sample.breakerState}, isolator ${sample.isolatorState}, interlock ${sample.interlockState}`;
  return (
    <span className="switch-tags" aria-label={label} title={label}>
      <span className={`switch-chip ${breakerTone(sample.breakerState)}`}>B{statusCode(sample.breakerState)}</span>
      <span className={`switch-chip ${isolatorTone(sample.isolatorState)}`}>I{statusCode(sample.isolatorState)}</span>
      <span className={`switch-chip ${interlockTone(sample.interlockState)}`}>L{statusCode(sample.interlockState)}</span>
    </span>
  );
}

function statusCode(state: BreakerState | IsolatorState | InterlockState) {
  if (state === "permissive")   return "P";
  if (state === "blocked")      return "B";
  if (state === "bypassed")     return "X";
  if (state === "tripped")      return "T";
  if (state === "closed")       return "C";
  if (state === "open")         return "O";
  if (state === "earthed")      return "E";
  if (state === "intermediate") return "N";
  return "M";
}

function breakerTone(state: BreakerState) {
  if (state === "closed") return "normal";
  if (state === "tripped") return "danger";
  return "caution";
}

function isolatorTone(state: IsolatorState) {
  if (state === "closed") return "normal";
  if (state === "intermediate") return "danger";
  return "caution";
}

function interlockTone(state: InterlockState) {
  if (state === "permissive") return "normal";
  if (state === "bypassed") return "danger";
  return "caution";
}
