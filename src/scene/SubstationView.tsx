/**
 * SubstationView — AP TRANSCO Kalikiri 400/220 kV AIS top-down plan.
 * Layout matches SLD dated 01.04.2018.
 * Visual references: site photographs 2026-06-03 (kalyan reddy).
 */
import { useRef, useState, type MouseEvent, type WheelEvent } from "react";
import type { BreakerState, TelemetrySample } from "../domain/types";

interface Props {
  selectedAssetId: string;
  samples: Record<string, TelemetrySample>;
  onSelectAsset: (id: string) => void;
}

// ── Canvas ─────────────────────────────────────────────────────────────────────
const VW = 1440;
const VH = 940;

// ── Y levels (top → bottom) ────────────────────────────────────────────────────
const Y_ENTRY   = 56;   // 400 kV conductor entry / gantry top
const Y_B400_1  = 252;  // 400 kV Main Bus-1
const Y_B400_2  = 268;  // 400 kV Main Bus-2
const Y_B400_T  = 284;  // 400 kV Transfer Bus (dashed)
const Y_WALL_T  = 308;  // retaining wall — top edge
const Y_WALL_B  = 330;  // retaining wall — bottom edge
const Y_ICT     = 412;  // ICT body centre
const Y_B220_1  = 512;  // 220 kV Main Bus-1
const Y_B220_2  = 528;  // 220 kV Transfer Bus
const Y_FDR_BOT = 692;  // 220 kV feeder exit bottom
const Y_BLDG_T  = 726;  // control building top
const Y_BLDG_B  = 816;  // control building bottom
const Y_ROAD    = 858;  // internal road centre
const Y_GATE    = 908;  // main gate

// ── X extents ─────────────────────────────────────────────────────────────────
const BX1 = 64;
const BX2 = 1360;

// ── 400 kV line bays (SLD Page 1) ─────────────────────────────────────────────
// Bay pairs: each line has Bus-1 (A) and Bus-2 (B) breaker paths per SLD
const LINE400 = [
  { id: "bay-400-rtpp2",  x: 182,  label: "RTPP-2",     bays: "401/402", future: false },
  { id: "bay-400-rtpp1",  x: 326,  label: "RTPP-1",     bays: "404/405", future: false },
  { id: "bay-400-chtr1",  x: 596,  label: "CHITTOOR-1", bays: "407/408", future: false },
  { id: "bay-400-chtr2",  x: 740,  label: "CHITTOOR-2", bays: "410/411", future: false },
  { id: "bay-400-fut1",   x: 968,  label: "FUTURE",     bays: "413-415", future: true  },
  { id: "bay-400-fut2",   x: 1132, label: "FUTURE",     bays: "416-418", future: true  },
];

// ── ICTs — 315 MVA 400/220/33 kV ──────────────────────────────────────────────
// HV bays: 406 (ICT-1), 409 (ICT-2), 412F (ICT-3) | LV bays: 205, 207, 209
const ICTS = [
  { id: "ict-1", x: 446,  label: "ICT-1",  rating: "315 MVA  400/220/33 kV", future: false },
  { id: "ict-2", x: 624,  label: "ICT-2",  rating: "315 MVA  400/220/33 kV", future: false },
  { id: "ict-3", x: 806,  label: "ICT-3",  rating: "315 MVA  400/220/33 kV", future: true  },
];

// ── 220 kV bays — SLD Page 2 (Bay 201 → 214 left to right) ───────────────────
const BAYS220 = [
  { id: "bay-201", x: 94,   label: "MADANAPALLI-2", bayNo: "201", future: false, coupler: false },
  { id: "bay-202", x: 178,  label: "MADANAPALLI-1", bayNo: "202", future: false, coupler: false },
  { id: "bay-203", x: 262,  label: "FUTURE",        bayNo: "203", future: true,  coupler: false },
  { id: "bay-204", x: 346,  label: "FUTURE",        bayNo: "204", future: true,  coupler: false },
  { id: "bay-205", x: 446,  label: "ICT-1 LV",      bayNo: "205", future: false, coupler: false },
  { id: "bay-206", x: 535,  label: "BUS COUPLER",   bayNo: "206", future: false, coupler: true  },
  { id: "bay-207", x: 624,  label: "ICT-2 LV",      bayNo: "207", future: false, coupler: false },
  { id: "bay-208", x: 713,  label: "TRANSFER BC",   bayNo: "208", future: false, coupler: true  },
  { id: "bay-209", x: 806,  label: "ICT-3 LV",      bayNo: "209", future: true,  coupler: false },
  { id: "bay-210", x: 895,  label: "FUTURE",        bayNo: "210", future: true,  coupler: false },
  { id: "bay-211", x: 984,  label: "FUTURE",        bayNo: "211", future: true,  coupler: false },
  { id: "bay-212", x: 1073, label: "KALIKIRI-2",    bayNo: "212", future: false, coupler: false },
  { id: "bay-213", x: 1162, label: "KALIKIRI-1",    bayNo: "213", future: false, coupler: false },
  { id: "bay-214", x: 1251, label: "FUTURE",        bayNo: "214", future: true,  coupler: false },
];

// ── Palette ───────────────────────────────────────────────────────────────────
const C400  = "#dca24a";
const C220  = "#70d7ff";
const CFUT  = "rgba(155,175,195,0.32)";
const CWIRE = "rgba(200,218,232,0.82)";

// ── State helpers ──────────────────────────────────────────────────────────────
function cbFill(st?: BreakerState)   { return (!st||st==="closed")?"#122a1e":st==="tripped"?"#3a0800":"#2a1e00"; }
function cbStroke(st?: BreakerState) { return (!st||st==="closed")?"#63e66f":st==="tripped"?"#ff5d4f":"#f5b942"; }

function dotColor(s?: TelemetrySample): string {
  if (!s)                           return "#3a5060";
  if (s.breakerState==="tripped")   return "#ff2a1a";
  if (s.alarmSeverity==="critical") return "#ff2a1a";
  if (s.alarmSeverity==="high")     return "#ff5d4f";
  if (s.alarmSeverity==="medium")   return "#f5b942";
  if (s.alarmSeverity==="low")      return "#f3d15b";
  if (s.breakerState!=="closed")    return "#f5b942";
  if (s.isolatorState!=="closed")   return "#f5b942";
  return "#63e66f";
}

