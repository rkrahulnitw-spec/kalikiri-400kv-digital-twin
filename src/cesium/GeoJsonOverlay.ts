import {
  Cartesian2,
  Cartesian3,
  Color,
  HeadingPitchRoll,
  HorizontalOrigin,
  LabelStyle,
  NearFarScalar,
  PolygonHierarchy,
  Transforms,
  VerticalOrigin,
  Viewer
} from "cesium";

import boomJson from "../data/geojson/Boom.json";
import busJson from "../data/geojson/Bus.json";
import cbJson from "../data/geojson/CB.json";
import ctJson from "../data/geojson/CT.json";
import cvtJson from "../data/geojson/CVT.json";
import isolatorJson from "../data/geojson/Isolator.json";
import jumpersJson from "../data/geojson/Jumpers.json";
import laJson from "../data/geojson/LA.json";
import ptJson from "../data/geojson/PT.json";
import ptrJson from "../data/geojson/PTR.json";
import strJson from "../data/geojson/STR.json";
import substationJson from "../data/geojson/substation.json";
import towersJson from "../data/geojson/Towers.json";
import virtualBusJson from "../data/geojson/VirtualBus.json";

type Position2 = [number, number];
type GeoGeometry =
  | { type: "Point"; coordinates: Position2 }
  | { type: "LineString"; coordinates: Position2[] }
  | { type: "MultiLineString"; coordinates: Position2[][] }
  | { type: "Polygon"; coordinates: Position2[][] };
type GeoFeature = { id?: string | number; geometry: GeoGeometry; properties?: Record<string, unknown> };
type FeatureCollection = { features: GeoFeature[] };

type PointLayer = {
  key: string;
  data: FeatureCollection;
  color: Color;
  height: number;
  radius: number;
  layerName: string;
};

type LineLayer = {
  key: string;
  data: FeatureCollection;
  color: Color;
  height: number;
  width: number;
  layerName: string;
};

const fc = (value: unknown) => value as FeatureCollection;

const SURVEY_ORANGE = Color.fromCssColorString("#f0a34b");
const SURVEY_BLUE = Color.fromCssColorString("#53c7df");
const SURVEY_GREEN = Color.fromCssColorString("#6fd18f");
const SURVEY_RED = Color.fromCssColorString("#ff7668");
const SURVEY_VIOLET = Color.fromCssColorString("#b998ff");
const SURVEY_STEEL = Color.fromCssColorString("#b7c2c9");
const SURVEY_DARK = Color.fromCssColorString("#27343a");
const SURVEY_YELLOW = Color.fromCssColorString("#ffd35f");

const lineLayers: LineLayer[] = [
  { key: "bus", data: fc(busJson), color: SURVEY_ORANGE, height: 22, width: 4.2, layerName: "Surveyed bus bars" },
  { key: "virtual-bus", data: fc(virtualBusJson), color: SURVEY_BLUE, height: 15, width: 2.8, layerName: "Virtual bus connectivity" },
  { key: "jumpers", data: fc(jumpersJson), color: SURVEY_YELLOW, height: 17, width: 2.2, layerName: "Jumpers" },
  { key: "boom", data: fc(boomJson), color: SURVEY_STEEL, height: 12, width: 1.8, layerName: "Boom structures" }
];

const pointLayers: PointLayer[] = [
  { key: "cb", data: fc(cbJson), color: SURVEY_RED, height: 5.6, radius: 1.5, layerName: "Circuit breakers" },
  { key: "ct", data: fc(ctJson), color: SURVEY_BLUE, height: 4.8, radius: 0.85, layerName: "Current transformers" },
  { key: "cvt", data: fc(cvtJson), color: SURVEY_GREEN, height: 5.4, radius: 0.9, layerName: "CVTs" },
  { key: "isolator", data: fc(isolatorJson), color: SURVEY_YELLOW, height: 4.2, radius: 0.9, layerName: "Isolators" },
  { key: "la", data: fc(laJson), color: SURVEY_VIOLET, height: 4.6, radius: 0.72, layerName: "Lightning arresters" },
  { key: "pt", data: fc(ptJson), color: SURVEY_GREEN, height: 4.2, radius: 0.8, layerName: "Potential transformers" },
  { key: "ptr", data: fc(ptrJson), color: Color.fromCssColorString("#7f9fb0"), height: 8.5, radius: 2.8, layerName: "Power transformers" },
  { key: "str", data: fc(strJson), color: Color.fromCssColorString("#a6b05d"), height: 5.4, radius: 1.6, layerName: "Station transformers" },
  { key: "tower", data: fc(towersJson), color: SURVEY_STEEL, height: 9, radius: 0.42, layerName: "Station structures" }
];

