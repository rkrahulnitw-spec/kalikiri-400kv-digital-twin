import { useEffect, useRef } from "react";
import {
  ArcGisMapServerImageryProvider,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  EllipsoidTerrainProvider,
  Entity,
  HeadingPitchRange,
  HeadingPitchRoll,
  HorizontalOrigin,
  ImageryLayer,
  Ion,
  LabelStyle,
  Math as CesiumMath,
  Matrix4,
  NearFarScalar,
  PolygonHierarchy,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  ShadowMode,
  Terrain,
  Transforms,
  VerticalOrigin,
  Viewer
} from "cesium";
import { SUBSTATION_ORIGIN } from "../domain/substation";
import type { TelemetrySample, VoltageLevel } from "../domain/types";

interface CesiumSceneProps {
  selectedAssetId: string;
  samples: Record<string, TelemetrySample>;
  onSelectAsset: (assetId: string) => void;
}

type LocalPoint = { east: number; north: number; up: number };

const VOLTAGE_COLOR: Record<VoltageLevel, Color> = {
  "400kV": Color.fromCssColorString("#dca24a"),
  "220kV": Color.fromCssColorString("#66b7d8"),
  "132kV": Color.fromCssColorString("#8bb5c3"),
  "33kV":  Color.fromCssColorString("#82b47c"),
  aux:     Color.fromCssColorString("#9aa7ad")
};

const CONCRETE      = Color.fromCssColorString("#626b6f");
const GRAVEL        = Color.fromCssColorString("#313b3f");
const ROAD          = Color.fromCssColorString("#20292d");
const STEEL         = Color.fromCssColorString("#8f9ca5");
const DARK_STEEL    = Color.fromCssColorString("#4f5c63");
const PORCELAIN     = Color.fromCssColorString("#dce7df");
const TRANSFORMER   = Color.fromCssColorString("#617985");
const RADIATOR      = Color.fromCssColorString("#3f5058");
const BUILDING      = Color.fromCssColorString("#c5cbd0");
const GLASS         = Color.fromCssColorString("#2b6576");
const COPPER        = Color.fromCssColorString("#d2b16f");
const ROUTE_HV      = Color.fromCssColorString("#ffd080");
const ROUTE_LV      = Color.fromCssColorString("#7cd7ff");
const CONTACT_SHADOW = Color.fromCssColorString("#02070b");
const GREEN         = Color.fromCssColorString("#63e66f");
const AMBER         = Color.fromCssColorString("#f5b942");
const RED           = Color.fromCssColorString("#ff5d4f");
const ESRI_URL      = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";

const LINE_BAYS_400 = [
  { id: "line-400-yerrampalem-1", label: "400 kV Yerrampalem", x: -160 },
  { id: "line-400-tirupati-1",    label: "400 kV Tirupati",    x:  -80 },
  { id: "line-400-nellore-1",     label: "400 kV Nellore",     x:   80 },
  { id: "line-400-hyderabad-1",   label: "400 kV Hyderabad",   x:  160 }
];

const ICTS = [
  { id: "ict-1", label: "ICT-1 315 MVA", x: -80 },
  { id: "ict-2", label: "ICT-2 315 MVA", x:  80 }
];

const FEEDERS_220 = [
  { id: "feeder-220-madanapalle", label: "Madanapalle", x: -195 },
  { id: "feeder-220-puttur",      label: "Puttur",      x: -125 },
  { id: "feeder-220-pileru",      label: "Pileru",      x:  -55 },
  { id: "feeder-220-vempalle",    label: "Vempalle",    x:   15 },
  { id: "feeder-220-chittoor",    label: "Chittoor",    x:   85 },
  { id: "feeder-220-spare",       label: "Spare",       x:  155 }
];

export default function CesiumScene({ selectedAssetId, samples, onSelectAsset }: CesiumSceneProps) {
  const containerRef       = useRef<HTMLDivElement | null>(null);
  const viewerRef          = useRef<Viewer | null>(null);
  const entityMapRef       = useRef(new Map<string, Entity>());
  const markerMapRef       = useRef(new Map<string, Entity>());
  const originRef          = useRef(Matrix4.IDENTITY);
  const flyoutReadyRef     = useRef(false);

  // ── Init viewer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
    const hasWorldTerrain = Boolean(token);
    if (token) Ion.defaultAccessToken = token;

    originRef.current = Transforms.eastNorthUpToFixedFrame(
      Cartesian3.fromDegrees(
        SUBSTATION_ORIGIN.longitude,
        SUBSTATION_ORIGIN.latitude,
        hasWorldTerrain ? SUBSTATION_ORIGIN.height : 0
      )
    );

    const viewer = new Viewer(containerRef.current, {
      animation: false, baseLayerPicker: false, fullscreenButton: false,
      geocoder: false, homeButton: false, infoBox: false,
      navigationHelpButton: false, sceneModePicker: false,
      selectionIndicator: false, timeline: false,
      baseLayer: createSatelliteLayer(),
      terrain: hasWorldTerrain ? Terrain.fromWorldTerrain() : undefined,
      terrainProvider: hasWorldTerrain ? undefined : new EllipsoidTerrainProvider()
    });

    viewerRef.current = viewer;
    viewer.scene.globe.baseColor             = Color.fromCssColorString("#172529");
    viewer.scene.globe.maximumScreenSpaceError = 3;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.postProcessStages.fxaa.enabled = true;
    viewer.scene.highDynamicRange            = false;
    viewer.shadows                           = false;
    viewer.terrainShadows                    = ShadowMode.DISABLED;
    viewer.resolutionScale                   = Math.min(window.devicePixelRatio || 1, 1.0);
    viewer.scene.fog.enabled                 = false;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 60;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 1200;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    viewer.cesiumWidget.creditContainer.setAttribute("style", "display:none");

    // ─ KEY PERFORMANCE FIX: only render on camera move / data change ─
    viewer.scene.requestRenderMode        = true;
    viewer.scene.maximumRenderTimeChange  = 0.1;

    buildSubstation(viewer, originRef.current, entityMapRef.current, markerMapRef.current);
    focusSubstation(viewer, originRef.current);

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((mv: { position: Cartesian2 }) => {
      const picked  = viewer.scene.pick(mv.position);
      const entity  = picked?.id as Entity | undefined;
      const assetId = entity?.properties?.assetId?.getValue(viewer.clock.currentTime) as string | undefined;
      if (assetId) onSelectAsset(assetId);
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      entityMapRef.current.clear();
      markerMapRef.current.clear();
    };
  }, [onSelectAsset]);

  useEffect(() => {
    const v = viewerRef.current;
    entityMapRef.current.forEach((e, id) => applySelection(e, id === selectedAssetId));
    v?.entities.values.forEach((e: Entity) => applyRouteSelection(e, selectedAssetId, v.clock.currentTime));
    v?.scene.requestRender();
  }, [selectedAssetId]);

  useEffect(() => {
    markerMapRef.current.forEach((m, id) => applyMarker(m, samples[id], id === selectedAssetId));
    viewerRef.current?.scene.requestRender();
  }, [samples, selectedAssetId]);

  useEffect(() => {
    const v = viewerRef.current;
    const e = entityMapRef.current.get(selectedAssetId);
    if (!v || !e?.position) return;
    if (!flyoutReadyRef.current) { flyoutReadyRef.current = true; return; }
    const pos = e.position.getValue(v.clock.currentTime);
    if (pos) {
      v.camera.flyToBoundingSphere(
        new BoundingSphere(pos, selectedAssetId.includes("ict") ? 60 : 40),
        { duration: 0.75, offset: new HeadingPitchRange(CesiumMath.toRadians(8), CesiumMath.toRadians(-28), 90) }
      );
    }
  }, [selectedAssetId]);

  return <div ref={containerRef} className="cesium-host" aria-label="Kalikiri 400/220 kV Cesium digital twin" />;
}