// ══════════════════════════════════════════════════════════════════════════════
export default function SubstationView({ selectedAssetId, samples, onSelectAsset }: Props) {
  const svgRef     = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState({ x: 0, y: 0, w: VW, h: VH });
  const dragging   = useRef(false);
  const hasDragged = useRef(false);
  const dragStart  = useRef({ x: 0, y: 0 });
  const lastPt     = useRef({ x: 0, y: 0 });

  function svgPt(ex: number, ey: number) {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: vb.x+(ex-r.left)/r.width*vb.w, y: vb.y+(ey-r.top)/r.height*vb.h };
  }
  const onMouseDown = (e: MouseEvent<SVGSVGElement>) => {
    dragging.current=true; hasDragged.current=false;
    dragStart.current={x:e.clientX,y:e.clientY};
    lastPt.current={x:e.clientX,y:e.clientY};
  };
  const onMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const dx=e.clientX-dragStart.current.x, dy=e.clientY-dragStart.current.y;
    if (!hasDragged.current && dx*dx+dy*dy>9) hasDragged.current=true;
    if (!hasDragged.current) return;
    const r=svgRef.current!.getBoundingClientRect();
    const sx=(e.clientX-lastPt.current.x)/r.width*vb.w;
    const sy=(e.clientY-lastPt.current.y)/r.height*vb.h;
    lastPt.current={x:e.clientX,y:e.clientY};
    setVb(v=>({...v,x:v.x-sx,y:v.y-sy}));
  };
  const onMouseUp = () => { dragging.current=false; };
  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const f=e.deltaY<0?0.88:1.14;
    const pt=svgPt(e.clientX,e.clientY);
    setVb(v=>{
      const nw=Math.max(320,Math.min(VW*2,v.w*f));
      const nh=Math.max(240,Math.min(VH*2,v.h*f));
      return { x:pt.x-(pt.x-v.x)*(nw/v.w), y:pt.y-(pt.y-v.y)*(nh/v.h), w:nw, h:nh };
    });
  };
  const sel = (id: string) => { if (!hasDragged.current) onSelectAsset(id); };

  return (
    <svg ref={svgRef} className="cesium-host"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      style={{ display:"block", width:"100%", height:"100%",
               cursor:dragging.current?"grabbing":"grab" }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}
      aria-label="AP TRANSCO Kalikiri 400/220 kV AIS — top-down plan"
    >
      <Background />
      <SiteFeatures />
      <RetainingWall />
      <ZoneLabels />

      {/* ── 400 kV buses ── */}
      <BusBar id="bus-400-main-1"   y={Y_B400_1} x1={BX1} x2={BX2} color={C400} sw={5.5} sel={selectedAssetId} s={samples} onSel={sel} />
      <BusBar id="bus-400-main-2"   y={Y_B400_2} x1={BX1} x2={BX2} color={C400} sw={5.5} sel={selectedAssetId} s={samples} onSel={sel} opacity={0.72} />
      <BusBar id="bus-400-transfer" y={Y_B400_T} x1={BX1} x2={BX2} color={C400} sw={2.8} sel={selectedAssetId} s={samples} onSel={sel} opacity={0.38} dash="18 7" />

      {/* ── 400 kV bus coupler (4-BB1/BB2) ── */}
      <BusCoupler400 sel={selectedAssetId==="bay-400-bus-coupler"} sample={samples["bay-400-bus-coupler"]} onSel={sel} />

      {/* ── 400 kV bus reactor (future) ── */}
      <BusReactor400 sel={selectedAssetId==="reactor-400-bus"} sample={samples["reactor-400-bus"]} onSel={sel} />

      {/* ── 400 kV line bays ── */}
      {LINE400.map(b => (
        <LineBay400 key={b.id} {...b} sel={selectedAssetId===b.id} sample={samples[b.id]} onSel={sel} />
      ))}

      {/* ── ICT transformers ── */}
      {ICTS.map(t => (
        <ICTUnit key={t.id} {...t} sel={selectedAssetId===t.id} sample={samples[t.id]} onSel={sel} />
      ))}

      {/* ── Fire protection ── */}
      <FireProtLine sel={selectedAssetId==="fire-detection"} sample={samples["fire-detection"]} onSel={sel} />

      {/* ── 220 kV buses ── */}
      <BusBar id="bus-220-main-1"   y={Y_B220_1} x1={BX1} x2={BX2} color={C220} sw={5.5} sel={selectedAssetId} s={samples} onSel={sel} />
      <BusBar id="bus-220-transfer" y={Y_B220_2} x1={BX1} x2={BX2} color={C220} sw={2.8} sel={selectedAssetId} s={samples} onSel={sel} opacity={0.38} dash="18 7" />

      {/* ── 220 kV bays ── */}
      {BAYS220.map(b => (
        <Bay220 key={b.id} {...b} sel={selectedAssetId===b.id} sample={samples[b.id]} onSel={sel} />
      ))}

      {/* ── Switchyard relay kiosk ── */}
      <RelayKiosk sel={selectedAssetId==="relay-room-sw"} sample={samples["relay-room-sw"]} onSel={sel} />

      {/* ── Control building & gate ── */}
      <ControlBuilding sel={selectedAssetId==="control-building"} sample={samples["control-building"]} onSel={sel} />
      <MainGate />
      <InternalRoad />

      {/* ── Perimeter lightning masts (lattice towers visible in photos) ── */}
      <LightningMast x={BX1+2}           y={Y_ENTRY-2}     />
      <LightningMast x={BX2-2}           y={Y_ENTRY-2}     />
      <LightningMast x={BX1+2}           y={Y_FDR_BOT+12}  />
      <LightningMast x={BX2-2}           y={Y_FDR_BOT+12}  />
      <LightningMast x={(BX1+BX2)/2-180} y={Y_ENTRY-2}     />
      <LightningMast x={(BX1+BX2)/2+180} y={Y_ENTRY-2}     />

      <CoordLabel />
    </svg>
  );
}

