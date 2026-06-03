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

  // ── 400 kV Incoming Line Bays (SLD Page 1 — active bays) ──────────────────
  asset("bay-400-rtpp2",  "400 kV RTPP-2  (Bays 401/402)", "feeder", "400kV", "400 kV Incoming Line Bays", -160, 165),
  asset("bay-400-rtpp1",  "400 kV RTPP-1  (Bays 404/405)", "feeder", "400kV", "400 kV Incoming Line Bays",  -80, 165),
  asset("bay-400-chtr1",  "400 kV CHITTOOR-1  (Bays 407/408)", "feeder", "400kV", "400 kV Incoming Line Bays",  80, 165),
  asset("bay-400-chtr2",  "400 kV CHITTOOR-2  (Bays 410/411)", "feeder", "400kV", "400 kV Incoming Line Bays", 160, 165),
  asset("bay-400-fut1",   "400 kV Future Bay (413-415)",   "feeder", "400kV", "400 kV Incoming Line Bays",  240, 165),
  asset("bay-400-fut2",   "400 kV Future Bay (416-418)",   "feeder", "400kV", "400 kV Incoming Line Bays",  320, 165),

  // ── 400 kV Double Bus ──────────────────────────────────────────────────────
  asset("bus-400-main-1",     "400 kV Main Bus-1",    "busbar",  "400kV", "400 kV Double Bus",   0, 160),
  asset("bus-400-main-2",     "400 kV Main Bus-2",    "busbar",  "400kV", "400 kV Double Bus",   0, 145),
  asset("bus-400-transfer",   "400 kV Transfer Bus",  "busbar",  "400kV", "400 kV Double Bus",   0, 130),
  asset("bay-400-bus-coupler","400 kV Bus Coupler (4-BB1/BB2)", "breaker", "400kV", "400 kV Double Bus", -200, 150),

  // ── 400/220 kV ICTs — 315 MVA each (SLD: ICT-1 Bay 406→205, ICT-2 Bay 409→207) ──
  asset("ict-1", "ICT-1  315 MVA  400/220/33 kV", "transformer", "400kV", "400/220 kV ICT Bays", -60, 10),
  asset("ict-2", "ICT-2  315 MVA  400/220/33 kV", "transformer", "400kV", "400/220 kV ICT Bays",  40, 10),
  asset("ict-3", "ICT-3  315 MVA  400/220/33 kV (Future)", "transformer", "400kV", "400/220 kV ICT Bays", 140, 10),

  // ── 220 kV Bus & Feeders — 14 bays (SLD Page 2, Bay 201 → 214) ───────────
  asset("bus-220-main-1",   "220 kV Main Bus-1",    "busbar",  "220kV", "220 kV Bus & Feeders",   0, -80),
  asset("bus-220-transfer", "220 kV Transfer Bus",  "busbar",  "220kV", "220 kV Bus & Feeders",   0, -100),

  // Active 220 kV line bays
  asset("bay-201", "220 kV MADANAPALLI-2  (Bay 201)", "feeder", "220kV", "220 kV Bus & Feeders", -340, -148),
  asset("bay-202", "220 kV MADANAPALLI-1  (Bay 202)", "feeder", "220kV", "220 kV Bus & Feeders", -260, -148),
  asset("bay-203", "220 kV Future Bay-203",            "feeder", "220kV", "220 kV Bus & Feeders", -180, -148),
  asset("bay-204", "220 kV Future Bay-204",            "feeder", "220kV", "220 kV Bus & Feeders", -100, -148),
  asset("bay-205", "220 kV ICT-1 LV  (Bay 205)",       "feeder", "220kV", "220 kV Bus & Feeders",  -20, -148),
  asset("bay-206", "220 kV Bus Coupler  (Bay 206)",    "breaker","220kV", "220 kV Bus & Feeders",   60, -120),
  asset("bay-207", "220 kV ICT-2 LV  (Bay 207)",       "feeder", "220kV", "220 kV Bus & Feeders",  130, -148),
  asset("bay-208", "220 kV Transfer Bus Coupler (Bay 208)", "breaker","220kV","220 kV Bus & Feeders", 200, -120),
  asset("bay-209", "220 kV ICT-3 LV  (Bay 209) Future","feeder", "220kV", "220 kV Bus & Feeders",  270, -148),
  asset("bay-210", "220 kV Future Bay-210",            "feeder", "220kV", "220 kV Bus & Feeders",  340, -148),
  asset("bay-211", "220 kV Future Bay-211",            "feeder", "220kV", "220 kV Bus & Feeders",  400, -148),
  asset("bay-212", "220 kV KALIKIRI-2  (Bay 212)",     "feeder", "220kV", "220 kV Bus & Feeders",  460, -148),
  asset("bay-213", "220 kV KALIKIRI-1  (Bay 213)",     "feeder", "220kV", "220 kV Bus & Feeders",  530, -148),
  asset("bay-214", "220 kV Future Bay-214",            "feeder", "220kV", "220 kV Bus & Feeders",  600, -148),

  // ── Reactive Compensation ──────────────────────────────────────────────────
  asset("reactor-400-bus", "400 kV Bus Reactor (Future)", "auxiliary", "400kV", "Reactive Compensation", -280, 80),
  asset("cap-bank-220-1",  "220 kV 2×15 MVAR Cap Bank",  "auxiliary", "220kV", "Reactive Compensation",  640, -80),

  // ── Auxiliary Systems ──────────────────────────────────────────────────────
  asset("control-building", "AP TRANSCO Control & Relay Building", "building", "aux", "Auxiliary Systems", -250, -200),
  asset("relay-room-sw",    "Switchyard Relay Kiosk",              "building", "aux", "Auxiliary Systems",    0,  -60),
  asset("battery-system",   "220 V DC Battery System",            "auxiliary", "aux", "Auxiliary Systems", -260, -220),
  asset("fire-detection",   "ICT Fire Protection System",         "auxiliary", "aux", "Auxiliary Systems",    0,   10),

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