// ── Build scene ────────────────────────────────────────────────────────────────
function buildSubstation(v: Viewer, o: Matrix4, em: Map<string, Entity>, mm: Map<string, Entity>) {
  addSiteContext(v, o);
  addCivilWorks(v, o);

  addZoneLabel(v, o, "400 kV AIS YARD",              0,  200, 28, "400kV");
  addZoneLabel(v, o, "ICT TRANSFORMER BAYS",           0,   50, 18, "400kV");
  addZoneLabel(v, o, "220 kV SWITCHGEAR & FEEDERS",   0, -130, 16, "220kV");

  addBusAssembly(v, o, "bus-400-main-1",   "400 kV Main Bus 1",  "400kV", -235, 235, 160, 22, em, mm);
  addBusAssembly(v, o, "bus-400-main-2",   "400 kV Main Bus 2",  "400kV", -235, 235, 140, 22, em, mm);
  addBusAssembly(v, o, "bus-400-transfer", "400 kV Transfer Bus","400kV", -235, 235, 120, 22, em, mm);
  addBusAssembly(v, o, "bus-220-section-1","220 kV Bus Section 1","220kV", -235,  -5, -80, 14, em, mm);
  addBusAssembly(v, o, "bus-220-section-2","220 kV Bus Section 2","220kV",    5, 235, -80, 14, em, mm);

  LINE_BAYS_400.forEach((b) => addLineBay400(v, o, b.id, b.label, b.x, em, mm));
  add400BusCoupler(v, o, em, mm);
  ICTS.forEach((t) => addICTBay(v, o, t.id, t.label, t.x, em, mm));
  addFireProtection(v, o, em, mm);
  add220BusCoupler(v, o, em, mm);
  FEEDERS_220.forEach((f) => add220FeederBay(v, o, f.id, f.label, f.x, em, mm));
  addCapacitorBank220(v, o, em, mm);
  addLineReactor400(v, o, em, mm);
  addControlBuilding(v, o, em, mm);
  addLightingMasts(v, o);
}

// ── Site context ───────────────────────────────────────────────────────────────
function addSiteContext(v: Viewer, o: Matrix4) {
  addPoly(v, o, [
    { east: -390, north: -310, up: -0.04 }, { east: 390, north: -310, up: -0.04 },
    { east:  390, north:  330, up: -0.04 }, { east: -390, north: 330, up: -0.04 }
  ], Color.fromCssColorString("#2d383c").withAlpha(0.72));

  // Reduced context buildings (from 9 to 4 for perf)
  [-290, 276].forEach((e) => addContextBuilding(v, o, e, 292, 36, 22));
  [-88,  130].forEach((e) => addContextBuilding(v, o, e, 308, 48, 26));

  [-284, 280].forEach((e) => {
    addPoly(v, o, [
      { east: e - 36, north: -256, up: 0.01 }, { east: e + 36, north: -256, up: 0.01 },
      { east: e + 36, north: -140, up: 0.01 }, { east: e - 36, north: -140, up: 0.01 }
    ], Color.fromCssColorString("#2d4b3e").withAlpha(0.58));
  });
}

function addContextBuilding(v: Viewer, o: Matrix4, e: number, n: number, w: number, l: number) {
  addGroundShadow(v, o, e + 1.8, n - 1.8, w + 4, l + 4, 0.2);
  addBox(v, o, undefined, undefined, e, n, 1.8, { x: w, y: l, z: 3.6, color: Color.fromCssColorString("#7d8b8f").withAlpha(0.64) });
}

// ── Civil works ────────────────────────────────────────────────────────────────
function addCivilWorks(v: Viewer, o: Matrix4) {
  addPoly(v, o, [
    { east: -248, north: -226, up: 0 }, { east: 248, north: -226, up: 0 },
    { east:  248, north:  248, up: 0 }, { east: -248, north: 248, up: 0 }
  ], CONCRETE.withAlpha(0.94));
  addPoly(v, o, [
    { east: -234, north: -212, up: 0.08 }, { east: 234, north: -212, up: 0.08 },
    { east:  234, north:  234, up: 0.08 }, { east: -234, north: 234, up: 0.08 }
  ], GRAVEL.withAlpha(0.92));

  // Service roads
  addPoly(v, o, [{ east:-234,north:-50,up:0.12},{east:234,north:-50,up:0.12},{east:234,north:-32,up:0.12},{east:-234,north:-32,up:0.12}], ROAD.withAlpha(0.84));
  addPoly(v, o, [{ east:-234,north:170,up:0.12},{east:234,north:170,up:0.12},{east:234,north:186,up:0.12},{east:-234,north:186,up:0.12}], ROAD.withAlpha(0.84));

  // Reduced trenches (6 key routes instead of 16)
  [-120, 48, 160].forEach((e) => addTrench(v, o, e, -204, e, 226));
  [-100, 56, 130].forEach((n) => addTrench(v, o, -220, n, 220, n));

  addFence(v, o);
  addGateAndDrainage(v, o);
}