// ── Background ─────────────────────────────────────────────────────────────────
function Background() {
  const swYard = Y_ENTRY - 10;
  const swH    = Y_FDR_BOT - swYard + 18;
  return (
    <>
      <defs>
        <linearGradient id="bg-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#020a13" />
          <stop offset="100%" stopColor="#07121e" />
        </linearGradient>
        <pattern id="grid60" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M60 0 L0 0 0 60" fill="none" stroke="rgba(70,100,120,0.065)" strokeWidth="0.6" />
        </pattern>
        {/* Gravel texture for yard surface */}
        <pattern id="gravel" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="0.9" fill="rgba(155,170,180,0.10)" />
          <circle cx="7.5" cy="7.5" r="0.9" fill="rgba(155,170,180,0.09)" />
          <circle cx="5.0" cy="1.5" r="0.6" fill="rgba(155,170,180,0.07)" />
          <circle cx="1.5" cy="7.0" r="0.6" fill="rgba(155,170,180,0.07)" />
        </pattern>
      </defs>

      {/* Base dark sky */}
      <rect x={0} y={0} width={VW} height={VH} fill="url(#bg-grad)" />
      <rect x={0} y={0} width={VW} height={VH} fill="url(#grid60)" />

      {/* 400 kV yard — elevated gravel surface (grey, from photos) */}
      <rect x={BX1-6} y={swYard} width={BX2-BX1+12} height={swH}
        fill="rgba(138,152,162,0.08)" rx={3} />
      <rect x={BX1-6} y={swYard} width={BX2-BX1+12} height={swH}
        fill="url(#gravel)" rx={3} />

      {/* Zone tints */}
      <rect x={BX1} y={18}       width={BX2-BX1} height={Y_WALL_T-14}         fill="rgba(220,162,74,0.042)"  rx="3" />
      <rect x={BX1} y={Y_WALL_B} width={BX2-BX1} height={Y_FDR_BOT-Y_WALL_B+20} fill="rgba(102,183,216,0.038)" rx="3" />
      {/* ICT level — slightly different tint */}
      <rect x={BX1} y={Y_WALL_B} width={BX2-BX1} height={Y_B220_1-Y_WALL_B-8} fill="rgba(100,120,140,0.04)" rx="3" />
    </>
  );
}

// ── Site features (fence, outer boundary, garden, utility roads) ───────────────
function SiteFeatures() {
  const fx1=BX1-22, fx2=BX2+22, fy1=Y_ENTRY-22, fy2=Y_FDR_BOT+22;
  return (
    <g pointerEvents="none">
      {/* Outer perimeter fence */}
      <rect x={fx1} y={fy1} width={fx2-fx1} height={fy2-fy1}
        fill="none" stroke="rgba(140,165,185,0.22)" strokeWidth={1.4} strokeDasharray="6 4" rx={2} />
      {/* Fence corner markers */}
      {[[fx1,fy1],[fx2,fy1],[fx1,fy2],[fx2,fy2]].map(([x,y],i) => (
        <rect key={i} x={(x as number)-3} y={(y as number)-3} width={6} height={6}
          fill="rgba(140,165,185,0.18)" stroke="rgba(140,165,185,0.35)" strokeWidth={0.8} />
      ))}
      {/* Patrol road along perimeter (inside fence) */}
      <rect x={fx1+6} y={fy1+6} width={fx2-fx1-12} height={fy2-fy1-12}
        fill="none" stroke="rgba(120,140,155,0.10)" strokeWidth={5} />

      {/* Garden / lawn area between building and gate (green from photos) */}
      <rect x={440} y={Y_BLDG_B+10} width={400} height={42}
        fill="rgba(60,120,60,0.18)" stroke="rgba(80,160,80,0.25)" strokeWidth={0.8} rx={4} />
      <text x={640} y={Y_BLDG_B+34} textAnchor="middle"
        fill="rgba(80,160,80,0.45)" fontSize="8" fontWeight="700">GARDEN</text>

      {/* Bund/oil pit walls around ICT area (concrete, from photos) */}
      {ICTS.map(t => (
        <rect key={t.id+"-bund"}
          x={t.x-54} y={Y_ICT-58} width={108} height={116}
          fill={t.future?"rgba(60,80,95,0.06)":"rgba(90,100,110,0.14)"}
          stroke={t.future?"rgba(120,140,160,0.18)":"rgba(155,170,180,0.38)"}
          strokeWidth={1.6} rx={3}
          strokeDasharray={t.future?"8 5":undefined} />
      ))}

      {/* Cable trench lines (visible in photos as raised concrete strips) */}
      <line x1={BX1+8} y1={Y_WALL_B+10} x2={BX2-8} y2={Y_WALL_B+10}
        stroke="rgba(130,150,165,0.18)" strokeWidth={3} />
      <line x1={BX1+8} y1={Y_FDR_BOT-8} x2={BX2-8} y2={Y_FDR_BOT-8}
        stroke="rgba(130,150,165,0.15)" strokeWidth={3} />
    </g>
  );
}

// ── Retaining wall — separates elevated 400 kV yard from ICT/220 kV level ─────
function RetainingWall() {
  return (
    <g pointerEvents="none">
      {/* Concrete wall body */}
      <rect x={BX1-8} y={Y_WALL_T} width={BX2-BX1+16} height={Y_WALL_B-Y_WALL_T}
        fill="rgba(110,118,124,0.60)" rx={1} />
      {/* Top edge highlight */}
      <line x1={BX1-8} y1={Y_WALL_T} x2={BX2+8} y2={Y_WALL_T}
        stroke="rgba(210,220,228,0.45)" strokeWidth={1.2} />
      {/* Bottom edge shadow */}
      <line x1={BX1-8} y1={Y_WALL_B} x2={BX2+8} y2={Y_WALL_B}
        stroke="rgba(30,40,50,0.55)" strokeWidth={1.5} />
      {/* Wall label */}
      <text x={(BX1+BX2)/2} y={Y_WALL_T+12} textAnchor="middle"
        fill="rgba(195,210,220,0.38)" fontSize="8" fontWeight="700" letterSpacing="0.12em">
        RETAINING WALL  ·  LEVEL CHANGE
      </text>
      {/* Step indicators */}
      {[200, 450, 700, 950, 1200].map(x => (
        <line key={x} x1={x} y1={Y_WALL_T} x2={x} y2={Y_WALL_B}
          stroke="rgba(160,175,185,0.15)" strokeWidth={0.8} />
      ))}
    </g>
  );
}

