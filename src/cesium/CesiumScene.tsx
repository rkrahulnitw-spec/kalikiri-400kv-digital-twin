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
  "33kV": Color.fromCssColorString("#82b47c"),
  aux: Color.fromCssColorString("#9aa7ad")
};

const CONCRETE = Color.fromCssColorString("#626b6f");
const GRAVEL = Color.fromCssColorString("#313b3f");
const ROAD = Color.fromCssColorString("#20292d");
const STEEL = Color.fromCssColorString("#8f9ca5");
const DARK_STEEL = Color.fromCssColorString("#4f5c63");
const PORCELAIN = Color.fromCssColorString("#dce7df");
const TRANSFORMER = Color.fromCssColorString("#617985");
const RADIATOR = Color.fromCssColorString("#3f5058");
const BUILDING = Color.fromCssColorString("#c5cbd0");
const GLASS = Color.fromCssColorString("#2b6576");
const COPPER = Color.fromCssColorString("#d2b16f");
const ROUTE_HV = Color.fromCssColorString("#ffd080");
const ROUTE_LV = Color.fromCssColorString("#7cd7ff");
const CONTACT_SHADOW = Color.fromCssColorString("#02070b");
const GREEN = Color.fromCssColorString("#63e66f");
const AMBER = Color.fromCssColorString("#f5b942");
const RED = Color.fromCssColorString("#ff5d4f");
const ESRI_WORLD_IMAGERY_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";

const LINE_BAYS_400 = [
  { id: "line-400-yerrampalem-1", label: "400 kV Yerrampalem", x: -160 },
  { id: "line-400-tirupati-1",    label: "400 kV Tirupati",    x: -80  },
  { id: "line-400-nellore-1",     label: "400 kV Nellore",     x:  80  },
  { id: "line-400-hyderabad-1",   label: "400 kV Hyderabad",   x:  160 }
];

const ICTS = [
  { id: "ict-1", label: "ICT-1 315 MVA", x: -80,  busSection: "bus-220-section-1" },
  { id: "ict-2", label: "ICT-2 315 MVA", x:  80,  busSection: "bus-220-section-2" }
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const entityMapRef = useRef(new Map<string, Entity>());
  const markerMapRef = useRef(new Map<string, Entity>());
  const originRef = useRef(Matrix4.IDENTITY);
  const selectionFlyoutReadyRef = useRef(false);

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
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      baseLayer: createSatelliteBaseLayer(),
      terrain: hasWorldTerrain ? Terrain.fromWorldTerrain() : undefined,
      terrainProvider: hasWorldTerrain ? undefined : new EllipsoidTerrainProvider()
    });

    viewerRef.current = viewer;
    viewer.scene.globe.baseColor = Color.fromCssColorString("#172529");
    viewer.scene.globe.maximumScreenSpaceError = 1.75;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.postProcessStages.fxaa.enabled = true;
    viewer.scene.highDynamicRange = true;
    viewer.shadows = false;
    viewer.terrainShadows = ShadowMode.DISABLED;
    viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.35);
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.00014;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 60;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 1200;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    viewer.cesiumWidget.creditContainer.setAttribute("style", "display:none");

    buildSubstation(viewer, originRef.current, entityMapRef.current, markerMapRef.current);
    focusSubstation(viewer, originRef.current);

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position);
      const entity = picked?.id as Entity | undefined;
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
    const viewer = viewerRef.current;
    entityMapRef.current.forEach((entity, assetId) => applySelection(entity, assetId === selectedAssetId));
    viewer?.entities.values.forEach((entity) =>
      applyRouteSelection(entity, selectedAssetId, viewer.clock.currentTime)
    );
  }, [selectedAssetId]);

  useEffect(() => {
    markerMapRef.current.forEach((marker, assetId) =>
      applyMarker(marker, samples[assetId], assetId === selectedAssetId)
    );
  }, [samples, selectedAssetId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const entity = entityMapRef.current.get(selectedAssetId);
    if (!viewer || !entity?.position) return;

    if (!selectionFlyoutReadyRef.current) {
      selectionFlyoutReadyRef.current = true;
      return;
    }

    const position = entity.position.getValue(viewer.clock.currentTime);
    if (position) {
      viewer.camera.flyToBoundingSphere(
        new BoundingSphere(position, selectedAssetId.includes("ict") ? 60 : 40),
        {
          duration: 0.75,
          offset: new HeadingPitchRange(
            CesiumMath.toRadians(8),
            CesiumMath.toRadians(-28),
            selectedAssetId.includes("bus") ? 140 : 90
          )
        }
      );
    }
  }, [selectedAssetId]);

  return (
    <div
      ref={containerRef}
      className="cesium-host"
      aria-label="400/220 kV Kalikiri substation digital twin scene"
    />
  );
}

// ─── Scene builder ────────────────────────────────────────────────────────────

function buildSubstation(
  viewer: Viewer,
  origin: Matrix4,
  entityMap: Map<string, Entity>,
  markerMap: Map<string, Entity>
) {
  addSiteContext(viewer, origin);
  addCivilWorks(viewer, origin);

  addZoneLabel(viewer, origin, "400 kV AIS YARD",           0,  200, 28, "400kV");
  addZoneLabel(viewer, origin, "ICT TRANSFORMER BAYS",       0,   50, 18, "400kV");
  addZoneLabel(viewer, origin, "220 kV SWITCHGEAR & FEEDERS", 0, -130, 16, "220kV");

  // 400 kV buses
  addBusAssembly(viewer, origin, "bus-400-main-1",  "400 kV Main Bus 1",  "400kV", -235, 235, 160, 22, entityMap, markerMap);
  addBusAssembly(viewer, origin, "bus-400-main-2",  "400 kV Main Bus 2",  "400kV", -235, 235, 140, 22, entityMap, markerMap);
  addBusAssembly(viewer, origin, "bus-400-transfer","400 kV Transfer Bus","400kV", -235, 235, 120, 22, entityMap, markerMap);

  // 220 kV buses
  addBusAssembly(viewer, origin, "bus-220-section-1","220 kV Bus Section 1","220kV", -235, -5,  -80, 14, entityMap, markerMap);
  addBusAssembly(viewer, origin, "bus-220-section-2","220 kV Bus Section 2","220kV",   5, 235,  -80, 14, entityMap, markerMap);

  // 400 kV line bays
  LINE_BAYS_400.forEach((bay) =>
    addIncomingLineBay400(viewer, origin, bay.id, bay.label, bay.x, entityMap, markerMap)
  );

  add400BusCoupler(viewer, origin, entityMap, markerMap);

  // ICT bays
  ICTS.forEach((ict) =>
    addICTBay(viewer, origin, ict.id, ict.label, ict.x, entityMap, markerMap)
  );

  addFireProtection(viewer, origin, entityMap, markerMap);
  add220BusCoupler(viewer, origin, entityMap, markerMap);

  // 220 kV feeder bays
  FEEDERS_220.forEach((feeder) =>
    add220FeederBay(viewer, origin, feeder.id, feeder.label, feeder.x, entityMap, markerMap)
  );

  addCapacitorBank220(viewer, origin, entityMap, markerMap);
  addLineReactor400(viewer, origin, entityMap, markerMap);
  addControlBuilding(viewer, origin, entityMap, markerMap);
  addLightingMasts(viewer, origin);
}

// ─── Site context & civil works ───────────────────────────────────────────────