function addFence(v: Viewer, o: Matrix4) {
  const corners = [
    { east: -248, north: -226, up: 3.2 }, { east:  248, north: -226, up: 3.2 },
    { east:  248, north:  248, up: 3.2 }, { east: -248, north:  248, up: 3.2 },
    { east: -248, north: -226, up: 3.2 }
  ];
  addLine(v, o, "perimeter-fence", corners, STEEL.withAlpha(0.82), 2, "perimeter-fence");
  for (let e = -234; e <= 234; e += 48) addCylinder(v, o, undefined, "perimeter-fence", e, -226, 1.6, 3.2, 0.09, STEEL);
  for (let n = -198; n <= 218; n += 48) addCylinder(v, o, undefined, "perimeter-fence", -248, n, 1.6, 3.2, 0.09, STEEL);
}

function addGateAndDrainage(v: Viewer, o: Matrix4) {
  addBox(v, o, undefined, "perimeter-fence", -28, -234, 1.6, { x: 22, y: 1.4, z: 3.2, color: STEEL.withAlpha(0.72) });
  addBox(v, o, undefined, "perimeter-fence",  28, -234, 1.6, { x: 22, y: 1.4, z: 3.2, color: STEEL.withAlpha(0.72) });
  addLine(v, o, "perimeter-fence", [
    { east: -234, north: -218, up: 0.18 }, { east: 234, north: -218, up: 0.18 },
    { east:  234, north:  234, up: 0.18 }, { east: -234, north: 234, up: 0.18 },
    { east: -234, north: -218, up: 0.18 }
  ], Color.fromCssColorString("#10191d").withAlpha(0.64), 3);
}

function addTrench(v: Viewer, o: Matrix4, x1: number, y1: number, x2: number, y2: number) {
  addLine(v, o, undefined, [{ east: x1,north: y1,up: 0.2 },{ east: x2,north: y2,up: 0.2 }], Color.fromCssColorString("#11191c").withAlpha(0.72), 5);
}

// ── Bus assembly ───────────────────────────────────────────────────────────────
function addBusAssembly(v: Viewer, o: Matrix4, id: string, label: string, vl: VoltageLevel,
  x1: number, x2: number, north: number, height: number,
  em: Map<string, Entity>, mm: Map<string, Entity>
) {
  const offs = busPhaseOffsets(vl);
  let reg: Entity | undefined;
  addBusSupportRack(v, o, id, x1, x2, north, height, vl);
  offs.forEach((off, i) => {
    const e = addLine(v, o, id,
      [{ east: x1, north: north + off, up: height }, { east: x2, north: north + off, up: height }],
      VOLTAGE_COLOR[vl].withAlpha(i === 1 ? 0.96 : 0.78),
      i === 1 ? 3.2 : 2,
      i === 1 ? id : undefined
    );
    if (i === 1) reg = e;
  });
  const sp = vl === "400kV" ? 32 : 24;
  for (let e = x1 + 18; e < x2; e += sp) {
    offs.forEach((off) => addInsulatorStack(v, o, id, e, north + off, height - insulH(vl), insulH(vl), insulR(vl)));
  }
  if (reg) { em.set(id, reg); mm.set(id, addMarker(v, o, id, x2 + 10, north, height + 2.5)); }
  addLabel(v, o, id, label, x2 + 32, north, height + 3);
}

function addBusSupportRack(v: Viewer, o: Matrix4, id: string, x1: number, x2: number, north: number, height: number, vl: VoltageLevel) {
  const sp = vl === "400kV" ? 32 : 24;
  const offs = busPhaseOffsets(vl);
  const pH = height - 1.8;
  for (let e = x1 + 18; e < x2; e += sp) {
    offs.forEach((off) => {
      addCylinder(v, o, undefined, id, e, north + off, pH / 2, pH, vl === "400kV" ? 0.18 : 0.13, STEEL.withAlpha(0.9));
    });
  }
}

// ── 400 kV line bay ────────────────────────────────────────────────────────────
function addLineBay400(v: Viewer, o: Matrix4, id: string, label: string, east: number, em: Map<string, Entity>, mm: Map<string, Entity>) {
  addBayFoundation(v, o, id, east, 163, 160, 28);
  addGantry(v, o, east, 232, 28, 30, id);
  addThreePhaseRun(v, o, id, east, 262, 26, east, 232, 28, "400kV", 2.8);
  addThreePhaseRun(v, o, id, east, 232, 28, east, 200, 22, "400kV", 2.8);
  addBayConductorDrops(v, o, id, east, [200, 186, 172, 158, 144, 132, 115], 22, "400kV");
  addLineTrap(v, o, id, east, 200, "400kV");
  addCT_CVT(v, o, id, east, 186, "cvt", "400kV");
  addSurgeArresters(v, o, id, east, 172, "400kV");
  addDisconnector(v, o, id, east, 158, "400kV", true);
  addCT_CVT(v, o, id, east, 144, "ct", "400kV");
  addCircuitBreaker(v, o, id, east, 132, "400kV");
  addDisconnector(v, o, id, east, 115, "400kV", false);
  addBusTap(v, o, id, east, 132, 22, east, 160, 22, "400kV", 2.8);
  addBusTap(v, o, id, east, 132, 22, east, 140, 22, "400kV", 2.8);
  const core = addBox(v, o, id, id, east, 163, 0.45, { x: 28, y: 160, z: 0.9, color: CONCRETE.withAlpha(0.98) });
  em.set(id, core);
  mm.set(id, addMarker(v, o, id, east + 14, 186, 27));
  addLabel(v, o, id, label, east, 252, 33);
}