// ── Zone labels ────────────────────────────────────────────────────────────────
function ZoneLabels() {
  return (
    <g pointerEvents="none">
      <ZL x={BX1+10} y={36}          text="400 kV AIS YARD — DOUBLE BUSBAR"      fill={C400} />
      <ZL x={BX1+10} y={Y_WALL_B+28} text="400/220 kV ICT BAYS  (315 MVA × 3)"   fill="rgba(180,200,215,0.60)" />
      <ZL x={BX1+10} y={Y_B220_1+32} text="220 kV SWITCHGEAR — BUS & FEEDERS"    fill={C220} />
    </g>
  );
}
function ZL({ x, y, text, fill }: { x:number; y:number; text:string; fill:string }) {
  return <text x={x} y={y} fill={fill} fontSize="11" fontWeight="800" letterSpacing="0.05em">{text}</text>;
}

// ── Bus bar ────────────────────────────────────────────────────────────────────
function BusBar({ id, y, x1, x2, color, sw, sel, s, onSel, opacity=1, dash }:
  { id:string; y:number; x1:number; x2:number; color:string; sw:number;
    sel:string; s:Record<string,TelemetrySample>; onSel:(id:string)=>void;
    opacity?:number; dash?:string }) {
  const selected = sel===id;
  const sample   = s[id];
  return (
    <g onClick={()=>onSel(id)} style={{cursor:"pointer"}}>
      <line x1={x1} y1={y} x2={x2} y2={y}
        stroke={selected?"#fff":color} strokeWidth={selected?sw+2.5:sw}
        strokeOpacity={opacity} strokeDasharray={dash}
        style={selected?{filter:`drop-shadow(0 0 10px ${color})`}:undefined} />
      {/* Wide invisible hit area */}
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="transparent" strokeWidth={22} />
      <Dot cx={(x1+x2)/2} cy={y} sample={sample} selected={selected} r={6} />
    </g>
  );
}

// ── 400 kV Line Bay ────────────────────────────────────────────────────────────
function LineBay400({ id, x, label, bays, future, sel, sample, onSel }:
  { id:string; x:number; label:string; bays:string; future:boolean;
    sel:boolean; sample?:TelemetrySample; onSel:(id:string)=>void }) {
  const cc   = future ? CFUT : C400;
  const wire = future ? "rgba(155,175,195,0.32)" : CWIRE;
  const op   = future ? 0.45 : 1;
  return (
    <g onClick={()=>onSel(id)} style={{cursor:"pointer"}} opacity={op}>
      {/* Selection highlight */}
      {sel && <rect x={x-24} y={Y_ENTRY-8} width={48} height={Y_B400_1-Y_ENTRY+18} rx={3}
        fill="none" stroke="rgba(112,215,255,0.45)" strokeWidth={1.5} strokeDasharray="7 3" />}

      {/* Overhead line entry */}
      <line x1={x} y1={Y_ENTRY-8} x2={x} y2={Y_B400_1}
        stroke={cc} strokeWidth={sel?3.2:2.2}
        style={sel?{filter:`drop-shadow(0 0 6px ${cc})`}:undefined} />

      {/* Gantry portal beam (visible in every photo) */}
      <line x1={x-28} y1={Y_ENTRY+4} x2={x+28} y2={Y_ENTRY+4}
        stroke="rgba(180,200,215,0.55)" strokeWidth={3.2} />
      <line x1={x-28} y1={Y_ENTRY+4} x2={x-28} y2={Y_ENTRY+20}
        stroke="rgba(180,200,215,0.40)" strokeWidth={1.6} />
      <line x1={x+28} y1={Y_ENTRY+4} x2={x+28} y2={Y_ENTRY+20}
        stroke="rgba(180,200,215,0.40)" strokeWidth={1.6} />

      {/* Surge arrester (LA) — 3-stack */}
      <path d={`M${x} ${Y_ENTRY+30} l-4 6 8 6 -8 6 8 6 -4 5`}
        fill="none" stroke="#c06848" strokeWidth={1.5} />

      {/* CVT — capacitor stack */}
      <rect x={x-5} y={Y_ENTRY+68} width={10} height={6} rx={1}
        fill="#0d1c28" stroke="rgba(175,195,210,0.55)" strokeWidth={1} />
      <rect x={x-5} y={Y_ENTRY+76} width={10} height={6} rx={1}
        fill="#0d1c28" stroke="rgba(175,195,210,0.45)" strokeWidth={1} />
      <rect x={x-5} y={Y_ENTRY+84} width={10} height={6} rx={1}
        fill="#0d1c28" stroke="rgba(175,195,210,0.35)" strokeWidth={1} />

      {/* Line isolator (89L) */}
      <line x1={x-10} y1={Y_ENTRY+104} x2={x+10} y2={Y_ENTRY+104}
        stroke={wire} strokeWidth={2.8} />
      <line x1={x-10} y1={Y_ENTRY+108} x2={x+10} y2={Y_ENTRY+108}
        stroke={wire} strokeWidth={1.2} strokeOpacity={0.5} />

      {/* CT */}
      <rect x={x-4} y={Y_ENTRY+122} width={8} height={10} rx={1}
        fill="#0d1c28" stroke="rgba(175,195,210,0.45)" strokeWidth={1} />

      {/* Circuit Breaker (52) */}
      <rect x={x-8} y={Y_ENTRY+146} width={16} height={16} rx={2}
        fill={cbFill(sample?.breakerState)}
        stroke={future?"rgba(155,175,195,0.42)":cbStroke(sample?.breakerState)}
        strokeWidth={1.8} />

      {/* Bus-1 isolator (89A) */}
      <line x1={x-10} y1={Y_ENTRY+176} x2={x+10} y2={Y_ENTRY+176}
        stroke={wire} strokeWidth={2.4} />

      {/* Label */}
      <text x={x} y={Y_ENTRY-14} textAnchor="middle"
        fill={future?"rgba(155,175,195,0.50)":"rgba(200,220,235,0.82)"}
        fontSize="9.5" fontWeight="800">{label}</text>
      <text x={x} y={Y_ENTRY-4} textAnchor="middle"
        fill="rgba(140,165,185,0.42)" fontSize="7.5" fontWeight="600">{bays}</text>

      {/* Status dot */}
      {!future && <Dot cx={x+14} cy={Y_ENTRY+154} sample={sample} selected={sel} r={5} />}
    </g>
  );
}

