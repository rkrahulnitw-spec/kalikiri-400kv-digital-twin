/**
 * SubstationView — lightweight 2D SVG top-down view of Kalikiri 400/220 kV.
 * Replaces CesiumJS 3D engine.  Bundle: ~0 KB extra (pure React + SVG).
 */
import { useRef, useState, type MouseEvent, type WheelEvent } from "react";
import type { BreakerState, IsolatorState, TelemetrySample } from "../domain/types";

interface Props {
  selectedAssetId: string;
  samples: Record<string, TelemetrySample>;
  onSelectAsset: (id: string) => void;
}

// ── SVG canvas size ────────────────────────────────────────────────────────────
const VW = 1200;
const VH = 840;

// ── Key Y positions ────────────────────────────────────────────────────────────
const BUS400_Y1 = 248;   // 400 kV Main Bus 1
const BUS400_Y2 = 266;   // 400 kV Main Bus 2
const BUS400_TY = 284;   // 400 kV Transfer Bus (dashed)
const ICT_Y     = 378;   // ICT transformer body centre
const BUS220_Y  = 510;   // 220 kV Bus

// ── Bus horizontal span ────────────────────────────────────────────────────────
const BX1 = 62;
const BX2 = 1138;

// ── Asset layout ───────────────────────────────────────────────────────────────
const LINE400 = [
  { id: "line-400-yerrampalem-1", x: 148,  label: "Yerrampalem" },
  { id: "line-400-tirupati-1",    x: 296,  label: "Tirupati"    },
  { id: "line-400-nellore-1",     x: 904,  label: "Nellore"     },
  { id: "line-400-hyderabad-1",   x: 1052, label: "Hyderabad"   },
];

const ICTS = [
  { id: "ict-1", x: 390, label: "ICT-1  315 MVA" },
  { id: "ict-2", x: 810, label: "ICT-2  315 MVA" },
];

const FEEDERS220 = [
  { id: "feeder-220-madanapalle", x: 118,  label: "Madanapalle" },
  { id: "feeder-220-puttur",      x: 242,  label: "Puttur"      },
  { id: "feeder-220-pileru",      x: 366,  label: "Pileru"      },
  { id: "feeder-220-vempalle",    x: 490,  label: "Vempalle"    },
  { id: "feeder-220-chittoor",    x: 614,  label: "Chittoor"    },
  { id: "feeder-220-spare",       x: 738,  label: "Spare"       },
];

// ── Colours ────────────────────────────────────────────────────────────────────
const C400 = "#dca24a";
const C220 = "#70d7ff";

function dotColor(s?: TelemetrySample): string {
  if (!s)                                return "#3a5060";
  if (s.breakerState === "tripped")      return "#ff2a1a";
  if (s.alarmSeverity === "critical")    return "#ff2a1a";
  if (s.alarmSeverity === "high")        return "#ff5d4f";
  if (s.alarmSeverity === "medium")      return "#f5b942";
  if (s.alarmSeverity === "low")         return "#f3d15b";
  if (s.breakerState  !== "closed")      return "#f5b942";
  if (s.isolatorState !== "closed")      return "#f5b942";
  return "#63e66f";
}

function cbFill(st?: BreakerState)   { return (!st || st === "closed") ? "#122a1e" : st === "tripped" ? "#3a0800" : "#2a1e00"; }
function cbStroke(st?: BreakerState) { return (!st || st === "closed") ? "#63e66f" : st === "tripped" ? "#ff5d4f" : "#f5b942"; }