// ── 400 kV bus coupler ─────────────────────────────────────────────────────────
function add400BusCoupler(v: Viewer, o: Matrix4, em: Map<string, Entity>, mm: Map<string, Entity>) {
  const id = "bay-400-bus-coupler";
  addBayFoundation(v, o, id, 0, 140, 70, 30);
  addBusTap(v, o, id, 0, 152, 22, 0, 160, 22, "400kV", 2.4);
  addBusTap(v, o, id, 0, 126, 22, 0, 140, 22, "400kV", 2.4);
  addDisconnector(v, o, id, 0, 152, "400kV", false);
  addCT_CVT(v, o, id, 0, 140, "ct", "400kV");
  addCircuitBreaker(v, o, id, 0, 128, "400kV");
  addDisconnector(v, o, id, 0, 115, "400kV", false);
  const core = addBox(v, o, id, id, 0, 140, 0.45, { x: 30, y: 70, z: 0.9, color: CONCRETE });
  em.set(id, core); mm.set(id, addMarker(v, o, id, 18, 142, 28));
  addLabel(v, o, id, "400 kV Bus Coupler", 0, 107, 28);
}

// ── ICT bay ────────────────────────────────────────────────────────────────────
function addICTBay(v: Viewer, o: Matrix4, id: string, label: string, east: number, em: Map<string, Entity>, mm: Map<string, Entity>) {
  addBayFoundation(v, o, id, east, 10, 130, 38);
  addBusTap(v, o, id, east, 52, 22, east, 140, 22, "400kV", 2.8);
  addBusTap(v, o, id, east, 52, 22, east, 160, 22, "400kV", 2.8);
  addBayConductorDrops(v, o, id, east, [68, 52, 38, 24], 22, "400kV");
  addDisconnector(v, o, id, east, 68, "400kV", false);
  addCT_CVT(v, o, id, east, 52, "ct", "400kV");
  addCircuitBreaker(v, o, id, east, 38, "400kV");
  addSurgeArresters(v, o, id, east, 24, "400kV");
  addThreePhaseRun(v, o, id, east, 22, 14, east, 4, 14, "400kV", 2.8);
  addICTTransformer(v, o, id, east, -10, label, em, mm);
  addThreePhaseRun(v, o, id, east, -20, 11, east, -54, 14, "220kV", 2.4);
  add220IncomerPanel(v, o, id, east, -56);
  addBusTap(v, o, id, east, -56, 14, east, -80, 14, "220kV", 2.4);
}

function addICTTransformer(v: Viewer, o: Matrix4, id: string, east: number, north: number, label: string, em: Map<string, Entity>, mm: Map<string, Entity>) {
  addGroundShadow(v, o, east + 1.5, north - 1.5, 88, 72, 0.36);
  addBox(v, o, undefined, id, east, north, 0.8, { x: 82, y: 66, z: 1.6, color: CONCRETE });
  const body = addBox(v, o, id, id, east, north, 7.2, { x: 44, y: 26, z: 14.4, color: TRANSFORMER });

  // Bund wall
  const wall = Color.fromCssColorString("#505a5d").withAlpha(0.92);
  addBox(v, o, undefined, id, east, north + 34, 1.2, { x: 90, y: 1.6, z: 2.4, color: wall });
  addBox(v, o, undefined, id, east, north - 34, 1.2, { x: 90, y: 1.6, z: 2.4, color: wall });
  addBox(v, o, undefined, id, east - 45, north, 1.2, { x: 1.6, y: 68, z: 2.4, color: wall });
  addBox(v, o, undefined, id, east + 45, north, 1.2, { x: 1.6, y: 68, z: 2.4, color: wall });

  // Radiators (6 per side)
  [-15, -8, -1, 6, 13, 20].forEach((off) => {
    addBox(v, o, undefined, id, east + off, north + 15, 7.2, { x: 2.4, y: 4, z: 11, color: RADIATOR });
    addBox(v, o, undefined, id, east + off, north - 15, 7.2, { x: 2.4, y: 4, z: 11, color: RADIATOR });
  });

  // Conservator
  addCylinder(v, o, undefined, id, east, north - 13, 16.8, 32, 2.4, TRANSFORMER, true);

  // HV bushings
  phaseOffsets("400kV").forEach((off) => addInsulatorStack(v, o, id, east + off, north + 13.5, 14.4, 8, 0.52));
  // LV bushings
  phaseOffsets("220kV").forEach((off) => addInsulatorStack(v, o, id, east + off, north - 13.5, 12, 5.8, 0.38));

  // OLTC
  addBox(v, o, undefined, id, east + 25, north, 5.8, { x: 4.8, y: 14, z: 11.6, color: DARK_STEEL });

  em.set(id, body);
  mm.set(id, addMarker(v, o, id, east + 28, north + 16, 20));
  addLabel(v, o, id, label, east, north + 32, 20);
}

function add220IncomerPanel(v: Viewer, o: Matrix4, id: string, east: number, north: number) {
  [-4.8, 0, 4.8].forEach((off) => {
    addBox(v, o, undefined, id, east + off, north, 3.2, { x: 2.8, y: 5, z: 6.4, color: DARK_STEEL });
    addInsulatorStack(v, o, id, east + off, north + 5.5, 5, 3.8, 0.2);
  });
}

// ── Fire protection ────────────────────────────────────────────────────────────
function addFireProtection(v: Viewer, o: Matrix4, em: Map<string, Entity>, mm: Map<string, Entity>) {
  const id = "fire-detection";
  addGroundShadow(v, o, 0, -10, 5.6, 56, 0.28);
  const fw = addBox(v, o, id, id, 0, 0, 5.5, { x: 2.2, y: 56, z: 11, color: Color.fromCssColorString("#b3b7b9").withAlpha(0.94) });
  [-80, 80].forEach((ex) => {
    addLine(v, o, id, [
      { east: ex-32,north:-36,up:1.2},{east:ex+32,north:-36,up:1.2},
      { east: ex+32,north: 16,up:1.2},{east:ex-32,north: 16,up:1.2},
      { east: ex-32,north:-36,up:1.2}
    ], RED.withAlpha(0.64), 1.2);
  });
  em.set(id, fw); mm.set(id, addMarker(v, o, id, 6, 18, 14));
  addLabel(v, o, id, "ICT Fire Protection", 0, 22, 14);
}