function addSiteContext(viewer: Viewer, origin: Matrix4) {
  // Outer site ground
  addPolygon(viewer, origin, [
    { east: -390, north: -310, up: -0.04 },
    { east:  390, north: -310, up: -0.04 },
    { east:  390, north:  330, up: -0.04 },
    { east: -390, north:  330, up: -0.04 }
  ], Color.fromCssColorString("#2d383c").withAlpha(0.72));

  // Road along north boundary
  addPolygon(viewer, origin, [
    { east: -390, north: 252, up: 0.02 },
    { east:  390, north: 252, up: 0.02 },
    { east:  390, north: 278, up: 0.02 },
    { east: -390, north: 278, up: 0.02 }
  ], Color.fromCssColorString("#424b51").withAlpha(0.9));
  // Road along west boundary
  addPolygon(viewer, origin, [
    { east: -368, north: -310, up: 0.02 },
    { east: -340, north: -310, up: 0.02 },
    { east: -340, north:  330, up: 0.02 },
    { east: -368, north:  330, up: 0.02 }
  ], Color.fromCssColorString("#3a454c").withAlpha(0.88));

  // Surrounding context buildings
  [-290, -238, 276, 322].forEach((east) => addContextBuilding(viewer, origin, east, 292, 36, 22));
  [-168, -88, 40, 130, 218].forEach((east) => addContextBuilding(viewer, origin, east, 308, 48, 26));

  // Vegetation patches
  [-284, 280].forEach((east) => {
    addPolygon(viewer, origin, [
      { east: east - 36, north: -256, up: 0.01 },
      { east: east + 36, north: -256, up: 0.01 },
      { east: east + 36, north: -140, up: 0.01 },
      { east: east - 36, north: -140, up: 0.01 }
    ], Color.fromCssColorString("#2d4b3e").withAlpha(0.58));
  });

  // Grid lines (survey grid)
  for (let east = -370; east <= 370; east += 60) {
    addLine(viewer, origin, undefined, [
      { east, north: -306, up: 0.04 },
      { east, north:  326, up: 0.04 }
    ], Color.fromCssColorString("#74858e").withAlpha(0.16), 0.8);
  }
  for (let north = -300; north <= 320; north += 60) {
    addLine(viewer, origin, undefined, [
      { east: -384, north, up: 0.04 },
      { east:  384, north, up: 0.04 }
    ], Color.fromCssColorString("#74858e").withAlpha(0.16), 0.8);
  }
}

function addContextBuilding(
  viewer: Viewer, origin: Matrix4, east: number, north: number, width: number, length: number
) {
  addGroundShadow(viewer, origin, east + 1.8, north - 1.8, width + 4, length + 4, 0.2);
  addBox(viewer, origin, undefined, undefined, east, north, 1.8, {
    x: width, y: length, z: 3.6,
    color: Color.fromCssColorString("#7d8b8f").withAlpha(0.64)
  });
  addBox(viewer, origin, undefined, undefined, east, north, 3.78, {
    x: width + 2.5, y: length + 2.5, z: 0.24,
    color: Color.fromCssColorString("#d5dadd").withAlpha(0.56)
  });
}

function addCivilWorks(viewer: Viewer, origin: Matrix4) {
  // Main yard concrete pad
  addPolygon(viewer, origin, [
    { east: -248, north: -226, up: 0 },
    { east:  248, north: -226, up: 0 },
    { east:  248, north:  248, up: 0 },
    { east: -248, north:  248, up: 0 }
  ], CONCRETE.withAlpha(0.94));

  // Inner gravel yard
  addPolygon(viewer, origin, [
    { east: -234, north: -212, up: 0.08 },
    { east:  234, north: -212, up: 0.08 },
    { east:  234, north:  234, up: 0.08 },
    { east: -234, north:  234, up: 0.08 }
  ], GRAVEL.withAlpha(0.92));

  // Service roads inside yard
  addPolygon(viewer, origin, [
    { east: -234, north: -50, up: 0.12 },
    { east:  234, north: -50, up: 0.12 },
    { east:  234, north: -32, up: 0.12 },
    { east: -234, north: -32, up: 0.12 }
  ], ROAD.withAlpha(0.84));
  addPolygon(viewer, origin, [
    { east: -234, north: 170, up: 0.12 },
    { east:  234, north: 170, up: 0.12 },
    { east:  234, north: 186, up: 0.12 },
    { east: -234, north: 186, up: 0.12 }
  ], ROAD.withAlpha(0.84));
  addRoadMarking(viewer, origin, -226, -41, 226, -41);
  addRoadMarking(viewer, origin, -226, 178, 226, 178);

  // Cable trenches
  [-176, -120, -64, -8, 48, 104, 160, 204].forEach((east) =>
    addTrench(viewer, origin, east, -204, east, 226)
  );
  [-176, -100, -24, 56, 130, 196].forEach((north) =>
    addTrench(viewer, origin, -220, north, 220, north)
  );

  addFence(viewer, origin);
  addGateAndDrainage(viewer, origin);
}

function addRoadMarking(viewer: Viewer, origin: Matrix4, x1: number, y1: number, x2: number, y2: number) {
  addLine(viewer, origin, undefined, [
    { east: x1, north: y1, up: 0.23 },
    { east: x2, north: y2, up: 0.23 }
  ], Color.fromCssColorString("#cbd2d5").withAlpha(0.32), 1);
}

function addFence(viewer: Viewer, origin: Matrix4) {
  const corners = [
    { east: -248, north: -226, up: 3.2 },
    { east:  248, north: -226, up: 3.2 },
    { east:  248, north:  248, up: 3.2 },
    { east: -248, north:  248, up: 3.2 },
    { east: -248, north: -226, up: 3.2 }
  ];
  addLine(viewer, origin, "perimeter-fence", corners, STEEL.withAlpha(0.82), 2, "perimeter-fence");
  for (let east = -234; east <= 234; east += 32) {
    addCylinder(viewer, origin, undefined, "perimeter-fence", east, -226, 1.6, 3.2, 0.09, STEEL);
    addCylinder(viewer, origin, undefined, "perimeter-fence", east,  248, 1.6, 3.2, 0.09, STEEL);
  }
  for (let north = -198; north <= 218; north += 32) {
    addCylinder(viewer, origin, undefined, "perimeter-fence", -248, north, 1.6, 3.2, 0.09, STEEL);
    addCylinder(viewer, origin, undefined, "perimeter-fence",  248, north, 1.6, 3.2, 0.09, STEEL);
  }
}

function addGateAndDrainage(viewer: Viewer, origin: Matrix4) {
  // Gate panels
  addBox(viewer, origin, undefined, "perimeter-fence", -28, -234, 1.6, { x: 22, y: 1.4, z: 3.2, color: STEEL.withAlpha(0.72) });
  addBox(viewer, origin, undefined, "perimeter-fence",  28, -234, 1.6, { x: 22, y: 1.4, z: 3.2, color: STEEL.withAlpha(0.72) });
  // Perimeter line on ground
  addLine(viewer, origin, "perimeter-fence", [
    { east: -234, north: -218, up: 0.18 },
    { east:  234, north: -218, up: 0.18 },
    { east:  234, north:  234, up: 0.18 },
    { east: -234, north:  234, up: 0.18 },
    { east: -234, north: -218, up: 0.18 }
  ], Color.fromCssColorString("#10191d").withAlpha(0.64), 3);
}

function addTrench(viewer: Viewer, origin: Matrix4, x1: number, y1: number, x2: number, y2: number) {
  addLine(viewer, origin, undefined, [
    { east: x1, north: y1, up: 0.2 },
    { east: x2, north: y2, up: 0.2 }
  ], Color.fromCssColorString("#11191c").withAlpha(0.72), 5);
  addLine(viewer, origin, undefined, [
    { east: x1, north: y1, up: 0.28 },
    { east: x2, north: y2, up: 0.28 }
  ], Color.fromCssColorString("#5e686c").withAlpha(0.42), 1);
}

// ─── Bus assembly ─────────────────────────────────────────────────────────────