// ── 400 kV Bus Coupler (4-BB1/BB2) ────────────────────────────────────────────
function BusCoupler400({ sel, sample, onSel }:
  { sel:boolean; sample?:TelemetrySample; onSel:(id:string)=>void }) {
  const id = "bay-400-bus-coupler";
  const x  = BX1 + 18;
  return (
    <g onClick={()=>onSel(id)} style={{cursor:"pointer"}}>
      <line x1={x} y1={Y_B400_1} x2={x} y2={Y_B400_T+8}
        stroke={C400} strokeWidth={sel?3.2:2} strokeOpacity={0.8} />
      <rect x={x-7} y={(Y_B400_1+Y_B400_T)/2-7} width={14} height={14} rx={2}
        fill={cbFill(sample?.breakerState)} stroke={cbStroke(sample?.breakerState)} strokeWidth={1.6} />
      <text x={x} y={Y_B400_T+22} textAnchor="middle"
        fill="rgba(220,162,74,0.50)" fontSize="8" fontWeight="700">BUS CPLR</text>
      <Dot cx={x+12} cy={(Y_B400_1+Y_B400_T)/2} sample={sample} selected={sel} r={5} />
    </g>
  );
}

// ── 400 kV Bus Reactor (Future) ───────────────────────────────────────────────
function BusReactor400({ sel, sample, onSel }:
  { sel:boolean; sample?:TelemetrySample; onSel:(id:string)=>void }) {
  const id = "reactor-400-bus";
  const x  = BX1 + 44;
  const y  = Y_B400_1;
  return (
    <g onClick={()=>onSel(id)} style={{cursor:"pointer"}} opacity={0.48}>
      <line x1={BX1+18} y1={y} x2={x} y2={y} stroke={C400} strokeWidth={2} strokeOpacity={0.5} />
      <line x1={x} y1={y} x2={x} y2={y+28} stroke={C400} strokeWidth={2} strokeOpacity={0.55} />
      {[0,14,28].map((dy,i) => (
        <path key={i} d={`M${x-9} ${y+28+dy} A9 9 0 0 1 ${x+9} ${y+28+dy}`}
          fill="none" stroke={C400} strokeWidth={1.8} />
      ))}
      <line x1={x-9} y1={y+70} x2={x+9} y2={y+70} stroke={C400} strokeWidth={1.5} />
      <text x={x} y={y+84} textAnchor="middle"
        fill="rgba(220,162,74,0.55)" fontSize="7.5" fontWeight="700">REACTOR</text>
      <text x={x} y={y+93} textAnchor="middle"
        fill="rgba(220,162,74,0.42)" fontSize="7" fontWeight="600">(FUTURE)</text>
    </g>
  );
}

// ── ICT Transformer ────────────────────────────────────────────────────────────
function ICTUnit({ id, x, label, rating, future, sel, sample, onSel }:
  { id:string; x:number; label:string; rating:string; future:boolean;
    sel:boolean; sample?:TelemetrySample; onSel:(id:string)=>void }) {
  const op  = future ? 0.42 : 1;
  const hvc = future ? CFUT : C400;
  const lvc = future ? CFUT : C220;
  return (
    <g onClick={()=>onSel(id)} style={{cursor:"pointer"}} opacity={op}>
      {sel && <rect x={x-56} y={Y_WALL_B+8} width={112} height={Y_B220_1-Y_WALL_B-16} rx={4}
        fill="none" stroke="rgba(112,215,255,0.42)" strokeWidth={1.5} strokeDasharray="7 3" />}

      {/* HV connection from 400 kV bus down through wall */}
      <line x1={x} y1={Y_B400_1} x2={x} y2={Y_WALL_T}
        stroke={hvc} strokeWidth={2.4} strokeOpacity={0.75} />
      <line x1={x} y1={Y_WALL_B} x2={x} y2={Y_ICT-44}
        stroke={hvc} strokeWidth={2.4} strokeOpacity={0.75} />

      {/* HV circuit breaker */}
      <rect x={x-8} y={Y_WALL_B+12} width={16} height={16} rx={2}
        fill={cbFill(sample?.breakerState)}
        stroke={future?"rgba(155,175,195,0.42)":cbStroke(sample?.breakerState)}
        strokeWidth={1.8} />

      {/* HV CT */}
      <ellipse cx={x} cy={Y_ICT-36} rx={6} ry={6}
        fill="#0d1c28" stroke="rgba(220,162,74,0.50)" strokeWidth={1.2} />

      {/* Transformer body — two interlocked circles (standard symbol) */}
      <circle cx={x} cy={Y_ICT-14} r={28}
        fill="rgba(18,36,52,0.94)" stroke={hvc} strokeWidth={2.4}
        style={sel?{filter:`drop-shadow(0 0 8px ${hvc})`}:undefined} />
      <circle cx={x} cy={Y_ICT+14} r={28}
        fill="rgba(18,36,52,0.94)" stroke={lvc} strokeWidth={2.4}
        style={sel?{filter:`drop-shadow(0 0 8px ${lvc})`}:undefined} />
      <text x={x} y={Y_ICT-10} textAnchor="middle" fill={hvc}  fontSize="8.5" fontWeight="900">HV</text>
      <text x={x} y={Y_ICT+18} textAnchor="middle" fill={lvc}  fontSize="8.5" fontWeight="900">LV</text>

      {/* LV CT */}
      <ellipse cx={x} cy={Y_ICT+44} rx={6} ry={6}
        fill="#0d1c28" stroke="rgba(112,215,255,0.50)" strokeWidth={1.2} />

      {/* LV circuit breaker */}
      <rect x={x-8} y={Y_B220_1-34} width={16} height={16} rx={2}
        fill={cbFill(sample?.breakerState)}
        stroke={future?"rgba(155,175,195,0.42)":cbStroke(sample?.breakerState)}
        strokeWidth={1.8} />

      {/* LV connection to 220 kV bus */}
      <line x1={x} y1={Y_ICT+56} x2={x} y2={Y_B220_1-34}
        stroke={lvc} strokeWidth={2.4} strokeOpacity={0.75} />
      <line x1={x} y1={Y_B220_1-18} x2={x} y2={Y_B220_1}
        stroke={lvc} strokeWidth={2.4} strokeOpacity={0.75} />

      {/* Labels */}
      <text x={x} y={Y_ICT+62} textAnchor="middle"
        fill={future?"rgba(155,175,195,0.55)":"rgba(200,220,235,0.88)"}
        fontSize="10.5" fontWeight="800">{label}</text>
      <text x={x} y={Y_ICT+74} textAnchor="middle"
        fill="rgba(160,185,205,0.50)" fontSize="8" fontWeight="600">{rating}</text>
      {future && <text x={x} y={Y_ICT+85} textAnchor="middle"
        fill="rgba(155,175,195,0.45)" fontSize="7.5" fontWeight="700">(FUTURE)</text>}

      {/* Status dot */}
      {!future && <Dot cx={x+36} cy={Y_ICT} sample={sample} selected={sel} r={7} />}
    </g>
  );
}