// ── 220 kV bus coupler ─────────────────────────────────────────────────────────
function add220BusCoupler(v: Viewer, o: Matrix4, em: Map<string, Entity>, mm: Map<string, Entity>) {
  const id = "bay-220-bus-coupler";
  addBayFoundation(v, o, id, 0, -80, 48, 22);
  addBusSectionJumper(v, o, id, -5, 5, -80, 14, "220kV", 2.2);
  addBox(v, o, undefined, id, 0, -90, 3, { x: 9, y: 6, z: 6, color: DARK_STEEL });
  addDisconnector(v, o, id, 0, -82, "220kV", false);
  const core = addBox(v, o, id, id, 0, -90, 0.45, { x: 22, y: 48, z: 0.9, color: CONCRETE });
  em.set(id, core); mm.set(id, addMarker(v, o, id, 13, -90, 17));
  addLabel(v, o, id, "220 kV Bus Coupler", 0, -106, 16);
}

// ── 220 kV feeder bay ─────────────────────────────────────────────────────────
function add220FeederBay(v: Viewer, o: Matrix4, id: string, label: string, east: number, em: Map<string, Entity>, mm: Map<string, Entity>) {
  addBayFoundation(v, o, id, east, -148, 90, 18);
  addBusTap(v, o, id, east, -126, 8, east, -80, 14, "220kV", 2.4);
  addBayConductorDrops(v, o, id, east, [-126, -138, -152], 8, "220kV");
  addThreePhaseRun(v, o, id, east, -126, 8, east, -184, 8, "220kV", 2.4);
  addBox(v, o, undefined, id, east, -126, 3, { x: 10, y: 6.5, z: 6, color: DARK_STEEL });
  addCT_CVT(v, o, id, east, -138, "ct", "220kV");
  addSurgeArresters(v, o, id, east, -152, "220kV");
  addGantry(v, o, east, -192, 14, 18, id);
  const core = addBox(v, o, id, id, east, -154, 0.45, { x: 18, y: 90, z: 0.9, color: CONCRETE });
  em.set(id, core); mm.set(id, addMarker(v, o, id, east + 9, -134, 16.5));
  addLabel(v, o, id, label, east, -200, 15);
}

// ── Reactive compensation ──────────────────────────────────────────────────────
function addLineReactor400(v: Viewer, o: Matrix4, em: Map<string, Entity>, mm: Map<string, Entity>) {
  const id = "reactor-400-1";
  addBayFoundation(v, o, id, 210, 80, 78, 32);
  addGroundShadow(v, o, 211, 78, 36, 54, 0.3);
  addBox(v, o, undefined, id, 210, 80, 0.8, { x: 30, y: 46, z: 1.6, color: CONCRETE });
  const body = addBox(v, o, id, id, 210, 80, 6.4, { x: 26, y: 36, z: 12.8, color: TRANSFORMER });
  [-10, 0, 10].forEach((off) => {
    addBox(v, o, undefined, id, 210 + off, 80 + 20, 6.4, { x: 2, y: 3.4, z: 9.6, color: RADIATOR });
    addBox(v, o, undefined, id, 210 + off, 80 - 20, 6.4, { x: 2, y: 3.4, z: 9.6, color: RADIATOR });
  });
  phaseOffsets("400kV").forEach((off) => addInsulatorStack(v, o, id, 210 + off, 80 + 14, 12.8, 7.5, 0.5));
  addBusTap(v, o, id, 210, 72, 22, 210, 140, 22, "400kV", 2.5);
  em.set(id, body); mm.set(id, addMarker(v, o, id, 228, 84, 18));
  addLabel(v, o, id, "400 kV Line Reactor", 210, 114, 19);
}

function addCapacitorBank220(v: Viewer, o: Matrix4, em: Map<string, Entity>, mm: Map<string, Entity>) {
  const id = "cap-bank-220-1";
  addBayFoundation(v, o, id, 210, -80, 55, 34);
  addBusTap(v, o, id, 210, -80, 8, 192, -80, 14, "220kV", 2.4);
  [-12, -5, 5, 12].forEach((eo) => {
    [-8, 8].forEach((no) => {
      addCylinder(v, o, undefined, id, 210 + eo, -80 + no, 2.8, 5.6, 0.7, Color.fromCssColorString("#bac8cd"));
      addInsulatorStack(v, o, id, 210 + eo, -80 + no, 5.8, 2.8, 0.2);
    });
  });
  addBox(v, o, undefined, id, 210, -62, 3, { x: 22, y: 4.2, z: 6, color: DARK_STEEL });
  const core = addBox(v, o, id, id, 210, -80, 0.45, { x: 34, y: 55, z: 0.9, color: CONCRETE });
  em.set(id, core); mm.set(id, addMarker(v, o, id, 232, -73, 13));
  addLabel(v, o, id, "220 kV Capacitor Bank", 210, -48, 14);
}

// ── Control building ───────────────────────────────────────────────────────────
function addControlBuilding(v: Viewer, o: Matrix4, em: Map<string, Entity>, mm: Map<string, Entity>) {
  const id = "control-building";
  addGroundShadow(v, o, -225, -30, 50, 34, 0.3);
  const body = addBox(v, o, id, id, -225, -30, 5.2, { x: 46, y: 30, z: 10.4, color: BUILDING });
  addBox(v, o, undefined, id, -225, -30, 10.8, { x: 50, y: 34, z: 1.2, color: Color.fromCssColorString("#88949b") });
  [-238, -225, -212].forEach((ex) => addBox(v, o, undefined, id, ex, -16.2, 5.6, { x: 7, y: 0.6, z: 3.6, color: GLASS.withAlpha(0.96) }));
  addBox(v, o, "battery-system", "battery-system", -240, -62, 1.8, { x: 14, y: 7, z: 3.6, color: DARK_STEEL });
  em.set(id, body); mm.set(id, addMarker(v, o, id, -202, -18, 13.5));
  addLabel(v, o, id, "Control & Relay Building", -225, -10, 14);
}

function addLightingMasts(v: Viewer, o: Matrix4) {
  [[-220,220],[220,220],[-220,-200],[220,-200],[0,224],[0,-212],[-200,0],[200,0]].forEach(([e,n]) => {
    addCylinder(v, o, undefined, undefined, e, n, 12, 24, 0.16, STEEL);
    addBox(v, o, undefined, undefined, e, n, 24.6, { x: 4.5, y: 1.6, z: 1, color: Color.fromCssColorString("#f2f4d8") });
  });
}