function addBusAssembly(
  viewer: Viewer, origin: Matrix4,
  assetId: string, label: string, voltage: VoltageLevel,
  x1: number, x2: number, north: number, height: number,
  entityMap: Map<string, Entity>, markerMap: Map<string, Entity>
) {
  const offsets = busPhaseOffsets(voltage);
  let registered: Entity | undefined;
  addBusSupportRack(viewer, origin, assetId, x1, x2, north, height, voltage);
  offsets.forEach((offset, index) => {
    const entity = addLine(
      viewer, origin, assetId,
      [
        { east: x1, north: north + offset, up: height },
        { east: x2, north: north + offset, up: height }
      ],
      VOLTAGE_COLOR[voltage].withAlpha(index === 1 ? 0.96 : 0.78),
      index === 1 ? 3.2 : 2,
      index === 1 ? assetId : undefined
    );
    if (index === 1) registered = entity;
  });

  const spacing = voltage === "400kV" ? 32 : voltage === "220kV" ? 24 : 20;
  for (let east = x1 + 18; east < x2; east += spacing) {
    offsets.forEach((offset) =>
      addInsulatorStack(viewer, origin, assetId, east, north + offset,
        height - insulatorHeight(voltage), insulatorHeight(voltage), insulatorRadius(voltage))
    );
  }

  if (registered) {
    entityMap.set(assetId, registered);
    markerMap.set(assetId, addMarker(viewer, origin, assetId, x2 + 10, north, height + 2.5));
  }
  addLabel(viewer, origin, assetId, label, x2 + 32, north, height + 3);
}

function addBusSupportRack(
  viewer: Viewer, origin: Matrix4, assetId: string,
  x1: number, x2: number, north: number, height: number, voltage: VoltageLevel
) {
  const spacing = voltage === "400kV" ? 32 : voltage === "220kV" ? 24 : 20;
  const offsets = busPhaseOffsets(voltage);
  const iHeight = insulatorHeight(voltage);
  const postHeight = height - 1.8;
  for (let east = x1 + 18; east < x2; east += spacing) {
    offsets.forEach((offset) => {
      addBox(viewer, origin, undefined, assetId, east, north + offset, 0.2, {
        x: voltage === "400kV" ? 3 : 2.2,
        y: voltage === "400kV" ? 3 : 2.2,
        z: 0.4,
        color: CONCRETE.withAlpha(0.94)
      });
      addCylinder(viewer, origin, undefined, assetId, east, north + offset,
        postHeight / 2, postHeight,
        voltage === "400kV" ? 0.18 : 0.13, STEEL.withAlpha(0.9)
      );
      addLine(viewer, origin, assetId, [
        { east: east - 1.2, north: north + offset, up: postHeight - iHeight - 0.8 },
        { east: east + 1.2, north: north + offset, up: postHeight - iHeight + 0.4 }
      ], STEEL.withAlpha(0.56), 1);
    });
  }
}

// ─── 400 kV incoming line bay ─────────────────────────────────────────────────

function addIncomingLineBay400(
  viewer: Viewer, origin: Matrix4,
  assetId: string, label: string, east: number,
  entityMap: Map<string, Entity>, markerMap: Map<string, Entity>
) {
  addBayFoundation(viewer, origin, assetId, east, 163, 160, 28);
  addGantry(viewer, origin, east, 232, 28, 30, assetId);
  // Incoming line drop from above
  addThreePhaseRun(viewer, origin, assetId, east, 262, 26, east, 232, 28, "400kV", 2.8);
  // From gantry down to equipment column height
  addThreePhaseRun(viewer, origin, assetId, east, 232, 28, east, 200, 22, "400kV", 2.8);
  // Horizontal run at bus height over equipment
  addBayConductorDrops(viewer, origin, assetId, east, [200, 186, 172, 158, 144, 132, 115], 22, "400kV");

  addLineTrap(viewer, origin, assetId, east, 200, "400kV");
  addInstrumentTransformer(viewer, origin, assetId, east, 186, "cvt", "400kV");
  addSurgeArresters(viewer, origin, assetId, east, 172, "400kV");
  addDisconnector(viewer, origin, assetId, east, 158, "400kV", true);
  addInstrumentTransformer(viewer, origin, assetId, east, 144, "ct", "400kV");
  addCircuitBreaker(viewer, origin, assetId, east, 132, "400kV");
  addDisconnector(viewer, origin, assetId, east, 115, "400kV", false);

  // Taps to both main buses
  addBusTap(viewer, origin, assetId, east, 132, 22, east, 160, 22, "400kV", 2.8);
  addBusTap(viewer, origin, assetId, east, 132, 22, east, 140, 22, "400kV", 2.8);

  const core = addBox(viewer, origin, assetId, assetId, east, 163, 0.45, {
    x: 28, y: 160, z: 0.9, color: CONCRETE.withAlpha(0.98)
  });
  entityMap.set(assetId, core);
  markerMap.set(assetId, addMarker(viewer, origin, assetId, east + 14, 186, 27));
  addLabel(viewer, origin, assetId, label, east, 252, 33);
}

// ─── 400 kV bus coupler ───────────────────────────────────────────────────────

function add400BusCoupler(
  viewer: Viewer, origin: Matrix4,
  entityMap: Map<string, Entity>, markerMap: Map<string, Entity>
) {
  const assetId = "bay-400-bus-coupler";
  addBayFoundation(viewer, origin, assetId, 0, 140, 70, 30);
  addBusTap(viewer, origin, assetId, 0, 152, 22, 0, 160, 22, "400kV", 2.4);
  addBusTap(viewer, origin, assetId, 0, 126, 22, 0, 140, 22, "400kV", 2.4);
  addDisconnector(viewer, origin, assetId, 0, 152, "400kV", false);
  addInstrumentTransformer(viewer, origin, assetId, 0, 140, "ct", "400kV");
  addCircuitBreaker(viewer, origin, assetId, 0, 128, "400kV");
  addDisconnector(viewer, origin, assetId, 0, 115, "400kV", false);
  const core = addBox(viewer, origin, assetId, assetId, 0, 140, 0.45, { x: 30, y: 70, z: 0.9, color: CONCRETE });
  entityMap.set(assetId, core);
  markerMap.set(assetId, addMarker(viewer, origin, assetId, 18, 142, 28));
  addLabel(viewer, origin, assetId, "400 kV Bus Coupler", 0, 107, 28);
}

// ─── ICT bay ──────────────────────────────────────────────────────────────────

function addICTBay(
  viewer: Viewer, origin: Matrix4,
  assetId: string, label: string, east: number,
  entityMap: Map<string, Entity>, markerMap: Map<string, Entity>
) {
  addBayFoundation(viewer, origin, assetId, east, 10, 130, 38);
  // HV side: connection from 400 kV bus down to ICT
  addBusTap(viewer, origin, assetId, east, 52, 22, east, 140, 22, "400kV", 2.8);
  addBusTap(viewer, origin, assetId, east, 52, 22, east, 160, 22, "400kV", 2.8);
  addBayConductorDrops(viewer, origin, assetId, east, [68, 52, 38, 24], 22, "400kV");
  addDisconnector(viewer, origin, assetId, east, 68, "400kV", false);
  addInstrumentTransformer(viewer, origin, assetId, east, 52, "ct", "400kV");
  addCircuitBreaker(viewer, origin, assetId, east, 38, "400kV");
  addSurgeArresters(viewer, origin, assetId, east, 24, "400kV");
  addThreePhaseRun(viewer, origin, assetId, east, 22, 14, east, 4, 14, "400kV", 2.8);

  // ICT transformer body
  addICTTransformer(viewer, origin, assetId, east, -10, label, entityMap, markerMap);

  // LV side (220 kV)
  addThreePhaseRun(viewer, origin, assetId, east, -20, 11, east, -54, 14, "220kV", 2.4);
  add220IncomerPanel(viewer, origin, assetId, east, -56);
  addBusTap(viewer, origin, assetId, east, -56, 14, east, -80, 14, "220kV", 2.4);
}