export function addSurveyedGeoJsonOverlay(viewer: Viewer, baseHeight: number) {
  try {
    addCompoundBoundary(viewer, baseHeight);
    lineLayers.forEach((layer) => safelyAddLayer(layer.layerName, () => addLineLayer(viewer, layer, baseHeight)));
    pointLayers.forEach((layer) => safelyAddLayer(layer.layerName, () => addPointLayer(viewer, layer, baseHeight)));
    addSurveyBadge(viewer, baseHeight);
  } catch (error) {
    console.error("Surveyed GIS overlay failed", error);
  }
}

function safelyAddLayer(layerName: string, render: () => void) {
  try {
    render();
  } catch (error) {
    console.error(`Surveyed GIS layer failed: ${layerName}`, error);
  }
}

function addCompoundBoundary(viewer: Viewer, baseHeight: number) {
  const feature = fc(substationJson).features[0];
  if (feature?.geometry.type !== "Polygon") return;

  const ring = feature.geometry.coordinates[0];
  viewer.entities.add({
    id: "surveyed-substation-compound",
    polygon: {
      hierarchy: new PolygonHierarchy(ring.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, baseHeight + 0.25))),
      material: Color.fromCssColorString("#1f3b3d").withAlpha(0.24),
      outline: true,
      outlineColor: Color.fromCssColorString("#9ef0df").withAlpha(0.9),
      perPositionHeight: true
    }
  });

  viewer.entities.add({
    id: "surveyed-substation-name",
    position: Cartesian3.fromDegrees(78.757399, 13.6535057, baseHeight + 38),
    label: {
      text: "Surveyed APTRANSCO Kalikiri GIS layer",
      font: "700 13px Inter,sans-serif",
      fillColor: Color.WHITE,
      showBackground: true,
      backgroundColor: Color.fromCssColorString("#07131f").withAlpha(0.78),
      pixelOffset: new Cartesian2(0, -18),
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.BOTTOM,
      horizontalOrigin: HorizontalOrigin.CENTER,
      scaleByDistance: new NearFarScalar(120, 1, 1400, 0.2)
    }
  });
}

function addLineLayer(viewer: Viewer, layer: LineLayer, baseHeight: number) {
  layer.data.features.forEach((feature, index) => {
    for (const line of lineStrings(feature.geometry)) {
      viewer.entities.add({
        id: `survey-${layer.key}-${feature.id ?? index}`,
        properties: { surveyLayer: layer.layerName },
        polyline: {
          positions: line.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, baseHeight + voltageHeight(feature, layer.height))),
          width: layer.width,
          material: layer.color.withAlpha(layer.key === "boom" ? 0.55 : 0.86),
          clampToGround: false
        }
      });
    }
  });
}