// ── Equipment helpers ──────────────────────────────────────────────────────────
function addBayFoundation(v: Viewer, o: Matrix4, id: string, east: number, north: number, l: number, w: number) {
  addGroundShadow(v, o, east + 1, north - 0.8, w + 3.6, l + 3.6, 0.28);
  addBox(v, o, undefined, id, east, north, 0.2, { x: w, y: l, z: 0.4, color: Color.fromCssColorString("#747d81").withAlpha(0.92) });
}

function addGroundShadow(v: Viewer, o: Matrix4, east: number, north: number, w: number, l: number, a: number) {
  addBox(v, o, undefined, undefined, east, north, 0.05, { x: w, y: l, z: 0.04, color: CONTACT_SHADOW.withAlpha(a) });
}

function addGantry(v: Viewer, o: Matrix4, east: number, north: number, h: number, span: number, id?: string) {
  [-span/2, span/2].forEach((off) => {
    addBox(v, o, undefined, id, east + off, north, 0.2, { x: 2.8, y: 2.8, z: 0.4, color: CONCRETE.withAlpha(0.94) });
    addCylinder(v, o, undefined, id, east + off, north, h/2, h, 0.22, STEEL);
    addLine(v, o, id, [{ east: east+off, north, up: h*0.72 },{ east, north, up: h }], STEEL.withAlpha(0.7), 1.2);
  });
  addLine(v, o, id, [{ east: east-span/2,north,up:h },{ east: east+span/2,north,up:h }], STEEL.withAlpha(0.82), 4);
}

function addLineTrap(v: Viewer, o: Matrix4, id: string, east: number, north: number, vl: VoltageLevel) {
  phaseOffsets(vl).forEach((off) => {
    addCylinder(v, o, undefined, id, east + off, north, 11.5, 4.5, vl === "400kV" ? 0.68 : 0.5, Color.fromCssColorString("#c8d0d3"));
    addInsulatorStack(v, o, id, east + off, north, 6.2, 4.8, vl === "400kV" ? 0.28 : 0.2);
  });
}

function addCT_CVT(v: Viewer, o: Matrix4, id: string, east: number, north: number, kind: "ct"|"cvt", vl: VoltageLevel) {
  const r = vl === "400kV" ? 0.42 : 0.32;
  phaseOffsets(vl).forEach((off) => {
    addBox(v, o, undefined, id, east+off, north, 0.85, { x: 2, y: 2, z: 1.7, color: DARK_STEEL });
    addInsulatorStack(v, o, id, east+off, north, 1.7, kind==="cvt" ? (vl==="400kV"?7.5:5.2) : (vl==="400kV"?5.5:3.8), r);
    addCylinder(v, o, undefined, id, east+off, north, kind==="cvt"?(vl==="400kV"?11.2:7.8):(vl==="400kV"?8.4:6.2), 2, vl==="400kV"?0.72:0.52, Color.fromCssColorString("#cfd6d9"));
  });
}

function addSurgeArresters(v: Viewer, o: Matrix4, id: string, east: number, north: number, vl: VoltageLevel) {
  const h = vl === "400kV" ? 7.5 : vl === "220kV" ? 5.2 : 2.8;
  const r = vl === "400kV" ? 0.30 : vl === "220kV" ? 0.24 : 0.18;
  phaseOffsets(vl).forEach((off) => {
    addBox(v, o, undefined, id, east+off, north, 0.9, { x: 1.8, y: 1.8, z: 1.8, color: DARK_STEEL });
    // Solid body + only 3 representative sheds (was 13 — saves 30 entities per arrester set)
    addCylinder(v, o, undefined, id, east+off, north, 0.9 + h/2, h, r*0.5, Color.fromCssColorString("#a7554a"));
    [0.2, 0.55, 0.85].forEach((t) =>
      addCylinder(v, o, undefined, id, east+off, north, 0.9 + t*h, 0.22, r, Color.fromCssColorString("#a7554a"))
    );
  });
}

function addCircuitBreaker(v: Viewer, o: Matrix4, id: string, east: number, north: number, vl: VoltageLevel) {
  const h = vl === "400kV" ? 8.5 : 6;
  phaseOffsets(vl).forEach((off) => {
    addBox(v, o, undefined, id, east+off, north, 0.8, { x: 2.4, y: 2.2, z: 1.6, color: DARK_STEEL });
    addInsulatorStack(v, o, id, east+off, north-1.5, 1.6, h, vl==="400kV"?0.34:0.26);
    addInsulatorStack(v, o, id, east+off, north+1.5, 1.6, h, vl==="400kV"?0.34:0.26);
    addCylinder(v, o, undefined, id, east+off, north, vl==="400kV"?11.8:9.5, vl==="400kV"?5:3.8, vl==="400kV"?0.54:0.42, Color.fromCssColorString("#d1d8db"), true);
  });
  addBox(v, o, undefined, id, east+(vl==="400kV"?10:8), north, 2, { x: 3.4, y: 5.5, z: 4, color: Color.fromCssColorString("#d6dde1") });
}

function addDisconnector(v: Viewer, o: Matrix4, id: string, east: number, north: number, vl: VoltageLevel, earthSw: boolean) {
  const bH = vl==="400kV"?5:3.8, sH = vl==="400kV"?6.5:5, sr = vl==="400kV"?0.3:0.22;
  phaseOffsets(vl).forEach((off) => {
    addInsulatorStack(v, o, id, east+off-1.6, north, 0, bH, sr);
    addInsulatorStack(v, o, id, east+off+1.6, north, 0, bH, sr);
    addLine(v, o, id, [{ east:east+off-1.8,north,up:bH+sH-1 },{ east:east+off+1.9,north:north+1,up:bH+sH }], Color.fromCssColorString("#edf5f8").withAlpha(0.96), 2.4);
    if (earthSw) addLine(v, o, id, [{ east:east+off+1.9,north:north+1,up:bH+sH },{ east:east+off+2.8,north:north+3.2,up:1 }], STEEL.withAlpha(0.8), 1.2);
  });
}

function addBayConductorDrops(v: Viewer, o: Matrix4, id: string, east: number, norths: number[], cUp: number, vl: VoltageLevel) {
  const col = VOLTAGE_COLOR[vl].withAlpha(0.82);
  norths.forEach((north) => {
    phaseOffsets(vl).forEach((off) => {
      const tUp = vl==="400kV"?12.5:vl==="220kV"?9:5.7;
      addCylinder(v, o, undefined, id, east+off, north, tUp-0.2, 0.4, vl==="400kV"?0.28:0.22, STEEL);
      addLine(v, o, id, [{ east:east+off,north,up:cUp },{ east:east+off,north,up:tUp }], col, vl==="400kV"?1.8:1.5);
    });
  });
}