function addICTTransformer(
  viewer: Viewer, origin: Matrix4,
  assetId: string, east: number, north: number, label: string,
  entityMap: Map<string, Entity>, markerMap: Map<string, Entity>
) {
  addGroundShadow(viewer, origin, east + 1.5, north - 1.5, 88, 72, 0.36);
  addBox(viewer, origin, undefined, assetId, east, north, 0.8, { x: 82, y: 66, z: 1.6, color: CONCRETE });
  addBox(viewer, origin, undefined, assetId, east, north, 0.3, {
    x: 90, y: 74, z: 0.6, color: Color.fromCssColorString("#343c40")
  });

  const body = addBox(viewer, origin, assetId, assetId, east, north, 7.2, {
    x: 44, y: 26, z: 14.4, color: TRANSFORMER
  });

  // Bund wall
  addICTBundWall(viewer, origin, assetId, east, north);

  // Radiators (8 per side)
  [-20, -14, -8, -2, 4, 10, 16, 22].forEach((offset) => {
    addBox(viewer, origin, undefined, assetId, east + offset, north + 15, 7.2, { x: 2.4, y: 4.2, z: 11.2, color: RADIATOR });
    addBox(viewer, origin, undefined, assetId, east + offset, north - 15, 7.2, { x: 2.4, y: 4.2, z: 11.2, color: RADIATOR });
  });

  // HV bushings (400 kV – very tall)
  addCylinder(viewer, origin, undefined, assetId, east, north - 13, 16.8, 32, 2.4, TRANSFORMER, true);
  phaseOffsets("400kV").forEach((offset) => {
    addInsulatorStack(viewer, origin, assetId, east + offset, north + 13.5, 14.4, 8, 0.52);
  });

  // LV bushings (220 kV)
  phaseOffsets("220kV").forEach((offset) => {
    addInsulatorStack(viewer, origin, assetId, east + offset, north - 13.5, 12, 5.8, 0.38);
  });

  // OLTC cabinet
  addBox(viewer, origin, undefined, assetId, east + (assetId === "ict-1" ? 30 : -30), north, 6.4, {
    x: 1.8, y: 42, z: 12.8, color: Color.fromCssColorString("#bfc7cb").withAlpha(0.78)
  });
  addBox(viewer, origin, undefined, assetId, east + 25, north, 5.8, { x: 4.8, y: 14, z: 11.6, color: DARK_STEEL });

  entityMap.set(assetId, body);
  markerMap.set(assetId, addMarker(viewer, origin, assetId, east + 28, north + 16, 20));
  addLabel(viewer, origin, assetId, label, east, north + 32, 20);
}

function addICTBundWall(viewer: Viewer, origin: Matrix4, assetId: string, east: number, north: number) {
  const wall = Color.fromCssColorString("#505a5d").withAlpha(0.92);
  addBox(viewer, origin, undefined, assetId, east, north + 34, 1.2, { x: 90, y: 1.6, z: 2.4, color: wall });
  addBox(viewer, origin, undefined, assetId, east, north - 34, 1.2, { x: 90, y: 1.6, z: 2.4, color: wall });
  addBox(viewer, origin, undefined, assetId, east - 45, north, 1.2, { x: 1.6, y: 68, z: 2.4, color: wall });
  addBox(viewer, origin, undefined, assetId, east + 45, north, 1.2, { x: 1.6, y: 68, z: 2.4, color: wall });
}

function add220IncomerPanel(viewer: Viewer, origin: Matrix4, assetId: string, east: number, north: number) {
  [-4.8, 0, 4.8].forEach((offset) => {
    addBox(viewer, origin, undefined, assetId, east + offset, north, 3.2, { x: 2.8, y: 5, z: 6.4, color: DARK_STEEL });
    addInsulatorStack(viewer, origin, assetId, east + offset, north + 5.5, 5, 3.8, 0.2);
  });
}

// ─── Fire protection system ───────────────────────────────────────────────────

function addFireProtection(
  viewer: Viewer, origin: Matrix4,
  entityMap: Map<string, Entity>, markerMap: Map<string, Entity>
) {
  const assetId = "fire-detection";
  addGroundShadow(viewer, origin, 0, -10, 5.6, 56, 0.28);
  const firewall = addBox(viewer, origin, assetId, assetId, 0, 0, 5.5, {
    x: 2.2, y: 56, z: 11, color: Color.fromCssColorString("#b3b7b9").withAlpha(0.94)
  });

  [-80, 80].forEach((ex) => {
    addLine(viewer, origin, assetId, [
      { east: ex - 32, north: -36, up: 1.2 },
      { east: ex + 32, north: -36, up: 1.2 },
      { east: ex + 32, north:  16, up: 1.2 },
      { east: ex - 32, north:  16, up: 1.2 },
      { east: ex - 32, north: -36, up: 1.2 }
    ], RED.withAlpha(0.64), 1.2);
    [-24, 24].forEach((offset) => {
      addCylinder(viewer, origin, undefined, assetId, ex + offset, 16, 1.8, 3.6, 0.14, RED.withAlpha(0.8));
      addBox(viewer, origin, undefined, assetId, ex + offset, 16, 3.7, { x: 2.2, y: 1, z: 0.6, color: RED.withAlpha(0.84) });
    });
  });

  entityMap.set(assetId, firewall);
  markerMap.set(assetId, addMarker(viewer, origin, assetId, 6, 18, 14));
  addLabel(viewer, origin, assetId, "ICT Fire Protection", 0, 22, 14);
}

// ─── 220 kV bus coupler ───────────────────────────────────────────────────────

function add220BusCoupler(
  viewer: Viewer, origin: Matrix4,
  entityMap: Map<string, Entity>, markerMap: Map<string, Entity>
) {
  const assetId = "bay-220-bus-coupler";
  addBayFoundation(viewer, origin, assetId, 0, -80, 48, 22);
  addBusSectionJumper(viewer, origin, assetId, -5, 5, -80, 14, "220kV", 2.2);
  addBox(viewer, origin, undefined, assetId, 0, -90, 3, { x: 9, y: 6, z: 6, color: DARK_STEEL });
  addDisconnector(viewer, origin, assetId, 0, -82, "220kV", false);
  const core = addBox(viewer, origin, assetId, assetId, 0, -90, 0.45, { x: 22, y: 48, z: 0.9, color: CONCRETE });
  entityMap.set(assetId, core);
  markerMap.set(assetId, addMarker(viewer, origin, assetId, 13, -90, 17));
  addLabel(viewer, origin, assetId, "220 kV Bus Coupler", 0, -106, 16);
}

// ─── 220 kV feeder bay ────────────────────────────────────────────────────────

function add220FeederBay(
  viewer: Viewer, origin: Matrix4,
  assetId: string, label: string, east: number,
  entityMap: Map<string, Entity>, markerMap: Map<string, Entity>
) {
  addBayFoundation(viewer, origin, assetId, east, -148, 90, 18);
  addBusTap(viewer, origin, assetId, east, -126, 8, east, -80, 14, "220kV", 2.4);
  addBayConductorDrops(viewer, origin, assetId, east, [-126, -138, -152], 8, "220kV");
  addThreePhaseRun(viewer, origin, assetId, east, -126, 8, east, -184, 8, "220kV", 2.4);
  addBox(viewer, origin, undefined, assetId, east, -126, 3, { x: 10, y: 6.5, z: 6, color: DARK_STEEL });
  addInstrumentTransformer(viewer, origin, assetId, east, -138, "ct", "220kV");
  addSurgeArresters(viewer, origin, assetId, east, -152, "220kV");
  addGantry(viewer, origin, east, -192, 14, 18, assetId);

  const core = addBox(viewer, origin, assetId, assetId, east, -154, 0.45, { x: 18, y: 90, z: 0.9, color: CONCRETE });
  entityMap.set(assetId, core);
  markerMap.set(assetId, addMarker(viewer, origin, assetId, east + 9, -134, 16.5));
  addLabel(viewer, origin, assetId, label, east, -200, 15);
}