// ── Fire protection line ───────────────────────────────────────────────────────
function FireProtLine({ sel, sample, onSel }:
  { sel:boolean; sample?:TelemetrySample; onSel:(id:string)=>void }) {
  const id = "fire-detection";
  const y  = Y_ICT + 92;
  return (
    <g onClick={()=>onSel(id)} style={{cursor:"pointer"}}>
      <line x1={ICTS[0].x-60} y1={y} x2={ICTS[2].x+60} y2={y}
        stroke="rgba(255,90,70,0.22)" strokeWidth={1.2} strokeDasharray="10 6" />
      <text x={(ICTS[0].x+ICTS[2].x)/2} y={y-8} textAnchor="middle"
        fill="rgba(255,90,70,0.50)" fontSize="8.5" fontWeight="700">FIRE PROTECTION</text>
      <Dot cx={(ICTS[0].x+ICTS[2].x)/2} cy={y-18} sample={sample} selected={sel} r={4} />
    </g>
  );
}

// ── 220 kV Bay ─────────────────────────────────────────────────────────────────
function Bay220({ id, x, label, bayNo, future, coupler, sel, sample, onSel }:
  { id:string; x:number; label:string; bayNo:string; future:boolean; coupler:boolean;
    sel:boolean; sample?:TelemetrySample; onSel:(id:string)=>void }) {
  const cc   = future ? CFUT : C220;
  const wire = future ? "rgba(155,175,195,0.32)" : CWIRE;
  const op   = future ? 0.44 : 1;
  const y0   = Y_B220_1;

  if (coupler) {
    // Bus coupler / transfer bus coupler: horizontal connection between buses
    return (
      <g onClick={()=>onSel(id)} style={{cursor:"pointer"}}>
        <line x1={x} y1={Y_B220_1} x2={x} y2={Y_B220_2+10}
          stroke={cc} strokeWidth={sel?3.2:2.2} strokeOpacity={0.85} />
        <rect x={x-7} y={(Y_B220_1+Y_B220_2)/2-7} width={14} height={14} rx={2}
          fill={cbFill(sample?.breakerState)} stroke={cbStroke(sample?.breakerState)} strokeWidth={1.6} />
        <text x={x} y={Y_B220_2+28} textAnchor="middle"
          fill={`${cc}88`} fontSize="8" fontWeight="700">{label}</text>
        <text x={x} y={Y_B220_2+38} textAnchor="middle"
          fill="rgba(140,165,185,0.40)" fontSize="7" fontWeight="600">Bay {bayNo}</text>
        <Dot cx={x+12} cy={(Y_B220_1+Y_B220_2)/2} sample={sample} selected={sel} r={5} />
      </g>
    );
  }

  return (
    <g onClick={()=>onSel(id)} style={{cursor:"pointer"}} opacity={op}>
      {sel && <rect x={x-22} y={y0+6} width={44} height={Y_FDR_BOT-y0-6} rx={3}
        fill="none" stroke="rgba(112,215,255,0.42)" strokeWidth={1.4} strokeDasharray="7 3" />}

      {/* Drop from bus to exit */}
      <line x1={x} y1={y0} x2={x} y2={Y_FDR_BOT}
        stroke={cc} strokeWidth={sel?3:2}
        style={sel?{filter:`drop-shadow(0 0 5px ${cc})`}:undefined} />

      {/* Bus isolator (89A) */}
      <line x1={x-10} y1={y0+22} x2={x+10} y2={y0+22}
        stroke={wire} strokeWidth={2.6} />

      {/* Circuit Breaker (52) */}
      <rect x={x-7} y={y0+44} width={14} height={14} rx={2}
        fill={cbFill(sample?.breakerState)}
        stroke={future?"rgba(155,175,195,0.38)":cbStroke(sample?.breakerState)}
        strokeWidth={1.6} />

      {/* CT */}
      <rect x={x-4} y={y0+72} width={8} height={9} rx={1}
        fill="#0d1c28" stroke="rgba(175,195,210,0.45)" strokeWidth={1} />

      {/* CVT */}
      <rect x={x-5} y={y0+96} width={10} height={6} rx={1}
        fill="#0d1c28" stroke="rgba(175,195,210,0.50)" strokeWidth={1} />
      <rect x={x-5} y={y0+104} width={10} height={6} rx={1}
        fill="#0d1c28" stroke="rgba(175,195,210,0.38)" strokeWidth={1} />

      {/* Surge arrester (LA) */}
      <path d={`M${x} ${y0+126} l-3 5 6 5 -6 5 3 5`}
        fill="none" stroke="#c06848" strokeWidth={1.2} />

      {/* Gantry exit bar */}
      <line x1={x-16} y1={Y_FDR_BOT-8} x2={x+16} y2={Y_FDR_BOT-8}
        stroke="rgba(180,200,215,0.38)" strokeWidth={2.6} />

      {/* Marshalling kiosk at base (visible in close-up photos) */}
      {!future && <rect x={x-6} y={Y_FDR_BOT-4} width={12} height={8} rx={1}
        fill="#0d2030" stroke="rgba(70,180,220,0.55)" strokeWidth={0.9} />}

      {/* Labels */}
      <text x={x} y={Y_FDR_BOT+16} textAnchor="middle"
        fill={future?"rgba(155,175,195,0.46)":"rgba(200,220,235,0.82)"}
        fontSize="8.5" fontWeight="800">{label}</text>
      <text x={x} y={Y_FDR_BOT+26} textAnchor="middle"
        fill="rgba(130,155,175,0.42)" fontSize="7.5" fontWeight="600">Bay {bayNo}</text>

      {!future && <Dot cx={x+10} cy={y0+51} sample={sample} selected={sel} r={4.5} />}
    </g>
  );
}