function addBusTap(v: Viewer, o: Matrix4, id: string, eq: number, eqN: number, eqU: number, busE: number, busN: number, busU: number, vl: VoltageLevel, w: number) {
  const eqOffs = phaseOffsets(vl);
  const bOffs  = busPhaseOffsets(vl);
  const col    = conductorColor(vl);
  eqOffs.forEach((eqOff, i) => {
    const from = { east: eq+eqOff, north: eqN, up: eqU };
    const to   = { east: busE+eqOff, north: busN+bOffs[i], up: busU };
    const jUp  = Math.max(from.up, to.up) + (vl==="400kV"?1.1:0.7);
    addCylinder(v, o, undefined, id, from.east, from.north, from.up-0.2, 0.4, vl==="400kV"?0.28:0.22, STEEL);
    addCylinder(v, o, undefined, id, to.east, to.north, to.up-0.2, 0.4, vl==="400kV"?0.28:0.22, STEEL);
    addLine(v, o, id, [
      from, { east:from.east,north:from.north,up:jUp },
      { east:from.east,north:to.north,up:jUp },
      { east:to.east,north:to.north,up:jUp }, to
    ], col.withAlpha(i===1?0.95:0.72), w);
  });
}

function addBusSectionJumper(v: Viewer, o: Matrix4, id: string, x1: number, x2: number, north: number, up: number, vl: VoltageLevel, w: number) {
  busPhaseOffsets(vl).forEach((off, i) => {
    addLine(v, o, id, [{ east:x1,north:north+off,up },{ east:x2,north:north+off,up }], conductorColor(vl).withAlpha(i===1?0.95:0.72), w);
  });
}

function addThreePhaseRun(v: Viewer, o: Matrix4, id: string, x1:number,y1:number,z1:number, x2:number,y2:number,z2:number, vl:VoltageLevel, w:number) {
  phaseOffsets(vl).forEach((off, i) => {
    const ns = Math.abs(y2-y1) >= Math.abs(x2-x1);
    const from = ns?{east:x1+off,north:y1,up:z1}:{east:x1,north:y1+off,up:z1};
    const to   = ns?{east:x2+off,north:y2,up:z2}:{east:x2,north:y2+off,up:z2};
    const mid  = { east:(from.east+to.east)/2, north:(from.north+to.north)/2, up:Math.min(from.up,to.up)-(vl==="400kV"?0.7:0.45) };
    addLine(v, o, id, [from, mid, to], conductorColor(vl).withAlpha(i===1?0.95:0.72), w);
  });
}

// Simplified: 3 representative sheds instead of one-per-disc → ~80% fewer entities
function addInsulatorStack(v: Viewer, o: Matrix4, id: string|undefined, east:number, north:number, up:number, h:number, r:number) {
  addCylinder(v, o, undefined, id, east, north, up+h/2, h, r*0.28, STEEL.withAlpha(0.76));
  [0.15, 0.5, 0.85].forEach((t) => addCylinder(v, o, undefined, id, east, north, up+t*h, 0.14, r, PORCELAIN.withAlpha(0.98)));
}

// ── Value helpers ──────────────────────────────────────────────────────────────
function insulH(vl: VoltageLevel) { return vl==="400kV"?8:vl==="220kV"?5.5:6.2; }
function insulR(vl: VoltageLevel) { return vl==="400kV"?0.46:vl==="220kV"?0.34:0.27; }
function conductorColor(vl: VoltageLevel) { return vl==="400kV"?ROUTE_HV:vl==="220kV"?ROUTE_LV:COPPER; }
function phaseOffsets(vl: VoltageLevel): number[] { return vl==="400kV"?[-8,0,8]:vl==="220kV"?[-5,0,5]:[-3.4,0,3.4]; }
function busPhaseOffsets(vl: VoltageLevel): number[] { return vl==="400kV"?[-6.5,0,6.5]:vl==="220kV"?[-4,0,4]:[-2.6,0,2.6]; }

// ── Cesium entity helpers ──────────────────────────────────────────────────────
function addMarker(v: Viewer, o: Matrix4, id: string, east:number, north:number, up:number) {
  return v.entities.add({
    id: `${id}-status`, properties: { assetId: id }, position: toWorld(o, east, north, up),
    point: { pixelSize:9, color:GREEN, outlineColor:Color.WHITE.withAlpha(0.86), outlineWidth:1, scaleByDistance:new NearFarScalar(80,1.15,900,0.38) }
  });
}

function addLabel(v: Viewer, o: Matrix4, id:string|undefined, text:string, east:number, north:number, up:number) {
  v.entities.add({
    id: `${id??text}-label`, properties: id?{assetId:id}:undefined, position: toWorld(o, east, north, up),
    label: { text, font:"600 12px Inter,sans-serif", fillColor:Color.WHITE, showBackground:true,
      backgroundColor:Color.fromCssColorString("#07131f").withAlpha(0.78),
      pixelOffset:new Cartesian2(0,-12), scaleByDistance:new NearFarScalar(100,1,800,0.2),
      style:LabelStyle.FILL_AND_OUTLINE, verticalOrigin:VerticalOrigin.BOTTOM, horizontalOrigin:HorizontalOrigin.CENTER }
  });
}

function addZoneLabel(v: Viewer, o: Matrix4, text:string, east:number, north:number, up:number, vl:VoltageLevel) {
  v.entities.add({
    id:`${text}-label`, position: toWorld(o, east, north, up),
    label:{ text, font:"700 14px Inter,sans-serif", fillColor:Color.WHITE, showBackground:true,
      backgroundColor:VOLTAGE_COLOR[vl].withAlpha(0.28), pixelOffset:new Cartesian2(0,-8),
      scaleByDistance:new NearFarScalar(110,1,900,0.36), style:LabelStyle.FILL_AND_OUTLINE }
  });
}

function addPoly(v: Viewer, o: Matrix4, pts: LocalPoint[], color: Color) {
  return v.entities.add({
    polygon: { hierarchy: new PolygonHierarchy(pts.map((p)=>toWorld(o,p.east,p.north,p.up))), perPositionHeight:true, material:color, outline:false }
  });
}