function addPointLayer(viewer: Viewer, layer: PointLayer, baseHeight: number) {
  layer.data.features.forEach((feature, index) => {
    if (feature.geometry.type !== "Point") return;
    const [lon, lat] = feature.geometry.coordinates;
    const id = `survey-${layer.key}-${feature.id ?? index}`;
    const height = voltageHeight(feature, layer.height);
    const pos = Cartesian3.fromDegrees(lon, lat, baseHeight + height / 2);
    const heading = Transforms.headingPitchRollQuaternion(pos, new HeadingPitchRoll(0, 0, 0));

    if (layer.key === "ptr") {
      viewer.entities.add({
        id,
        properties: { surveyLayer: layer.layerName },
        position: pos,
        orientation: heading,
        box: {
          dimensions: new Cartesian3(13, 9, height),
          material: layer.color.withAlpha(0.82),
          outline: true,
          outlineColor: Color.WHITE.withAlpha(0.18)
        }
      });
      addCompactLabel(viewer, id, labelFor(feature, "PTR"), lon, lat, baseHeight + height + 5);
      return;
    }

    if (layer.key === "cb") {
      viewer.entities.add({
        id,
        properties: { surveyLayer: layer.layerName },
        position: pos,
        orientation: heading,
        box: {
          dimensions: new Cartesian3(4.2, 3.2, height),
          material: layer.color.withAlpha(0.78),
          outline: true,
          outlineColor: Color.WHITE.withAlpha(0.15)
        }
      });
      return;
    }

    viewer.entities.add({
      id,
      properties: { surveyLayer: layer.layerName },
      position: pos,
      cylinder: {
        length: height,
        topRadius: layer.radius * 0.62,
        bottomRadius: layer.radius,
        material: layer.color.withAlpha(layer.key === "tower" ? 0.56 : 0.84),
        outline: layer.key !== "tower",
        outlineColor: Color.WHITE.withAlpha(0.14)
      }
    });

    if (layer.key === "isolator") {
      addSurveyBlade(viewer, `${id}-blade`, lon, lat, baseHeight + height + 0.9, layer.color);
    }
  });
}

function addSurveyBlade(viewer: Viewer, id: string, lon: number, lat: number, height: number, color: Color) {
  const d = 0.000018;
  viewer.entities.add({
    id,
    polyline: {
      positions: [
        Cartesian3.fromDegrees(lon - d, lat - d, height),
        Cartesian3.fromDegrees(lon + d, lat + d, height + 0.8)
      ],
      width: 2,
      material: color.withAlpha(0.9)
    }
  });
}

function addCompactLabel(viewer: Viewer, id: string, text: string, lon: number, lat: number, height: number) {
  viewer.entities.add({
    id: `${id}-label`,
    position: Cartesian3.fromDegrees(lon, lat, height),
    label: {
      text,
      font: "700 11px Inter,sans-serif",
      fillColor: Color.WHITE,
      showBackground: true,
      backgroundColor: SURVEY_DARK.withAlpha(0.74),
      pixelOffset: new Cartesian2(0, -10),
      scaleByDistance: new NearFarScalar(90, 1, 900, 0.25),
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.BOTTOM,
      horizontalOrigin: HorizontalOrigin.CENTER
    }
  });
}

function addSurveyBadge(viewer: Viewer, baseHeight: number) {
  viewer.entities.add({
    id: "survey-layer-count-badge",
    position: Cartesian3.fromDegrees(78.75495, 13.65682, baseHeight + 30),
    label: {
      text: "544 surveyed GIS objects loaded",
      font: "700 12px Inter,sans-serif",
      fillColor: Color.WHITE,
      showBackground: true,
      backgroundColor: Color.fromCssColorString("#0b1a20").withAlpha(0.78),
      style: LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cartesian2(0, -12),
      scaleByDistance: new NearFarScalar(120, 1, 1400, 0.22)
    }
  });
}

function lineStrings(geometry: GeoGeometry) {
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function voltageHeight(feature: GeoFeature, fallback: number) {
  const props = feature.properties ?? {};
  const raw = props["Operating Voltage"] ?? props["Operating Voltage (KV)"] ?? props.OperatingVoltage ?? props.NormalVoltage ?? props["Bus Voltage"];
  const voltage = Number(raw);
  if (voltage === 1 || voltage >= 380) return Math.max(fallback, 22);
  if (voltage === 2 || voltage >= 200) return Math.max(Math.min(fallback, 16), 14);
  if (voltage === 4 || voltage >= 30) return Math.min(fallback, 8);
  return fallback;
}

function labelFor(feature: GeoFeature, fallback: string) {
  const props = feature.properties ?? {};
  return String(props["PTR ID"] ?? props["Station Transformer ID"] ?? props["Station Structure Label Text"] ?? fallback);
}
