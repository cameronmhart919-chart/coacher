import { useState, useEffect, useRef, useCallback } from "react";
import { getApps } from "firebase/app";
import {
  getFirestore, collection, doc,
  onSnapshot, addDoc, deleteDoc, setDoc,
} from "firebase/firestore";

const getDb = () => getFirestore(getApps()[0]);

// ── Field geometry ─────────────────────────────────────────────────────────────
// SVG canvas
const SW = 700, SH = 500;
// Field rectangle inside the SVG
const F = {
  x: 50, y: 25,
  w: 600, h: 450,
  get r() { return this.x + this.w; },
  get b() { return this.y + this.h; },
  los: 250,        // y-coord of line of scrimmage (centre)
  lh:  250,        // x-coord of left hash
  rh:  450,        // x-coord of right hash
  pxY: 10,         // px per yard (vertical)
  get pxX() { return this.w / 53.33; },  // px per yard (horizontal) ≈ 11.25
};

// Yard lines at ±5, ±10, ±15, ±20 yards from LOS
const YARD_OFFSETS = [-200, -150, -100, -50, 50, 100, 150, 200];
const HASH_OFFSETS = [-200, -150, -100, -50, 0, 50, 100, 150, 200];

// ── Drawing helpers ────────────────────────────────────────────────────────────
function pts2poly(pts) {
  return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function arrowHeadPts(pts) {
  if (!pts || pts.length < 2) return null;
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const L = 14, W = 0.40;
  const p1x = (b.x - L * Math.cos(ang - W)).toFixed(1);
  const p1y = (b.y - L * Math.sin(ang - W)).toFixed(1);
  const p2x = (b.x - L * Math.cos(ang + W)).toFixed(1);
  const p2y = (b.y - L * Math.sin(ang + W)).toFixed(1);
  return `${p1x},${p1y} ${b.x.toFixed(1)},${b.y.toFixed(1)} ${p2x},${p2y}`;
}

// Return a copy of pts where the last point is pulled back by `trim` px
// so the polyline ends at the arrowhead base, not its tip
function trimLastPt(pts, trim = 12) {
  if (!pts || pts.length < 2) return pts;
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  if (dist <= trim) return pts;
  const t = (dist - trim) / dist;
  return [...pts.slice(0, -1), { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }];
}

function blockTPath(pts) {
  if (!pts || pts.length < 2) return "";
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const perp = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
  const L = 12;
  const x1 = (b.x + L * Math.cos(perp)).toFixed(1);
  const y1 = (b.y + L * Math.sin(perp)).toFixed(1);
  const x2 = (b.x - L * Math.cos(perp)).toFixed(1);
  const y2 = (b.y - L * Math.sin(perp)).toFixed(1);
  return `M${x1},${y1} L${x2},${y2}`;
}

// Translate every coordinate in an SVG path string by (dx, dy)
function translatePath(d, dx, dy) {
  return d.replace(/([ML])(-?[\d.]+),(-?[\d.]+)/g,
    (_, cmd, x, y) => `${cmd}${(parseFloat(x)+dx).toFixed(1)},${(parseFloat(y)+dy).toFixed(1)}`
  );
}

// Mirror every x-coordinate in an SVG path string across the vertical line x=cx
function mirrorPathX(d, cx) {
  return d.replace(/([ML])(-?[\d.]+),(-?[\d.]+)/g,
    (_, cmd, x, y) => `${cmd}${(2*cx - parseFloat(x)).toFixed(1)},${parseFloat(y).toFixed(1)}`
  );
}

function getSvgPos(svgEl, e, snap = 5) {
  const r = svgEl.getBoundingClientRect();
  const raw = {
    x: (e.clientX - r.left) * (SW / r.width),
    y: (e.clientY - r.top) * (SH / r.height),
  };
  if (!snap) return raw;
  return { x: Math.round(raw.x / snap) * snap, y: Math.round(raw.y / snap) * snap };
}

// ── Preset routes (relative to player position) ───────────────────────────────
function routePreset(key, px, py) {
  const toCenter = px < F.x + F.w / 2 ? 1 : -1;   // +1 = right, -1 = left
  const toSide   = -toCenter;
  const clamp = pts => pts.map(p => ({
    x: Math.max(F.x + 8, Math.min(F.r - 8, p.x)),
    y: Math.max(F.y + 8, Math.min(F.b - 8, p.y)),
  }));
  const presets = {
    go:       [{ x:px,             y:py }, { x:px,                    y:py + 150 }],
    post:     [{ x:px,             y:py }, { x:px,                    y:py + 65  }, { x:px + toCenter * 65, y:py + 140 }],
    corner:   [{ x:px,             y:py }, { x:px,                    y:py + 65  }, { x:px + toSide   * 65, y:py + 140 }],
    out:      [{ x:px,             y:py }, { x:px,                    y:py + 65  }, { x:px + toSide   * 75, y:py + 65  }],
    in:       [{ x:px,             y:py }, { x:px,                    y:py + 65  }, { x:px + toCenter * 75, y:py + 65  }],
    curl:     [{ x:px,             y:py }, { x:px,                    y:py + 80  }, { x:px + toSide   * 12, y:py + 58  }],
    comeback: [{ x:px,             y:py }, { x:px,                    y:py + 105 }, { x:px + toSide   * 28, y:py + 78  }],
    slant:    [{ x:px,             y:py }, { x:px + toCenter * 12,    y:py + 18  }, { x:px + toCenter * 72, y:py + 85  }],
    flat:     [{ x:px,             y:py }, { x:px + toSide   * 85,    y:py + 22  }],
  };
  return clamp(presets[key] || presets.go);
}

const ROUTE_PRESETS = [
  { key:"go",       label:"Go"       },
  { key:"post",     label:"Post"     },
  { key:"corner",   label:"Corner"   },
  { key:"out",      label:"Out"      },
  { key:"in",       label:"In"       },
  { key:"curl",     label:"Curl"     },
  { key:"comeback", label:"Comeback" },
  { key:"slant",    label:"Slant"    },
  { key:"flat",     label:"Flat"     },
];

// ── Default position lists per side ───────────────────────────────────────────
const SIDE_POSITIONS = {
  offense: ["QB","RB","FB","WR","TE","C","G","T","OL","SE","FL","HB","SL"],
  defense: ["DE","DT","NT","LB","MLB","OLB","CB","S","FS","SS","DB","NB","WILL","MIKE","SAM","RUSH"],
  st:      ["K","P","LS","PR","KR","H","G","L1","L2","R1","R2"],
};

// Map a playbook section to its default player side
const SECTION_SIDE = { "Offense":"offense", "Defense":"defense", "Special Teams":"st" };

// ── Built-in formations ────────────────────────────────────────────────────────
// Coords in SVG/field space: LOS y=250, centre x=350. Offense lines up at/above
// the LOS and attacks +y (downfield); defence sits just below the LOS.
const _o = (position, x, y) => ({ side:"offense", position, x, y });
const _d = (position, x, y) => ({ side:"defense", position, x, y });
// Standard 5-man offensive line on the LOS
const _OL = [ _o("LT",296,250), _o("LG",323,250), _o("C",350,250), _o("RG",377,250), _o("RT",404,250) ];

const BUILTIN_FORMATIONS = [
  { name:"Trips Right", unit:"Offense", builtin:true, players:[ ..._OL,
    _o("QB",350,212), _o("RB",382,205),
    _o("WR",108,250), _o("TE",436,250), _o("WR",512,250), _o("WR",584,250) ] },
  { name:"I-Form", unit:"Offense", builtin:true, players:[ ..._OL,
    _o("QB",350,238), _o("FB",350,212), _o("RB",350,186),
    _o("TE",436,250), _o("WR",108,250), _o("WR",592,250) ] },
  { name:"Shotgun Spread", unit:"Offense", builtin:true, players:[ ..._OL,
    _o("QB",350,210), _o("RB",386,206),
    _o("WR",92,250), _o("WR",182,250), _o("WR",518,250), _o("WR",608,250) ] },
  { name:"Singleback", unit:"Offense", builtin:true, players:[ ..._OL,
    _o("QB",350,238), _o("RB",350,200),
    _o("TE",436,250), _o("WR",100,250), _o("WR",200,250), _o("WR",600,250) ] },
  { name:"4-3", unit:"Defense", builtin:true, players:[
    _d("DE",300,256), _d("DT",330,256), _d("DT",370,256), _d("DE",400,256),
    _d("LB",312,296), _d("MLB",350,296), _d("LB",388,296),
    _d("CB",110,262), _d("CB",590,262), _d("S",284,360), _d("S",416,360) ] },
  { name:"Nickel", unit:"Defense", builtin:true, players:[
    _d("DE",300,256), _d("DT",334,256), _d("DT",366,256), _d("DE",400,256),
    _d("LB",326,296), _d("LB",374,296),
    _d("CB",110,262), _d("CB",590,262), _d("NB",206,278),
    _d("S",292,360), _d("S",408,360) ] },
];

// ── Mini preview of a formation (players as dots on a small field) ──────────────
function FormationPreview({ players, size = 72 }) {
  const bw = size, bh = size * (F.h / F.w);
  const dot = p => ({ x:(p.x - F.x)/F.w*bw, y:(p.y - F.y)/F.h*bh });
  return (
    <svg width={bw} height={bh} style={{ background:"#2d6a1a", borderRadius:5, flexShrink:0 }}>
      <line x1={0} y1={(F.los-F.y)/F.h*bh} x2={bw} y2={(F.los-F.y)/F.h*bh} stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
      {players.map((p,i) => {
        const d = dot(p), off = p.side==="offense";
        return <circle key={i} cx={d.x} cy={d.y} r={2.6}
          fill={off ? "#facc15" : "#fff"} stroke={off ? "#b45309" : "#111827"} strokeWidth={0.8} />;
      })}
    </svg>
  );
}

// ── Tiny uid ───────────────────────────────────────────────────────────────────
let _uid = 0;
const uid = () => `${Date.now()}-${++_uid}`;

// ═══════════════════════════════════════════════════════════════════════════════
// ── FieldSVG — pure renderer (no event logic) ─────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function FieldSVG({
  svgRef, elements, draftPts, fhPoints, fhDrawing, livePos,
  selId, tool, dragging,
  onSvgMouseDown, onSvgMouseMove, onSvgMouseUp,
  onSvgClick, onSvgDblClick,
  onPlayerMouseDown, onElementMouseDown, onElementClick,
  tk,
}) {
  const PR = 15;  // player circle radius

  const renderEl = (el) => {
    const sel = el.id === selId;
    const selGlow = sel
      ? { filter:"drop-shadow(0 0 5px rgba(250,204,21,0.9))" }
      : {};

    if (el.type === "player") {
      const isOff = el.side === "offense";
      const fill   = isOff ? tk.primary : "#fff";
      const stroke = isOff ? "#fff"     : "#111827";
      const tc     = isOff ? "#fff"     : "#111827";
      const fs     = el.position.length > 3 ? 7 : el.position.length > 2 ? 8 : 9;
      return (
        <g key={el.id} style={{ cursor: tool === "select" ? "grab" : "crosshair", ...selGlow }}
          onMouseDown={e => onPlayerMouseDown(e, el)}
          onClick={e => { e.stopPropagation(); onElementClick(el.id); }}>
          <circle cx={el.x} cy={el.y} r={PR}
            fill={fill} stroke={isOff ? tk.primaryDark : "#111827"}
            strokeWidth={sel ? 2.5 : 1.5} />
          {/* white ring for offense so it pops against dark green */}
          {isOff && <circle cx={el.x} cy={el.y} r={PR} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />}
          <text x={el.x} y={el.y + 0.5}
            textAnchor="middle" dominantBaseline="middle"
            fill={tc} fontSize={fs} fontWeight="800" fontFamily="system-ui, sans-serif"
            style={{ pointerEvents:"none" }}>
            {el.position}
          </text>
          {sel && <circle cx={el.x} cy={el.y} r={PR + 5} fill="none" stroke="#facc15" strokeWidth={1.5} strokeDasharray="4,3" />}
        </g>
      );
    }

    if (el.type === "route" || el.type === "motion") {
      if (!el.points || el.points.length < 2) return null;
      const clr      = el.type === "motion" ? "#1d4ed8" : "#111827";
      const dash     = el.type === "motion" ? "8,5" : undefined;
      const ah       = arrowHeadPts(el.points);
      const drawPts  = trimLastPt(el.points, 12); // stop line before arrowhead tip
      // Only show dots at intermediate waypoints (not first or last)
      const midPts   = el.points.slice(1, -1);
      return (
        <g key={el.id} style={{ cursor: tool==="select" ? "grab" : "crosshair", ...selGlow }}
          onMouseDown={e => onElementMouseDown(e, el)}
          onClick={e => { e.stopPropagation(); onElementClick(el.id); }}>
          {/* fat invisible hit area */}
          <polyline points={pts2poly(el.points)} stroke="transparent" strokeWidth={12} fill="none" />
          {sel && <polyline points={pts2poly(drawPts)} stroke="#facc15" strokeWidth={6} fill="none" opacity={0.35} />}
          <polyline points={pts2poly(drawPts)} stroke={clr} strokeWidth={2.5} fill="none"
            strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" />
          {ah && <polygon points={ah} fill={clr} />}
          {midPts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill={clr} />
          ))}
        </g>
      );
    }

    if (el.type === "block") {
      if (!el.points || el.points.length < 2) return null;
      const clr  = "#7c3aed";
      const tpath = blockTPath(el.points);
      return (
        <g key={el.id} style={{ cursor: tool==="select" ? "grab" : "crosshair", ...selGlow }}
          onMouseDown={e => onElementMouseDown(e, el)}
          onClick={e => { e.stopPropagation(); onElementClick(el.id); }}>
          <polyline points={pts2poly(el.points)} stroke="transparent" strokeWidth={12} fill="none" />
          {sel && <polyline points={pts2poly(el.points)} stroke="#facc15" strokeWidth={6} fill="none" opacity={0.35} />}
          <polyline points={pts2poly(el.points)} stroke={clr} strokeWidth={2} fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
          <path d={tpath} stroke={clr} strokeWidth={3} fill="none" strokeLinecap="round" />
        </g>
      );
    }

    if (el.type === "freehand") {
      if (!el.pathData) return null;
      return (
        <g key={el.id} style={{ cursor: tool==="select" ? "grab" : "crosshair", ...selGlow }}
          onMouseDown={e => onElementMouseDown(e, el)}
          onClick={e => { e.stopPropagation(); onElementClick(el.id); }}>
          <path d={el.pathData} stroke="transparent" strokeWidth={12} fill="none" />
          {sel && <path d={el.pathData} stroke="#facc15" strokeWidth={6} fill="none" opacity={0.35} />}
          <path d={el.pathData} stroke="#111827" strokeWidth={2} fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    }

    return null;
  };

  // live draft preview line color
  const draftColor = tool === "motion" ? "#1d4ed8" : tool === "block" ? "#7c3aed" : "#111827";

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SW} ${SH}`}
      style={{ width:"100%", maxWidth:SW, height:"auto", display:"block",
        userSelect:"none", cursor: tool === "select" ? (dragging ? "grabbing" : "default") : "crosshair" }}
      onMouseDown={onSvgMouseDown}
      onMouseMove={onSvgMouseMove}
      onMouseUp={onSvgMouseUp}
      onClick={onSvgClick}
      onDoubleClick={onSvgDblClick}
    >
      {/* ── Dark surround ── */}
      <rect x={0} y={0} width={SW} height={SH} fill="#1a1a1a" />

      {/* ── Field ── */}
      <rect x={F.x} y={F.y} width={F.w} height={F.h} fill="#2d6a1a" />

      {/* End zone shading */}
      <rect x={F.x} y={F.y}           width={F.w} height={48} fill="#1e4d12" />
      <rect x={F.x} y={F.b - 48}      width={F.w} height={48} fill="#1e4d12" />
      <text x={F.x + F.w/2} y={F.y + 28} textAnchor="middle" fill="rgba(255,255,255,0.15)"
        fontSize={14} fontWeight="900" fontFamily="system-ui" letterSpacing={6}>END ZONE</text>
      <text x={F.x + F.w/2} y={F.b - 14} textAnchor="middle" fill="rgba(255,255,255,0.15)"
        fontSize={14} fontWeight="900" fontFamily="system-ui" letterSpacing={6}>END ZONE</text>

      {/* Yard lines */}
      {YARD_OFFSETS.map(dy => (
        <line key={dy}
          x1={F.x} y1={F.los + dy} x2={F.r} y2={F.los + dy}
          stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      ))}

      {/* Hash marks */}
      {HASH_OFFSETS.map(dy => (
        <g key={`hm${dy}`}>
          <line x1={F.lh - 7} y1={F.los + dy} x2={F.lh + 7} y2={F.los + dy}
            stroke="rgba(255,255,255,0.45)" strokeWidth={1.5} />
          <line x1={F.rh - 7} y1={F.los + dy} x2={F.rh + 7} y2={F.los + dy}
            stroke="rgba(255,255,255,0.45)" strokeWidth={1.5} />
        </g>
      ))}

      {/* Sideline border */}
      <rect x={F.x} y={F.y} width={F.w} height={F.h} fill="none" stroke="white" strokeWidth={2} />

      {/* LOS */}
      <line x1={F.x} y1={F.los} x2={F.r} y2={F.los} stroke="white" strokeWidth={2.5} />
      <text x={F.x + 3} y={F.los - 5} fill="rgba(255,255,255,0.6)" fontSize={9}
        fontFamily="monospace" fontWeight="700">LOS</text>

      {/* Yard labels */}
      {[
        [-200,"20"],[-150,"15"],[-100,"10"],[-50,"5"],
        [50,"5"],[100,"10"],[150,"15"],[200,"20"],
      ].map(([dy, lbl]) => (
        <text key={dy}
          x={F.x + 6} y={F.los + dy + (dy > 0 ? 12 : -4)}
          fill="rgba(255,255,255,0.35)" fontSize={8} fontFamily="monospace">{lbl}</text>
      ))}

      {/* LOS side labels */}
      <text x={F.r - 4} y={F.los - 6} fill="rgba(255,255,255,0.45)" fontSize={8}
        textAnchor="end" fontFamily="system-ui">OFF</text>
      <text x={F.r - 4} y={F.los + 14} fill="rgba(255,255,255,0.45)" fontSize={8}
        textAnchor="end" fontFamily="system-ui">DEF</text>

      {/* ── Play elements ── */}
      {elements.map(renderEl)}

      {/* ── Route/block draft preview ── */}
      {draftPts.length > 0 && livePos && (() => {
        const allPts  = [...draftPts, livePos];
        const drawPts = (tool==="route"||tool==="motion") ? trimLastPt(allPts, 12) : allPts;
        const ah      = (tool==="route"||tool==="motion") ? arrowHeadPts(allPts) : null;
        return (
          <>
            <polyline points={pts2poly(drawPts)}
              stroke={draftColor} strokeWidth={2.5} fill="none" opacity={0.55}
              strokeDasharray={tool==="motion" ? "8,5" : undefined}
              strokeLinecap="round" />
            {ah && <polygon points={ah} fill={draftColor} opacity={0.55} />}
            {draftPts.slice(1).map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill={draftColor} opacity={0.7} />
            ))}
            <circle cx={draftPts[0].x} cy={draftPts[0].y} r={3} fill={draftColor} opacity={0.7} />
            <text x={livePos.x + 6} y={livePos.y - 6}
              fill="rgba(255,255,255,0.6)" fontSize={9} fontFamily="monospace">
              click = waypoint · hold to finish
            </text>
          </>
        );
      })()}

      {/* ── Freehand live preview ── */}
      {fhDrawing && fhPoints.length > 1 && (
        <path
          d={fhPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          stroke="#111827" strokeWidth={2} fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── TacklePlaybook ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// ── Mini preview of a saved library item (offsets relative to anchor) ──────────
function LibraryPreview({ item, size = 56 }) {
  const pad = 7;
  const xs = item.points.map(p => p.dx), ys = item.points.map(p => p.dy);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  const scale = Math.min((size - pad*2) / w, (size - pad*2) / h);
  const tx = (dx, dy) => ({
    x: pad + (dx - minX) * scale + (size - pad*2 - w*scale)/2,
    y: pad + (dy - minY) * scale + (size - pad*2 - h*scale)/2,
  });
  const sp = item.points.map(tx);
  const poly = sp.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const isBlock = item.kind === "block";
  const color = isBlock ? "#7c3aed" : item.kind === "motion" ? "#1d4ed8" : "#111827";
  const a = sp[sp.length-2], b = sp[sp.length-1];
  return (
    <svg width={size} height={size} style={{ background:"#f9fafb", borderRadius:6, flexShrink:0 }}>
      <circle cx={sp[0].x} cy={sp[0].y} r={3} fill={color} />
      <polyline points={poly} fill="none" stroke={color} strokeWidth={2}
        strokeDasharray={item.kind==="motion" ? "3,2" : undefined}
        strokeLinejoin="round" strokeLinecap="round" />
      {isBlock && a && b && (() => {
        const perp = Math.atan2(b.y-a.y, b.x-a.x) + Math.PI/2, L = 5;
        return <line x1={b.x+L*Math.cos(perp)} y1={b.y+L*Math.sin(perp)}
          x2={b.x-L*Math.cos(perp)} y2={b.y-L*Math.sin(perp)} stroke={color} strokeWidth={2} />;
      })()}
    </svg>
  );
}

export default function TacklePlaybook({ instanceId, tk, playCodes = [], onAddPlayCode }) {
  const db   = getDb();
  const base = `data/${instanceId}`;

  // ── Firestore data ──────────────────────────────────────────────────────────
  const [folders, setFolders] = useState([]);
  const [plays,   setPlays]   = useState([]);
  const [library, setLibrary] = useState([]);   // saved reusable routes & blocks
  const [formationsLib, setFormationsLib] = useState([]);  // saved player formations

  useEffect(() => {
    if (!instanceId) return;
    const u1 = onSnapshot(collection(db, base, "tackle_pb_folders"),
      snap => setFolders(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, base, "tackle_pb_plays"),
      snap => setPlays(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
    const u3 = onSnapshot(collection(db, base, "tackle_pb_library"),
      snap => setLibrary(snap.docs.map(d => ({ id:d.id, ...d.data() }))
        .sort((a,b) => (a.name||"").localeCompare(b.name||""))));
    const u4 = onSnapshot(collection(db, base, "tackle_pb_formations"),
      snap => setFormationsLib(snap.docs.map(d => ({ id:d.id, ...d.data() }))
        .sort((a,b) => (a.name||"").localeCompare(b.name||""))));
    return () => { u1(); u2(); u3(); u4(); };
  }, [instanceId]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const [section,  setSection]  = useState("Offense");
  const [folderId, setFolderId] = useState(null);
  const [playId,   setPlayId]   = useState(null);

  // ── Editor state ────────────────────────────────────────────────────────────
  const [playName,    setPlayName]    = useState("");
  const [playCodeId,  setPlayCodeId]  = useState("");
  const [playerCount, setPlayerCount] = useState(11);
  const [elements,    setElements]    = useState([]);
  const [isDirty,     setIsDirty]     = useState(false);

  // ── Tool state ──────────────────────────────────────────────────────────────
  const [tool,        setTool]        = useState("select");
  const [selId,       setSelId]       = useState(null);
  const [pendingPos,  setPendingPos]  = useState(null);
  const [pendingSide, setPendingSide] = useState("offense");

  // ── Route/Block library state ─────────────────────────────────────────────────
  const [libNaming,   setLibNaming]   = useState(false);  // showing the "name this" input?
  const [libNameInput,setLibNameInput]= useState("");
  const [libOpen,     setLibOpen]     = useState(false);  // library manager modal open?

  // ── Formations state ──────────────────────────────────────────────────────────
  const [formOpen,     setFormOpen]     = useState(false); // formations modal open?
  const [formNaming,   setFormNaming]   = useState(false);
  const [formNameInput,setFormNameInput]= useState("");
  const [editingForm,  setEditingForm]  = useState(null);  // { id, name } being edited on the field

  // ── Drawing state ───────────────────────────────────────────────────────────
  const [draftPts,  setDraftPts]  = useState([]);
  const [livePos,   setLivePos]   = useState(null);
  const [fhPoints,  setFhPoints]  = useState([]);
  const [fhDrawing, setFhDrawing] = useState(false);

  // ── Undo / redo ─────────────────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // ── Dragging ────────────────────────────────────────────────────────────────
  // type:"player" → { id, type, ox, oy }
  // type:"pts"    → { id, type, origPts, startX, startY }   (route/motion/block)
  // type:"fh"     → { id, type, origPath, startX, startY }  (freehand)
  const [dragging, setDragging] = useState(null);
  const didDragRef        = useRef(false);
  const preDragSnapshot   = useRef(null);  // snapshot taken at drag-start, committed on drag-end

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  const [openFolders,      setOpenFolders]      = useState({});
  const [newFolderName,    setNewFolderName]    = useState("");
  const [addingFolderUnder,setAddingFolderUnder]= useState(null); // "root" | folderId | null
  const [newPlayName,      setNewPlayName]      = useState("");
  const [addingPlayFor,    setAddingPlayFor]    = useState(null);
  // { type:"play"|"folder", id:string } — which item is in "pick a destination" mode
  const [movingItem,       setMovingItem]       = useState(null);

  const svgRef              = useRef(null);
  // Long-press-to-finish refs
  const longPressTimerRef   = useRef(null);
  const suppressNextClickRef= useRef(false);
  const draftPtsRef         = useRef([]);   // always-current mirror of draftPts state
  const mouseDownPosRef     = useRef(null); // SVG position at last mousedown

  // Keep draftPtsRef in sync so the long-press timer can read current waypoints
  useEffect(() => { draftPtsRef.current = draftPts; }, [draftPts]);

  // ── Load play into editor ───────────────────────────────────────────────────
  useEffect(() => {
    const play = plays.find(p => p.id === playId);
    if (play) {
      setPlayName(play.name || "");
      setPlayCodeId(play.playCodeId || "");
      setPlayerCount(play.playerCount || 11);
      setElements(play.elements || []);
      setIsDirty(false);
      setSelId(null);
      setTool("select");
      setDraftPts([]);
    } else if (!playId) {
      setElements([]);
    }
  }, [playId, plays.map(p => p.id).join(",")]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!playId) return;
    await setDoc(doc(db, base, "tackle_pb_plays", playId), {
      name: playName, playCodeId: playCodeId || null,
      playerCount, elements, updatedAt: new Date().toISOString(),
    }, { merge:true });
    setIsDirty(false);
  };

  // ── Undo helpers ────────────────────────────────────────────────────────────
  const pushUndo = (snap) => {
    setUndoStack(u => [...u.slice(-29), snap]);
    setRedoStack([]);
  };
  const undo = () => {
    if (!undoStack.length) return;
    const snap = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, elements]);
    setUndoStack(u => u.slice(0, -1));
    setElements(snap);
    setIsDirty(true);
  };
  const redo = () => {
    if (!redoStack.length) return;
    const snap = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, elements]);
    setRedoStack(r => r.slice(0, -1));
    setElements(snap);
    setIsDirty(true);
  };

  // ── Element helpers ─────────────────────────────────────────────────────────
  const addEl = el => {
    pushUndo(elements);
    setElements(p => [...p, { id:uid(), ...el }]);
    setIsDirty(true);
  };
  // updateEl does NOT push undo — caller is responsible (e.g. drag start)
  const updateEl = (id, patch) => {
    setElements(p => p.map(e => e.id===id ? {...e,...patch} : e));
    setIsDirty(true);
  };
  const deleteEl = id => {
    pushUndo(elements);
    setElements(p => p.filter(e => e.id!==id));
    setIsDirty(true);
    if (selId===id) setSelId(null);
  };

  // ── Copy / Mirror selected element ──────────────────────────────────────────
  const clampX = x => Math.max(F.x + 8, Math.min(F.r - 8, x));
  const clampY = y => Math.max(F.y + 8, Math.min(F.b - 8, y));

  // Duplicate the selected element, offset slightly, and select the copy
  const copyEl = () => {
    const el = elements.find(e => e.id===selId);
    if (!el) return;
    const OFF = 24;
    let clone;
    if (el.type==="player") {
      clone = { ...el, x:clampX(el.x+OFF), y:clampY(el.y+OFF) };
    } else if (el.type==="freehand") {
      clone = { ...el, pathData:translatePath(el.pathData, OFF, OFF) };
    } else {
      clone = { ...el, points:el.points.map(p => ({ x:clampX(p.x+OFF), y:clampY(p.y+OFF) })) };
    }
    pushUndo(elements);
    const newId = uid();
    setElements(p => [...p, { ...clone, id:newId }]);
    setIsDirty(true);
    setSelId(newId);
  };

  // Mirror the selected element horizontally across the field's vertical centre
  const mirrorEl = () => {
    const el = elements.find(e => e.id===selId);
    if (!el) return;
    const cx = F.x + F.w/2;
    let patch;
    if (el.type==="player") {
      patch = { x:clampX(2*cx - el.x) };
    } else if (el.type==="freehand") {
      patch = { pathData:mirrorPathX(el.pathData, cx) };
    } else {
      patch = { points:el.points.map(p => ({ x:clampX(2*cx - p.x), y:p.y })) };
    }
    pushUndo(elements);
    updateEl(el.id, patch);
  };

  // ── Keyboard ────────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(e => {
    if (e.target.tagName==="INPUT" || e.target.tagName==="TEXTAREA" || e.target.tagName==="SELECT") return;
    if ((e.key==="Delete"||e.key==="Backspace") && selId) { e.preventDefault(); deleteEl(selId); }
    if (e.key==="d" && (e.ctrlKey||e.metaKey) && selId) { e.preventDefault(); copyEl(); }
    if ((e.key==="m"||e.key==="M") && !e.ctrlKey && !e.metaKey && selId) { e.preventDefault(); mirrorEl(); }
    if (e.key==="Escape") { setDraftPts([]); setPendingPos(null); setTool("select"); }
    if (e.key==="s" && (e.ctrlKey||e.metaKey)) { e.preventDefault(); handleSave(); }
    if (e.key==="z" && (e.ctrlKey||e.metaKey)) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if (e.key==="y" && (e.ctrlKey||e.metaKey)) { e.preventDefault(); redo(); }
  }, [selId, handleSave, undo, redo]);

  // ── SVG coord helper ────────────────────────────────────────────────────────
  const svgPos = (e, noSnap=false) => svgRef.current ? getSvgPos(svgRef.current, e, noSnap?0:5) : {x:0,y:0};

  const LONG_PRESS_MS = 400;
  const isDrawTool = t => t==="route" || t==="motion" || t==="block";

  // ── Mouse handlers ──────────────────────────────────────────────────────────
  const handleSvgMouseDown = e => {
    if (tool==="freehand") {
      setFhDrawing(true);
      setFhPoints([svgPos(e, true)]);
      return;
    }

    if (isDrawTool(tool) && draftPtsRef.current.length >= 1) {
      // At least one waypoint already placed — start long-press timer.
      // When it fires, the held position becomes the final waypoint.
      const pos = svgPos(e);
      mouseDownPosRef.current = pos;
      const capturedTool = tool;
      const capturedAddEl = addEl; // capture current addEl (fresh elements for undo)

      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        const finalPts = [...draftPtsRef.current, mouseDownPosRef.current];
        if (finalPts.length >= 2) {
          suppressNextClickRef.current = true;
          capturedAddEl({ type:capturedTool, points:finalPts });
          setDraftPts([]);
        }
      }, LONG_PRESS_MS);
    }
  };

  const handleSvgMouseMove = e => {
    const pos = svgPos(e);
    setLivePos(pos);
    if (tool==="freehand" && fhDrawing) {
      setFhPoints(p => [...p, svgPos(e, true)]);
      return;
    }
    if (dragging) {
      didDragRef.current = true;
      if (dragging.type === "player") {
        updateEl(dragging.id, { x:pos.x - dragging.ox, y:pos.y - dragging.oy });
      } else if (dragging.type === "pts") {
        const dx = pos.x - dragging.startX, dy = pos.y - dragging.startY;
        updateEl(dragging.id, { points: dragging.origPts.map(p => ({ x:p.x+dx, y:p.y+dy })) });
      } else if (dragging.type === "fh") {
        const dx = pos.x - dragging.startX, dy = pos.y - dragging.startY;
        updateEl(dragging.id, { pathData: translatePath(dragging.origPath, dx, dy) });
      }
    }
  };

  const handleSvgMouseUp = () => {
    // Cancel long-press timer on quick release (normal click → waypoint added via onClick)
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (tool==="freehand" && fhDrawing) {
      if (fhPoints.length > 2) {
        const d = fhPoints.map((p,i)=>`${i===0?"M":"L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        addEl({ type:"freehand", pathData:d });
      }
      setFhDrawing(false);
      setFhPoints([]);
    }
    // Commit undo snapshot only if an actual drag occurred
    if (dragging && didDragRef.current && preDragSnapshot.current) {
      pushUndo(preDragSnapshot.current);
    }
    preDragSnapshot.current = null;
    setDragging(null);
  };

  const handleSvgClick = e => {
    if (tool==="freehand") return;
    // Suppress click that follows a long-press finish
    if (suppressNextClickRef.current) { suppressNextClickRef.current = false; return; }
    if (didDragRef.current) { didDragRef.current = false; return; }

    const pos = svgPos(e);
    if (!pos) return;

    if (tool==="player" && pendingPos) {
      addEl({ type:"player", side:pendingSide, position:pendingPos, x:pos.x, y:pos.y });
      return;
    }
    if (isDrawTool(tool)) {
      setDraftPts(p => [...p, pos]);
      return;
    }
    if (tool==="select" && (e.target===svgRef.current || e.target.classList.contains("field-bg"))) {
      setSelId(null);
    }
  };

  // Double-click kept as a fallback finish method
  const handleSvgDblClick = e => {
    if (isDrawTool(tool) && draftPts.length >= 2) {
      addEl({ type:tool, points:[...draftPts] });
      setDraftPts([]);
    }
  };

  const handlePlayerMouseDown = (e, el) => {
    if (tool!=="select") return;
    e.stopPropagation();
    didDragRef.current = false;
    setSelId(el.id);
    const pos = svgPos(e);
    preDragSnapshot.current = elements;  // snapshot before drag
    setDragging({ id:el.id, type:"player", ox:pos.x-el.x, oy:pos.y-el.y });
  };

  const handleElementMouseDown = (e, el) => {
    if (tool!=="select") return;
    e.stopPropagation();
    didDragRef.current = false;
    setSelId(el.id);
    const pos = svgPos(e);
    preDragSnapshot.current = elements;  // snapshot before drag
    if (el.type==="route"||el.type==="motion"||el.type==="block") {
      setDragging({ id:el.id, type:"pts", origPts:[...el.points], startX:pos.x, startY:pos.y });
    } else if (el.type==="freehand") {
      setDragging({ id:el.id, type:"fh", origPath:el.pathData, startX:pos.x, startY:pos.y });
    }
  };

  const handleElementClick = id => {
    if (tool==="select") setSelId(id);
  };

  // ── Route preset ────────────────────────────────────────────────────────────
  const applyPreset = key => {
    const player = elements.find(e => e.id===selId && e.type==="player");
    if (!player) return;
    addEl({ type:"route", points:routePreset(key, player.x, player.y) });
  };

  // ── Route/Block library ───────────────────────────────────────────────────────
  // Save the selected route/motion/block as a reusable, named library item.
  // Points are stored as offsets from the first point (the anchor), plus the
  // side it was drawn on, so it can be re-anchored and auto-mirrored later.
  const isLibKind = t => t==="route" || t==="motion" || t==="block";
  const saveSelToLibrary = async () => {
    const el = elements.find(e => e.id===selId);
    const name = libNameInput.trim();
    if (!el || !isLibKind(el.type) || !name) return;
    const anchor  = el.points[0];
    const refSide = anchor.x < F.x + F.w/2 ? "left" : "right";
    const offs    = el.points.map(p => ({ dx:+(p.x-anchor.x).toFixed(1), dy:+(p.y-anchor.y).toFixed(1) }));
    await addDoc(collection(db, base, "tackle_pb_library"), {
      name, kind:el.type, refSide, points:offs, section,
      createdAt:new Date().toISOString(),
    });
    setLibNaming(false); setLibNameInput("");
  };

  // Apply a saved library item to the selected player, auto-mirroring by side.
  const applyLibraryItem = item => {
    const player = elements.find(e => e.id===selId && e.type==="player");
    if (!player) return;
    const curSide = player.x < F.x + F.w/2 ? "left" : "right";
    const flip    = curSide !== item.refSide;
    const pts = item.points.map(o => ({
      x: clampX(player.x + (flip ? -o.dx : o.dx)),
      y: clampY(player.y + o.dy),
    }));
    addEl({ type:item.kind, points:pts });
  };

  // Drop a saved library item onto the field as a standalone element (no player
  // needed). Anchored at field centre, selected so it's ready to drag.
  const placeLibraryItem = item => {
    const ax = F.x + F.w/2, ay = F.y + F.h/2;
    const pts = item.points.map(o => ({ x:clampX(ax+o.dx), y:clampY(ay+o.dy) }));
    pushUndo(elements);
    const newId = uid();
    setElements(p => [...p, { type:item.kind, points:pts, id:newId }]);
    setIsDirty(true);
    setSelId(newId);
    setTool("select");
    setLibOpen(false);
  };

  const deleteLibraryItem = async id => {
    await deleteDoc(doc(db, base, "tackle_pb_library", id));
  };

  // Close the "name this route" input whenever the selection changes
  useEffect(() => { setLibNaming(false); setLibNameInput(""); }, [selId]);

  // Exit formation-edit mode when switching to a different play
  useEffect(() => { setEditingForm(null); }, [playId]);

  // Default the player-placement side to the current section's unit
  useEffect(() => {
    setPendingSide(SECTION_SIDE[section] || "offense");
    setPendingPos(null);
  }, [section]);

  // ── Formations ────────────────────────────────────────────────────────────────
  // Apply a formation: replace the play's players with the formation's set,
  // keeping any routes/blocks already drawn.
  const applyFormation = f => {
    pushUndo(elements);
    const newPlayers = f.players.map(p => ({
      id:uid(), type:"player", side:p.side, position:p.position, x:p.x, y:p.y,
    }));
    setElements(prev => [...prev.filter(e => e.type!=="player"), ...newPlayers]);
    setIsDirty(true);
    setSelId(null);
    setEditingForm(null);   // startEditFormation re-sets this immediately after
    setFormOpen(false);
  };

  // Save the players currently on the field as a named formation for this unit.
  const saveCurrentAsFormation = async () => {
    const name = formNameInput.trim();
    const players = elements.filter(e => e.type==="player")
      .map(p => ({ side:p.side, position:p.position, x:p.x, y:p.y }));
    if (!name || players.length===0) return;
    await addDoc(collection(db, base, "tackle_pb_formations"), {
      name, unit:section, players, createdAt:new Date().toISOString(),
    });
    setFormNaming(false); setFormNameInput("");
  };

  const deleteFormation = async id => {
    await deleteDoc(doc(db, base, "tackle_pb_formations", id));
    if (editingForm?.id === id) setEditingForm(null);
  };

  // Load a saved formation onto the field for editing, then update it in place.
  const startEditFormation = f => {
    applyFormation(f);                 // drops its players onto the field
    setEditingForm({ id:f.id, name:f.name });
  };
  const saveEditedFormation = async () => {
    if (!editingForm) return;
    const name = editingForm.name.trim() || "Formation";
    const players = elements.filter(e => e.type==="player")
      .map(p => ({ side:p.side, position:p.position, x:p.x, y:p.y }));
    if (players.length === 0) return;
    await setDoc(doc(db, base, "tackle_pb_formations", editingForm.id),
      { name, players }, { merge:true });
    setEditingForm(null);
  };

  // ── Folder / play CRUD ──────────────────────────────────────────────────────
  const createFolder = async (parentId = null) => {
    if (!newFolderName.trim()) return;
    const ref = await addDoc(collection(db, base, "tackle_pb_folders"), {
      name:newFolderName.trim(), section, parentId,
      createdAt:new Date().toISOString(),
    });
    setNewFolderName(""); setAddingFolderUnder(null);
    setOpenFolders(o => {
      const next = { ...o, [ref.id]:true };
      if (parentId) next[parentId] = true;
      return next;
    });
    setFolderId(ref.id);
  };

  const deleteFolder = async id => {
    if (!window.confirm("Delete folder and all its contents?")) return;
    const recurse = async fid => {
      plays.filter(p => p.folderId===fid)
           .forEach(p => deleteDoc(doc(db, base, "tackle_pb_plays", p.id)));
      const children = folders.filter(f => f.parentId===fid);
      for (const c of children) await recurse(c.id);
      await deleteDoc(doc(db, base, "tackle_pb_folders", fid));
    };
    await recurse(id);
    if (folderId===id) { setFolderId(null); setPlayId(null); }
  };

  // Returns every folder in the current section that is NOT folderId or a descendant of it
  // (prevents moving a folder into itself or into one of its own children)
  const getFolderMoveTargets = (fid) => {
    const getDesc = id => {
      const kids = folders.filter(f => f.parentId===id);
      return [id, ...kids.flatMap(k => getDesc(k.id))];
    };
    const excluded = new Set(getDesc(fid));
    return folders.filter(f => f.section===section && !excluded.has(f.id));
  };

  const movePlay = async (pid, newFolderId) => {
    await setDoc(doc(db, base, "tackle_pb_plays", pid), { folderId:newFolderId }, { merge:true });
    setOpenFolders(o => ({ ...o, [newFolderId]:true }));
    setMovingItem(null);
  };

  const moveFolder = async (fid, newParentId) => {
    // null / "" → root level
    await setDoc(doc(db, base, "tackle_pb_folders", fid),
      { parentId: newParentId || null }, { merge:true });
    if (newParentId) setOpenFolders(o => ({ ...o, [newParentId]:true }));
    setMovingItem(null);
  };

  const duplicatePlay = async (play) => {
    const { id: _id, createdAt: _c, ...rest } = play;
    const ref = await addDoc(collection(db, base, "tackle_pb_plays"), {
      ...rest,
      name: play.name + " (copy)",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setPlayId(ref.id);
  };

  const createPlay = async forFolderId => {
    if (!newPlayName.trim()) return;
    const ref = await addDoc(collection(db, base, "tackle_pb_plays"), {
      name:newPlayName.trim(), folderId:forFolderId, section,
      playerCount:11, elements:[], playCodeId:null, notes:"",
      createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
    });
    setNewPlayName(""); setAddingPlayFor(null); setPlayId(ref.id);
  };

  const deletePlay = async id => {
    if (!window.confirm("Delete this play?")) return;
    await deleteDoc(doc(db, base, "tackle_pb_plays", id));
    if (playId===id) setPlayId(null);
  };

  const switchPlay = id => {
    if (isDirty && !window.confirm("Unsaved changes — switch anyway?")) return;
    setPlayId(id);
  };

  // ── Export as PNG ───────────────────────────────────────────────────────────
  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml  = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type:"image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = SW * 2; c.height = SH * 2;
      const ctx = c.getContext("2d");
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.download = `${playName || "play"}.png`;
      a.href = c.toDataURL("image/png");
      a.click();
    };
    img.src = url;
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const selectedPlayer = elements.find(e => e.id===selId && e.type==="player");
  const selectedEl     = elements.find(e => e.id===selId);
  const currentPlay    = plays.find(p => p.id===playId);
  const rootFolders    = folders.filter(f => f.section===section && !f.parentId);
  // Only show library items belonging to the current section (legacy items
  // saved before sections were tracked have no `section` and show everywhere).
  const inSection      = i => !i.section || i.section===section;
  const savedRoutes    = library.filter(i => (i.kind==="route" || i.kind==="motion") && inSection(i));
  const savedBlocks    = library.filter(i => i.kind==="block" && inSection(i));
  const selIsLibKind   = selectedEl && isLibKind(selectedEl.type);
  const builtinForms   = BUILTIN_FORMATIONS.filter(f => f.unit===section);
  const savedForms     = formationsLib.filter(f => f.unit===section);
  const playerCountOnField = elements.filter(e => e.type==="player").length;

  // Play codes for the current unit (legacy untagged codes count as Offense)
  const sectionPlayCodes = playCodes.filter(pc => (pc.unit||"Offense")===section);

  // ── Add the current play to the team's play-code list (if not already there) ──
  const trimmedName     = playName.trim();
  const matchingCode    = sectionPlayCodes.find(pc => (pc.code||"").toLowerCase() === trimmedName.toLowerCase());
  const canAddPlayCode  = !!onAddPlayCode && !!trimmedName && !matchingCode;
  const addPlayAsCode = () => {
    if (!canAddPlayCode) return;
    const newCode = { id: Date.now(), code: trimmedName, unit: section, category: null };
    onAddPlayCode(newCode);   // parent persists it to the play-code list
    setPlayCodeId(newCode.id); // link this play to the freshly created code
    setIsDirty(true);
  };

  // ── Recursive folder renderer ─────────────────────────────────────────────
  const renderFolder = (folder, depth=0) => {
    const isOpen   = !!openFolders[folder.id];
    const fps      = plays.filter(p => p.folderId===folder.id);
    const children = folders.filter(f => f.parentId===folder.id);
    const pl       = depth * 14; // left padding per depth level

    return (
      <div key={folder.id}>
        {/* Folder row */}
        <div style={{ display:"flex", alignItems:"center",
          padding:`5px ${10}px 5px ${10+pl}px`, cursor:"pointer",
          background:folderId===folder.id ? "#f9fafb" : "none" }}
          onClick={() => {
            setOpenFolders(o => ({ ...o, [folder.id]:!o[folder.id] }));
            setFolderId(folder.id);
          }}>
          <span style={{ fontSize:10, color:"#9ca3af", width:12, flexShrink:0 }}>
            {isOpen ? "▾" : "▸"}
          </span>
          <span style={{ fontSize:12, fontWeight:700, color:"#374151", flex:1,
            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            📁 {folder.name}
          </span>
          <span style={{ fontSize:10, color:"#d1d5db", marginRight:2 }}>({fps.length})</span>
          <button title="New subfolder"
            onClick={e => { e.stopPropagation(); setAddingFolderUnder(folder.id); setNewFolderName(""); }}
            style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:11, padding:"0 2px", lineHeight:1 }}>📁+</button>
          {/* Move folder */}
          {movingItem?.type==="folder" && movingItem?.id===folder.id ? (
            <select autoFocus
              onClick={e => e.stopPropagation()}
              onChange={e => moveFolder(folder.id, e.target.value)}
              onBlur={() => setMovingItem(null)}
              style={{ fontSize:11, padding:"2px 3px", borderRadius:4,
                border:`1.5px solid ${tk.primary}`, maxWidth:88, background:"#fff",
                color:"#111827", fontFamily:"inherit" }}>
              <option value="">↑ Root level</option>
              {getFolderMoveTargets(folder.id)
                .filter(f => f.id !== (folder.parentId||"__none__"))
                .sort((a,b)=>a.name.localeCompare(b.name))
                .map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          ) : (
            <button title="Move folder"
              onClick={e => { e.stopPropagation(); setMovingItem({type:"folder",id:folder.id}); }}
              style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:12, padding:"0 2px", lineHeight:1 }}>⇥</button>
          )}
          <button onClick={e => { e.stopPropagation(); deleteFolder(folder.id); }}
            style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:14, padding:"0 2px", lineHeight:1 }}>×</button>
        </div>

        {isOpen && (
          <div>
            {/* Subfolder input */}
            {addingFolderUnder===folder.id && (
              <div style={{ display:"flex", gap:4, padding:`4px 10px 4px ${26+pl}px` }}>
                <input autoFocus style={{ ...inp, flex:1, padding:"4px 7px", fontSize:12 }}
                  placeholder="Subfolder name" value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => {
                    if(e.key==="Enter") createFolder(folder.id);
                    if(e.key==="Escape"){ setAddingFolderUnder(null); setNewFolderName(""); }
                  }} />
                <button onClick={() => createFolder(folder.id)}
                  style={{ background:tk.buttonBg, color:"#fff", border:"none", borderRadius:4,
                    padding:"4px 9px", fontSize:11, cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>+</button>
              </div>
            )}

            {/* Child folders (recursive) */}
            {children.map(c => renderFolder(c, depth+1))}

            {/* Plays */}
            {fps.map(p => (
              <div key={p.id} style={{ display:"flex", alignItems:"center",
                padding:`5px 8px 5px ${26+pl}px`, cursor:"pointer",
                background:playId===p.id ? tk.primaryLight : "none",
                borderLeft:`3px solid ${playId===p.id ? tk.primary : "transparent"}` }}
                onClick={() => switchPlay(p.id)}>
                <span style={{ fontSize:12, flex:1, fontWeight:playId===p.id?700:400,
                  color:playId===p.id ? tk.primaryDark : "#374151",
                  whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  <span style={{ display:"inline-block", width:5, height:5, borderRadius:"50%",
                    background: playId===p.id ? tk.primary : "#cbd5e1", marginRight:7,
                    verticalAlign:"middle", flexShrink:0 }} />
                  {p.name}
                </span>
                <button title="Duplicate play"
                  onClick={e => { e.stopPropagation(); duplicatePlay(p); }}
                  style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:12, padding:"0 2px", lineHeight:1 }}>⎘</button>
                {/* Move play */}
                {movingItem?.type==="play" && movingItem?.id===p.id ? (
                  <select autoFocus
                    onClick={e => e.stopPropagation()}
                    onChange={e => { if(e.target.value) movePlay(p.id, e.target.value); }}
                    onBlur={() => setMovingItem(null)}
                    style={{ fontSize:11, padding:"2px 3px", borderRadius:4,
                      border:`1.5px solid ${tk.primary}`, maxWidth:88, background:"#fff",
                      color:"#111827", fontFamily:"inherit" }}>
                    <option value="">Move to…</option>
                    {folders.filter(f => f.section===section && f.id!==p.folderId)
                      .sort((a,b)=>a.name.localeCompare(b.name))
                      .map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                ) : (
                  <button title="Move to folder"
                    onClick={e => { e.stopPropagation(); setMovingItem({type:"play",id:p.id}); }}
                    style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:12, padding:"0 2px", lineHeight:1 }}>⇥</button>
                )}
                <button onClick={e => { e.stopPropagation(); deletePlay(p.id); }}
                  style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:14, padding:"0 2px", lineHeight:1 }}>×</button>
              </div>
            ))}

            {/* Add play */}
            {addingPlayFor===folder.id ? (
              <div style={{ display:"flex", gap:4, padding:`4px 8px 4px ${26+pl}px` }}>
                <input autoFocus style={{ ...inp, flex:1, padding:"4px 7px", fontSize:12 }}
                  placeholder="Play name" value={newPlayName}
                  onChange={e => setNewPlayName(e.target.value)}
                  onKeyDown={e => {
                    if(e.key==="Enter") createPlay(folder.id);
                    if(e.key==="Escape"){ setAddingPlayFor(null); setNewPlayName(""); }
                  }} />
                <button onClick={() => createPlay(folder.id)}
                  style={{ background:tk.buttonBg, color:"#fff", border:"none", borderRadius:4,
                    padding:"4px 9px", fontSize:11, cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>+</button>
              </div>
            ) : (
              <button onClick={() => { setAddingPlayFor(folder.id); setFolderId(folder.id); }}
                style={{ width:"100%", padding:`5px 8px 5px ${26+pl}px`, border:"none",
                  background:"none", textAlign:"left", cursor:"pointer",
                  fontFamily:"inherit", fontSize:12, color:"#9ca3af" }}>
                + Add Play
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const TOOL_BTNS = [
    { key:"select",   label:"↖ Select",   hint:"Select & drag" },
    { key:"route",    label:"→ Route",     hint:"Solid arrow (dbl-click finish)" },
    { key:"motion",   label:"⤳ Motion",   hint:"Dashed arrow" },
    { key:"block",    label:"⊥ Block",     hint:"Blocking assignment" },
    { key:"freehand", label:"✏ Free",      hint:"Freehand draw" },
    { key:"player",   label:"● Player",    hint:"Place a player" },
  ];

  const inp = { padding:"6px 10px", border:"1.5px solid #d1d5db", borderRadius:6,
    fontFamily:"inherit", fontSize:13, outline:"none", background:"#fff", color:"#111827" };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ display:"flex", height:"calc(100vh - 148px)", overflow:"hidden",
        fontFamily:"'DM Sans', system-ui, sans-serif" }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >

      {/* ════════════════════════════════════════════════════════
          SIDEBAR
      ════════════════════════════════════════════════════════ */}
      <div style={{ width:220, flexShrink:0, background:"#fff",
        borderRight:"1.5px solid #e5e7eb", display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Section tabs */}
        <div style={{ display:"flex", borderBottom:"1.5px solid #e5e7eb", flexShrink:0 }}>
          {["Offense","Defense","Special Teams"].map(s => (
            <button key={s}
              onClick={() => { setSection(s); setFolderId(null); }}
              style={{ flex:1, padding:"9px 2px", border:"none", background:"none", cursor:"pointer",
                fontFamily:"inherit", fontSize:10, fontWeight:section===s?800:500,
                color:section===s ? tk.primary : "#9ca3af",
                borderBottom:`2px solid ${section===s ? tk.primary : "transparent"}` }}>
              {s==="Special Teams" ? "ST" : s}
            </button>
          ))}
        </div>

        {/* Folder tree */}
        <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
          {rootFolders.length===0 && (
            <div style={{ padding:"20px 12px", fontSize:12, color:"#d1d5db", textAlign:"center" }}>
              No folders yet
            </div>
          )}
          {rootFolders.map(f => renderFolder(f, 0))}
        </div>

        {/* New root folder */}
        <div style={{ padding:10, borderTop:"1.5px solid #e5e7eb", flexShrink:0 }}>
          {addingFolderUnder==="root" ? (
            <div style={{ display:"flex", gap:6 }}>
              <input autoFocus style={{ ...inp, flex:1, padding:"6px 8px", fontSize:12 }}
                placeholder="Folder name" value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if(e.key==="Enter") createFolder(null);
                  if(e.key==="Escape"){ setAddingFolderUnder(null); setNewFolderName(""); }
                }} />
              <button onClick={() => createFolder(null)}
                style={{ padding:"6px 12px", background:tk.buttonBg, color:"#fff",
                  border:"none", borderRadius:6, fontWeight:700, fontSize:12,
                  cursor:"pointer", fontFamily:"inherit" }}>+</button>
            </div>
          ) : (
            <button onClick={() => { setAddingFolderUnder("root"); setNewFolderName(""); }}
              style={{ width:"100%", padding:"8px", background:tk.primaryLight,
                color:tk.primaryDark, border:`1.5px dashed ${tk.primary}`,
                borderRadius:8, cursor:"pointer", fontWeight:700,
                fontSize:12, fontFamily:"inherit" }}>
              + New Folder
            </button>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          EDITOR
      ════════════════════════════════════════════════════════ */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:"#f4f6fa" }}>

        {!playId ? (
          <div style={{ flex:1, display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center", gap:12, color:"#9ca3af" }}>
            <div style={{ fontSize:48 }}>📓</div>
            <div style={{ fontSize:15, fontWeight:700 }}>No play selected</div>
            <div style={{ fontSize:13 }}>
              Create a folder in the sidebar, then add a play.
            </div>
          </div>
        ) : (
          <>
            {/* ── Top bar ── */}
            <div style={{ padding:"8px 14px", borderBottom:"1.5px solid #e5e7eb",
              background:"#fff", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>

              <input value={playName}
                onChange={e => { setPlayName(e.target.value); setIsDirty(true); }}
                style={{ ...inp, fontWeight:700, width:160 }} />

              <select value={playCodeId}
                onChange={e => { setPlayCodeId(e.target.value); setIsDirty(true); }}
                style={{ ...inp }}>
                <option value="">— No Play Code —</option>
                {sectionPlayCodes.map(pc => (
                  <option key={pc.id} value={pc.id}>{pc.code}</option>
                ))}
              </select>

              {canAddPlayCode && (
                <button onClick={addPlayAsCode}
                  title={`Add "${trimmedName}" to your team's play codes`}
                  style={{ padding:"6px 11px", background:"#fff", color:tk.primary,
                    border:`1.5px solid ${tk.primary}`, borderRadius:6, fontWeight:700,
                    fontSize:12, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                  + Add to Play Codes
                </button>
              )}

              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:12, color:"#6b7280" }}>Players:</span>
                <select value={playerCount}
                  onChange={e => { setPlayerCount(Number(e.target.value)); setIsDirty(true); }}
                  style={{ ...inp, width:70 }}>
                  {[5,6,7,8,9,10,11].map(n => (
                    <option key={n} value={n}>{n}v{n}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex:1 }} />

              {isDirty && (
                <button onClick={handleSave}
                  style={{ padding:"6px 16px", background:tk.buttonBg, color:"#fff",
                    border:"none", borderRadius:6, fontWeight:700, fontSize:12,
                    cursor:"pointer", fontFamily:"inherit" }}>
                  Save
                </button>
              )}
              {!isDirty && currentPlay && (
                <span style={{ fontSize:11, color:"#9ca3af" }}>Saved ✓</span>
              )}
              <button onClick={() => { setFormOpen(true); setFormNaming(false); }}
                title="Apply a preset formation, or save the current players as one"
                style={{ padding:"6px 14px", background:"#f3f4f6", color:"#374151",
                  border:"1.5px solid #e5e7eb", borderRadius:6, fontWeight:700,
                  fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                ⊞ Formations
              </button>
              <button onClick={() => setLibOpen(true)}
                title="Manage your saved routes & blocks"
                style={{ padding:"6px 14px", background:"#f3f4f6", color:"#374151",
                  border:"1.5px solid #e5e7eb", borderRadius:6, fontWeight:700,
                  fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                📚 Library{(savedRoutes.length+savedBlocks.length) ? ` (${savedRoutes.length+savedBlocks.length})` : ""}
              </button>
              <button onClick={exportPng}
                style={{ padding:"6px 14px", background:"#f3f4f6", color:"#374151",
                  border:"1.5px solid #e5e7eb", borderRadius:6, fontWeight:700,
                  fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                ↓ PNG
              </button>
            </div>

            {/* ── Editing-formation banner ── */}
            {editingForm && (
              <div style={{ padding:"7px 14px", borderBottom:"1.5px solid #e5e7eb",
                background:tk.primaryLight, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{ fontSize:12, fontWeight:700, color:tk.primaryDark }}>✎ Editing formation:</span>
                <input value={editingForm.name}
                  onChange={e => setEditingForm(ef => ({ ...ef, name:e.target.value }))}
                  onKeyDown={e => { if (e.key==="Enter") saveEditedFormation(); }}
                  style={{ padding:"4px 10px", border:`1.5px solid ${tk.primary}`, borderRadius:6,
                    fontSize:12, fontFamily:"inherit", outline:"none", width:160 }} />
                <span style={{ fontSize:11, color:tk.primaryDark }}>
                  Rearrange players, then update.
                </span>
                <div style={{ flex:1 }} />
                <button onClick={saveEditedFormation}
                  style={{ padding:"5px 14px", background:tk.buttonBg, color:"#fff", border:"none",
                    borderRadius:6, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                  Update Formation
                </button>
                <button onClick={() => setEditingForm(null)}
                  style={{ padding:"5px 12px", background:"#fff", color:"#6b7280",
                    border:"1.5px solid #d1d5db", borderRadius:6, fontWeight:600, fontSize:12,
                    cursor:"pointer", fontFamily:"inherit" }}>
                  Cancel
                </button>
              </div>
            )}

            {/* ── Toolbar ── */}
            <div style={{ padding:"6px 14px", borderBottom:"1.5px solid #e5e7eb",
              background:"#fafafa", display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
              {TOOL_BTNS.map(t => (
                <button key={t.key} title={t.hint}
                  onClick={() => {
                    setTool(t.key);
                    if (t.key!=="player") setPendingPos(null);
                    setDraftPts([]);
                  }}
                  style={{ padding:"5px 11px", borderRadius:6, fontFamily:"inherit",
                    fontSize:12, cursor:"pointer", fontWeight:tool===t.key?700:500,
                    border:`1.5px solid ${tool===t.key ? tk.primary : "#d1d5db"}`,
                    background:tool===t.key ? tk.primaryLight : "#fff",
                    color:tool===t.key ? tk.primaryDark : "#374151" }}>
                  {t.label}
                </button>
              ))}
              <div style={{ flex:1 }} />
              {/* Undo / Redo */}
              <button onClick={undo} disabled={!undoStack.length} title="Undo (Ctrl+Z)"
                style={{ padding:"5px 10px", borderRadius:6, border:"1.5px solid #e5e7eb",
                  background:"#fff", color:undoStack.length?"#374151":"#d1d5db",
                  fontSize:13, cursor:undoStack.length?"pointer":"default", fontFamily:"inherit" }}>↩</button>
              <button onClick={redo} disabled={!redoStack.length} title="Redo (Ctrl+Shift+Z)"
                style={{ padding:"5px 10px", borderRadius:6, border:"1.5px solid #e5e7eb",
                  background:"#fff", color:redoStack.length?"#374151":"#d1d5db",
                  fontSize:13, cursor:redoStack.length?"pointer":"default", fontFamily:"inherit" }}>↪</button>
              <div style={{ width:1, height:20, background:"#e5e7eb" }} />
              <button
                onClick={() => { if(window.confirm("Clear all elements?")){ pushUndo(elements); setElements([]); setIsDirty(true); setSelId(null); }}}
                style={{ padding:"5px 11px", borderRadius:6, border:"1.5px solid #e5e7eb",
                  background:"#fff", color:"#9ca3af", fontSize:12,
                  cursor:"pointer", fontFamily:"inherit" }}>
                Clear
              </button>
            </div>

            {/* ── Player palette (when player tool active) ── */}
            {tool==="player" && (
              <div style={{ padding:"6px 14px", borderBottom:"1.5px solid #e5e7eb",
                background:"#f9fafb", display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                {["offense","defense","st"].map(s => (
                  <button key={s} onClick={() => { setPendingSide(s); setPendingPos(null); }}
                    style={{ padding:"3px 9px", borderRadius:99, fontSize:11,
                      fontWeight:pendingSide===s?700:500, cursor:"pointer", fontFamily:"inherit",
                      border:`1.5px solid ${pendingSide===s ? tk.primary : "#d1d5db"}`,
                      background:pendingSide===s ? tk.primary : "#fff",
                      color:pendingSide===s ? "#fff" : "#6b7280" }}>
                    {s==="st"?"ST":s.charAt(0).toUpperCase()+s.slice(1)}
                  </button>
                ))}
                <div style={{ width:1, height:20, background:"#e5e7eb", margin:"0 2px" }} />
                {SIDE_POSITIONS[pendingSide].map(pos => (
                  <button key={pos} onClick={() => setPendingPos(pos)}
                    style={{ padding:"3px 9px", borderRadius:99, fontSize:11,
                      fontWeight:pendingPos===pos?800:500, cursor:"pointer", fontFamily:"inherit",
                      border:`1.5px solid ${pendingPos===pos ? tk.primary : "#d1d5db"}`,
                      background:pendingPos===pos ? tk.primary : "#fff",
                      color:pendingPos===pos ? "#fff" : "#374151" }}>
                    {pos}
                  </button>
                ))}
                {pendingPos && (
                  <span style={{ fontSize:11, color:tk.primary, fontWeight:600, marginLeft:4 }}>
                    Click field to place {pendingPos}  ·  Esc to cancel
                  </span>
                )}
              </div>
            )}

            {/* ── Selection action bar (shown when any element is selected in select mode) ── */}
            {tool==="select" && selectedEl && (
              <div style={{ padding:"6px 14px", borderBottom:"1.5px solid #e5e7eb",
                background:"#f9fafb", display:"flex", gap:5, alignItems:"center", flexWrap:"wrap" }}>
                <button onClick={copyEl} title="Duplicate (⌘D)"
                  style={{ padding:"3px 11px", borderRadius:99, fontSize:11, fontWeight:600,
                    border:"1.5px solid #d1d5db", background:"#fff", color:"#374151",
                    cursor:"pointer", fontFamily:"inherit" }}>
                  ⧉ Copy
                </button>
                <button onClick={mirrorEl} title="Mirror to other side (M)"
                  style={{ padding:"3px 11px", borderRadius:99, fontSize:11, fontWeight:600,
                    border:"1.5px solid #d1d5db", background:"#fff", color:"#374151",
                    cursor:"pointer", fontFamily:"inherit" }}>
                  ⇄ Mirror
                </button>
                {/* Save a drawn route/block into the reusable library */}
                {selIsLibKind && (
                  libNaming ? (
                    <>
                      <input autoFocus value={libNameInput}
                        onChange={e => setLibNameInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key==="Enter") saveSelToLibrary();
                          if (e.key==="Escape") { setLibNaming(false); setLibNameInput(""); }
                        }}
                        placeholder={selectedEl.type==="block" ? "Block name…" : "Route name…"}
                        style={{ padding:"3px 8px", border:`1.5px solid ${tk.primary}`, borderRadius:99,
                          fontSize:11, fontFamily:"inherit", outline:"none", width:130 }} />
                      <button onClick={saveSelToLibrary}
                        style={{ padding:"3px 11px", borderRadius:99, fontSize:11, fontWeight:700,
                          border:"none", background:tk.buttonBg, color:"#fff", cursor:"pointer", fontFamily:"inherit" }}>
                        Save
                      </button>
                      <button onClick={() => { setLibNaming(false); setLibNameInput(""); }}
                        style={{ padding:"3px 8px", borderRadius:99, fontSize:11, fontWeight:600,
                          border:"1.5px solid #d1d5db", background:"#fff", color:"#6b7280", cursor:"pointer", fontFamily:"inherit" }}>
                        ✕
                      </button>
                    </>
                  ) : (
                    <button onClick={() => { setLibNaming(true); setLibNameInput(""); }}
                      title="Save this to your route/block library"
                      style={{ padding:"3px 11px", borderRadius:99, fontSize:11, fontWeight:600,
                        border:`1.5px solid ${tk.primary}`, background:"#fff", color:tk.primary,
                        cursor:"pointer", fontFamily:"inherit" }}>
                      ★ Save to Library
                    </button>
                  )
                )}

                {selectedPlayer && (
                  <>
                    <div style={{ width:1, height:18, background:"#e5e7eb", margin:"0 3px" }} />
                    {/* Built-in route presets are offensive — hide them in Defense */}
                    {section !== "Defense" && (
                      <>
                        <span style={{ fontSize:11, fontWeight:700, color:"#9ca3af", marginRight:4 }}>
                          ROUTES:
                        </span>
                        {ROUTE_PRESETS.map(r => (
                          <button key={r.key} onClick={() => applyPreset(r.key)}
                            style={{ padding:"3px 9px", borderRadius:99, fontSize:11, fontWeight:500,
                              border:"1.5px solid #d1d5db", background:"#fff", color:"#374151",
                              cursor:"pointer", fontFamily:"inherit" }}>
                            {r.label}
                          </button>
                        ))}
                      </>
                    )}
                    {savedRoutes.length > 0 && (
                      <>
                        <span style={{ fontSize:11, fontWeight:700, color:tk.primary, margin:"0 2px 0 6px" }}>
                          SAVED:
                        </span>
                        {savedRoutes.map(item => (
                          <button key={item.id} onClick={() => applyLibraryItem(item)}
                            title={`Apply saved route "${item.name}"`}
                            style={{ padding:"3px 9px", borderRadius:99, fontSize:11, fontWeight:600,
                              border:`1.5px solid ${tk.primary}`, background:tk.primaryLight, color:tk.primaryDark,
                              cursor:"pointer", fontFamily:"inherit" }}>
                            {item.name}
                          </button>
                        ))}
                      </>
                    )}
                    {savedBlocks.length > 0 && (
                      <>
                        <span style={{ fontSize:11, fontWeight:700, color:"#9ca3af", margin:"0 2px 0 6px" }}>
                          BLOCKS:
                        </span>
                        {savedBlocks.map(item => (
                          <button key={item.id} onClick={() => applyLibraryItem(item)}
                            title={`Apply saved block "${item.name}"`}
                            style={{ padding:"3px 9px", borderRadius:99, fontSize:11, fontWeight:600,
                              border:"1.5px solid #7c3aed", background:"#f5f3ff", color:"#6d28d9",
                              cursor:"pointer", fontFamily:"inherit" }}>
                            {item.name}
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
                <div style={{ flex:1 }} />
                <span style={{ fontSize:11, color:"#d1d5db" }}>
                  Delete key removes selection
                </span>
              </div>
            )}

            {/* ── Field ── */}
            <div style={{ flex:1, overflow:"auto", background:"#1a1a1a",
              display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
              <FieldSVG
                svgRef={svgRef}
                elements={elements}
                draftPts={draftPts}
                fhPoints={fhPoints}
                fhDrawing={fhDrawing}
                livePos={livePos}
                selId={selId}
                tool={tool}
                dragging={dragging}
                onSvgMouseDown={handleSvgMouseDown}
                onSvgMouseMove={handleSvgMouseMove}
                onSvgMouseUp={handleSvgMouseUp}
                onSvgClick={handleSvgClick}
                onSvgDblClick={handleSvgDblClick}
                onPlayerMouseDown={handlePlayerMouseDown}
                onElementMouseDown={handleElementMouseDown}
                onElementClick={handleElementClick}
                tk={tk}
              />
            </div>
          </>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════
          ROUTE & BLOCK LIBRARY — manager modal
      ════════════════════════════════════════════════════════ */}
      {libOpen && (
        <div onClick={() => setLibOpen(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:200,
            display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:"#fff", borderRadius:14, width:560, maxWidth:"100%",
              maxHeight:"82vh", overflow:"hidden", display:"flex", flexDirection:"column",
              boxShadow:"0 16px 48px rgba(0,0,0,0.3)" }}>
            <div style={{ padding:"16px 20px", borderBottom:"1.5px solid #e5e7eb",
              display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#111827", flex:1 }}>
                📚 {section} Route &amp; Block Library
              </div>
              <button onClick={() => setLibOpen(false)}
                style={{ border:"none", background:"none", fontSize:20, color:"#9ca3af",
                  cursor:"pointer", lineHeight:1 }}>✕</button>
            </div>
            <div style={{ padding:"8px 20px 20px", overflowY:"auto" }}>
              {library.length === 0 ? (
                <div style={{ padding:"32px 8px", textAlign:"center", color:"#9ca3af", fontSize:13, lineHeight:1.6 }}>
                  No saved routes or blocks yet.<br/>
                  Draw a route or block, select it, and click <b>★ Save to Library</b>.
                </div>
              ) : [["Routes", savedRoutes], ["Blocks", savedBlocks]].map(([label, items]) => (
                items.length > 0 && (
                  <div key={label} style={{ marginTop:14 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", letterSpacing:0.5, marginBottom:8 }}>
                      {label.toUpperCase()} ({items.length})
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:10 }}>
                      {items.map(item => (
                        <div key={item.id} style={{ border:"1.5px solid #e5e7eb", borderRadius:10,
                          padding:8, display:"flex", alignItems:"center", gap:8 }}>
                          <button onClick={() => placeLibraryItem(item)}
                            title="Add to the field (drag to position)"
                            style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:8,
                              border:"none", background:"none", cursor:"pointer", padding:0, textAlign:"left",
                              fontFamily:"inherit" }}>
                            <LibraryPreview item={item} />
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:"#111827",
                                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                                {item.name}
                              </div>
                              <div style={{ fontSize:10, color:tk.primary, fontWeight:600 }}>
                                + Add to field
                              </div>
                            </div>
                          </button>
                          <button onClick={() => deleteLibraryItem(item.id)}
                            title="Delete"
                            style={{ border:"none", background:"none", color:"#9ca3af",
                              cursor:"pointer", fontSize:16, lineHeight:1, padding:2 }}>🗑</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ))}
              <div style={{ marginTop:18, fontSize:11, color:"#9ca3af", lineHeight:1.5 }}>
                Tip: click any item to drop it on the field as a standalone element you can drag. Or select a player first and apply it from the action bar — that version auto-mirrors to the player's side.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          FORMATIONS — apply a preset / save current players
      ════════════════════════════════════════════════════════ */}
      {formOpen && (
        <div onClick={() => setFormOpen(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:200,
            display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:"#fff", borderRadius:14, width:600, maxWidth:"100%",
              maxHeight:"82vh", overflow:"hidden", display:"flex", flexDirection:"column",
              boxShadow:"0 16px 48px rgba(0,0,0,0.3)" }}>
            <div style={{ padding:"16px 20px", borderBottom:"1.5px solid #e5e7eb",
              display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#111827", flex:1 }}>
                ⊞ {section} Formations
              </div>
              <button onClick={() => setFormOpen(false)}
                style={{ border:"none", background:"none", fontSize:20, color:"#9ca3af",
                  cursor:"pointer", lineHeight:1 }}>✕</button>
            </div>
            <div style={{ padding:"8px 20px 20px", overflowY:"auto" }}>
              <div style={{ fontSize:12, color:"#6b7280", marginTop:8, marginBottom:4 }}>
                Click a formation to drop its players onto the field (replaces current players, keeps drawn routes/blocks).
              </div>
              {[["Presets", builtinForms], ["Your Formations", savedForms]].map(([label, items]) => (
                <div key={label} style={{ marginTop:14 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", letterSpacing:0.5, marginBottom:8 }}>
                    {label.toUpperCase()}{items.length ? ` (${items.length})` : ""}
                  </div>
                  {items.length === 0 ? (
                    <div style={{ fontSize:12, color:"#d1d5db", padding:"4px 0 8px" }}>
                      {label==="Presets" ? "No built-in formations for this unit." : "None yet — arrange players, then save below."}
                    </div>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:10 }}>
                      {items.map((f, idx) => (
                        <div key={f.id || `b${idx}`} style={{ border:"1.5px solid #e5e7eb", borderRadius:10,
                          padding:8, display:"flex", alignItems:"center", gap:8 }}>
                          <button onClick={() => applyFormation(f)}
                            title={`Apply "${f.name}"`}
                            style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:8,
                              border:"none", background:"none", cursor:"pointer", padding:0, textAlign:"left",
                              fontFamily:"inherit" }}>
                            <FormationPreview players={f.players} />
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:"#111827",
                                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                                {f.name}
                              </div>
                              <div style={{ fontSize:10, color:tk.primary, fontWeight:600 }}>
                                {f.players.length} players · apply
                              </div>
                            </div>
                          </button>
                          {!f.builtin && (
                            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                              <button onClick={() => startEditFormation(f)} title="Edit on the field"
                                style={{ border:"none", background:"none", color:"#9ca3af",
                                  cursor:"pointer", fontSize:14, lineHeight:1, padding:2 }}>✎</button>
                              <button onClick={() => deleteFormation(f.id)} title="Delete"
                                style={{ border:"none", background:"none", color:"#9ca3af",
                                  cursor:"pointer", fontSize:14, lineHeight:1, padding:2 }}>🗑</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Save current arrangement */}
              <div style={{ marginTop:18, paddingTop:16, borderTop:"1.5px solid #e5e7eb" }}>
                {formNaming ? (
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <input autoFocus value={formNameInput}
                      onChange={e => setFormNameInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key==="Enter") saveCurrentAsFormation();
                        if (e.key==="Escape") { setFormNaming(false); setFormNameInput(""); }
                      }}
                      placeholder={`Name this ${section} formation…`}
                      style={{ flex:1, padding:"8px 12px", border:`1.5px solid ${tk.primary}`,
                        borderRadius:8, fontSize:13, fontFamily:"inherit", outline:"none" }} />
                    <button onClick={saveCurrentAsFormation}
                      style={{ padding:"8px 16px", background:tk.buttonBg, color:"#fff", border:"none",
                        borderRadius:8, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                      Save
                    </button>
                    <button onClick={() => { setFormNaming(false); setFormNameInput(""); }}
                      style={{ padding:"8px 12px", background:"#fff", color:"#6b7280",
                        border:"1.5px solid #d1d5db", borderRadius:8, fontWeight:600, fontSize:13,
                        cursor:"pointer", fontFamily:"inherit" }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setFormNaming(true); setFormNameInput(""); }}
                    disabled={playerCountOnField===0}
                    title={playerCountOnField===0 ? "Place some players first" : "Save the current players as a reusable formation"}
                    style={{ padding:"9px 16px", background:playerCountOnField===0 ? "#f3f4f6" : tk.primaryLight,
                      color:playerCountOnField===0 ? "#9ca3af" : tk.primaryDark,
                      border:`1.5px dashed ${playerCountOnField===0 ? "#d1d5db" : tk.primary}`,
                      borderRadius:8, fontWeight:700, fontSize:13,
                      cursor:playerCountOnField===0 ? "default" : "pointer", fontFamily:"inherit" }}>
                    + Save current {playerCountOnField>0 ? `${playerCountOnField} ` : ""}players as a formation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