// ─── Reactive compensation ────────────────────────────────────────────────────

function addLineReactor400(
  viewer: Viewer, origin: Matrix4,
  entityMap: Map<string, Entity>, markerMap: Map<string, Entity>
) {
  const assetId = "reactor-400-1";
  addBayFoundation(viewer, origin, assetId, 210, 80, 78, 32);
  addGroundShadow(viewer, origin, 211, 78, 36, 54, 0.3);
  addBox(viewer, origin, undefined, assetId, 210, 80, 0.8, { x: 30, y: 46, z: 1.6, color: CONCRETE });
  const body = addBox(viewer, origin, assetId, assetId, 210, 80, 6.4, { x: 26, y: 36, z: 12.8, color: TRANSFORMER });
  addBundWall400(viewer, origin, assetId, 210, 80);
  [-10, 0, 10].forEach((offset) => {
    addBox(viewer, origin, undefined, assetId, 210 + offset, 80 + 20, 6.4, { x: 2, y: 3.4, z: 9.6, color: RADIATOR });
    addBox(viewer, origin, undefined, assetId, 210 + offset, 80 - 20, 6.4, { x: 2, y: 3.4, z: 9.6, color: RADIATOR });
  });
  phaseOffsets("400kV").forEach((offset) => {
    addInsulatorStack(viewer, origin, assetId, 210 + offset, 80 + 14, 12.8, 7.5, 0.5);
  });
  addBusTap(viewer, origin, assetId, 210, 72, 22, 210, 140, 22, "400kV", 2.5);
  entityMap.set(assetId, body);
  markerMap.set(assetId, addMarker(viewer, origin, assetId, 228, 84, 18));
  addLabel(viewer, origin, assetId, "400 kV Line Reactor", 210, 114, 19);
}

function addBundWall400(viewer: Viewer, origin: Matrix4, assetId: string, east: number, north: number) {
  const wall = Color.fromCssColorString("#505a5d").withAlpha(0.92);
  addBox(viewer, origin, undefined, assetId, east, north + 26, 1.2, { x: 64, y: 1.6, z: 2.4, color: wall });
  addBox(viewer, origin, undefined, assetId, east, north - 26, 1.2, { x: 64, y: 1.6, z: 2.4, color: wall });
  addBox(viewer, origin, undefined, assetId, east - 32, north, 1.2, { x: 1.6, y: 52, z: 2.4, color: wall });
  addBox(viewer, origin, undefined, assetId, east + 32, north, 1.2, { x: 1.6, y: 52, z: 2.4, color: wall });
}

function addCapacitorBank220(
  viewer: Viewer, origin: Matrix4,
  entityMap: Map<string, Entity>, markerMap: Map<string, Entity>
) {
  const assetId = "cap-bank-220-1";
  addBayFoundation(viewer, origin, assetId, 210, -80, 55, 34);
  addBusTap(viewer, origin, assetId, 210, -80, 8, 192, -80, 14, "220kV", 2.4);
  [-12, -5, 5, 12].forEach((eastOffset) => {
    [-8, 8].forEach((northOffset) => {
      addCylinder(viewer, origin, undefined, assetId, 210 + eastOffset, -80 + northOffset, 2.8, 5.6, 0.7,
        Color.fromCssColorString("#bac8cd"));
      addInsulatorStack(viewer, origin, assetId, 210 + eastOffset, -80 + northOffset, 5.8, 2.8, 0.2);
    });
  });
  addBox(viewer, origin, undefined, assetId, 210, -62, 3, { x: 22, y: 4.2, z: 6, color: DARK_STEEL });
  const core = addBox(viewer, origin, assetId, assetId, 210, -80, 0.45, { x: 34, y: 55, z: 0.9, color: CONCRETE });
  entityMap.set(assetId, core);
  markerMap.set(assetId, addMarker(viewer, origin, assetId, 232, -73, 13));
  addLabel(viewer, origin, assetId, "220 kV Capacitor Bank", 210, -48, 14);
}

// ─── Control building & auxiliaries ──────────────────────────────────────────

function addControlBuilding(
  viewer: Viewer, origin: Matrix4,
  entityMap: Map<string, Entity>, markerMap: Map<string, Entity>
) {
  const assetId = "control-building";
  addGroundShadow(viewer, origin, -225, -30, 50, 34, 0.3);
  const body = addBox(viewer, origin, assetId, assetId, -225, -30, 5.2, { x: 46, y: 30, z: 10.4, color: BUILDING });
  addBox(viewer, origin, undefined, assetId, -225, -30, 10.8, { x: 50, y: 34, z: 1.2, color: Color.fromCssColorString("#88949b") });
  [-238, -225, -212].forEach((ex) =>
    addBox(viewer, origin, undefined, assetId, ex, -16.2, 5.6, { x: 7, y: 0.6, z: 3.6, color: GLASS.withAlpha(0.96) })
  );
  addBox(viewer, origin, "battery-system", "battery-system", -240, -62, 1.8, { x: 14, y: 7, z: 3.6, color: DARK_STEEL });
  addCableTray(viewer, origin, assetId);
  entityMap.set(assetId, body);
  markerMap.set(assetId, addMarker(viewer, origin, assetId, -202, -18, 13.5));
  addLabel(viewer, origin, assetId, "Control & Relay Building", -225, -10, 14);
}

function addCableTray(viewer: Viewer, origin: Matrix4, assetId: string) {
  addLine(viewer, origin, assetId, [
    { east: -202, north: -30, up: 1.2 },
    { east: -176, north: -22, up: 1.2 },
    { east:  -72, north: -22, up: 1.2 },
    { east:  -18, north:  20, up: 1.2 },
    { east:  108, north:  46, up: 1.2 }
  ], Color.fromCssColorString("#a4adb2").withAlpha(0.54), 2.5);
  addLine(viewer, origin, assetId, [
    { east: -200, north: -32, up: 1.2 },
    { east: -173, north: -24, up: 1.2 },
    { east:  -70, north: -24, up: 1.2 },
    { east:  -16, north:  18, up: 1.2 },
    { east:  110, north:  44, up: 1.2 }
  ], Color.fromCssColorString("#606a70").withAlpha(0.7), 1.5);
}

function addLightingMasts(viewer: Viewer, origin: Matrix4) {
  [
    [-220, 220], [220, 220], [-220, -200], [220, -200],
    [0, 224], [0, -212], [-200, 0], [200, 0]
  ].forEach(([east, north]) => {
    addCylinder(viewer, origin, undefined, undefined, east, north, 12, 24, 0.16, STEEL);
    addBox(viewer, origin, undefined, undefined, east, north, 24.6, { x: 4.5, y: 1.6, z: 1, color: Color.fromCssColorString("#f2f4d8") });
    addBox(viewer, origin, undefined, undefined, east + 2, north, 24.6, { x: 1, y: 3.2, z: 1, color: Color.fromCssColorString("#f2f4d8") });
  });
}

// ─── Shared equipment primitives ──────────────────────────────────────────────

function addBayFoundation(
  viewer: Viewer, origin: Matrix4, assetId: string,
  east: number, north: number, length: number, width: number
) {
  addGroundShadow(viewer, origin, east + 1, north - 0.8, width + 3.6, length + 3.6, 0.28);
  addBox(viewer, origin, undefined, assetId, east, north, 0.2, {
    x: width, y: length, z: 0.4, color: Color.fromCssColorString("#747d81").withAlpha(0.92)
  });
}