// ── Switchyard relay / marshalling kiosk (visible in photos — blue, red roof) ──
function RelayKiosk({ sel, sample, onSel }:
  { sel:boolean; sample?:TelemetrySample; onSel:(id:string)=>void }) {
  const id = "relay-room-sw";
  const x  = 860, y = Y_B220_2 - 2;
  return (
    <g onClick={()=>onSel(id)} style={{cursor:"pointer"}}>
      <rect x={x} y={y} width={52} height={36} rx={2}
        fill="rgba(14,36,60,0.90)"
        stroke={sel?"rgba(112,215,255,0.72)":"rgba(70,160,220,0.55)"}
        strokeWidth={sel?1.8:1.2}
        style={sel?{filter:"drop-shadow(0 0 6px rgba(70,160,220,0.6))"}:undefined} />
      {/* Red roof stripe */}
      <rect x={x} y={y} width={52} height={6} rx={2}
        fill="rgba(200,60,50,0.55)" />
      <text x={x+26} y={y+24} textAnchor="middle"
        fill="rgba(100,190,230,0.72)" fontSize="7.5" fontWeight="700">RELAY</text>
      <text x={x+26} y={y+33} textAnchor="middle"
        fill="rgba(100,190,230,0.52)" fontSize="6.5" fontWeight="600">KIOSK</text>
      <Dot cx={x+44} cy={y+8} sample={sample} selected={sel} r={4} />
    </g>
  );
}

// ── Control building (2-story pink — AP TRANSCO, visible in all overview photos)
function ControlBuilding({ sel, sample, onSel }:
  { sel:boolean; sample?:TelemetrySample; onSel:(id:string)=>void }) {
  const id = "control-building";
  const x  = 420, w = 480;
  return (
    <g onClick={()=>onSel(id)} style={{cursor:"pointer"}}>
      {/* Building footprint */}
      <rect x={x} y={Y_BLDG_T} width={w} height={Y_BLDG_B-Y_BLDG_T} rx={3}
        fill="rgba(225,165,165,0.14)"
        stroke={sel?"rgba(255,200,200,0.75)":"rgba(220,160,160,0.48)"}
        strokeWidth={sel?2:1.4}
        style={sel?{filter:"drop-shadow(0 0 8px rgba(220,150,150,0.50))"}:undefined} />
      {/* Floor division (2-story) */}
      <line x1={x} y1={(Y_BLDG_T+Y_BLDG_B)/2} x2={x+w} y2={(Y_BLDG_T+Y_BLDG_B)/2}
        stroke="rgba(220,160,160,0.22)" strokeWidth={1} />
      {/* Arched entrance (centre, visible in front-view photo) */}
      <path d={`M${x+w/2-16} ${Y_BLDG_B} L${x+w/2-16} ${Y_BLDG_T+30} A16 20 0 0 1 ${x+w/2+16} ${Y_BLDG_T+30} L${x+w/2+16} ${Y_BLDG_B}`}
        fill="rgba(14,28,44,0.60)" stroke="rgba(220,160,160,0.35)" strokeWidth={0.9} />
      {/* Signboard strip */}
      <rect x={x+12} y={Y_BLDG_T+4} width={w-24} height={16} rx={2}
        fill="rgba(100,20,20,0.55)" />
      <text x={x+w/2} y={Y_BLDG_T+15} textAnchor="middle"
        fill="rgba(255,240,240,0.88)" fontSize="7.5" fontWeight="800" letterSpacing="0.06em">
        AP TRANSCO  ·  400/220 kV SUB STATION KALIKIRI
      </text>
      {/* Windows */}
      {[-120,-60,0,60,120].map(dx => (
        <rect key={dx} x={x+w/2+dx-12} y={Y_BLDG_T+26} width={18} height={12} rx={1}
          fill="rgba(14,30,50,0.70)" stroke="rgba(200,215,230,0.25)" strokeWidth={0.7} />
      ))}
      {[-120,-60,0,60,120].map(dx => (
        <rect key={dx+1000} x={x+w/2+dx-12} y={(Y_BLDG_T+Y_BLDG_B)/2+10} width={18} height={12} rx={1}
          fill="rgba(14,30,50,0.70)" stroke="rgba(200,215,230,0.25)" strokeWidth={0.7} />
      ))}
      {/* AC unit icons */}
      {[-100,100].map(dx => (
        <rect key={dx+2000} x={x+w/2+dx-8} y={Y_BLDG_T+24} width={12} height={8} rx={1}
          fill="rgba(180,200,220,0.20)" stroke="rgba(180,200,220,0.38)" strokeWidth={0.7} />
      ))}

      <text x={x+w/2} y={Y_BLDG_B+14} textAnchor="middle"
        fill="rgba(220,160,160,0.60)" fontSize="8.5" fontWeight="700">CONTROL & RELAY BUILDING</text>
      <Dot cx={x+w-12} cy={Y_BLDG_T+12} sample={sample} selected={sel} r={5} />
    </g>
  );
}

