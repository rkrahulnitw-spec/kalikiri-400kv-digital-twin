import type { SubstationAsset } from "./types";

export const SUBSTATION_ORIGIN = {
  longitude: 78.7573990,
  latitude: 13.6535057,
  height: 170
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

  // 400 kV Incoming Line Bays
  asset("line-400-yerrampalem-1", "400 kV Yerrampalem Line Bay 1", "feeder", "400kV", "400 kV Incoming Line Bays", -160, 165),
  asset("line-400-tirupati-1", "400 kV Tirupati Line Bay", "feeder", "400kV", "400 kV Incoming Line Bays", -80, 165),
  asset("line-400-nellore-1", "400 kV Nellore Line Bay", "feeder", "400kV", "400 kV Incoming Line Bays", 80, 165),
  asset("line-400-hyderabad-1", "400 kV Hyderabad Line Bay", "feeder", "400kV", "400 kV Incoming Line Bays", 160, 165),

  // 400 kV Double Bus
  asset("bus-400-main-1", "400 kV Main Bus 1", "busbar", "400kV", "400 kV Double Bus", 0, 160),
  asset("bus-400-main-2", "400 kV Main Bus 2", "busbar", "400kV", "400 kV Double Bus", 0, 140),
  asset("bus-400-transfer", "400 kV Transfer Bus", "busbar", "400kV", "400 kV Double Bus", 0, 120),
  asset("bay-400-bus-coupler", "400 kV Bus Coupler Bay", "breaker", "400kV", "400 kV Double Bus", 0, 140),

  // 400/220 kV ICT Bays
  asset("ict-1", "ICT-1 400/220 kV 315 MVA", "transformer", "400kV", "400/220 kV ICT Bays", -80, 10),
  asset("ict-2", "ICT-2 400/220 kV 315 MVA", "transformer", "400kV", "400/220 kV ICT Bays", 80, 10),

  // 220 kV Bus & Feeders
  asset("bus-220-section-1", "220 kV Bus Section 1", "busbar", "220kV", "220 kV Bus & Feeders", -120, -80),
  asset("bus-220-section-2", "220 kV Bus Section 2", "busbar", "220kV", "220 kV Bus & Feeders", 120, -80),
  asset("bay-220-bus-coupler", "220 kV Bus Coupler Bay", "breaker", "220kV", "220 kV Bus & Feeders", 0, -80),
  asset("feeder-220-madanapalle", "220 kV Madanapalle Line Bay", "feeder", "220kV", "220 kV Bus & Feeders", -195, -148),
  asset("feeder-220-puttur", "220 kV Puttur Line Bay", "feeder", "220kV", "220 kV Bus & Feeders", -125, -148),
  asset("feeder-220-pileru", "220 kV Pileru Line Bay", "feeder", "220kV", "220 kV Bus & Feeders", -55, -148),
  asset("feeder-220-vempalle", "220 kV Vempalle Line Bay", "feeder", "220kV", "220 kV Bus & Feeders", 15, -148),
  asset("feeder-220-chittoor", "220 kV Chittoor Line Bay", "feeder", "220kV", "220 kV Bus & Feeders", 85, -148),
  asset("feeder-220-spare", "220 kV Spare Bay", "feeder", "220kV", "220 kV Bus & Feeders", 155, -148),

  // Reactive Compensation
  asset("reactor-400-1", "400 kV 50 MVAR Line Reactor", "auxiliary", "400kV", "Reactive Compensation", 210, 80),
  asset("cap-bank-220-1", "220 kV 2×15 MVAR Capacitor Bank", "auxiliary", "220kV", "Reactive Compensation", 210, -80),

  // Auxiliary Systems
  asset("control-building", "Control & Relay Building", "building", "aux", "Auxiliary Systems", -225, -30),
  asset("battery-system", "220 V DC Battery System", "auxiliary", "aux", "Auxiliary Systems", -238, -62),
  asset("fire-detection", "ICT Fire Protection System", "auxiliary", "aux", "Auxiliary Systems", 0, 10),

  // Perimeter & Civil
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
    modelRef: {
      externalId: `APTRANSCO-KALIKIRI:${id}`
    }
  };
}