function addGroundShadow(
  viewer: Viewer, origin: Matrix4,
  east: number, north: number, width: number, length: number, alpha: number
) {
  addBox(viewer, origin, undefined, undefined, east, north, 0.05, {
    x: width, y: length, z: 0.04, color: CONTACT_SHADOW.withAlpha(alpha)
  });
}

function addGantry(
  viewer: Viewer, origin: Matrix4,
  east: number, north: number, height: number, span: number, assetId?: string
) {
  [-span / 2, span / 2].forEach((offset) => {
    addBox(viewer, origin, undefined, assetId, east + offset, north, 0.2, { x: 2.8, y: 2.8, z: 0.4, color: CONCRETE.withAlpha(0.94) });
    addCylinder(viewer, origin, undefined, assetId, east + offset, north, height / 2, height, 0.22, STEEL);
    addCylinder(viewer, origin, undefined, assetId, east + offset + (offset < 0 ? 1.1 : -1.1), north, height / 2, height, 0.13, STEEL.withAlpha(0.86));
    addLine(viewer, origin, assetId, [
      { east: east + offset, north, up: height * 0.72 },
      { east, north, up: height }
    ], STEEL.withAlpha(0.7), 1.2);
    addLine(viewer, origin, assetId, [
      { east: east + offset, north, up: height * 0.18 },
      { east: east + offset + (offset < 0 ? 1.1 : -1.1), north, up: height * 0.42 },
      { east: east + offset, north, up: height * 0.64 },
      { east: east + offset + (offset < 0 ? 1.1 : -1.1), north, up: height * 0.84 }
    ], STEEL.withAlpha(0.54), 1);
  });
  addLine(viewer, origin, assetId, [
    { east: east - span / 2, north, up: height },
    { east: east + span / 2, north, up: height }
  ], STEEL.withAlpha(0.82), 4);
  addLine(viewer, origin, assetId, [
    { east: east - span / 2, north, up: height - 1.8 },
    { east: east + span / 2, north, up: height - 1.8 }
  ], STEEL.withAlpha(0.62), 1.8);
}

function addLineTrap(viewer: Viewer, origin: Matrix4, assetId: string, east: number, north: number, voltage: VoltageLevel) {
  phaseOffsets(voltage).forEach((offset) => {
    addCylinder(viewer, origin, undefined, assetId, east + offset, north, 11.5, 4.5,
      voltage === "400kV" ? 0.68 : 0.5, Color.fromCssColorString("#c8d0d3"));
    addInsulatorStack(viewer, origin, assetId, east + offset, north, 6.2, 4.8,
      voltage === "400kV" ? 0.28 : 0.2);
  });
}

function addInstrumentTransformer(
  viewer: Viewer, origin: Matrix4,
  assetId: string, east: number, north: number, kind: "ct" | "cvt", voltage: VoltageLevel
) {
  const radius = voltage === "400kV" ? 0.42 : voltage === "220kV" ? 0.32 : 0.27;
  const baseH = voltage === "400kV" ? 1.7 : 1.3;
  phaseOffsets(voltage).forEach((offset) => {
    addBox(viewer, origin, undefined, assetId, east + offset, north, baseH / 2, { x: 2, y: 2, z: baseH, color: DARK_STEEL });
    addInsulatorStack(viewer, origin, assetId, east + offset, north, baseH,
      kind === "cvt"
        ? (voltage === "400kV" ? 7.5 : 5.2)
        : (voltage === "400kV" ? 5.5 : 3.8),
      radius
    );
    addCylinder(viewer, origin, undefined, assetId, east + offset, north,
      kind === "cvt"
        ? (voltage === "400kV" ? 11.2 : 7.8)
        : (voltage === "400kV" ? 8.4 : 6.2),
      2,
      voltage === "400kV" ? 0.72 : 0.52,
      Color.fromCssColorString("#cfd6d9")
    );
  });
}

function addSurgeArresters(
  viewer: Viewer, origin: Matrix4,
  assetId: string, east: number, north: number, voltage: VoltageLevel
) {
  const count = voltage === "400kV" ? 13 : voltage === "220kV" ? 9 : 5;
  const radius = voltage === "400kV" ? 0.3 : voltage === "220kV" ? 0.24 : 0.18;
  phaseOffsets(voltage).forEach((offset) => {
    addBox(viewer, origin, undefined, assetId, east + offset, north, 0.9, { x: 1.8, y: 1.8, z: 1.8, color: DARK_STEEL });
    for (let i = 0; i < count; i++) {
      addCylinder(viewer, origin, undefined, assetId, east + offset, north, 2 + i * 0.56, 0.24, radius,
        Color.fromCssColorString("#a7554a"));
    }
  });
}

function addCircuitBreaker(
  viewer: Viewer, origin: Matrix4,
  assetId: string, east: number, north: number, voltage: VoltageLevel
) {
  const height = voltage === "400kV" ? 8.5 : voltage === "220kV" ? 6 : 5.4;
  const baseH = voltage === "400kV" ? 1.6 : 1.3;
  phaseOffsets(voltage).forEach((offset) => {
    addBox(viewer, origin, undefined, assetId, east + offset, north, baseH / 2, { x: 2.4, y: 2.2, z: baseH, color: DARK_STEEL });
    addInsulatorStack(viewer, origin, assetId, east + offset, north - 1.5, baseH, height,
      voltage === "400kV" ? 0.34 : 0.26);
    addInsulatorStack(viewer, origin, assetId, east + offset, north + 1.5, baseH, height,
      voltage === "400kV" ? 0.34 : 0.26);
    addCylinder(viewer, origin, undefined, assetId, east + offset, north,
      voltage === "400kV" ? 11.8 : 9.5,
      voltage === "400kV" ? 5 : 3.8,
      voltage === "400kV" ? 0.54 : 0.42,
      Color.fromCssColorString("#d1d8db"), true
    );
  });
  addBox(viewer, origin, undefined, assetId,
    east + (voltage === "400kV" ? 10 : 8), north, baseH + 1,
    { x: 3.4, y: 5.5, z: 4.2, color: Color.fromCssColorString("#d6dde1") }
  );
}

function addDisconnector(
  viewer: Viewer, origin: Matrix4,
  assetId: string, east: number, north: number, voltage: VoltageLevel, withEarthSwitch: boolean
) {
  const baseH = voltage === "400kV" ? 5 : voltage === "220kV" ? 3.8 : 3.2;
  const stackH = voltage === "400kV" ? 6.5 : voltage === "220kV" ? 5 : 4.2;
  const sr = voltage === "400kV" ? 0.3 : voltage === "220kV" ? 0.22 : 0.15;
  phaseOffsets(voltage).forEach((offset) => {
    addInsulatorStack(viewer, origin, assetId, east + offset - 1.6, north, 0, baseH, sr);
    addInsulatorStack(viewer, origin, assetId, east + offset + 1.6, north, 0, baseH, sr);
    addLine(viewer, origin, assetId, [
      { east: east + offset - 1.8, north, up: baseH + stackH - 1 },
      { east: east + offset + 1.9, north: north + 1, up: baseH + stackH }
    ], Color.fromCssColorString("#edf5f8").withAlpha(0.96), 2.4);
    if (withEarthSwitch) {
      addLine(viewer, origin, assetId, [
        { east: east + offset + 1.9, north: north + 1, up: baseH + stackH },
        { east: east + offset + 2.8, north: north + 3.2, up: 1 }
      ], STEEL.withAlpha(0.8), 1.2);
    }
  });
}