// ── Main gate (pink arch — "AP TRANSCO 400/220 kV SUB STATION KALIKIRI") ──────
function MainGate() {
  const cx = (BX1+BX2)/2;
  const gw = 160, gy = Y_GATE;
  return (
    <g pointerEvents="none">
      {/* Gate arch pillars */}
      <rect x={cx-gw/2-10} y={gy-24} width={14} height={32} rx={2}
        fill="rgba(225,165,165,0.40)" stroke="rgba(220,155,155,0.60)" strokeWidth={1.2} />
      <rect x={cx+gw/2-4}  y={gy-24} width={14} height={32} rx={2}
        fill="rgba(225,165,165,0.40)" stroke="rgba(220,155,155,0.60)" strokeWidth={1.2} />
      {/* Arch header */}
      <rect x={cx-gw/2-10} y={gy-32} width={gw+24} height={10} rx={2}
        fill="rgba(180,40,40,0.55)" stroke="rgba(220,155,155,0.50)" strokeWidth={0.9} />
      {/* Gate text */}
      <text x={cx} y={gy-25} textAnchor="middle"
        fill="rgba(255,235,235,0.80)" fontSize="6.5" fontWeight="800" letterSpacing="0.05em">
        AP TRANSCO  ·  400/220 kV  SUB STATION KALIKIRI
      </text>
      {/* Gate leaves */}
      <line x1={cx-gw/2+4} y1={gy-14} x2={cx-10} y2={gy-14}
        stroke="rgba(60,60,70,0.80)" strokeWidth={2.8} />
      <line x1={cx+10} y1={gy-14} x2={cx+gw/2-4} y2={gy-14}
        stroke="rgba(60,60,70,0.80)" strokeWidth={2.8} />
      {/* Guard post (red roof building) */}
      <rect x={cx-gw/2-32} y={gy-20} width={18} height={16} rx={1}
        fill="rgba(14,28,44,0.80)" stroke="rgba(140,160,175,0.35)" strokeWidth={0.8} />
      <rect x={cx-gw/2-32} y={gy-20} width={18} height={5} rx={1}
        fill="rgba(200,55,45,0.60)" />
      {/* Road approach */}
      <rect x={cx-28} y={gy} width={56} height={16} rx={0}
        fill="rgba(150,160,168,0.14)" />
    </g>
  );
}

// ── Internal access road (concrete, tree-lined — visible in photos) ────────────
function InternalRoad() {
  const cx = (BX1+BX2)/2;
  return (
    <g pointerEvents="none">
      {/* Road surface */}
      <rect x={cx-28} y={Y_BLDG_B+2} width={56} height={Y_GATE-Y_BLDG_B-2}
        fill="rgba(145,155,165,0.14)" />
      {/* Road centreline */}
      <line x1={cx} y1={Y_BLDG_B+4} x2={cx} y2={Y_GATE}
        stroke="rgba(200,215,225,0.18)" strokeWidth={1} strokeDasharray="12 8" />
      {/* Globe lamp posts (visible on both sides of road in photos) */}
      {[0,1,2,3].map(i => {
        const ry = Y_BLDG_B + 16 + i * 22;
        return (
          <g key={i}>
            <line x1={cx-38} y1={ry} x2={cx-38} y2={ry+10}
              stroke="rgba(185,200,215,0.40)" strokeWidth={1} />
            <circle cx={cx-38} cy={ry} r={3.5}
              fill="rgba(255,240,180,0.50)" stroke="rgba(255,240,180,0.65)" strokeWidth={0.6} />
            <line x1={cx+38} y1={ry} x2={cx+38} y2={ry+10}
              stroke="rgba(185,200,215,0.40)" strokeWidth={1} />
            <circle cx={cx+38} cy={ry} r={3.5}
              fill="rgba(255,240,180,0.50)" stroke="rgba(255,240,180,0.65)" strokeWidth={0.6} />
          </g>
        );
      })}
    </g>
  );
}

// ── Lightning mast — lattice tower (tall, at yard corners, visible in photos) ──
function LightningMast({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none">
      {/* Main mast pole */}
      <line x1={x} y1={y} x2={x} y2={y-40}
        stroke="rgba(170,190,210,0.55)" strokeWidth={1.8} />
      {/* Crossarms */}
      <line x1={x-10} y1={y-28} x2={x+10} y2={y-28}
        stroke="rgba(170,190,210,0.50)" strokeWidth={1.4} />
      <line x1={x-7}  y1={y-36} x2={x+7}  y2={y-36}
        stroke="rgba(170,190,210,0.45)" strokeWidth={1.2} />
      {/* Top spike */}
      <line x1={x} y1={y-40} x2={x} y2={y-50}
        stroke="rgba(170,190,210,0.65)" strokeWidth={1} />
      {/* Foundation square */}
      <rect x={x-5} y={y-2} width={10} height={6} rx={1}
        fill="rgba(130,145,160,0.35)" stroke="rgba(160,178,195,0.38)" strokeWidth={0.7} />
      {/* Lattice diagonal details */}
      <line x1={x-2} y1={y} x2={x+2} y2={y-14}
        stroke="rgba(160,180,200,0.28)" strokeWidth={0.7} />
      <line x1={x+2} y1={y} x2={x-2} y2={y-14}
        stroke="rgba(160,180,200,0.28)" strokeWidth={0.7} />
      <line x1={x-2} y1={y-14} x2={x+2} y2={y-28}
        stroke="rgba(160,180,200,0.25)" strokeWidth={0.7} />
      <line x1={x+2} y1={y-14} x2={x-2} y2={y-28}
        stroke="rgba(160,180,200,0.25)" strokeWidth={0.7} />
    </g>
  );
}

// ── Status dot ──────────────────────────────────────────────────────────────────
function Dot({ cx, cy, sample, selected, r=6 }:
  { cx:number; cy:number; sample?:TelemetrySample; selected:boolean; r?:number }) {
  const c = dotColor(sample);
  return (
    <circle cx={cx} cy={cy} r={selected?r+2:r} fill={c}
      stroke={selected?"#fff":"rgba(255,255,255,0.42)"}
      strokeWidth={selected?2:1}
      style={{filter:`drop-shadow(0 0 ${selected?6:3}px ${c})`}} />
  );
}

// ── Coordinate label ───────────────────────────────────────────────────────────
function CoordLabel() {
  return (
    <text x={VW-8} y={VH-7} textAnchor="end"
      fill="rgba(140,165,185,0.32)" fontSize="9" fontFamily="monospace">
      78.7574°E  13.6535°N  ·  AP TRANSCO Kalikiri 400/220 kV AIS  ·  SLD Rev. 01.04.2018
    </text>
  );
}
