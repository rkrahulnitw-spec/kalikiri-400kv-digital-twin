import type { SubstationAsset } from "./types";

export const SUBSTATION_ORIGIN = {
  longitude: 78.7573990,
  latitude:  13.6535057,
  height:    170
};

export const PRIMARY_ASSET_ID = "ict-1";

export const ASSET_GROUPS = [
  "400 kV Incoming Line Bays",
  "400 kV Double Bus",
  "400/220 kV ICT Bays",
  "220 kV Bus & Feeders",
  "Reactive Compensation",
  "Auxiliary Systems",
  "Perimeter & Civil"
];

export const SUBSTATION_ASSETS: SubstationAsset[] = [
  asset("yard-400-220", "400/220 kV AIS Substation Yard", "yard", "400kV", "Perimeter & Civil", 0, 0),

  // ── 400 kV Incoming Line Bays (real from SLD) ─────────────────────────────
  asset("line-400-rtpp4-ag-2",  "400 kV RTPP4 AG LINE-2",  "feeder", "400kV", "400 kV Incoming Line Bays", -160, 165),
  asset("line-400-rtpp4-ag-1",  "400 kV RTPP4 AG LINE-1",  "feeder", "400kV", "400 kV Incoming Line Bays",  -80, 165),
  asset("line-400-chtr4-at-1",  "400 kV CHTR4 AT LINE-1",  "feeder", "400kV", "400 kV Incoming Line Bays",   80, 165),
  asset("line-400-chtr4-at-2",  "400 kV CHTR4 AT LINE-2",  "feeder", "400kV", "400 kV Incoming Line Bays",  160, 165),
  asset("future-bay-1",         "400 kV Future Bay-1",      "feeder", "400kV", "400 kV Incoming Line Bays",  220, 165),
  asset("future-bay-3",         "400 kV Future Bay-3",      "feeder", "400kV", "400 kV Incoming Line Bays",  240, 165),

  // ── 400 kV Double Bus ──────────────────────────────────────────────────────
  asset("bus-400-main-1",    "400 kV Main Bus-1",   "busbar",  "400kV", "400 kV Double Bus",  0, 160),
  asset("bus-400-main-2",    "400 kV Main Bus-2",   "busbar",  "400kV", "400 kV Double Bus",  0, 140),
  asset("bus-400-transfer",  "400 kV Transfer Bus", "busbar",  "400kV", "400 kV Double Bus",  0, 120),
  asset("bay-400-bus-coupler","400 kV Bus Coupler",  "breaker", "400kV", "400 kV Double Bus",  0, 140),

  // ── 400/220 kV ICTs — 3 units at 315 MVA each (real from SLD) ─────────────
  asset("ict-1",        "ICT-T1  400/220 kV  315 MVA", "transformer", "400kV", "400/220 kV ICT Bays", -110, 10),
  asset("ict-2",        "ICT-T2  400/220 kV  315 MVA", "transformer", "400kV", "400/220 kV ICT Bays",    0, 10),
  asset("ict-3",        "ICT-T3  400/220 kV  315 MVA", "transformer", "400kV", "400/220 kV ICT Bays",  110, 10),
  asset("future-bay-2", "400 kV Future Bay-2",          "feeder",      "400kV", "400/220 kV ICT Bays",  -50, 80),
  asset("future-bay-4", "400 kV Future Bay-4",          "feeder",      "400kV", "400/220 kV ICT Bays",  170, 80),

  // ── 220 kV Bus & Feeders (real from SLD) ──────────────────────────────────
  asset("bus-220-section-1",  "220 kV Bus Section-1",  "busbar",  "220kV", "220 kV Bus & Feeders", -120, -80),
  asset("bus-220-section-2",  "220 kV Bus Section-2",  "busbar",  "220kV", "220 kV Bus & Feeders",  120, -80),
  asset("bus-220-transfer",   "220 kV Transfer Bus",   "busbar",  "220kV", "220 kV Bus & Feeders",    0, -160),
  asset("bay-220-bus-coupler","220 kV Bus Coupler",    "breaker", "220kV", "220 kV Bus & Feeders",    0, -80),

  // Real 220 kV lines from SLD
  asset("feeder-220-mdpl2-l2", "220 kV MDPL2 AT LINE-2", "feeder", "220kV", "220 kV Bus & Feeders", -230, -148),
  asset("feeder-220-mdpl2-l1", "220 kV MDPL2 AT LINE-1", "feeder", "220kV", "220 kV Bus & Feeders", -160, -148),
  asset("feeder-220-future-1", "220 kV Future-1",         "feeder", "220kV", "220 kV Bus & Feeders",  -90, -148),
  asset("feeder-220-future-2", "220 kV Future-2",         "feeder", "220kV", "220 kV Bus & Feeders",  -20, -148),
  asset("feeder-220-future-3", "220 kV Future-3",         "feeder", "220kV", "220 kV Bus & Feeders",   50, -148),
  asset("feeder-220-future-4", "220 kV Future-4",         "feeder", "220kV", "220 kV Bus & Feeders",  120, -148),
  asset("feeder-220-klkr2-l1", "220 kV KLKR2 AT LINE-1", "feeder", "220kV", "220 kV Bus & Feeders",  190, -148),
  asset("feeder-220-klkr2-l2", "220 kV KLKR2 AT LINE-2", "feeder", "220kV", "220 kV Bus & Feeders",  230, -148),

  // ── Reactive Compensation ──────────────────────────────────────────────────
  asset("reactor-400-bus",  "400 kV Bus Reactor",          "auxiliary", "400kV", "Reactive Compensation", -220, 80),
  asset("cap-bank-220-1",   "220 kV 2×15 MVAR Cap Bank",  "auxiliary", "220kV", "Reactive Compensation",  240, -80),

  // ── Auxiliary Systems ──────────────────────────────────────────────────────
  asset("control-building", "Control & Relay Building",    "building", "aux", "Auxiliary Systems", -225, -30),
  asset("battery-system",   "220 V DC Battery System",     "auxiliary","aux", "Auxiliary Systems", -238, -62),
  asset("fire-detection",   "ICT Fire Protection System",  "auxiliary","aux", "Auxiliary Systems",    0,  10),

  // ── Perimeter & Civil ─────────────────────────────────────────────────────
  asset("perimeter-fence", "Perimeter Fence", "fence", "aux", "Perimeter & Civil", 0, 0)
];

export const ALL_ASSETS = SUBSTATION_ASSETS;

export function getAssetById(assetId: string) {
  return ALL_ASSETS.find((a) => a.id === assetId);
}

function asset(
  id: string,
  name: SubstationAsset["name"],
  type: SubstationAsset["type"],
  voltageLevel: SubstationAsset["voltageLevel"],
  bay: string,
  east: number,
  north: number
): SubstationAsset {
  return {
    id,
    name,
    type,
    voltageLevel,
    bay,
    parentId: id === "yard-400-220" ? undefined : "yard-400-220",
    position: { east, north },
    geometry: {
      kind: type === "busbar" || type === "fence" ? "line" : type === "yard" ? "compound" : "point"
    },
    modelRef: { externalId: `APTRANSCO-KALIKIRI:${id}` }
  };
}