function addBayConductorDrops(
  viewer: Viewer, origin: Matrix4,
  assetId: string, east: number, equipmentNorths: number[], conductorUp: number, voltage: VoltageLevel
) {
  const color = VOLTAGE_COLOR[voltage].withAlpha(0.82);
  equipmentNorths.forEach((north) => {
    phaseOffsets(voltage).forEach((offset) => {
      const terminalUp = equipmentTerminalUp(voltage);
      addTerminalStub(viewer, origin, assetId, east + offset, north, terminalUp, voltage);
      addLine(viewer, origin, assetId, [
        { east: east + offset, north, up: conductorUp },
        { east: east + offset, north, up: terminalUp }
      ], color, voltage === "400kV" ? 1.8 : 1.5);
    });
  });
}

function equipmentTerminalUp(voltage: VoltageLevel) {
  if (voltage === "400kV") return 12.5;
  if (voltage === "220kV") return 9;
  return voltage === "33kV" ? 5.7 : 8.4;
}

function addBusTap(
  viewer: Viewer, origin: Matrix4,
  assetId: string,
  equipmentEast: number, equipmentNorth: number, equipmentUp: number,
  busEast: number, busNorth: number, busUp: number,
  voltage: VoltageLevel, width: number
) {
  const eqOffsets = phaseOffsets(voltage);
  const busOffs = busPhaseOffsets(voltage);
  const color = conductorColor(voltage);

  eqOffsets.forEach((eqOffset, index) => {
    const from = { east: equipmentEast + eqOffset, north: equipmentNorth, up: equipmentUp };
    const to   = { east: busEast + eqOffset, north: busNorth + busOffs[index], up: busUp };
    const jumperUp = Math.max(from.up, to.up) + (voltage === "400kV" ? 1.1 : 0.7);

    addTerminalStub(viewer, origin, assetId, from.east, from.north, from.up, voltage);
    addTerminalStub(viewer, origin, assetId, to.east, to.north, to.up, voltage);
    addLine(viewer, origin, assetId, [
      from,
      { east: from.east, north: from.north, up: jumperUp },
      { east: from.east, north: to.north,   up: jumperUp },
      { east: to.east,   north: to.north,   up: jumperUp },
      to
    ], color.withAlpha(index === 1 ? 0.95 : 0.72), width);
  });
}

function addBusSectionJumper(
  viewer: Viewer, origin: Matrix4,
  assetId: string, x1: number, x2: number, north: number, up: number, voltage: VoltageLevel, width: number
) {
  busPhaseOffsets(voltage).forEach((offset, index) => {
    addTerminalStub(viewer, origin, assetId, x1, north + offset, up, voltage);
    addTerminalStub(viewer, origin, assetId, x2, north + offset, up, voltage);
    addLine(viewer, origin, assetId, [
      { east: x1, north: north + offset, up },
      { east: x2, north: north + offset, up }
    ], conductorColor(voltage).withAlpha(index === 1 ? 0.95 : 0.72), width);
  });
}

function addTerminalStub(
  viewer: Viewer, origin: Matrix4,
  assetId: string, east: number, north: number, up: number, voltage: VoltageLevel
) {
  const r = voltage === "400kV" ? 0.28 : voltage === "220kV" ? 0.22 : 0.18;
  addCylinder(viewer, origin, undefined, assetId, east, north, up - 0.2, 0.4, r, STEEL);
  viewer.entities.add({
    properties: { assetId },
    position: toWorld(origin, east, north, up),
    ellipsoid: {
      radii: new Cartesian3(r * 1.5, r * 1.5, r * 1.5),
      material: conductorColor(voltage).withAlpha(0.92)
    }
  });
}

function addThreePhaseRun(
  viewer: Viewer, origin: Matrix4,
  assetId: string,
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  voltage: VoltageLevel, width: number
) {
  const offsets = phaseOffsets(voltage);
  offsets.forEach((offset, index) => {
    const mostly = Math.abs(y2 - y1) >= Math.abs(x2 - x1);
    const from = mostly ? { east: x1 + offset, north: y1, up: z1 } : { east: x1, north: y1 + offset, up: z1 };
    const to   = mostly ? { east: x2 + offset, north: y2, up: z2 } : { east: x2, north: y2 + offset, up: z2 };
    const mid  = {
      east:  (from.east  + to.east)  / 2,
      north: (from.north + to.north) / 2,
      up:    Math.min(from.up, to.up) - (voltage === "400kV" ? 0.7 : 0.45)
    };
    addLine(viewer, origin, assetId, [from, mid, to], conductorColor(voltage).withAlpha(index === 1 ? 0.95 : 0.72), width);
  });
}