function addBox(v: Viewer, o: Matrix4, id:string|undefined, assetId:string|undefined, east:number, north:number, up:number, opts:{x:number;y:number;z:number;color:Color;headingDeg?:number}) {
  const pos = toWorld(o, east, north, up);
  return v.entities.add({
    id, properties:assetId?{assetId}:undefined, position:pos,
    orientation:Transforms.headingPitchRollQuaternion(pos, new HeadingPitchRoll(CesiumMath.toRadians(opts.headingDeg??0),0,0)),
    box:{dimensions:new Cartesian3(opts.x,opts.y,opts.z),material:opts.color,outline:false}
  });
}

function addCylinder(v: Viewer, o: Matrix4, id:string|undefined, assetId:string|undefined, east:number, north:number, up:number, length:number, radius:number, color:Color, horiz=false) {
  const pos = toWorld(o, east, north, up);
  return v.entities.add({
    id, properties:assetId?{assetId}:undefined, position:pos,
    orientation:horiz?Transforms.headingPitchRollQuaternion(pos,new HeadingPitchRoll(CesiumMath.toRadians(90),CesiumMath.toRadians(90),0)):undefined,
    cylinder:{length,topRadius:radius,bottomRadius:radius,material:color}
  });
}

function addLine(v: Viewer, o: Matrix4, assetId:string|undefined, pts:LocalPoint[], color:Color, width:number, id?:string) {
  const elec = Boolean(assetId && isElectricalColor(color));
  return v.entities.add({
    id, properties:assetId?{assetId,baseWidth:width,baseRed:color.red,baseGreen:color.green,baseBlue:color.blue,baseAlpha:color.alpha,electricalLine:elec}:undefined,
    position:toWorld(o,avg(pts,"east"),avg(pts,"north"),avg(pts,"up")),
    polyline:{positions:pts.map((p)=>toWorld(o,p.east,p.north,p.up)),width,material:color}
  });
}

function isElectricalColor(c: Color) {
  return [ROUTE_HV,ROUTE_LV,COPPER,VOLTAGE_COLOR["400kV"],VOLTAGE_COLOR["220kV"],VOLTAGE_COLOR["132kV"],VOLTAGE_COLOR["33kV"]]
    .some((x)=>Math.abs(c.red-x.red)+Math.abs(c.green-x.green)+Math.abs(c.blue-x.blue)<0.1);
}

// ── Selection highlighting ─────────────────────────────────────────────────────
function applySelection(e: Entity, sel: boolean) {
  if (e.box) e.box.material = new ColorMaterialProperty(matColor(e).withAlpha(sel?1:0.98));
  if (e.polyline) e.polyline.width = new ConstantProperty(sel?6:e.id?.toString().includes("bus")?3.2:2);
}

function applyRouteSelection(e: Entity, selId: string, t: JulianDateLike) {
  if (!e.polyline||!e.properties) return;
  const aId  = e.properties.assetId?.getValue(t) as string|undefined;
  const elec = e.properties.electricalLine?.getValue(t) as boolean|undefined;
  if (!aId||!elec) return;
  const bW   = (e.properties.baseWidth?.getValue(t) as number|undefined)??1.8;
  const bCol = new Color((e.properties.baseRed?.getValue(t) as number|undefined)??1,(e.properties.baseGreen?.getValue(t) as number|undefined)??1,(e.properties.baseBlue?.getValue(t) as number|undefined)??1,(e.properties.baseAlpha?.getValue(t) as number|undefined)??0.86);
  const sel  = aId === selId;
  e.polyline.width    = new ConstantProperty(sel?Math.max(4.5,bW*2.35):bW);
  e.polyline.material = new ColorMaterialProperty(sel?brighten(bCol,0.34).withAlpha(1):bCol);
}

type JulianDateLike = Parameters<NonNullable<Entity["properties"]>["getValue"]>[0];
function brighten(c: Color, a: number) { return new Color(Math.min(1,c.red+a),Math.min(1,c.green+a),Math.min(1,c.blue+a),c.alpha); }
function matColor(e: Entity) {
  const id = e.id?.toString()??""
  if (id.includes("ict")||id.includes("reactor")) return TRANSFORMER;
  if (id.includes("control")) return BUILDING;
  return CONCRETE;
}

function applyMarker(m: Entity, s: TelemetrySample|undefined, sel: boolean) {
  if (!m.point) return;
  m.point.color       = new ConstantProperty(s?dotColor(s):GREEN);
  m.point.pixelSize   = new ConstantProperty(sel?16:9);
  m.point.outlineWidth = new ConstantProperty(sel?3:1);
}

function dotColor(s: TelemetrySample) {
  if (s.alarmSeverity==="critical"||s.healthStatus==="critical") return RED;
  if (s.interlockState==="bypassed"||s.isolatorState==="intermediate") return RED;
  if (s.interlockState==="blocked"||s.isolatorState!=="closed"||s.breakerState!=="closed") return AMBER;
  if (s.alarmSeverity==="medium"||s.healthStatus==="warning") return AMBER;
  if (s.alarmSeverity==="low"||s.healthStatus==="watch") return Color.fromCssColorString("#f3d15b");
  return GREEN;
}

// ── Math ───────────────────────────────────────────────────────────────────────
function avg(pts: LocalPoint[], k: keyof LocalPoint) { return pts.reduce((s,p)=>s+p[k],0)/pts.length; }
function toWorld(o: Matrix4, east:number, north:number, up:number) { return Matrix4.multiplyByPoint(o,new Cartesian3(east,north,up),new Cartesian3()); }

function createSatelliteLayer() {
  return ImageryLayer.fromProviderAsync(
    ArcGisMapServerImageryProvider.fromUrl(ESRI_URL,{enablePickFeatures:false}),
    {brightness:0.94,contrast:1.08,saturation:0.9,maximumAnisotropy:16}
  );
}

function focusSubstation(v: Viewer, o: Matrix4) {
  v.camera.flyTo({
    destination: toWorld(o, -10, -380, 220),
    orientation: { heading:CesiumMath.toRadians(4), pitch:CesiumMath.toRadians(-28), roll:0 },
    duration: 0
  });
}