// ── Main component ─────────────────────────────────────────────────────────────
export default function SubstationView({ selectedAssetId, samples, onSelectAsset }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, w: VW, h: VH });
  const dragging  = useRef(false);
  const hasDragged = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastPt    = useRef({ x: 0, y: 0 });

  function svgPt(ex: number, ey: number) {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: vb.x + (ex - r.left) / r.width  * vb.w,
      y: vb.y + (ey - r.top)  / r.height * vb.h,
    };
  }

  const onMouseDown = (e: MouseEvent<SVGSVGElement>) => {
    dragging.current  = true;
    hasDragged.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    lastPt.current    = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (!hasDragged.current && dx * dx + dy * dy > 9) hasDragged.current = true;
    if (!hasDragged.current) return;
    const r  = svgRef.current!.getBoundingClientRect();
    const sx = (e.clientX - lastPt.current.x) / r.width  * vb.w;
    const sy = (e.clientY - lastPt.current.y) / r.height * vb.h;
    lastPt.current = { x: e.clientX, y: e.clientY };
    setVb(v => ({ ...v, x: v.x - sx, y: v.y - sy }));
  };

  const onMouseUp = () => { dragging.current = false; };

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.88 : 1.14;
    const pt = svgPt(e.clientX, e.clientY);
    setVb(v => {
      const nw = Math.max(300, Math.min(VW * 2, v.w * factor));
      const nh = Math.max(220, Math.min(VH * 2, v.h * factor));
      return {
        x: pt.x - (pt.x - v.x) * (nw / v.w),
        y: pt.y - (pt.y - v.y) * (nh / v.h),
        w: nw, h: nh
      };
    });
  };

  const sel = (id: string) => {
    if (!hasDragged.current) onSelectAsset(id);
  };

  return (
    <svg
      ref={svgRef}
      className="cesium-host"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      style={{ display: "block", width: "100%", height: "100%",
               cursor: dragging.current ? "grabbing" : "grab" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
      aria-label="Kalikiri 400/220 kV substation top-down view"
    >
      <Background />
      <ZoneLabels />

      {/* ── 400 kV buses ── */}
      <Bus id="bus-400-main-1"   x1={BX1} x2={BX2}                 y={BUS400_Y1} color={C400} sw={5.5} sel={selectedAssetId} s={samples} onSel={sel} />
      <Bus id="bus-400-main-2"   x1={BX1} x2={BX2}                 y={BUS400_Y2} color={C400} sw={5.5} sel={selectedAssetId} s={samples} onSel={sel} opacity={0.72} />
      <Bus id="bus-400-transfer" x1={BX1} x2={BX2}                 y={BUS400_TY} color={C400} sw={3}   sel={selectedAssetId} s={samples} onSel={sel} opacity={0.42} dash="20 7" />

      {/* ── 220 kV buses ── */}
      <Bus id="bus-220-section-1" x1={BX1} x2={(BX1 + BX2) / 2 - 6} y={BUS220_Y}  color={C220} sw={5.5} sel={selectedAssetId} s={samples} onSel={sel} />
      <Bus id="bus-220-section-2" x1={(BX1 + BX2) / 2 + 6} x2={BX2} y={BUS220_Y}  color={C220} sw={5.5} sel={selectedAssetId} s={samples} onSel={sel} />

      {/* ── 400 kV line bays ── */}
      {LINE400.map(b => (
        <LineBay400 key={b.id} {...b} sel={selectedAssetId === b.id} sample={samples[b.id]} onSel={sel} />
      ))}

      {/* ── 400 kV bus coupler ── */}
      <BusCoupler400 sel={selectedAssetId === "bay-400-bus-coupler"} sample={samples["bay-400-bus-coupler"]} onSel={sel} />

      {/* ── ICTs ── */}
      {ICTS.map(t => (
        <ICT key={t.id} {...t} sel={selectedAssetId === t.id} sample={samples[t.id]} onSel={sel} />
      ))}

      {/* ── Fire protection ── */}
      <FireProt sel={selectedAssetId === "fire-detection"} sample={samples["fire-detection"]} onSel={sel} />

      {/* ── 220 kV bus coupler ── */}
      <BusCoupler220 sel={selectedAssetId === "bay-220-bus-coupler"} sample={samples["bay-220-bus-coupler"]} onSel={sel} />

      {/* ── 220 kV feeders ── */}
      {FEEDERS220.map(f => (
        <Feeder220 key={f.id} {...f} sel={selectedAssetId === f.id} sample={samples[f.id]} onSel={sel} />
      ))}

      {/* ── Reactive compensation ── */}
      <CapBank sel={selectedAssetId === "cap-bank-220-1"} sample={samples["cap-bank-220-1"]} onSel={sel} />
      <Reactor400 sel={selectedAssetId === "reactor-400-1"} sample={samples["reactor-400-1"]} onSel={sel} />

      {/* ── Auxiliaries ── */}
      <CtrlBuilding sel={selectedAssetId === "control-building"} sample={samples["control-building"]} onSel={sel} />

      <CoordLabel />
    </svg>
  );
}

// ── Background & decoration ────────────────────────────────────────────────────
function Background() {
  return (
    <>
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#030b14" />
          <stop offset="100%" stopColor="#07111c" />
        </linearGradient>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M60 0 L0 0 0 60" fill="none" stroke="rgba(75,105,125,0.07)" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={VW} height={VH} fill="url(#bg)" />
      <rect x={0} y={0} width={VW} height={VH} fill="url(#grid)" />
      {/* Zone tints */}
      <rect x={BX1} y={22}            width={BX2 - BX1} height={BUS400_TY + 22}             fill="rgba(220,162,74,0.04)"  rx="3" />
      <rect x={BX1} y={BUS400_TY + 22} width={BX2 - BX1} height={BUS220_Y - BUS400_TY - 30} fill="rgba(100,120,130,0.04)" rx="3" />
      <rect x={BX1} y={BUS220_Y + 12}  width={BX2 - BX1} height={VH - BUS220_Y - 22}        fill="rgba(102,183,216,0.04)" rx="3" />
    </>
  );
}

function ZoneLabels() {
  return (
    <g pointerEvents="none">
      <ZL x={BX1 + 8} y={44}            text="400 kV AIS YARD"              fill={C400} />
      <ZL x={BX1 + 8} y={BUS400_TY + 44} text="400 / 220 kV ICT BAYS"       fill="rgba(180,200,210,0.65)" />
      <ZL x={BX1 + 8} y={BUS220_Y + 30}  text="220 kV SWITCHGEAR & FEEDERS" fill={C220} />
    </g>
  );
}

function ZL({ x, y, text, fill }: { x: number; y: number; text: string; fill: string }) {
  return <text x={x} y={y} fill={fill} fontSize="12" fontWeight="800" letterSpacing="0.06em">{text}</text>;
}

// ── Bus bar ────────────────────────────────────────────────────────────────────
function Bus({ id, x1, x2, y, color, sw, sel, s, onSel, opacity = 1, dash }:
  { id: string; x1: number; x2: number; y: number; color: string; sw: number;
    sel: string; s: Record<string, TelemetrySample>; onSel: (id: string) => void;
    opacity?: number; dash?: string }) {
  const selected = sel === id;
  const sample = s[id];
  return (
    <g onClick={() => onSel(id)} style={{ cursor: "pointer" }}>
      <line x1={x1} y1={y} x2={x2} y2={y}
        stroke={selected ? "#fff" : color} strokeWidth={selected ? sw + 2 : sw}
        strokeOpacity={opacity} strokeDasharray={dash}
        style={selected ? { filter: `drop-shadow(0 0 10px ${color})` } : undefined} />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="transparent" strokeWidth={22} />
      <Dot cx={(x1 + x2) / 2} cy={y} sample={sample} selected={selected} r={6} />
    </g>
  );
}

// ── 400 kV Line Bay ────────────────────────────────────────────────────────────
function LineBay400({ id, x, label, sel, sample, onSel }:
  { id: string; x: number; label: string; sel: boolean; sample?: TelemetrySample; onSel: (id: string) => void }) {
  return (
    <g onClick={() => onSel(id)} style={{ cursor: "pointer" }}>
      {sel && <rect x={x - 22} y={20} width={44} height={242} rx={3}
        fill="none" stroke="rgba(112,215,255,0.45)" strokeWidth={1.5} strokeDasharray="7 3" />}
      {/* Entry line */}
      <line x1={x} y1={20} x2={x} y2={BUS400_Y1}
        stroke={C400} strokeWidth={sel ? 3.2 : 2.2} strokeOpacity={0.85}
        style={sel ? { filter: `drop-shadow(0 0 6px ${C400})` } : undefined} />
      {/* Gantry */}
      <line x1={x - 20} y1={26} x2={x + 20} y2={26} stroke="rgba(180,200,210,0.45)" strokeWidth={2.5} />
      {/* Line trap */}
      <rect x={x - 6} y={46} width={12} height={16} rx={2}
        fill="#0e1e28" stroke="rgba(170,190,205,0.45)" strokeWidth={1} />
      {/* CVT */}
      <ellipse cx={x} cy={88} rx={5} ry={9}
        fill="#0e1e28" stroke="rgba(170,190,205,0.55)" strokeWidth={1} />
      {/* Arrester */}
      <path d={`M${x} 112 l-4 6 8 6 -8 6 4 6`} fill="none" stroke="#b05040" strokeWidth={1.4} />
      {/* Disc (isolator) */}
      <line x1={x - 8} y1={154} x2={x + 8} y2={154}
        stroke={sample?.isolatorState !== "closed" ? "#f5b942" : "rgba(225,238,248,0.8)"}
        strokeWidth={2.5} />
      {/* CT */}
      <rect x={x - 4} y={172} width={8} height={9} rx={1}
        fill="#0e1e28" stroke="rgba(170,190,205,0.45)" strokeWidth={1} />
      {/* CB */}
      <rect x={x - 7} y={196} width={14} height={14} rx={2}
        fill={cbFill(sample?.breakerState)} stroke={cbStroke(sample?.breakerState)} strokeWidth={1.6} />
      {/* Lower disc */}
      <line x1={x - 8} y1={222} x2={x + 8} y2={222}
        stroke="rgba(225,238,248,0.8)" strokeWidth={2.5} />
      {/* Label */}
      <text x={x} y={13} textAnchor="middle" fill="rgba(195,215,230,0.75)" fontSize="9.5" fontWeight="700">{label}</text>
      {/* Status dot */}
      <Dot cx={x + 13} cy={203} sample={sample} selected={sel} r={5} />
    </g>
  );
}

// ── 400 kV Bus Coupler ─────────────────────────────────────────────────────────
function BusCoupler400({ sel, sample, onSel }:
  { sel: boolean; sample?: TelemetrySample; onSel: (id: string) => void }) {
  const id = "bay-400-bus-coupler";
  const x = 600;
  return (
    <g onClick={() => onSel(id)} style={{ cursor: "pointer" }}>
      {sel && <rect x={x - 20} y={BUS400_Y1 - 8} width={40} height={BUS400_TY - BUS400_Y1 + 30} rx={3}
        fill="none" stroke="rgba(112,215,255,0.45)" strokeWidth={1.5} strokeDasharray="7 3" />}
      <line x1={x} y1={BUS400_Y1} x2={x} y2={BUS400_TY}
        stroke={C400} strokeWidth={sel ? 3.2 : 2.2} strokeOpacity={0.8} />
      <rect x={x - 7} y={(BUS400_Y1 + BUS400_TY) / 2 - 7} width={14} height={14} rx={2}
        fill={cbFill(sample?.breakerState)} stroke={cbStroke(sample?.breakerState)} strokeWidth={1.6} />
      <text x={x} y={BUS400_TY + 18} textAnchor="middle"
        fill="rgba(195,215,230,0.55)" fontSize="9" fontWeight="700">BUS CPLR</text>
      <Dot cx={x + 13} cy={(BUS400_Y1 + BUS400_TY) / 2} sample={sample} selected={sel} r={5} />
    </g>
  );
}

// ── ICT ────────────────────────────────────────────────────────────────────────
function ICT({ id, x, label, sel, sample, onSel }:
  { id: string; x: number; label: string; sel: boolean; sample?: TelemetrySample; onSel: (id: string) => void }) {
  return (
    <g onClick={() => onSel(id)} style={{ cursor: "pointer" }}>
      {sel && <rect x={x - 38} y={BUS400_TY + 18} width={76} height={BUS220_Y - BUS400_TY - 8} rx={4}
        fill="none" stroke="rgba(112,215,255,0.45)" strokeWidth={1.5} strokeDasharray="7 3" />}
      {/* HV connection */}
      <line x1={x} y1={BUS400_Y1} x2={x} y2={BUS400_TY + 22}
        stroke={C400} strokeWidth={2.4} strokeOpacity={0.8} />
      {/* HV CB */}
      <rect x={x - 7} y={BUS400_TY + 22} width={14} height={14} rx={2}
        fill={cbFill(sample?.breakerState)} stroke={cbStroke(sample?.breakerState)} strokeWidth={1.6} />
      <line x1={x} y1={BUS400_TY + 36} x2={x} y2={ICT_Y - 28}
        stroke={C400} strokeWidth={2} strokeOpacity={0.7} />
      {/* Transformer body: two overlapping circles */}
      <circle cx={x} cy={ICT_Y - 12} r={24}
        fill="rgba(20,38,52,0.92)" stroke={C400} strokeWidth={2.2}
        style={sel ? { filter: `drop-shadow(0 0 8px ${C400})` } : undefined} />
      <circle cx={x} cy={ICT_Y + 12} r={24}
        fill="rgba(20,38,52,0.92)" stroke={C220} strokeWidth={2.2}
        style={sel ? { filter: `drop-shadow(0 0 8px ${C220})` } : undefined} />
      <text x={x} y={ICT_Y - 8}  textAnchor="middle" fill={C400} fontSize="8" fontWeight="900">HV</text>
      <text x={x} y={ICT_Y + 16} textAnchor="middle" fill={C220} fontSize="8" fontWeight="900">LV</text>
      {/* LV connection */}
      <line x1={x} y1={ICT_Y + 36} x2={x} y2={BUS220_Y}
        stroke={C220} strokeWidth={2.4} strokeOpacity={0.8} />
      {/* Label */}
      <text x={x} y={ICT_Y + 52} textAnchor="middle" fill="rgba(195,215,230,0.8)" fontSize="10" fontWeight="700">{label}</text>
      {/* Status */}
      <Dot cx={x + 30} cy={ICT_Y} sample={sample} selected={sel} r={7} />
    </g>
  );
}

// ── Fire Protection ────────────────────────────────────────────────────────────
function FireProt({ sel, sample, onSel }:
  { sel: boolean; sample?: TelemetrySample; onSel: (id: string) => void }) {
  const id = "fire-detection";
  return (
    <g onClick={() => onSel(id)} style={{ cursor: "pointer" }}>
      <line x1={364} y1={ICT_Y} x2={836} y2={ICT_Y}
        stroke="rgba(255,93,79,0.25)" strokeWidth={1} strokeDasharray="8 5" />
      <text x={600} y={ICT_Y - 18} textAnchor="middle"
        fill="rgba(255,93,79,0.55)" fontSize="9" fontWeight="700">FIRE PROTECTION</text>
      <Dot cx={600} cy={ICT_Y - 28} sample={sample} selected={sel} r={4} />
    </g>
  );
}

// ── 220 kV Bus Coupler ─────────────────────────────────────────────────────────
function BusCoupler220({ sel, sample, onSel }:
  { sel: boolean; sample?: TelemetrySample; onSel: (id: string) => void }) {
  const id = "bay-220-bus-coupler";
  const xc = (BX1 + BX2) / 2;
  return (
    <g onClick={() => onSel(id)} style={{ cursor: "pointer" }}>
      <line x1={xc - 6} y1={BUS220_Y} x2={xc + 6} y2={BUS220_Y}
        stroke={C220} strokeWidth={3} strokeOpacity={0.9} />
      <text x={xc} y={BUS220_Y + 20} textAnchor="middle"
        fill="rgba(102,183,216,0.5)" fontSize="8.5" fontWeight="700">BC</text>
      <Dot cx={xc} cy={BUS220_Y - 12} sample={sample} selected={sel} r={5} />
    </g>
  );
}

// ── 220 kV Feeder ─────────────────────────────────────────────────────────────
function Feeder220({ id, x, label, sel, sample, onSel }:
  { id: string; x: number; label: string; sel: boolean; sample?: TelemetrySample; onSel: (id: string) => void }) {
  const spare = id === "feeder-220-spare";
  const y0 = BUS220_Y;
  return (
    <g onClick={() => onSel(id)} style={{ cursor: "pointer" }}>
      {sel && <rect x={x - 20} y={y0 + 8} width={40} height={158} rx={3}
        fill="none" stroke="rgba(112,215,255,0.45)" strokeWidth={1.5} strokeDasharray="7 3" />}
      {/* Drop */}
      <line x1={x} y1={y0} x2={x} y2={y0 + 152}
        stroke={C220} strokeWidth={sel ? 3 : 2}
        strokeOpacity={spare ? 0.35 : 0.8}
        style={sel ? { filter: `drop-shadow(0 0 5px ${C220})` } : undefined} />
      {/* CB */}
      <rect x={x - 6} y={y0 + 26} width={12} height={12} rx={1.5}
        fill={cbFill(sample?.breakerState)}
        stroke={spare ? "#3a5060" : cbStroke(sample?.breakerState)}
        strokeWidth={1.5} />
      {/* CT */}
      <rect x={x - 4} y={y0 + 54} width={8} height={8} rx={1}
        fill="#0e1e28" stroke="rgba(170,190,205,0.4)" strokeWidth={1} />
      {/* Arrester */}
      <path d={`M${x} ${y0 + 76} l-3 5 6 5 -6 5 3 5`}
        fill="none" stroke="#b05040" strokeWidth={1.2} />
      {/* Gantry exit */}
      <line x1={x - 14} y1={y0 + 148} x2={x + 14} y2={y0 + 148}
        stroke="rgba(170,190,205,0.35)" strokeWidth={2.4} />
      {/* Label */}
      <text x={x} y={y0 + 170} textAnchor="middle"
        fill={spare ? "rgba(140,165,180,0.45)" : "rgba(195,215,230,0.78)"}
        fontSize="9.5" fontWeight="700">{label}</text>
      {/* Status */}
      <Dot cx={x + 10} cy={y0 + 32} sample={sample} selected={sel} r={4} />
    </g>
  );
}

// ── 220 kV Capacitor Bank ─────────────────────────────────────────────────────
function CapBank({ sel, sample, onSel }:
  { sel: boolean; sample?: TelemetrySample; onSel: (id: string) => void }) {
  const id = "cap-bank-220-1";
  const x = 1090;
  const y = BUS220_Y;
  return (
    <g onClick={() => onSel(id)} style={{ cursor: "pointer" }}>
      {sel && <rect x={x - 24} y={y - 8} width={48} height={104} rx={3}
        fill="none" stroke="rgba(112,215,255,0.45)" strokeWidth={1.5} strokeDasharray="7 3" />}
      <line x1={BX2} y1={y} x2={x} y2={y} stroke={C220} strokeWidth={2} strokeOpacity={0.65} />
      <line x1={x} y1={y} x2={x} y2={y + 52} stroke={C220} strokeWidth={2} strokeOpacity={0.7} />
      {/* Capacitor plates */}
      <line x1={x - 14} y1={y + 48} x2={x + 14} y2={y + 48} stroke={C220} strokeWidth={2.8} />
      <line x1={x - 14} y1={y + 56} x2={x + 14} y2={y + 56} stroke={C220} strokeWidth={2.8} />
      <line x1={x} y1={y + 56} x2={x} y2={y + 70} stroke={C220} strokeWidth={1.5} />
      <line x1={x - 8} y1={y + 70} x2={x + 8} y2={y + 70} stroke={C220} strokeWidth={2} />
      <text x={x} y={y + 88} textAnchor="middle" fill="rgba(102,183,216,0.65)" fontSize="8.5" fontWeight="700">CAP BANK</text>
      <Dot cx={x + 16} cy={y + 52} sample={sample} selected={sel} r={5} />
    </g>
  );
}

// ── 400 kV Line Reactor ────────────────────────────────────────────────────────
function Reactor400({ sel, sample, onSel }:
  { sel: boolean; sample?: TelemetrySample; onSel: (id: string) => void }) {
  const id = "reactor-400-1";
  const x = 1090;
  const y = BUS400_Y1;
  return (
    <g onClick={() => onSel(id)} style={{ cursor: "pointer" }}>
      {sel && <rect x={x - 22} y={y - 8} width={44} height={100} rx={3}
        fill="none" stroke="rgba(112,215,255,0.45)" strokeWidth={1.5} strokeDasharray="7 3" />}
      <line x1={BX2} y1={y} x2={x} y2={y} stroke={C400} strokeWidth={2} strokeOpacity={0.65} />
      <line x1={x} y1={y} x2={x} y2={y + 28} stroke={C400} strokeWidth={2} strokeOpacity={0.7} />
      {/* Inductor bumps */}
      {[0, 14, 28].map((dy, i) => (
        <path key={i} d={`M${x - 9} ${y + 28 + dy} A9 9 0 0 1 ${x + 9} ${y + 28 + dy}`}
          fill="none" stroke={C400} strokeWidth={2} />
      ))}
      <line x1={x} y1={y + 70} x2={x} y2={y + 82} stroke={C400} strokeWidth={1.5} />
      <line x1={x - 8} y1={y + 82} x2={x + 8} y2={y + 82} stroke={C400} strokeWidth={2} />
      <text x={x} y={y + 96} textAnchor="middle" fill="rgba(220,162,74,0.65)" fontSize="8.5" fontWeight="700">REACTOR</text>
      <Dot cx={x + 16} cy={y + 42} sample={sample} selected={sel} r={5} />
    </g>
  );
}

// ── Control Building ───────────────────────────────────────────────────────────
function CtrlBuilding({ sel, sample, onSel }:
  { sel: boolean; sample?: TelemetrySample; onSel: (id: string) => void }) {
  const id = "control-building";
  return (
    <g onClick={() => onSel(id)} style={{ cursor: "pointer" }}>
      <rect x={28} y={BUS220_Y + 28} width={72} height={42} rx={3}
        fill="rgba(197,203,208,0.12)" stroke="rgba(197,203,208,0.38)" strokeWidth={1.2}
        style={sel ? { filter: "drop-shadow(0 0 6px rgba(197,203,208,0.5))" } : undefined} />
      <text x={64} y={BUS220_Y + 50} textAnchor="middle"
        fill="rgba(200,215,225,0.65)" fontSize="9" fontWeight="700">C&amp;R BLDG</text>
      <Dot cx={94} cy={BUS220_Y + 34} sample={sample} selected={sel} r={4} />
    </g>
  );
}

// ── Status dot ─────────────────────────────────────────────────────────────────
function Dot({ cx, cy, sample, selected, r = 6 }:
  { cx: number; cy: number; sample?: TelemetrySample; selected: boolean; r?: number }) {
  const c = dotColor(sample);
  return (
    <circle cx={cx} cy={cy} r={selected ? r + 2 : r} fill={c}
      stroke={selected ? "#fff" : "rgba(255,255,255,0.45)"}
      strokeWidth={selected ? 2 : 1}
      style={{ filter: `drop-shadow(0 0 ${selected ? 6 : 3}px ${c})` }} />
  );
}

// ── Coordinates label ──────────────────────────────────────────────────────────
function CoordLabel() {
  return (
    <text x={VW - 8} y={VH - 7} textAnchor="end"
      fill="rgba(140,165,185,0.35)" fontSize="9" fontFamily="monospace">
      78.7574°E  13.6535°N  ·  Kalikiri 400/220 kV AIS  ·  APTRANSCO
    </text>
  );
}