function addInsulatorStack(
  viewer: Viewer, origin: Matrix4,
  assetId: string | undefined,
  east: number, north: number, up: number, height: number, radius: number
) {
  addCylinder(viewer, origin, undefined, assetId, east, north, up + height / 2, height, radius * 0.28, STEEL.withAlpha(0.76));
  for (let i = 0; i < Math.max(3, Math.round(height / 0.54)); i++) {
    addCylinder(viewer, origin, undefined, assetId, east, north, up + i * 0.52, 0.1, radius, PORCELAIN.withAlpha(0.98));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function insulatorHeight(voltage: VoltageLevel) {
  if (voltage === "400kV") return 8;
  if (voltage === "220kV") return 5.5;
  return voltage === "33kV" ? 4.2 : 6.2;
}

function insulatorRadius(voltage: VoltageLevel) {
  if (voltage === "400kV") return 0.46;
  if (voltage === "220kV") return 0.34;
  return voltage === "33kV" ? 0.18 : 0.27;
}

function conductorColor(voltage: VoltageLevel) {
  if (voltage === "400kV") return ROUTE_HV;
  if (voltage === "220kV") return ROUTE_LV;
  return COPPER;
}

function phaseOffsets(voltage: VoltageLevel) {
  if (voltage === "400kV") return [-8, 0, 8];
  if (voltage === "220kV") return [-5, 0, 5];
  return voltage === "33kV" ? [-1.9, 0, 1.9] : [-3.4, 0, 3.4];
}

function busPhaseOffsets(voltage: VoltageLevel) {
  if (voltage === "400kV") return [-6.5, 0, 6.5];
  if (voltage === "220kV") return [-4, 0, 4];
  return voltage === "33kV" ? [-1.5, 0, 1.5] : [-2.6, 0, 2.6];
}

// ─── Cesium entity primitives ─────────────────────────────────────────────────

function addMarker(viewer: Viewer, origin: Matrix4, assetId: string, east: number, north: number, up: number) {
  return viewer.entities.add({
    id: `${assetId}-status`,
    properties: { assetId },
    position: toWorld(origin, east, north, up),
    point: {
      pixelSize: 9,
      color: GREEN,
      outlineColor: Color.WHITE.withAlpha(0.86),
      outlineWidth: 1,
      scaleByDistance: new NearFarScalar(80, 1.15, 900, 0.38)
    }
  });
}

function addLabel(
  viewer: Viewer, origin: Matrix4, assetId: string | undefined,
  text: string, east: number, north: number, up: number
) {
  viewer.entities.add({
    id: `${assetId ?? text}-label`,
    properties: assetId ? { assetId } : undefined,
    position: toWorld(origin, east, north, up),
    label: {
      text,
      font: "600 12px Inter, sans-serif",
      fillColor: Color.WHITE,
      showBackground: true,
      backgroundColor: Color.fromCssColorString("#07131f").withAlpha(0.78),
      pixelOffset: new Cartesian2(0, -12),
      scaleByDistance: new NearFarScalar(100, 1, 800, 0.2),
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.BOTTOM,
      horizontalOrigin: HorizontalOrigin.CENTER
    }
  });
}

function addZoneLabel(
  viewer: Viewer, origin: Matrix4,
  text: string, east: number, north: number, up: number, voltage: VoltageLevel
) {
  viewer.entities.add({
    id: `${text}-label`,
    position: toWorld(origin, east, north, up),
    label: {
      text,
      font: "700 14px Inter, sans-serif",
      fillColor: Color.WHITE,
      showBackground: true,
      backgroundColor: VOLTAGE_COLOR[voltage].withAlpha(0.28),
      pixelOffset: new Cartesian2(0, -8),
      scaleByDistance: new NearFarScalar(110, 1, 900, 0.36),
      style: LabelStyle.FILL_AND_OUTLINE
    }
  });
}

function addPolygon(viewer: Viewer, origin: Matrix4, points: LocalPoint[], color: Color) {
  return viewer.entities.add({
    polygon: {
      hierarchy: new PolygonHierarchy(points.map((p) => toWorld(origin, p.east, p.north, p.up))),
      perPositionHeight: true,
      material: color,
      outline: false
    }
  });
}

function addBox(
  viewer: Viewer, origin: Matrix4,
  id: string | undefined, assetId: string | undefined,
  east: number, north: number, up: number,
  options: { x: number; y: number; z: number; color: Color; headingDeg?: number }
) {
  const position = toWorld(origin, east, north, up);
  return viewer.entities.add({
    id,
    properties: assetId ? { assetId } : undefined,
    position,
    orientation: Transforms.headingPitchRollQuaternion(
      position,
      new HeadingPitchRoll(CesiumMath.toRadians(options.headingDeg ?? 0), 0, 0)
    ),
    box: { dimensions: new Cartesian3(options.x, options.y, options.z), material: options.color, outline: false }
  });
}

function addCylinder(
  viewer: Viewer, origin: Matrix4,
  id: string | undefined, assetId: string | undefined,
  east: number, north: number, up: number,
  length: number, radius: number, color: Color, horizontal = false
) {
  const position = toWorld(origin, east, north, up);
  return viewer.entities.add({
    id,
    properties: assetId ? { assetId } : undefined,
    position,
    orientation: horizontal
      ? Transforms.headingPitchRollQuaternion(
          position,
          new HeadingPitchRoll(CesiumMath.toRadians(90), CesiumMath.toRadians(90), 0)
        )
      : undefined,
    cylinder: { length, topRadius: radius, bottomRadius: radius, material: color }
  });
}

function addLine(
  viewer: Viewer, origin: Matrix4,
  assetId: string | undefined, points: LocalPoint[], color: Color, width: number, id?: string
) {
  const electricalLine = Boolean(assetId && isElectricalConductorColor(color));
  return viewer.entities.add({
    id,
    properties: assetId
      ? {
          assetId,
          baseWidth: width,
          baseRed: color.red,
          baseGreen: color.green,
          baseBlue: color.blue,
          baseAlpha: color.alpha,
          electricalLine
        }
      : undefined,
    position: toWorld(origin, average(points, "east"), average(points, "north"), average(points, "up")),
    polyline: {
      positions: points.map((p) => toWorld(origin, p.east, p.north, p.up)),
      width,
      material: color
    }
  });
}

function isElectricalConductorColor(color: Color) {
  return [
    ROUTE_HV, ROUTE_LV, COPPER,
    VOLTAGE_COLOR["400kV"], VOLTAGE_COLOR["220kV"],
    VOLTAGE_COLOR["132kV"], VOLTAGE_COLOR["33kV"]
  ].some((candidate) => colorDistance(color, candidate) < 0.1);
}

function colorDistance(a: Color, b: Color) {
  return Math.abs(a.red - b.red) + Math.abs(a.green - b.green) + Math.abs(a.blue - b.blue);
}

// ─── Selection / marker update ────────────────────────────────────────────────

function applySelection(entity: Entity, selected: boolean) {
  if (entity.box) {
    entity.box.material = new ColorMaterialProperty(materialColor(entity).withAlpha(selected ? 1 : 0.98));
  }
  if (entity.polyline) {
    entity.polyline.width = new ConstantProperty(selected ? 6 : entity.id?.toString().includes("bus") ? 3.2 : 2);
  }
}

function applyRouteSelection(entity: Entity, selectedAssetId: string, currentTime: JulianDateLike) {
  if (!entity.polyline || !entity.properties) return;
  const assetId = entity.properties.assetId?.getValue(currentTime) as string | undefined;
  const electricalLine = entity.properties.electricalLine?.getValue(currentTime) as boolean | undefined;
  if (!assetId || !electricalLine) return;

  const baseWidth = (entity.properties.baseWidth?.getValue(currentTime) as number | undefined) ?? 1.8;
  const baseColor = new Color(
    (entity.properties.baseRed?.getValue(currentTime)   as number | undefined) ?? 1,
    (entity.properties.baseGreen?.getValue(currentTime) as number | undefined) ?? 1,
    (entity.properties.baseBlue?.getValue(currentTime)  as number | undefined) ?? 1,
    (entity.properties.baseAlpha?.getValue(currentTime) as number | undefined) ?? 0.86
  );
  const selected = assetId === selectedAssetId;
  entity.polyline.width = new ConstantProperty(selected ? Math.max(4.5, baseWidth * 2.35) : baseWidth);
  entity.polyline.material = new ColorMaterialProperty(
    selected ? brightenColor(baseColor, 0.34).withAlpha(1) : baseColor
  );
}

type JulianDateLike = Parameters<NonNullable<Entity["properties"]>["getValue"]>[0];

function brightenColor(color: Color, amount: number) {
  return new Color(
    Math.min(1, color.red   + amount),
    Math.min(1, color.green + amount),
    Math.min(1, color.blue  + amount),
    color.alpha
  );
}

function materialColor(entity: Entity) {
  const id = entity.id?.toString() ?? "";
  if (id.includes("ict")) return TRANSFORMER;
  if (id.includes("reactor")) return TRANSFORMER;
  if (id.includes("control")) return BUILDING;
  return CONCRETE;
}

function applyMarker(marker: Entity, sample: TelemetrySample | undefined, selected: boolean) {
  if (!marker.point) return;
  marker.point.color = new ConstantProperty(sample ? colorForSample(sample) : GREEN);
  marker.point.pixelSize = new ConstantProperty(selected ? 16 : 9);
  marker.point.outlineWidth = new ConstantProperty(selected ? 3 : 1);
}

function colorForSample(sample: TelemetrySample) {
  if (sample.alarmSeverity === "critical" || sample.healthStatus === "critical") return RED;
  if (sample.interlockState === "bypassed" || sample.isolatorState === "intermediate") return RED;
  if (sample.interlockState === "blocked" || sample.isolatorState !== "closed" || sample.breakerState !== "closed") return AMBER;
  if (sample.alarmSeverity === "medium" || sample.healthStatus === "warning") return AMBER;
  if (sample.alarmSeverity === "low" || sample.healthStatus === "watch") return Color.fromCssColorString("#f3d15b");
  return GREEN;
}

// ─── Math utilities ───────────────────────────────────────────────────────────

function average(points: LocalPoint[], key: keyof LocalPoint) {
  return points.reduce((sum, p) => sum + p[key], 0) / points.length;
}

function toWorld(origin: Matrix4, east: number, north: number, up: number) {
  return Matrix4.multiplyByPoint(origin, new Cartesian3(east, north, up), new Cartesian3());
}

function createSatelliteBaseLayer() {
  return ImageryLayer.fromProviderAsync(
    ArcGisMapServerImageryProvider.fromUrl(ESRI_WORLD_IMAGERY_URL, { enablePickFeatures: false }),
    { brightness: 0.94, contrast: 1.08, saturation: 0.9, maximumAnisotropy: 16 }
  );
}

function focusSubstation(viewer: Viewer, origin: Matrix4) {
  viewer.camera.flyTo({
    destination: toWorld(origin, -10, -380, 220),
    orientation: {
      heading: CesiumMath.toRadians(4),
      pitch: CesiumMath.toRadians(-28),
      roll: 0
    },
    duration: 0
  });
}
