import { useState, useEffect, useMemo } from "react";
import TacklePlaybook from "./tackle-playbook.jsx";
import { getApps } from "firebase/app";
import {
  getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, setDoc,
} from "firebase/firestore";
import { getAuth, signOut } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

// ── Re-use the Firebase app already initialised by football-coach.jsx ─────────
const getDb      = () => getFirestore(getApps()[0]);
const getAuthInst= () => getAuth(getApps()[0]);
const getStore   = () => getStorage(getApps()[0]);

// ── Firestore helpers ─────────────────────────────────────────────────────────
const tkBase   = (id) => `data/${id}`;
const tkColRef = (id, col)      => collection(getDb(), tkBase(id), col);
const tkDocRef = (id, ...segs)  => doc(getDb(), tkBase(id), ...segs);

// ── Theme helpers ─────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace("#","");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbToHex(r,g,b) {
  return "#"+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
}
function darken(hex,f)  { const [r,g,b]=hexToRgb(hex); return rgbToHex(r*f,g*f,b*f); }
function lighten(hex,f) { const [r,g,b]=hexToRgb(hex); return rgbToHex(r+(255-r)*f,g+(255-g)*f,b+(255-b)*f); }
function buildTK(primary="#be123c") {
  const dark     = darken(primary, 0.62);
  const veryDark = darken(primary, 0.30);
  const light    = lighten(primary, 0.88);
  return {
    primary,
    primaryDark:  dark,
    primaryLight: light,
    buttonBg:     dark,
    accent:       primary,
    headerBg:     `linear-gradient(135deg, ${veryDark} 0%, ${dark} 100%)`,
    red:          "#dc2626",
  };
}

// ── Theme (mutable — reassigned inside TackleCoach before each render) ────────
let TK = buildTK();

// ── Preset theme swatches ─────────────────────────────────────────────────────
const TK_PRESET_COLORS = [
  { label:"Crimson",       hex:"#be123c" },
  { label:"Maroon",        hex:"#7f1d1d" },
  { label:"Navy",          hex:"#1e3a5f" },
  { label:"Royal Blue",    hex:"#1d4ed8" },
  { label:"Purple",        hex:"#7e22ce" },
  { label:"Forest Green",  hex:"#15803d" },
  { label:"Teal",          hex:"#0f766e" },
  { label:"Orange",        hex:"#c2410c" },
  { label:"Gold",          hex:"#b45309" },
  { label:"Black",         hex:"#111827" },
];

// ── Default data ──────────────────────────────────────────────────────────────
const TK_POSITION_CATEGORIES = [
  { key:"Offense", label:"Offense" },
  { key:"Defense", label:"Defense" },
];

const TK_POSITIONS = [
  { id:1,  name:"QB",  category:"Offense" },
  { id:2,  name:"RB",  category:"Offense" },
  { id:3,  name:"FB",  category:"Offense" },
  { id:4,  name:"WR",  category:"Offense" },
  { id:5,  name:"TE",  category:"Offense" },
  { id:6,  name:"C",   category:"Offense" },
  { id:7,  name:"G",   category:"Offense" },
  { id:8,  name:"T",   category:"Offense" },
  { id:9,  name:"DE",  category:"Defense" },
  { id:10, name:"DT",  category:"Defense" },
  { id:11, name:"NT",  category:"Defense" },
  { id:12, name:"LB",  category:"Defense" },
  { id:13, name:"MLB", category:"Defense" },
  { id:14, name:"OLB", category:"Defense" },
  { id:15, name:"CB",  category:"Defense" },
  { id:16, name:"S",   category:"Defense" },
  { id:17, name:"FS",  category:"Defense" },
  { id:18, name:"SS",  category:"Defense" },
  { id:19, name:"K",   category:"" },
  { id:20, name:"P",   category:"" },
  { id:21, name:"LS",  category:"" },
];

const TK_FORMATIONS = [
  "I-Form","Split Back","Full House","Pistol","Shotgun","Single Back",
  "Wildcat","Trips","Pro","Ace","Empty","Jumbo","Goal Line",
];

const TK_PERSONNEL = ["10","11","12","13","20","21","22","00","23"];

const TK_BLOCKING_SCHEMES = [
  "Inside Zone","Outside Zone","Power","Counter","Trap","Draw",
  "Pin & Pull","Wham","Iso","Lead","Stretch","Sweep","Speed Option",
];

const TK_PLAY_TYPES = ["Run","Pass","Screen","Play Action","RPO","Option","QB Sneak","Kneel"];

const TK_PLAY_CATEGORIES = [
  { key:"Run",    label:"Run",    bg:"#fff7ed", color:"#c2410c", border:"#fed7aa" },
  { key:"Pass",   label:"Pass",   bg:"#dbeafe", color:"#1e40af", border:"#93c5fd" },
  { key:"Screen", label:"Screen", bg:"#ede9fe", color:"#5b21b6", border:"#c4b5fd" },
  { key:"RPO",    label:"RPO",    bg:"#fef3c7", color:"#92400e", border:"#fcd34d" },
];

// Defensive play-call categories
const TK_DEF_PLAY_CATEGORIES = [
  { key:"Coverage", label:"Coverage", bg:"#ecfeff", color:"#0e7490", border:"#a5f3fc" },
  { key:"Stunt",    label:"Stunt",    bg:"#f5f3ff", color:"#6d28d9", border:"#ddd6fe" },
  { key:"Blitz",    label:"Blitz",    bg:"#fef2f2", color:"#b91c1c", border:"#fecaca" },
];

// Play-call categories for a given unit ("" → flat list, no categories)
const catsForUnit = (unit) =>
  unit === "Defense" ? TK_DEF_PLAY_CATEGORIES :
  unit === "Special Teams" ? [] :
  TK_PLAY_CATEGORIES;

const TK_DIRECTIONS = ["Left","Middle","Right"];

const TK_OFF_OUTCOMES = [
  "TD","First Down","Run - Gain","Run - Loss","Pass Complete - Gain",
  "Pass Complete - Loss","Incomplete","Drop","Sack","INT","Fumble Lost",
  "Fumble Recovered","Penalty - Offense","Penalty - Defense","Spike","Kneel",
];

const TK_DEF_OUTCOMES = [
  "Tackle","TFL (Tackle For Loss)","Sack","INT","Forced Fumble","Fumble Recovery",
  "PBU (Pass Break Up)","TD Allowed","Pass Complete Allowed","Run Allowed",
  "Penalty - Defense","Penalty - Offense","Missed Tackle",
];

const TK_DEF_ACTIONS = [
  "Tackle","Assist Tackle","Sack","INT","Forced Fumble","Fumble Recovery",
  "PBU","Coverage","Blitz","Spy","Zone Drop",
];

const TK_ST_TYPES = [
  "Punt","Kickoff","Field Goal Attempt","PAT (1pt)","2pt Conversion",
  "Punt Return","Kick Return","Onside Kick",
];

const TK_ST_OUTCOMES = {
  "Punt":               ["Downed","Fair Catch","Out of Bounds","Returned","Touchback","Blocked","Muffed"],
  "Kickoff":            ["Touchback","Returned","Onside Kick - Recovered","Onside Kick - Failed"],
  "Field Goal Attempt": ["Good","Miss","Blocked"],
  "PAT (1pt)":          ["Good","Miss","Blocked","Returned for 2"],
  "2pt Conversion":     ["Good","Failed","INT","Fumble"],
  "Punt Return":        ["Gain","TD","Fumble","Fair Catch","Touchback"],
  "Kick Return":        ["Gain","TD","Fumble","Touchback"],
  "Onside Kick":        ["Recovered by Kicking Team","Recovered by Receiving Team"],
};

const TK_DEFAULT_TAGS = [
  "Red Zone","Goal Line","2-Minute Drill","4th Down","3rd & Long",
  "3rd & Short","Two Point Attempt","Opening Drive","Hurry Up","Motion",
  "Blitz Package","Empty Backfield","Play Action","RPO","Screen Game",
];

const TK_DEFAULT_GAMES = [
  "Game 1","Game 2","Game 3","Game 4","Game 5",
  "Game 6","Game 7","Game 8","Game 9","Game 10",
];

// ── Shared small components ───────────────────────────────────────────────────
function TkBadge({ color = "gray", children }) {
  const map = {
    green:  { background:"#ffe4e6", color:"#881337" },
    red:    { background:"#fee2e2", color:"#991b1b" },
    blue:   { background:"#dbeafe", color:"#1e40af" },
    yellow: { background:"#fef3c7", color:"#92400e" },
    gray:   { background:"#f3f4f6", color:"#374151" },
    purple: { background:"#ede9fe", color:"#5b21b6" },
  };
  return (
    <span style={{
      padding:"2px 10px", borderRadius:999, fontSize:12, fontWeight:700,
      fontFamily:"inherit", ...( map[color] || map.gray ),
    }}>{children}</span>
  );
}

function TkStatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background:"#fff", border:"1.5px solid #e5e7eb", borderRadius:14,
      padding:"18px 20px", display:"flex", flexDirection:"column", gap:2,
      borderLeft: accent ? `4px solid ${accent}` : undefined,
    }}>
      <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", letterSpacing:1, textTransform:"uppercase" }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:900, color:"#111827", lineHeight:1.1 }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{sub}</div>}
    </div>
  );
}

function TkCollapsible({ title, subtitle, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width:"100%", padding:"16px 24px", background:"none", border:"none", cursor:"pointer",
        display:"flex", alignItems:"center", justifyContent:"space-between", fontFamily:"inherit",
        borderLeft:`4px solid ${TK.primary}`,
      }}>
        <div style={{ textAlign:"left" }}>
          <div style={{ fontSize:16, fontWeight:800, color:"#111827" }}>{title}</div>
          {subtitle && <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{subtitle}</div>}
        </div>
        <span style={{ fontSize:18, color:"#9ca3af", transform:open?"rotate(180deg)":"rotate(0deg)", transition:"transform 0.2s" }}>▾</span>
      </button>
      {open && <div style={{ padding:"0 24px 24px" }}>{children}</div>}
    </div>
  );
}

// ── Play-code manager (one unit's play calls, optionally grouped by category) ──
function PlayCodeManager({ unit, playCodes, savePlayCodes, TK, isMobile, inp, placeholder }) {
  const categories = catsForUnit(unit);
  const [newCode, setNewCode] = useState("");
  const [newCat,  setNewCat]  = useState(categories[0]?.key || "");
  const mine = playCodes.filter(pc => (pc.unit || "Offense") === unit);
  const add = () => {
    const c = newCode.trim();
    if (!c) return;
    savePlayCodes([...playCodes, { id:Date.now(), code:c, unit, category: categories.length ? newCat : "" }]);
    setNewCode("");
  };
  const remove = id => savePlayCodes(playCodes.filter(p => p.id !== id));
  const chip = (pc, color, bg, border) => (
    <div key={pc.id} style={{ background:bg, border:`1.5px solid ${border}`, borderRadius:8, padding:"5px 12px", display:"flex", alignItems:"center", gap:6 }}>
      <span style={{ fontSize:13, fontWeight:700, color }}>{pc.code}</span>
      <button onClick={() => remove(pc.id)} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:14, padding:0, lineHeight:1 }}>×</button>
    </div>
  );
  const flat = mine.filter(pc => !categories.some(c => c.key === pc.category));
  return (
    <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
      <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:4 }}>{unit} Plays</div>
      <div style={{ fontSize:12, color:"#9ca3af", marginBottom:16 }}>
        {categories.length ? "Assign each play call to a category so they group together in the logger." : "Add your play calls for this unit."}
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <input style={{ ...inp, flex:2, minWidth:120 }} placeholder={placeholder} value={newCode}
          onChange={e => setNewCode(e.target.value)} onKeyDown={e => { if (e.key==="Enter") add(); }} />
        {categories.length > 0 && (
          <select style={{ ...inp, flex:1, minWidth:90 }} value={newCat} onChange={e => setNewCat(e.target.value)}>
            {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        )}
        <button onClick={add}
          style={{ padding:"9px 16px", background:TK.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13, whiteSpace:"nowrap" }}>Add</button>
      </div>
      {categories.map(cat => {
        const group = mine.filter(pc => pc.category === cat.key);
        if (!group.length) return null;
        return (
          <div key={cat.key} style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:800, color:cat.color, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{cat.label}</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>{group.map(pc => chip(pc, cat.color, cat.bg, cat.border))}</div>
          </div>
        );
      })}
      {flat.length > 0 && (
        <div style={{ marginBottom:8 }}>
          {categories.length > 0 && <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Uncategorized</div>}
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>{flat.map(pc => chip(pc, "#374151", "#f3f4f6", "#e5e7eb"))}</div>
        </div>
      )}
      {mine.length === 0 && <div style={{ fontSize:13, color:"#d1d5db", textAlign:"center", padding:"20px 0" }}>No plays yet. Add one above.</div>}
    </div>
  );
}

// ── Manage list helpers (reusable for simple string lists) ────────────────────
function TkStringList({ items, onAdd, onEdit, onDelete, placeholder }) {
  const [val, setVal] = useState("");
  const [editing, setEditing] = useState(null); // { index, value }
  const inp = { width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #d1d5db", fontSize:14, fontFamily:"inherit", background:"#fff", color:"#111827", boxSizing:"border-box", outline:"none" };
  return (
    <>
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <input style={{ ...inp, flex:1 }} placeholder={placeholder} value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key==="Enter" && val.trim()) { onAdd(val.trim()); setVal(""); } }} />
        <button onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(""); } }}
          style={{ padding:"9px 14px", background:TK.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Add</button>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:280, overflowY:"auto" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", background:"#f8fafc", borderRadius:8 }}>
            {editing?.index === i ? (
              <>
                <input autoFocus style={{ ...inp, flex:1, padding:"4px 8px", fontSize:13 }} value={editing.value}
                  onChange={e => setEditing(ed => ({ ...ed, value:e.target.value }))}
                  onKeyDown={e => { if(e.key==="Enter"){const v=editing.value.trim();if(v)onEdit(i,v);setEditing(null);} if(e.key==="Escape")setEditing(null); }} />
                <button onClick={() => { const v=editing.value.trim();if(v)onEdit(i,v);setEditing(null); }}
                  style={{ border:"none", background:"#ffe4e6", color:"#881337", borderRadius:6, padding:"3px 8px", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>Save</button>
                <button onClick={() => setEditing(null)} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
              </>
            ) : (
              <>
                <span style={{ fontSize:13, fontWeight:600, color:"#374151", flex:1 }}>{item}</span>
                <button onClick={() => setEditing({ index:i, value:item })} style={{ border:"none", background:"none", color:"#6b7280", cursor:"pointer", fontSize:13, padding:"0 2px" }}>✏️</button>
                <button onClick={() => { if (window.confirm(`Delete "${item}"?`)) onDelete(i); }}
                  style={{ border:"none", background:"none", color:"#ef4444", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Trend chart metrics ───────────────────────────────────────────────────────
const TK_CHART_COLORS = ["#be123c","#d97706","#7c3aed","#0284c7","#ec4899","#059669"];

const TK_OFF_METRICS = [
  { key:"yards",        label:"Total Yards" },
  { key:"yardsPerPlay", label:"Yds / Play" },
  { key:"tds",          label:"Touchdowns" },
  { key:"plays",        label:"Total Plays" },
  { key:"passPlays",    label:"Pass Plays" },
  { key:"runPlays",     label:"Run Plays" },
  { key:"firstDowns",   label:"First Downs" },
  { key:"successRate",  label:"Success Rate %" },
];

const TK_DEF_METRICS = [
  { key:"yardsAllowed",        label:"Yards Allowed" },
  { key:"yardsAllowedPerPlay", label:"Yds Allowed / Play" },
  { key:"tdsAllowed",          label:"TDs Allowed" },
  { key:"sacks",               label:"Sacks" },
  { key:"tfls",                label:"TFLs" },
  { key:"ints",                label:"INTs" },
  { key:"plays",               label:"Total Plays" },
];

// ── TkTrendChart ──────────────────────────────────────────────────────────────
function TkTrendChart({ gameData, metrics }) {
  const [tooltip, setTooltip] = useState(null);
  const W = 640, H = 240;
  const PAD = { l:52, r:24, t:20, b:56 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const n = gameData.length;
  if (!n || !metrics.length) return null;
  const xOf = (i) => PAD.l + (n > 1 ? i / (n - 1) : 0.5) * cW;
  const allVals = metrics.flatMap(m => gameData.map(d => d[m.key] ?? 0));
  const rawMax = Math.max(...allVals, 0);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax || 1)));
  const niceMax = (Math.ceil(rawMax / magnitude) * magnitude) || 5;
  const yOf = (v) => PAD.t + cH - Math.min(1, v / niceMax) * cH;
  const N_GRID = 4;
  const gridStep = niceMax / N_GRID;
  return (
    <div style={{ position:"relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:"auto", overflow:"visible" }}>
        {gameData.map((_, i) => (
          <line key={i} x1={xOf(i)} y1={PAD.t} x2={xOf(i)} y2={PAD.t+cH} stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4,3" />
        ))}
        {Array.from({ length: N_GRID + 1 }, (_, i) => {
          const val = i * gridStep; const y = yOf(val);
          const lbl = val % 1 === 0 ? String(Math.round(val)) : val.toFixed(1);
          return (
            <g key={i}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke={i===0?"#d1d5db":"#f3f4f6"} strokeWidth={i===0?1.5:1} />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" fill="#9ca3af" fontSize="11" fontFamily="system-ui">{lbl}</text>
            </g>
          );
        })}
        {gameData.map((d, i) => {
          const x = xOf(i); const lbl = d.game.length > 12 ? d.game.slice(0,11)+"…" : d.game;
          return <text key={d.game} x={x} y={PAD.t+cH+14} textAnchor="end" fill="#6b7280" fontSize="10" fontFamily="system-ui" transform={`rotate(-38,${x},${PAD.t+cH+14})`}>{lbl}</text>;
        })}
        {metrics.map((m, mi) => {
          const color = TK_CHART_COLORS[mi % TK_CHART_COLORS.length];
          if (n < 2) return null;
          const d = gameData.map((row, i) => `${i===0?"M":"L"}${xOf(i).toFixed(1)},${yOf(row[m.key]??0).toFixed(1)}`).join(" ");
          return <path key={m.key} d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />;
        })}
        {metrics.map((m, mi) => {
          const color = TK_CHART_COLORS[mi % TK_CHART_COLORS.length];
          return gameData.map((row, i) => {
            const x = xOf(i); const y = yOf(row[m.key]??0);
            const isHov = tooltip?.metricKey===m.key && tooltip?.game===row.game;
            return (
              <circle key={`${m.key}-${i}`} cx={x} cy={y} r={isHov?6:4} fill={color} stroke="#fff" strokeWidth="2"
                style={{ cursor:"pointer" }}
                onMouseEnter={() => setTooltip({ metricKey:m.key, game:row.game, val:row[m.key]??0, label:m.label, color, svgX:x, svgY:y })}
                onMouseLeave={() => setTooltip(null)} />
            );
          });
        })}
      </svg>
      {tooltip && (
        <div style={{ position:"absolute", left:`calc(${(tooltip.svgX/W*100).toFixed(1)}% + 10px)`, top:`calc(${(tooltip.svgY/H*100).toFixed(1)}% - 44px)`, background:"#881337", color:"#fff", borderRadius:8, padding:"6px 12px", fontSize:12, pointerEvents:"none", whiteSpace:"nowrap", boxShadow:"0 4px 14px rgba(0,0,0,0.25)", zIndex:10 }}>
          <div style={{ color:"#fda4af", fontSize:11 }}>{tooltip.game}</div>
          <div style={{ marginTop:2 }}><span style={{ color:tooltip.color, fontWeight:700 }}>{tooltip.label}:</span> <span style={{ fontWeight:800 }}>{typeof tooltip.val==="number"&&!Number.isInteger(tooltip.val)?tooltip.val.toFixed(1):tooltip.val}</span></div>
        </div>
      )}
    </div>
  );
}

// ── TACKLE COACH MAIN COMPONENT ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function TackleCoach({ instanceId, authUser, userProfile, onSwitchPortal }) {
  const db   = getDb();
  const auth = getAuthInst();
  const base = tkBase(instanceId);

  // ── Responsive ──────────────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // desktop slideout nav
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [tab,           setTab]           = useState("Log a Play +");
  const [logSubTab,     setLogSubTab]     = useState("Offense");
  const [analyticsSubTab, setAnalyticsSubTab] = useState("Offense");
  const [settingsTab,   setSettingsTab]   = useState("general");
  const [filterGame,    setFilterGame]    = useState("All");
  const [selectedPlayer, setSelectedPlayer] = useState(null); // for report card detail
  const [offenseTrendMetrics, setOffenseTrendMetrics] = useState(["yards"]);
  const [defenseTrendMetrics, setDefenseTrendMetrics] = useState(["yardsAllowed"]);
  const [logoUrl,          setLogoUrl]          = useState(null);
  const [logoUploading,    setLogoUploading]    = useState(false);
  const [themeColor,       setThemeColor]       = useState("#be123c");
  const [newBlockingScheme,    setNewBlockingScheme]    = useState("");
  const [newBlockingSchemeCat, setNewBlockingSchemeCat] = useState("Run");
  const [newPositionName,      setNewPositionName]      = useState("");
  const [newPositionCat,       setNewPositionCat]       = useState("Offense");

  // ── Firestore data ───────────────────────────────────────────────────────────
  const [plays,         setPlays]         = useState([]);
  const [defPlays,      setDefPlays]      = useState([]);
  const [stPlays,       setStPlays]       = useState([]);
  const [players,       setPlayers]       = useState([]);
  const [games,         setGames]         = useState(TK_DEFAULT_GAMES);
  const [positions,     setPositions]     = useState(TK_POSITIONS);
  const [formations,    setFormations]    = useState(TK_FORMATIONS);
  const [personnel,     setPersonnel]     = useState(TK_PERSONNEL);
  const [blockingSchemes, setBlockingSchemes] = useState(TK_BLOCKING_SCHEMES);
  const [offOutcomes,   setOffOutcomes]   = useState(TK_OFF_OUTCOMES);
  const [defOutcomes,   setDefOutcomes]   = useState(TK_DEF_OUTCOMES);
  const [defActions,    setDefActions]    = useState(TK_DEF_ACTIONS);
  const [stOutcomes,    setStOutcomes]    = useState(TK_ST_OUTCOMES);
  const [tags,          setTags]          = useState(TK_DEFAULT_TAGS);
  const [playCodes,     setPlayCodes]     = useState([]);
  const [gameScores,    setGameScores]    = useState({});
  const [playerNotes,   setPlayerNotes]   = useState({}); // { [playerId]: string }

  // ── Firestore subscriptions ──────────────────────────────────────────────────
  useEffect(() => {
    if (!instanceId) return;
    const unsubs = [];
    const listenCol = (name, setter) => {
      const unsub = onSnapshot(collection(db, base, name), snap => {
        setter(snap.docs.map(d => ({ id:d.id, ...d.data() }))
          .sort((a,b) => (b.timestamp||"").localeCompare(a.timestamp||"")));
      });
      unsubs.push(unsub);
    };
    const listenDoc = (name, setter) => {
      const unsub = onSnapshot(doc(db, base, name), snap => {
        if (snap.exists()) setter(snap.data());
      });
      unsubs.push(unsub);
    };
    listenCol("tackle_plays",    setPlays);
    listenCol("tackle_defPlays", setDefPlays);
    listenCol("tackle_stPlays",  setStPlays);
    listenDoc("tackle_config/games",          snap => setGames(snap.games || TK_DEFAULT_GAMES));
    listenDoc("tackle_config/players",        snap => setPlayers(snap.players || []));
    listenDoc("tackle_config/positions", snap => {
      const raw = snap.positions || TK_POSITIONS;
      setPositions(raw.map((p, i) => typeof p === "string" ? { id: Date.now() + i, name: p, category: "" } : p));
    });
    listenDoc("tackle_config/formations",     snap => setFormations(snap.formations || TK_FORMATIONS));
    listenDoc("tackle_config/personnel",      snap => setPersonnel(snap.personnel || TK_PERSONNEL));
    listenDoc("tackle_config/blockingSchemes", snap => {
      const raw = snap.schemes || TK_BLOCKING_SCHEMES;
      // normalise legacy plain strings to { id, name, category } objects
      setBlockingSchemes(raw.map((s, i) => typeof s === "string" ? { id: Date.now() + i, name: s, category: "" } : s));
    });
    listenDoc("tackle_config/offOutcomes",    snap => setOffOutcomes(snap.outcomes || TK_OFF_OUTCOMES));
    listenDoc("tackle_config/defOutcomes",    snap => setDefOutcomes(snap.outcomes || TK_DEF_OUTCOMES));
    listenDoc("tackle_config/defActions",     snap => setDefActions(snap.actions || TK_DEF_ACTIONS));
    listenDoc("tackle_config/stOutcomes",     snap => setStOutcomes(snap.outcomes || TK_ST_OUTCOMES));
    listenDoc("tackle_config/tags",           snap => setTags(snap.tags || TK_DEFAULT_TAGS));
    listenDoc("tackle_config/playCodes",      snap => setPlayCodes(snap.codes || []));
    listenDoc("tackle_config/gameScores",     snap => setGameScores(snap || {}));
    listenDoc("tackle_config/playerNotes",    snap => setPlayerNotes(snap.notes || {}));
    listenDoc("tackle_config/settings", snap => {
      setLogoUrl(snap.logoUrl || null);
      if (snap.themeColor) setThemeColor(snap.themeColor);
    });
    return () => unsubs.forEach(u => u());
  }, [instanceId]);

  // ── Save helpers ─────────────────────────────────────────────────────────────
  const saveDoc = (name, data) => setDoc(doc(db, base, name), data, { merge:true });
  const saveGames     = (v) => saveDoc("tackle_config/games",          { games:v });
  const savePlayers   = (v) => saveDoc("tackle_config/players",        { players:v });
  const savePositions = (v) => saveDoc("tackle_config/positions",      { positions:v });
  const saveFormations= (v) => saveDoc("tackle_config/formations",     { formations:v });
  const savePersonnel = (v) => saveDoc("tackle_config/personnel",      { personnel:v });
  const saveBlockingSchemes = (v) => saveDoc("tackle_config/blockingSchemes", { schemes:v });
  const saveOffOutcomes = (v) => saveDoc("tackle_config/offOutcomes",  { outcomes:v });
  const saveDefOutcomes = (v) => saveDoc("tackle_config/defOutcomes",  { outcomes:v });
  const saveDefActions  = (v) => saveDoc("tackle_config/defActions",   { actions:v });
  const saveStOutcomes  = (v) => saveDoc("tackle_config/stOutcomes",   { outcomes:v });
  const saveTags        = (v) => saveDoc("tackle_config/tags",         { tags:v });
  const savePlayCodes   = (v) => saveDoc("tackle_config/playCodes",    { codes:v });
  const saveGameScore   = (game, score) => saveDoc("tackle_config/gameScores", { [game]:score }, { merge:true });
  const savePlayerNote  = (pid, note) => saveDoc("tackle_config/playerNotes", { notes:{ ...playerNotes, [pid]:note } });

  const handleLogoUpload = async (file) => {
    setLogoUploading(true);
    try {
      const storageRef = ref(getStore(), `instances/${instanceId}/tackle_logo`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setLogoUrl(url);
      await setDoc(doc(db, base, "tackle_config/settings"), { logoUrl: url }, { merge: true });
    } catch (e) {
      alert("Logo upload failed: " + e.message);
    } finally {
      setLogoUploading(false);
    }
  };

  const saveThemeColor = (hex) => saveDoc("tackle_config/settings", { themeColor: hex });

  const handleLogoDelete = async () => {
    try {
      const storageRef = ref(getStore(), `instances/${instanceId}/tackle_logo`);
      await deleteObject(storageRef);
    } catch (_) { /* file may not exist */ }
    setLogoUrl(null);
    await setDoc(doc(db, base, "tackle_config/settings"), { logoUrl: null }, { merge: true });
  };

  // ── Offensive form ───────────────────────────────────────────────────────────
  const initOffForm = () => ({
    game: games[0] || "Game 1", quarter:"1", down:"1", distance:"10",
    yardLine:"", territory:"own", hash:"middle",
    formation:"", personnel:"11", playCode:"", playType:"", direction:"",
    blockingScheme:"", tags:[],
    qb:"", carrier:"", receiver:"",
    yardsGained:"", outcome:"", notes:"",
  });
  const [form, setForm] = useState(initOffForm);
  const f = (k, v) => setForm(p => ({ ...p, [k]:v }));
  const toggleTag = (tag) => setForm(p => ({
    ...p, tags: p.tags.includes(tag) ? p.tags.filter(t => t !== tag) : [...p.tags, tag],
  }));

  const handleLogPlay = async () => {
    if (!form.outcome || !form.playType) return;
    await addDoc(collection(db, base, "tackle_plays"), {
      ...form,
      yardsGained: Number(form.yardsGained) || 0,
      timestamp: new Date().toISOString(),
    });
    setForm(p => ({
      ...initOffForm(),
      game: p.game, quarter: p.quarter,
      down: String(Math.min(4, Number(p.down) + 1)),
      formation: p.formation, personnel: p.personnel,
    }));
  };

  const deletePlay = (id) => deleteDoc(doc(db, base, "tackle_plays", id));

  // ── Defensive form ───────────────────────────────────────────────────────────
  const initDefForm = () => ({
    game: games[0] || "Game 1", quarter:"1", down:"1", distance:"10",
    playType:"", playCode:"", outcome:"",
    primaryTackler:"", secondaryTackler:"", playerAction:"",
    yardsAllowed:"", notes:"",
  });
  const [defForm, setDefForm] = useState(initDefForm);
  const df = (k, v) => setDefForm(p => ({ ...p, [k]:v }));

  const handleLogDefPlay = async () => {
    if (!defForm.outcome) return;
    await addDoc(collection(db, base, "tackle_defPlays"), {
      ...defForm,
      yardsAllowed: Number(defForm.yardsAllowed) || 0,
      timestamp: new Date().toISOString(),
    });
    setDefForm(p => ({
      ...initDefForm(),
      game: p.game, quarter: p.quarter,
      down: String(Math.min(4, Number(p.down) + 1)),
    }));
  };

  const deleteDefPlay = (id) => deleteDoc(doc(db, base, "tackle_defPlays", id));

  // ── Special teams form ───────────────────────────────────────────────────────
  const initStForm = () => ({
    game: games[0] || "Game 1", quarter:"1",
    stType: "Punt", side:"offense",
    player:"", yardage:"", fieldGoalDist:"",
    playCode:"", outcome:"", notes:"",
  });
  const [stForm, setStForm] = useState(initStForm);
  const stf = (k, v) => setStForm(p => ({ ...p, [k]:v }));

  const handleLogStPlay = async () => {
    if (!stForm.outcome) return;
    await addDoc(collection(db, base, "tackle_stPlays"), {
      ...stForm,
      yardage: Number(stForm.yardage) || 0,
      fieldGoalDist: Number(stForm.fieldGoalDist) || 0,
      timestamp: new Date().toISOString(),
    });
    setStForm(p => ({ ...initStForm(), game:p.game, quarter:p.quarter, stType:p.stType }));
  };

  const deleteStPlay = (id) => deleteDoc(doc(db, base, "tackle_stPlays", id));

  // ── Player management ─────────────────────────────────────────────────────────
  const [newPlayer, setNewPlayer] = useState({ name:"", number:"", positions:[] });
  const [editingPlayer, setEditingPlayer] = useState(null);

  // ── Analytics ────────────────────────────────────────────────────────────────
  const filteredOffPlays = useMemo(() =>
    filterGame === "All" ? plays : plays.filter(p => p.game === filterGame),
  [plays, filterGame]);
  const filteredDefPlays = useMemo(() =>
    filterGame === "All" ? defPlays : defPlays.filter(p => p.game === filterGame),
  [defPlays, filterGame]);
  const filteredStPlays = useMemo(() =>
    filterGame === "All" ? stPlays : stPlays.filter(p => p.game === filterGame),
  [stPlays, filterGame]);

  // ── Helper: get all positions for a player (supports legacy single string) ──
  const getPositions = (pl) => pl.positions?.length ? pl.positions : (pl.position ? [pl.position] : []);

  // ── Per-game trend data ───────────────────────────────────────────────────────
  const offByGame = useMemo(() => {
    return games.map(game => {
      const gp = plays.filter(p => p.game === game);
      if (!gp.length) return null;
      const yards = gp.reduce((a,b) => a+(Number(b.yardsGained)||0), 0);
      const passP = gp.filter(p => ["Pass","Play Action","RPO","Screen"].includes(p.playType));
      const runP  = gp.filter(p => ["Run","Option","QB Sneak","Kneel"].includes(p.playType));
      return {
        game,
        plays:        gp.length,
        yards,
        yardsPerPlay: gp.length ? +(yards/gp.length).toFixed(1) : 0,
        tds:          gp.filter(p => p.outcome==="TD").length,
        passPlays:    passP.length,
        runPlays:     runP.length,
        firstDowns:   gp.filter(p => p.outcome==="First Down"||p.outcome==="TD").length,
        successRate:  gp.length ? Math.round(gp.filter(p => p.outcome==="TD"||p.outcome==="First Down"||(Number(p.yardsGained)||0)>0).length/gp.length*100) : 0,
      };
    }).filter(Boolean);
  }, [plays, games]);

  const defByGame = useMemo(() => {
    return games.map(game => {
      const gp = defPlays.filter(p => p.game === game);
      if (!gp.length) return null;
      const ya = gp.reduce((a,b) => a+(Number(b.yardsAllowed)||0), 0);
      return {
        game,
        plays:               gp.length,
        yardsAllowed:        ya,
        yardsAllowedPerPlay: gp.length ? +(ya/gp.length).toFixed(1) : 0,
        tdsAllowed:          gp.filter(p => p.outcome?.includes("TD Allowed")).length,
        sacks:               gp.filter(p => p.outcome?.includes("Sack")).length,
        tfls:                gp.filter(p => p.outcome?.includes("TFL")).length,
        ints:                gp.filter(p => p.outcome?.includes("INT")).length,
      };
    }).filter(Boolean);
  }, [defPlays, games]);

  // ── Per-player analytics memos ────────────────────────────────────────────────
  const byPlayerOff = useMemo(() => {
    const map = {};
    players.forEach(pl => {
      map[pl.id] = { id:pl.id, name:pl.name, positions:getPositions(pl), carries:0, rushYards:0, rushTDs:0, targets:0, receptions:0, recYards:0, recTDs:0 };
    });
    filteredOffPlays.forEach(p => {
      if (p.carrier && map[p.carrier]) {
        const s = map[p.carrier];
        s.carries++;
        s.rushYards += Number(p.yardsGained)||0;
        if (p.outcome==="TD") s.rushTDs++;
      }
      if (p.receiver && map[p.receiver]) {
        const s = map[p.receiver];
        s.targets++;
        if (!["Incomplete","Drop"].includes(p.outcome) && p.outcome) {
          s.receptions++;
          s.recYards += Number(p.yardsGained)||0;
        }
        if (p.outcome==="TD") s.recTDs++;
      }
    });
    return Object.values(map)
      .filter(p => p.carries>0 || p.targets>0)
      .sort((a,b) => (b.carries+b.targets)-(a.carries+a.targets));
  }, [filteredOffPlays, players]);

  const byPlayerDef = useMemo(() => {
    const map = {};
    players.forEach(pl => {
      map[pl.id] = { id:pl.id, name:pl.name, positions:getPositions(pl), tackles:0, assists:0, tfls:0, sacks:0, ints:0, forcedFumbles:0, pbu:0 };
    });
    filteredDefPlays.forEach(p => {
      if (p.primaryTackler && map[p.primaryTackler]) {
        const s = map[p.primaryTackler];
        s.tackles++;
        if (p.outcome?.includes("TFL"))           s.tfls++;
        if (p.outcome?.includes("Sack"))          s.sacks++;
        if (p.outcome?.includes("INT"))           s.ints++;
        if (p.outcome?.includes("Forced Fumble")) s.forcedFumbles++;
        if (p.playerAction?.includes("PBU"))      s.pbu++;
      }
      if (p.secondaryTackler && p.secondaryTackler !== p.primaryTackler && map[p.secondaryTackler]) {
        map[p.secondaryTackler].assists++;
      }
    });
    return Object.values(map)
      .filter(p => p.tackles>0 || p.assists>0 || p.ints>0)
      .sort((a,b) => (b.tackles+b.assists)-(a.tackles+a.assists));
  }, [filteredDefPlays, players]);

  const byFormation = useMemo(() => {
    const map = {};
    filteredOffPlays.forEach(p => {
      const f = p.formation || "Unknown";
      if (!map[f]) map[f] = { formation:f, plays:0, yards:0, tds:0, firstDowns:0, pass:0, run:0 };
      const s = map[f];
      s.plays++;
      s.yards += Number(p.yardsGained)||0;
      if (p.outcome==="TD") s.tds++;
      if (p.outcome==="First Down"||p.outcome==="TD") s.firstDowns++;
      if (["Pass","Play Action","RPO","Screen"].includes(p.playType)) s.pass++;
      else s.run++;
    });
    return Object.values(map).sort((a,b) => b.plays-a.plays);
  }, [filteredOffPlays]);

  const byDown = useMemo(() => {
    const map = { "1":{down:"1st",plays:0,yards:0,success:0}, "2":{down:"2nd",plays:0,yards:0,success:0}, "3":{down:"3rd",plays:0,yards:0,success:0}, "4":{down:"4th",plays:0,yards:0,success:0} };
    filteredOffPlays.forEach(p => {
      const d = p.down;
      if (!map[d]) return;
      map[d].plays++;
      map[d].yards += Number(p.yardsGained)||0;
      if (p.outcome==="TD"||p.outcome==="First Down"||(Number(p.yardsGained)||0)>0) map[d].success++;
    });
    return Object.values(map).map(s => ({
      ...s,
      yardsPerPlay:  s.plays>0 ? +(s.yards/s.plays).toFixed(1) : 0,
      successRate:   s.plays>0 ? Math.round(s.success/s.plays*100) : 0,
    }));
  }, [filteredOffPlays]);

  // ── Play-code (play call) breakdowns per unit ─────────────────────────────────
  const byOffCode = useMemo(() => {
    const map = {};
    filteredOffPlays.forEach(p => {
      if (!p.playCode) return;
      if (!map[p.playCode]) map[p.playCode] = { code:p.playCode, plays:0, yards:0, tds:0, firstDowns:0 };
      const s = map[p.playCode];
      s.plays++; s.yards += Number(p.yardsGained)||0;
      if (p.outcome==="TD") s.tds++;
      if (p.outcome==="First Down"||p.outcome==="TD") s.firstDowns++;
    });
    return Object.values(map).sort((a,b) => b.plays-a.plays);
  }, [filteredOffPlays]);

  const byDefCode = useMemo(() => {
    const map = {};
    filteredDefPlays.forEach(p => {
      if (!p.playCode) return;
      if (!map[p.playCode]) map[p.playCode] = { code:p.playCode, plays:0, yardsAllowed:0, tdsAllowed:0, sacks:0, tfls:0, ints:0 };
      const s = map[p.playCode];
      s.plays++; s.yardsAllowed += Number(p.yardsAllowed)||0;
      if (p.outcome?.includes("TD Allowed")) s.tdsAllowed++;
      if (p.outcome?.includes("Sack")) s.sacks++;
      if (p.outcome?.includes("TFL")) s.tfls++;
      if (p.outcome?.includes("INT")) s.ints++;
    });
    return Object.values(map).sort((a,b) => b.plays-a.plays);
  }, [filteredDefPlays]);

  const byStCode = useMemo(() => {
    const map = {};
    filteredStPlays.forEach(p => {
      if (!p.playCode) return;
      if (!map[p.playCode]) map[p.playCode] = { code:p.playCode, plays:0, yards:0 };
      const s = map[p.playCode];
      s.plays++; s.yards += Number(p.yardage)||0;
    });
    return Object.values(map).sort((a,b) => b.plays-a.plays);
  }, [filteredStPlays]);

  // ── Rebuild theme for this render ────────────────────────────────────────────
  TK = buildTK(themeColor);

  // ── Styles ───────────────────────────────────────────────────────────────────
  const inp = { width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #d1d5db", fontSize:14, fontFamily:"inherit", background:"#fff", color:"#111827", boxSizing:"border-box", outline:"none" };
  const mInp = isMobile ? { ...inp, padding:"13px 14px", fontSize:16, minHeight:48 } : inp;
  const lbl = { fontSize:12, fontWeight:700, color:"#374151", marginBottom:4, display:"block", letterSpacing:0.3 };
  const sectionHdr = { fontSize:11, fontWeight:800, color:TK.primary, textTransform:"uppercase", letterSpacing:1, marginBottom:10, marginTop:4 };
  const cols2 = "1fr 1fr";
  const cols3 = isMobile ? "1fr 1fr" : "1fr 1fr 1fr";
  const cols4 = isMobile ? "1fr 1fr" : "repeat(4, 1fr)";

  // ── Toggle button row (hash / territory / direction) ────────────────────────
  const BtnGroup = ({ options, value, onChange, color = TK.buttonBg }) => (
    <div style={{ display:"flex", gap:6 }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} style={{
          flex:1, padding: isMobile ? "12px 4px" : "9px 4px",
          borderRadius:8, border:`1.5px solid ${value===o ? color : "#d1d5db"}`,
          background: value===o ? color : "#fff",
          color: value===o ? "#fff" : "#374151",
          fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit",
        }}>{o.charAt(0).toUpperCase() + o.slice(1)}</button>
      ))}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // ── RENDER ───────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  const TABS = ["Log a Play +","Play History","Analytics","Playbook","Settings"];

  return (
    <div style={{ minHeight:"100vh", background:"#f4f6fa", fontFamily:"'DM Sans', system-ui, sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background:TK.headerBg, boxShadow:"0 4px 24px rgba(0,0,0,0.25)" }}>
        <div style={{ maxWidth: isMobile ? undefined : 980, margin:"0 auto", padding: isMobile ? "14px 16px 0" : "20px 24px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom: isMobile ? 12 : 18 }}>
            {!isMobile && (
              <button onClick={() => setNavOpen(true)} title="Menu"
                style={{ width:38, height:38, borderRadius:10, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", fontSize:18, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit" }}>
                ☰
              </button>
            )}
            <div style={{ width:38, height:38, borderRadius:10, background:"rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0, overflow:"hidden" }}>
              {logoUrl
                ? <img src={logoUrl} alt="logo" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : "🏈"}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize: isMobile ? 16 : 20, fontWeight:900, color:"#fff", letterSpacing:-0.5 }}>Coacher <span style={{ fontSize:12, fontWeight:600, background:"rgba(255,255,255,0.15)", padding:"2px 8px", borderRadius:999, marginLeft:6, verticalAlign:"middle" }}>Tackle</span></div>
              {!isMobile && <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)", marginTop:1 }}>{userProfile?.name || authUser?.email} · {userProfile?.role === "admin" ? "Admin" : "Coach"}</div>}
            </div>
            <button onClick={onSwitchPortal}
              style={{ padding:"6px 12px", background:"rgba(255,255,255,0.12)", color:"#fff", border:"1px solid rgba(255,255,255,0.25)", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
              ⇄ {isMobile ? "" : "Switch Portal"}
            </button>
            {!isMobile && (
              <button onClick={() => signOut(auth)}
                style={{ padding:"6px 12px", background:"rgba(255,255,255,0.10)", color:"rgba(255,255,255,0.8)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                Sign Out
              </button>
            )}
          </div>
          {/* Current-tab label (desktop) — full nav lives in the slideout */}
          {!isMobile && (
            <div style={{ display:"flex", alignItems:"center", gap:8, paddingBottom:12 }}>
              <span style={{ fontSize:15, fontWeight:800, color:"#fff" }}>{tab === "Log a Play +" ? "Log a Play" : tab}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop slideout nav ───────────────────────────────────────────── */}
      {!isMobile && navOpen && (
        <div onClick={() => setNavOpen(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:300 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position:"absolute", top:0, left:0, bottom:0, width:264, background:"#fff",
              boxShadow:"4px 0 24px rgba(0,0,0,0.2)", display:"flex", flexDirection:"column", fontFamily:"inherit" }}>
            <div style={{ padding:"18px 20px", background:TK.headerBg, display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:9, background:"rgba(255,255,255,0.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:19, overflow:"hidden" }}>
                {logoUrl ? <img src={logoUrl} alt="logo" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : "🏈"}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:900, color:"#fff" }}>Coacher</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{userProfile?.name || authUser?.email}</div>
              </div>
              <button onClick={() => setNavOpen(false)}
                style={{ border:"none", background:"none", color:"rgba(255,255,255,0.8)", fontSize:20, cursor:"pointer", lineHeight:1 }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"10px 0" }}>
              {TABS.map(t => {
                const active = tab === t;
                return (
                  <button key={t} onClick={() => { setTab(t); setNavOpen(false); }}
                    style={{ width:"100%", padding:"13px 22px", textAlign:"left", border:"none",
                      background: active ? TK.primaryLight : "none",
                      borderLeft: `3px solid ${active ? TK.primary : "transparent"}`,
                      color: active ? TK.primaryDark : "#374151",
                      fontWeight: active ? 800 : 600, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
                    {t === "Log a Play +" ? "Log a Play" : t}
                  </button>
                );
              })}
            </div>
            <div style={{ borderTop:"1.5px solid #e5e7eb", padding:"10px 0" }}>
              <button onClick={() => { onSwitchPortal(); setNavOpen(false); }}
                style={{ width:"100%", padding:"13px 22px", textAlign:"left", border:"none", background:"none", color:"#374151", fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
                ⇄ Switch Portal
              </button>
              <button onClick={() => signOut(auth)}
                style={{ width:"100%", padding:"13px 22px", textAlign:"left", border:"none", background:"none", color:"#dc2626", fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
                🚪 Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile bottom nav ──────────────────────────────────────────────── */}
      {isMobile && (
        <>
          {mobileMoreOpen && (
            <div onClick={() => setMobileMoreOpen(false)}
              style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:200 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ position:"absolute", bottom:64, left:0, right:0, background:"#fff", borderRadius:"20px 20px 0 0", padding:"12px 0 8px", boxShadow:"0 -4px 24px rgba(0,0,0,0.15)" }}>
                <div style={{ width:40, height:4, borderRadius:2, background:"#d1d5db", margin:"0 auto 16px" }} />
                {[
                  { icon:"📜", label:"Play History", tab:"Play History" },
                  { icon:"📓", label:"Playbook",    tab:"Playbook" },
                  { icon:"⚙️", label:"Settings",    tab:"Settings" },
                ].map(item => (
                  <button key={item.tab} onClick={() => { setTab(item.tab); setMobileMoreOpen(false); }}
                    style={{ width:"100%", padding:"16px 24px", background:"none", border:"none", textAlign:"left", fontSize:16, fontWeight:700, color:"#111827", cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:14 }}>
                    <span style={{ fontSize:22 }}>{item.icon}</span>{item.label}
                  </button>
                ))}
                <div style={{ height:"1px", background:"#e5e7eb", margin:"8px 0" }} />
                <button onClick={() => { onSwitchPortal(); setMobileMoreOpen(false); }}
                  style={{ width:"100%", padding:"16px 24px", background:"none", border:"none", textAlign:"left", fontSize:16, fontWeight:700, color:"#374151", cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:14 }}>
                  <span style={{ fontSize:22 }}>⇄</span> Switch Portal
                </button>
                <button onClick={() => signOut(auth)}
                  style={{ width:"100%", padding:"16px 24px", background:"none", border:"none", textAlign:"left", fontSize:16, fontWeight:700, color:"#dc2626", cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:14 }}>
                  <span style={{ fontSize:22 }}>🚪</span> Sign Out
                </button>
              </div>
            </div>
          )}
          <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:100, background:"#fff", borderTop:"1.5px solid #e5e7eb", display:"flex", boxShadow:"0 -2px 12px rgba(0,0,0,0.08)" }}>
            {[
              { icon:"📋", label:"Log",     tab:"Log a Play +" },
              { icon:"📊", label:"Stats",   tab:"Analytics", sub:"Offense" },
              { icon:"🏈", label:"Games",   tab:"Analytics", sub:"Game Summary" },
              { icon:"📝", label:"Cards",   tab:"Analytics", sub:"Report Cards" },
              { icon:"⋯",  label:"More",    tab:null },
            ].map(item => {
              const analyticsCore = ["Offense","Defense","Special Teams"];
              const isActive = !item.tab ? tab === "Settings"
                : item.sub
                  ? (tab === "Analytics" && (
                      item.sub === "Game Summary" ? analyticsSubTab === "Game Summary"
                      : item.sub === "Report Cards" ? analyticsSubTab === "Report Cards"
                      : analyticsCore.includes(analyticsSubTab)))
                  : tab === item.tab;
              return (
                <button key={item.label}
                  onClick={() => {
                    if (!item.tab) { setMobileMoreOpen(o => !o); return; }
                    setTab(item.tab);
                    if (item.sub) setAnalyticsSubTab(item.sub);
                  }}
                  style={{ flex:1, padding:"8px 4px 10px", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                  <span style={{ fontSize:20 }}>{item.icon}</span>
                  <span style={{ fontSize:10, fontWeight: isActive ? 800 : 500, color: isActive ? TK.primaryDark : "#6b7280" }}>{item.label}</span>
                  {isActive && <div style={{ width:18, height:2.5, borderRadius:2, background:TK.primaryDark, marginTop:1 }} />}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: isMobile ? undefined : 980, margin:"0 auto", padding: isMobile ? "20px 16px 88px" : "28px 24px" }}>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* LOG A PLAY TAB                                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {tab === "Log a Play +" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            {/* Sub-tab selector */}
            <div style={{ display:"flex", gap:8 }}>
              {["Offense","Defense","Special Teams"].map(st => (
                <button key={st} onClick={() => setLogSubTab(st)} style={{
                  padding: isMobile ? "10px 14px" : "9px 20px",
                  borderRadius:8, border:"none", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                  background: logSubTab===st ? (st==="Defense" ? TK.red : st==="Special Teams" ? "#7c3aed" : TK.buttonBg) : "#e5e7eb",
                  color: logSubTab===st ? "#fff" : "#374151",
                  flex: isMobile ? 1 : undefined,
                }}>{isMobile ? (st==="Special Teams"?"ST":st) : st}</button>
              ))}
            </div>

            {/* ── OFFENSIVE FORM ─────────────────────────────────────────── */}
            {logSubTab === "Offense" && (
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 360px", gap:20 }}>
                {/* Form card */}
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding: isMobile ? 18 : 28 }}>
                  <div style={{ fontSize:18, fontWeight:800, color:"#111827", marginBottom:20 }}>Log an Offensive Play</div>

                  {/* Situation */}
                  <div style={sectionHdr}>Situation</div>
                  <div style={{ display:"grid", gridTemplateColumns:cols3, gap:12, marginBottom:12 }}>
                    <div><label style={lbl}>Game</label>
                      <select style={mInp} value={form.game} onChange={e => f("game", e.target.value)}>
                        {games.map(g => <option key={g}>{g}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Quarter</label>
                      <select style={mInp} value={form.quarter} onChange={e => f("quarter", e.target.value)}>
                        {["1","2","3","4","OT"].map(q => <option key={q}>{q}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Down</label>
                      <select style={mInp} value={form.down} onChange={e => f("down", e.target.value)}>
                        {["1","2","3","4"].map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:cols2, gap:12, marginBottom:12 }}>
                    <div><label style={lbl}>Distance (yards)</label>
                      <input style={mInp} type="number" placeholder="e.g. 10" value={form.distance} onChange={e => f("distance", e.target.value)} />
                    </div>
                    <div><label style={lbl}>Yard Line</label>
                      <input style={mInp} type="number" placeholder="1–50" min="1" max="50" value={form.yardLine} onChange={e => f("yardLine", e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:cols2, gap:12, marginBottom:18 }}>
                    <div><label style={lbl}>Territory</label>
                      <BtnGroup options={["own","opp"]} value={form.territory} onChange={v => f("territory", v)} />
                    </div>
                    <div><label style={lbl}>Hash</label>
                      <BtnGroup options={["left","middle","right"]} value={form.hash} onChange={v => f("hash", v)} />
                    </div>
                  </div>

                  {/* Scheme */}
                  <div style={sectionHdr}>Scheme</div>
                  <div style={{ display:"grid", gridTemplateColumns:cols2, gap:12, marginBottom:12 }}>
                    <div><label style={lbl}>Formation</label>
                      <select style={mInp} value={form.formation} onChange={e => f("formation", e.target.value)}>
                        <option value="">— Select —</option>
                        {formations.map(fo => <option key={fo}>{fo}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Personnel</label>
                      <select style={mInp} value={form.personnel} onChange={e => f("personnel", e.target.value)}>
                        {personnel.map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:cols2, gap:12, marginBottom:12 }}>
                    <div><label style={lbl}>Play Type *</label>
                      <select style={mInp} value={form.playType} onChange={e => f("playType", e.target.value)}>
                        <option value="">— Select —</option>
                        {TK_PLAY_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Play</label>
                      <select style={mInp} value={form.playCode} onChange={e => f("playCode", e.target.value)}>
                        <option value="">— None —</option>
                        {TK_PLAY_CATEGORIES.map(cat => {
                          const group = playCodes.filter(pc => (pc.unit||"Offense")==="Offense" && pc.category === cat.key);
                          if (!group.length) return null;
                          return (
                            <optgroup key={cat.key} label={cat.label}>
                              {group.map(pc => <option key={pc.id} value={pc.code}>{pc.code}</option>)}
                            </optgroup>
                          );
                        })}
                        {(() => { const uncategorized = playCodes.filter(pc => (pc.unit||"Offense")==="Offense" && !TK_PLAY_CATEGORIES.some(c=>c.key===pc.category)); return uncategorized.length ? <optgroup label="Other">{uncategorized.map(pc => <option key={pc.id} value={pc.code}>{pc.code}</option>)}</optgroup> : null; })()}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:cols2, gap:12, marginBottom:18 }}>
                    <div><label style={lbl}>Direction</label>
                      <BtnGroup options={["Left","Middle","Right"]} value={form.direction} onChange={v => f("direction", v)} />
                    </div>
                    <div><label style={lbl}>Blocking Scheme</label>
                      <select style={mInp} value={form.blockingScheme} onChange={e => f("blockingScheme", e.target.value)}>
                        <option value="">— None —</option>
                        {TK_PLAY_CATEGORIES.map(cat => {
                          const group = blockingSchemes.filter(s => s.category === cat.key);
                          if (!group.length) return null;
                          return (
                            <optgroup key={cat.key} label={cat.label}>
                              {group.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </optgroup>
                          );
                        })}
                        {(() => { const u = blockingSchemes.filter(s => !s.category); return u.length ? <optgroup label="Other">{u.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</optgroup> : null; })()}
                      </select>
                    </div>
                  </div>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <>
                      <div style={sectionHdr}>Tags</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:18 }}>
                        {tags.map(tag => {
                          const active = form.tags.includes(tag);
                          return (
                            <button key={tag} onClick={() => toggleTag(tag)} style={{
                              padding:"4px 12px", borderRadius:99, fontSize:12,
                              border:`1.5px solid ${active ? TK.primary : "#d1d5db"}`,
                              background: active ? TK.primary : "#f8fafc",
                              color: active ? "#fff" : "#6b7280",
                              fontWeight: active ? 700 : 500, cursor:"pointer", fontFamily:"inherit",
                            }}>{tag}</button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Players */}
                  <div style={sectionHdr}>Players</div>
                  <div style={{ display:"grid", gridTemplateColumns:cols3, gap:12, marginBottom:12 }}>
                    <div><label style={lbl}>QB / Thrower</label>
                      <select style={mInp} value={form.qb} onChange={e => f("qb", e.target.value)}>
                        <option value="">— None —</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Ball Carrier</label>
                      <select style={mInp} value={form.carrier} onChange={e => f("carrier", e.target.value)}>
                        <option value="">— None —</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Receiver</label>
                      <select style={mInp} value={form.receiver} onChange={e => f("receiver", e.target.value)}>
                        <option value="">— None —</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Result */}
                  <div style={sectionHdr}>Result</div>
                  <div style={{ display:"grid", gridTemplateColumns:cols2, gap:12, marginBottom:12 }}>
                    <div><label style={lbl}>Yards Gained</label>
                      <input style={mInp} type="number" placeholder="0" value={form.yardsGained} onChange={e => f("yardsGained", e.target.value)} />
                    </div>
                    <div><label style={lbl}>Outcome *</label>
                      <select style={mInp} value={form.outcome} onChange={e => f("outcome", e.target.value)}>
                        <option value="">— Select —</option>
                        {offOutcomes.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <label style={lbl}>Notes</label>
                    <input style={mInp} placeholder="Optional notes..." value={form.notes} onChange={e => f("notes", e.target.value)} />
                  </div>

                  <button onClick={handleLogPlay} disabled={!form.outcome || !form.playType} style={{
                    width:"100%", padding: isMobile ? "16px" : "14px",
                    background: (!form.outcome||!form.playType) ? "#e5e7eb" : `linear-gradient(135deg, ${TK.primaryDark}, ${TK.primary})`,
                    color: (!form.outcome||!form.playType) ? "#9ca3af" : "#fff",
                    border:"none", borderRadius:10, fontSize: isMobile ? 17 : 15, fontWeight:800,
                    cursor: (!form.outcome||!form.playType) ? "not-allowed" : "pointer", fontFamily:"inherit",
                  }}>+ Log Offensive Play</button>
                </div>

                {/* Recent plays sidebar */}
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:"#111827" }}>Recent Plays</div>
                  {plays.length === 0 && (
                    <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:28, textAlign:"center", color:"#9ca3af", fontSize:14 }}>No offensive plays logged yet.</div>
                  )}
                  {plays.slice(0,8).map(p => {
                    const qbPl    = players.find(pl => pl.id === Number(p.qb));
                    const carrier = players.find(pl => pl.id === Number(p.carrier));
                    return (
                      <div key={p.id} style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:"12px 16px", display:"flex", flexDirection:"column", gap:5 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                          <span style={{ fontSize:13, fontWeight:800, color:"#111827" }}>
                            {p.game} · Q{p.quarter} · {p.down}&{p.distance}
                            {p.yardLine && <span style={{ color:"#6b7280", fontWeight:500 }}> · {p.territory==="opp"?"Opp":"Own"} {p.yardLine}</span>}
                          </span>
                          <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                            <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:99,
                              background: p.outcome?.includes("TD") ? "#ffe4e6" : p.outcome?.includes("Loss") || p.outcome?.includes("INT") || p.outcome?.includes("Fumble") ? "#fee2e2" : "#f3f4f6",
                              color: p.outcome?.includes("TD") ? "#881337" : p.outcome?.includes("Loss") || p.outcome?.includes("INT") || p.outcome?.includes("Fumble") ? "#991b1b" : "#374151",
                            }}>{p.outcome}</span>
                            <button onClick={() => deletePlay(p.id)} style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:16, padding:0 }}>×</button>
                          </div>
                        </div>
                        <div style={{ fontSize:12, color:"#6b7280" }}>
                          <strong>{p.playType}</strong>
                          {p.formation && <> · {p.formation}</>}
                          {p.personnel && <> · {p.personnel}</>}
                          {p.direction && <> · {p.direction}</>}
                          {p.blockingScheme && <> · <span style={{ color:TK.primary, fontWeight:600 }}>{p.blockingScheme}</span></>}
                          {carrier && <> · {carrier.name}</>}
                          {qbPl && !carrier && <> · QB: {qbPl.name}</>}
                        </div>
                        <div style={{ fontSize:12, fontWeight:700, color: (Number(p.yardsGained)||0)>0 ? TK.primary : (Number(p.yardsGained)||0)<0 ? TK.red : "#6b7280" }}>
                          {(Number(p.yardsGained)||0)>0 ? `+${p.yardsGained}` : p.yardsGained||"0"} yards
                        </div>
                        {p.tags?.length > 0 && (
                          <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                            {p.tags.map(tag => <span key={tag} style={{ fontSize:10, background:TK.primaryLight, color:TK.primaryDark, padding:"1px 7px", borderRadius:99, fontWeight:600 }}>{tag}</span>)}
                          </div>
                        )}
                        {p.notes && <div style={{ fontSize:11, color:"#9ca3af", fontStyle:"italic" }}>{p.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── DEFENSIVE FORM ─────────────────────────────────────────── */}
            {logSubTab === "Defense" && (
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 360px", gap:20 }}>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding: isMobile ? 18 : 28 }}>
                  <div style={{ fontSize:18, fontWeight:800, color:"#111827", marginBottom:20 }}>Log a Defensive Play</div>

                  <div style={sectionHdr}>Situation</div>
                  <div style={{ display:"grid", gridTemplateColumns:cols3, gap:12, marginBottom:12 }}>
                    <div><label style={lbl}>Game</label>
                      <select style={mInp} value={defForm.game} onChange={e => df("game", e.target.value)}>
                        {games.map(g => <option key={g}>{g}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Quarter</label>
                      <select style={mInp} value={defForm.quarter} onChange={e => df("quarter", e.target.value)}>
                        {["1","2","3","4","OT"].map(q => <option key={q}>{q}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Down</label>
                      <select style={mInp} value={defForm.down} onChange={e => df("down", e.target.value)}>
                        {["1","2","3","4"].map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:cols2, gap:12, marginBottom:18 }}>
                    <div><label style={lbl}>Distance</label>
                      <input style={mInp} type="number" placeholder="e.g. 10" value={defForm.distance} onChange={e => df("distance", e.target.value)} />
                    </div>
                    <div><label style={lbl}>Play Type</label>
                      <select style={mInp} value={defForm.playType} onChange={e => df("playType", e.target.value)}>
                        <option value="">— Select —</option>
                        <option>Pass</option><option>Run</option>
                      </select>
                    </div>
                    <div><label style={lbl}>Defensive Call</label>
                      <select style={mInp} value={defForm.playCode} onChange={e => df("playCode", e.target.value)}>
                        <option value="">— None —</option>
                        {TK_DEF_PLAY_CATEGORIES.map(cat => {
                          const group = playCodes.filter(pc => pc.unit==="Defense" && pc.category === cat.key);
                          if (!group.length) return null;
                          return (
                            <optgroup key={cat.key} label={cat.label}>
                              {group.map(pc => <option key={pc.id} value={pc.code}>{pc.code}</option>)}
                            </optgroup>
                          );
                        })}
                        {(() => { const u = playCodes.filter(pc => pc.unit==="Defense" && !TK_DEF_PLAY_CATEGORIES.some(c=>c.key===pc.category)); return u.length ? <optgroup label="Other">{u.map(pc => <option key={pc.id} value={pc.code}>{pc.code}</option>)}</optgroup> : null; })()}
                      </select>
                    </div>
                  </div>

                  <div style={sectionHdr}>Result</div>
                  <div style={{ display:"grid", gridTemplateColumns:cols2, gap:12, marginBottom:12 }}>
                    <div><label style={lbl}>Outcome *</label>
                      <select style={mInp} value={defForm.outcome} onChange={e => df("outcome", e.target.value)}>
                        <option value="">— Select —</option>
                        {defOutcomes.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Yards Allowed</label>
                      <input style={mInp} type="number" placeholder="0" value={defForm.yardsAllowed} onChange={e => df("yardsAllowed", e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:cols2, gap:12, marginBottom:12 }}>
                    <div><label style={lbl}>Player Action</label>
                      <select style={mInp} value={defForm.playerAction} onChange={e => df("playerAction", e.target.value)}>
                        <option value="">— None —</option>
                        {defActions.map(a => <option key={a}>{a}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Primary Play Maker</label>
                      <select style={mInp} value={defForm.primaryTackler} onChange={e => df("primaryTackler", e.target.value)}>
                        <option value="">— None —</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <label style={lbl}>Secondary Play Maker / Assist</label>
                    <select style={mInp} value={defForm.secondaryTackler} onChange={e => df("secondaryTackler", e.target.value)}>
                      <option value="">— None —</option>
                      {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <label style={lbl}>Notes</label>
                    <input style={mInp} placeholder="Optional notes..." value={defForm.notes} onChange={e => df("notes", e.target.value)} />
                  </div>

                  <button onClick={handleLogDefPlay} disabled={!defForm.outcome} style={{
                    width:"100%", padding: isMobile ? "16px" : "14px",
                    background: !defForm.outcome ? "#e5e7eb" : TK.red,
                    color: !defForm.outcome ? "#9ca3af" : "#fff",
                    border:"none", borderRadius:10, fontSize: isMobile ? 17 : 15, fontWeight:800,
                    cursor: !defForm.outcome ? "not-allowed" : "pointer", fontFamily:"inherit",
                  }}>+ Log Defensive Play</button>
                </div>

                {/* Recent defensive plays */}
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:"#111827" }}>Recent Plays</div>
                  {defPlays.length === 0 && (
                    <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:28, textAlign:"center", color:"#9ca3af", fontSize:14 }}>No defensive plays logged yet.</div>
                  )}
                  {defPlays.slice(0,8).map(p => {
                    const pl = players.find(x => x.id === Number(p.primaryTackler));
                    return (
                      <div key={p.id} style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:"12px 16px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:800, color:"#111827" }}>{p.game} · Q{p.quarter} · {p.down}&{p.distance}</span>
                          <div style={{ display:"flex", gap:4 }}>
                            <span style={{ fontSize:11, fontWeight:700, background:"#fee2e2", color:"#991b1b", padding:"2px 8px", borderRadius:99 }}>{p.outcome}</span>
                            <button onClick={() => deleteDefPlay(p.id)} style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:16, padding:0 }}>×</button>
                          </div>
                        </div>
                        <div style={{ fontSize:12, color:"#6b7280" }}>
                          {p.playType && <strong>{p.playType}</strong>}
                          {p.playerAction && <> · {p.playerAction}</>}
                          {pl && <> · <strong>{pl.name}</strong></>}
                          {(Number(p.yardsAllowed)||0) > 0 && <span style={{ color:TK.red }}> · {p.yardsAllowed} yds allowed</span>}
                        </div>
                        {p.notes && <div style={{ fontSize:11, color:"#9ca3af", marginTop:3, fontStyle:"italic" }}>{p.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── SPECIAL TEAMS FORM ─────────────────────────────────────── */}
            {logSubTab === "Special Teams" && (
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 360px", gap:20 }}>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding: isMobile ? 18 : 28 }}>
                  <div style={{ fontSize:18, fontWeight:800, color:"#111827", marginBottom:20 }}>Log a Special Teams Play</div>

                  <div style={sectionHdr}>Situation</div>
                  <div style={{ display:"grid", gridTemplateColumns:cols3, gap:12, marginBottom:12 }}>
                    <div><label style={lbl}>Game</label>
                      <select style={mInp} value={stForm.game} onChange={e => stf("game", e.target.value)}>
                        {games.map(g => <option key={g}>{g}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Quarter</label>
                      <select style={mInp} value={stForm.quarter} onChange={e => stf("quarter", e.target.value)}>
                        {["1","2","3","4","OT"].map(q => <option key={q}>{q}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Side</label>
                      <BtnGroup options={["offense","defense"]} value={stForm.side} onChange={v => stf("side", v)} color="#7c3aed" />
                    </div>
                  </div>

                  <div style={{ marginBottom:12 }}>
                    <label style={lbl}>Play Type</label>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {TK_ST_TYPES.map(st => (
                        <button key={st} onClick={() => { stf("stType", st); stf("outcome", ""); }} style={{
                          padding:"7px 14px", borderRadius:8, fontSize:12,
                          border:`1.5px solid ${stForm.stType===st ? "#7c3aed" : "#d1d5db"}`,
                          background: stForm.stType===st ? "#7c3aed" : "#fff",
                          color: stForm.stType===st ? "#fff" : "#374151",
                          fontWeight: stForm.stType===st ? 700 : 500, cursor:"pointer", fontFamily:"inherit",
                        }}>{st}</button>
                      ))}
                    </div>
                  </div>

                  <div style={sectionHdr}>Details</div>
                  <div style={{ display:"grid", gridTemplateColumns:cols2, gap:12, marginBottom:12 }}>
                    <div><label style={lbl}>Player</label>
                      <select style={mInp} value={stForm.player} onChange={e => stf("player", e.target.value)}>
                        <option value="">— None —</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Yardage</label>
                      <input style={mInp} type="number" placeholder="0" value={stForm.yardage} onChange={e => stf("yardage", e.target.value)} />
                    </div>
                    <div><label style={lbl}>Play</label>
                      <select style={mInp} value={stForm.playCode} onChange={e => stf("playCode", e.target.value)}>
                        <option value="">— None —</option>
                        {playCodes.filter(pc => pc.unit==="Special Teams").map(pc => <option key={pc.id} value={pc.code}>{pc.code}</option>)}
                      </select>
                    </div>
                  </div>
                  {(stForm.stType === "Field Goal Attempt" || stForm.stType === "PAT (1pt)") && (
                    <div style={{ marginBottom:12 }}>
                      <label style={lbl}>Field Goal Distance (yards)</label>
                      <input style={mInp} type="number" placeholder="e.g. 35" value={stForm.fieldGoalDist} onChange={e => stf("fieldGoalDist", e.target.value)} />
                    </div>
                  )}

                  <div style={sectionHdr}>Result</div>
                  <div style={{ marginBottom:12 }}>
                    <label style={lbl}>Outcome *</label>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
                      {(stOutcomes[stForm.stType] || []).map(o => (
                        <button key={o} onClick={() => stf("outcome", o)} style={{
                          padding:"7px 14px", borderRadius:8, fontSize:12,
                          border:`1.5px solid ${stForm.outcome===o ? "#7c3aed" : "#d1d5db"}`,
                          background: stForm.outcome===o ? "#7c3aed" : "#fff",
                          color: stForm.outcome===o ? "#fff" : "#374151",
                          fontWeight: stForm.outcome===o ? 700 : 500, cursor:"pointer", fontFamily:"inherit",
                        }}>{o}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <label style={lbl}>Notes</label>
                    <input style={mInp} placeholder="Optional notes..." value={stForm.notes} onChange={e => stf("notes", e.target.value)} />
                  </div>

                  <button onClick={handleLogStPlay} disabled={!stForm.outcome} style={{
                    width:"100%", padding: isMobile ? "16px" : "14px",
                    background: !stForm.outcome ? "#e5e7eb" : "#7c3aed",
                    color: !stForm.outcome ? "#9ca3af" : "#fff",
                    border:"none", borderRadius:10, fontSize: isMobile ? 17 : 15, fontWeight:800,
                    cursor: !stForm.outcome ? "not-allowed" : "pointer", fontFamily:"inherit",
                  }}>+ Log Special Teams Play</button>
                </div>

                {/* Recent ST plays */}
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:"#111827" }}>Recent ST Plays</div>
                  {stPlays.length === 0 && (
                    <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:28, textAlign:"center", color:"#9ca3af", fontSize:14 }}>No ST plays logged yet.</div>
                  )}
                  {stPlays.slice(0,8).map(p => {
                    const pl = players.find(x => x.id === Number(p.player));
                    return (
                      <div key={p.id} style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:"12px 16px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:800, color:"#111827" }}>{p.game} · Q{p.quarter}</span>
                          <div style={{ display:"flex", gap:4 }}>
                            <span style={{ fontSize:11, fontWeight:700, background:"#ede9fe", color:"#5b21b6", padding:"2px 8px", borderRadius:99 }}>{p.stType}</span>
                            <button onClick={() => deleteStPlay(p.id)} style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:16, padding:0 }}>×</button>
                          </div>
                        </div>
                        <div style={{ fontSize:12, color:"#6b7280" }}>
                          <TkBadge color={p.side==="offense"?"green":"red"}>{p.side}</TkBadge>
                          {" "}{p.outcome}
                          {(Number(p.yardage)||0) > 0 && <> · {p.yardage} yds</>}
                          {pl && <> · {pl.name}</>}
                        </div>
                        {p.notes && <div style={{ fontSize:11, color:"#9ca3af", marginTop:3, fontStyle:"italic" }}>{p.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PLAY HISTORY TAB                                                    */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {tab === "Play History" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* Filter bar */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", gap:8 }}>
                {["All","Offense","Defense","Special Teams"].map(s => (
                  <button key={s} onClick={() => setLogSubTab(s)} style={{
                    padding:"8px 14px", borderRadius:8, border:"none", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                    background: logSubTab===s ? TK.buttonBg : "#e5e7eb",
                    color: logSubTab===s ? "#fff" : "#374151",
                  }}>{isMobile && s==="Special Teams"?"ST":s}</button>
                ))}
              </div>
              <select value={filterGame} onChange={e => setFilterGame(e.target.value)}
                style={{ padding:"8px 12px", borderRadius:8, border:"1.5px solid #d1d5db", fontSize:13, fontFamily:"inherit" }}>
                <option value="All">All Games</option>
                {games.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>

            {/* Offensive plays */}
            {(logSubTab === "All" || logSubTab === "Offense") && filteredOffPlays.length > 0 && (
              <TkCollapsible title="Offensive Plays" subtitle={`${filteredOffPlays.length} plays`} defaultOpen={logSubTab==="Offense"}>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {filteredOffPlays.map(p => {
                    const carrier = players.find(pl => pl.id === Number(p.carrier));
                    const qbPl    = players.find(pl => pl.id === Number(p.qb));
                    return (
                      <div key={p.id} style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", display:"flex", justifyContent:"space-between", gap:8 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:800, color:"#111827", marginBottom:2 }}>
                            {p.game} · Q{p.quarter} · {p.down}&{p.distance}
                            {p.yardLine && <span style={{ color:"#6b7280", fontWeight:500 }}> · {p.territory==="opp"?"Opp":"Own"} {p.yardLine}</span>}
                          </div>
                          <div style={{ fontSize:12, color:"#6b7280" }}>
                            <strong>{p.playType}</strong>
                            {p.formation && <> · {p.formation}</>}
                            {p.direction && <> · {p.direction}</>}
                            {p.blockingScheme && <> · {p.blockingScheme}</>}
                            {carrier && <> · {carrier.name}</>}
                            {qbPl && !carrier && <> · QB: {qbPl.name}</>}
                            {p.tags?.length > 0 && <> · <span style={{ color:TK.primary }}>{p.tags.join(", ")}</span></>}
                          </div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                          <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:99,
                            background: p.outcome?.includes("TD") ? "#ffe4e6" : p.outcome?.includes("Loss")||p.outcome?.includes("INT")||p.outcome?.includes("Fumble") ? "#fee2e2" : "#f3f4f6",
                            color: p.outcome?.includes("TD") ? "#881337" : p.outcome?.includes("Loss")||p.outcome?.includes("INT")||p.outcome?.includes("Fumble") ? "#991b1b" : "#374151",
                          }}>{p.outcome}</span>
                          <span style={{ fontSize:12, fontWeight:700, color:(Number(p.yardsGained)||0)>0?TK.primary:(Number(p.yardsGained)||0)<0?TK.red:"#6b7280" }}>
                            {(Number(p.yardsGained)||0)>0?`+${p.yardsGained}`:p.yardsGained||"0"} yds
                          </span>
                          <button onClick={() => deletePlay(p.id)} style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TkCollapsible>
            )}

            {/* Defensive plays */}
            {(logSubTab === "All" || logSubTab === "Defense") && filteredDefPlays.length > 0 && (
              <TkCollapsible title="Defensive Plays" subtitle={`${filteredDefPlays.length} plays`} defaultOpen={logSubTab==="Defense"}>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {filteredDefPlays.map(p => {
                    const pl = players.find(x => x.id === Number(p.primaryTackler));
                    return (
                      <div key={p.id} style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", display:"flex", justifyContent:"space-between", gap:8 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:800, color:"#111827", marginBottom:2 }}>{p.game} · Q{p.quarter} · {p.down}&{p.distance}</div>
                          <div style={{ fontSize:12, color:"#6b7280" }}>
                            {p.playType && <strong>{p.playType}</strong>}
                            {p.playerAction && <> · {p.playerAction}</>}
                            {pl && <> · <strong>{pl.name}</strong></>}
                            {(Number(p.yardsAllowed)||0) > 0 && <span style={{ color:TK.red }}> · {p.yardsAllowed} yds allowed</span>}
                          </div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                          <span style={{ fontSize:11, fontWeight:700, background:"#fee2e2", color:"#991b1b", padding:"2px 8px", borderRadius:99 }}>{p.outcome}</span>
                          <button onClick={() => deleteDefPlay(p.id)} style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TkCollapsible>
            )}

            {/* ST plays */}
            {(logSubTab === "All" || logSubTab === "Special Teams") && stPlays.filter(p => filterGame==="All"||p.game===filterGame).length > 0 && (
              <TkCollapsible title="Special Teams Plays" subtitle={`${stPlays.filter(p => filterGame==="All"||p.game===filterGame).length} plays`} defaultOpen={logSubTab==="Special Teams"}>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {stPlays.filter(p => filterGame==="All"||p.game===filterGame).map(p => {
                    const pl = players.find(x => x.id === Number(p.player));
                    return (
                      <div key={p.id} style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", display:"flex", justifyContent:"space-between", gap:8 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:800, color:"#111827", marginBottom:2 }}>{p.game} · Q{p.quarter} · <TkBadge color="purple">{p.stType}</TkBadge></div>
                          <div style={{ fontSize:12, color:"#6b7280" }}>
                            <TkBadge color={p.side==="offense"?"green":"red"}>{p.side}</TkBadge>
                            {" "}{p.outcome}{(Number(p.yardage)||0)>0 && <> · {p.yardage} yds</>}{pl && <> · {pl.name}</>}
                          </div>
                        </div>
                        <button onClick={() => deleteStPlay(p.id)} style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                      </div>
                    );
                  })}
                </div>
              </TkCollapsible>
            )}

            {plays.length === 0 && defPlays.length === 0 && stPlays.length === 0 && (
              <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:60, textAlign:"center", color:"#9ca3af", fontSize:15 }}>
                No plays logged yet. Head to <strong>Log a Play +</strong> to get started.
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ANALYTICS TAB                                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {tab === "Analytics" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            {/* Sub-tabs + game filter */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {["Offense","Defense","Special Teams","Game Summary","Report Cards"].map(st => (
                  <button key={st} onClick={() => setAnalyticsSubTab(st)} style={{
                    padding:"8px 16px", borderRadius:8, border:"none", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                    background: analyticsSubTab===st ? (st==="Defense"?TK.red:st==="Special Teams"?"#7c3aed":TK.buttonBg) : "#e5e7eb",
                    color: analyticsSubTab===st?"#fff":"#374151",
                  }}>{isMobile?(st==="Special Teams"?"ST":st==="Game Summary"?"Games":st==="Report Cards"?"Cards":st):st}</button>
                ))}
              </div>
              {analyticsSubTab !== "Game Summary" && analyticsSubTab !== "Report Cards" && (
                <select value={filterGame} onChange={e => setFilterGame(e.target.value)}
                  style={{ padding:"8px 12px", borderRadius:8, border:"1.5px solid #d1d5db", fontSize:13, fontFamily:"inherit" }}>
                  <option value="All">All Games</option>
                  {games.map(g => <option key={g}>{g}</option>)}
                </select>
              )}
            </div>

            {/* ── OFFENSE ANALYTICS ──────────────────────────────────────── */}
            {analyticsSubTab === "Offense" && (<>
              {filteredOffPlays.length === 0 ? (
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:60, textAlign:"center", color:"#9ca3af", fontSize:15 }}>No offensive plays logged yet.</div>
              ) : (<>
                {/* Stat cards */}
                <div style={{ display:"grid", gridTemplateColumns:cols4, gap:14 }}>
                  <TkStatCard label="Total Plays" value={filteredOffPlays.length} accent={TK.primary} />
                  <TkStatCard label="Total Yards" value={`+${filteredOffPlays.reduce((a,b)=>a+(Number(b.yardsGained)||0),0)}`} sub={`${(filteredOffPlays.reduce((a,b)=>a+(Number(b.yardsGained)||0),0)/filteredOffPlays.length).toFixed(1)} yds/play`} accent={TK.primary} />
                  <TkStatCard label="Touchdowns" value={filteredOffPlays.filter(p=>p.outcome==="TD").length} accent={TK.primary} />
                  <TkStatCard label="Success Rate" value={`${Math.round(filteredOffPlays.filter(p=>p.outcome==="TD"||p.outcome==="First Down"||(Number(p.yardsGained)||0)>0).length/filteredOffPlays.length*100)}%`} accent={TK.primary} />
                </div>

                {/* Trend chart */}
                {offByGame.length >= 2 && (() => {
                  const active = TK_OFF_METRICS.filter(m => offenseTrendMetrics.includes(m.key));
                  return (
                    <TkCollapsible title="Trend Chart" subtitle="Game-over-game · select up to 4 metrics" defaultOpen>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
                        {TK_OFF_METRICS.map(m => {
                          const on = offenseTrendMetrics.includes(m.key);
                          const ci = offenseTrendMetrics.indexOf(m.key);
                          const cc = on ? TK_CHART_COLORS[ci % TK_CHART_COLORS.length] : undefined;
                          return <button key={m.key} onClick={() => setOffenseTrendMetrics(prev => prev.includes(m.key)?(prev.length>1?prev.filter(k=>k!==m.key):prev):prev.length<4?[...prev,m.key]:prev)} style={{ padding:"4px 12px", borderRadius:99, fontSize:12, fontWeight:on?700:500, border:`1.5px solid ${on?cc:"#d1d5db"}`, background:on?cc:"#f8fafc", color:on?"#fff":"#6b7280", cursor:"pointer", fontFamily:"inherit" }}>{m.label}</button>;
                        })}
                        {offenseTrendMetrics.length>=4 && <span style={{ fontSize:11, color:"#9ca3af", alignSelf:"center" }}>Max 4</span>}
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:10 }}>
                        {active.map((m,mi) => <div key={m.key} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, fontWeight:600, color:"#374151" }}><div style={{ width:18, height:3, borderRadius:2, background:TK_CHART_COLORS[mi%TK_CHART_COLORS.length] }}/>{m.label}</div>)}
                      </div>
                      <TkTrendChart gameData={offByGame} metrics={active} />
                    </TkCollapsible>
                  );
                })()}

                {/* Pass vs Run */}
                <TkCollapsible title="Pass vs Run" defaultOpen>
                  {["Pass","Run"].map(type => {
                    const tp = filteredOffPlays.filter(p => { const pt=(p.playType||"").toLowerCase(); return type==="Run"?(pt==="run"||pt==="option"||pt==="qb sneak"||pt==="kneel"):(pt==="pass"||pt==="play action"||pt==="rpo"||pt==="screen"); });
                    const pct = filteredOffPlays.length>0?Math.round(tp.length/filteredOffPlays.length*100):0;
                    const yds = tp.reduce((a,b)=>a+(Number(b.yardsGained)||0),0);
                    return <div key={type} style={{ marginBottom:12 }}><div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:3 }}><span style={{ fontWeight:700 }}>{type}</span><span style={{ color:"#6b7280" }}>{tp.length} plays · {tp.length>0?(yds/tp.length).toFixed(1):0} yds/play · {pct}%</span></div><div style={{ height:8, background:"#f3f4f6", borderRadius:99 }}><div style={{ height:"100%", width:`${pct}%`, background:TK.primary, borderRadius:99 }}/></div></div>;
                  })}
                </TkCollapsible>

                {/* Per-player offense table */}
                {byPlayerOff.length > 0 && (
                  <TkCollapsible title="Player Stats — Offense" defaultOpen>
                    <div style={{ overflowX:"auto" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:700 }}>
                        <thead><tr style={{ background:TK.buttonBg }}>
                          {["Player","Pos","Car","Rush Yds","Yds/Car","Rush TD","Tgt","Rec","Rec Yds","Rec TD"].map((h,i) => (
                            <th key={h} style={{ padding:"8px 10px", fontWeight:700, color:"#fff", fontSize:11, textTransform:"uppercase", whiteSpace:"nowrap", textAlign:i<2?"left":"center", position:i===0?"sticky":undefined, left:i===0?0:undefined, zIndex:i===0?3:undefined, background:i===0?TK.buttonBg:undefined, boxShadow:i===0?"2px 0 5px rgba(0,0,0,0.1)":undefined }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {byPlayerOff.map((p,ri) => {
                            const bg = ri%2===0?"#fff":"#fafafa";
                            return (
                              <tr key={p.id} style={{ borderBottom:"1px solid #f3f4f6", background:bg }}>
                                <td style={{ padding:"9px 10px", fontWeight:700, color:"#111827", position:"sticky", left:0, zIndex:1, background:bg, boxShadow:"2px 0 5px rgba(0,0,0,0.07)", whiteSpace:"nowrap" }}>{p.name}</td>
                                <td style={{ padding:"9px 10px" }}>{p.positions.map(pos => <TkBadge key={pos} color="green">{pos}</TkBadge>)}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{p.carries||"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, color:TK.primary }}>{p.rushYards>0?`+${p.rushYards}`:p.rushYards||"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{p.carries>0?(p.rushYards/p.carries).toFixed(1):"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center" }}>{p.rushTDs>0?<TkBadge color="green">{p.rushTDs}</TkBadge>:"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{p.targets||"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{p.receptions||"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, color:TK.primary }}>{p.recYards>0?`+${p.recYards}`:p.recYards||"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center" }}>{p.recTDs>0?<TkBadge color="green">{p.recTDs}</TkBadge>:"—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </TkCollapsible>
                )}

                {/* Per-formation table */}
                {byFormation.length > 0 && (
                  <TkCollapsible title="Formation Breakdown">
                    <div style={{ overflowX:"auto" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead><tr style={{ background:TK.buttonBg }}>
                          {["Formation","Plays","Yds/Play","TDs","1st Downs","Pass%","Run%"].map((h,i) => (
                            <th key={h} style={{ padding:"8px 10px", fontWeight:700, color:"#fff", fontSize:11, textTransform:"uppercase", textAlign:i===0?"left":"center", position:i===0?"sticky":undefined, left:i===0?0:undefined, zIndex:i===0?3:undefined, background:i===0?TK.buttonBg:undefined, boxShadow:i===0?"2px 0 5px rgba(0,0,0,0.1)":undefined }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {byFormation.map((r,ri) => {
                            const bg = ri%2===0?"#fff":"#fafafa";
                            return (
                              <tr key={r.formation} style={{ borderBottom:"1px solid #f3f4f6", background:bg }}>
                                <td style={{ padding:"9px 10px", fontWeight:700, color:"#111827", position:"sticky", left:0, background:bg, boxShadow:"2px 0 5px rgba(0,0,0,0.07)" }}>{r.formation}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.plays}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, color:TK.primary }}>{r.plays>0?(r.yards/r.plays).toFixed(1):"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center" }}>{r.tds>0?<TkBadge color="green">{r.tds}</TkBadge>:"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.firstDowns}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.plays>0?Math.round(r.pass/r.plays*100):0}%</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.plays>0?Math.round(r.run/r.plays*100):0}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </TkCollapsible>
                )}

                {/* Play (play-code) breakdown */}
                {byOffCode.length > 0 && (
                  <TkCollapsible title="Play Breakdown" subtitle="By play call">
                    <div style={{ overflowX:"auto" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead><tr style={{ background:TK.buttonBg }}>
                          {["Play","Plays","Yds/Play","TDs","1st Downs"].map((h,i) => (
                            <th key={h} style={{ padding:"8px 10px", fontWeight:700, color:"#fff", fontSize:11, textTransform:"uppercase", textAlign:i===0?"left":"center", position:i===0?"sticky":undefined, left:i===0?0:undefined, zIndex:i===0?3:undefined, background:i===0?TK.buttonBg:undefined, boxShadow:i===0?"2px 0 5px rgba(0,0,0,0.1)":undefined }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {byOffCode.map((r,ri) => {
                            const bg = ri%2===0?"#fff":"#fafafa";
                            return (
                              <tr key={r.code} style={{ borderBottom:"1px solid #f3f4f6", background:bg }}>
                                <td style={{ padding:"9px 10px", fontWeight:700, color:"#111827", position:"sticky", left:0, background:bg, boxShadow:"2px 0 5px rgba(0,0,0,0.07)", whiteSpace:"nowrap" }}>{r.code}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.plays}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, color:TK.primary }}>{r.plays>0?(r.yards/r.plays).toFixed(1):"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center" }}>{r.tds>0?<TkBadge color="green">{r.tds}</TkBadge>:"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.firstDowns}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </TkCollapsible>
                )}

                {/* Down & Distance table */}
                {filteredOffPlays.some(p=>p.down) && (
                  <TkCollapsible title="Down & Distance">
                    <div style={{ overflowX:"auto" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead><tr style={{ background:TK.buttonBg }}>
                          {["Down","Plays","Yds/Play","Success Rate"].map((h,i) => (
                            <th key={h} style={{ padding:"8px 10px", fontWeight:700, color:"#fff", fontSize:11, textTransform:"uppercase", textAlign:i===0?"left":"center" }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {byDown.map((r,ri) => {
                            const bg = ri%2===0?"#fff":"#fafafa";
                            return (
                              <tr key={r.down} style={{ borderBottom:"1px solid #f3f4f6", background:bg }}>
                                <td style={{ padding:"9px 10px", fontWeight:700, color:"#111827" }}>{r.down} Down</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.plays||"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, color:TK.primary }}>{r.plays>0?r.yardsPerPlay:"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center" }}>
                                  {r.plays>0 ? (
                                    <span style={{ fontWeight:700, color:r.successRate>=50?TK.primary:TK.red }}>{r.successRate}%</span>
                                  ) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </TkCollapsible>
                )}
              </>)}
            </>)}

            {/* ── DEFENSE ANALYTICS ──────────────────────────────────────── */}
            {analyticsSubTab === "Defense" && (<>
              {filteredDefPlays.length === 0 ? (
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:60, textAlign:"center", color:"#9ca3af", fontSize:15 }}>No defensive plays logged yet.</div>
              ) : (<>
                <div style={{ display:"grid", gridTemplateColumns:cols4, gap:14 }}>
                  <TkStatCard label="Plays Defended" value={filteredDefPlays.length} accent={TK.red} />
                  <TkStatCard label="Yards Allowed" value={filteredDefPlays.reduce((a,b)=>a+(Number(b.yardsAllowed)||0),0)} sub={`${(filteredDefPlays.reduce((a,b)=>a+(Number(b.yardsAllowed)||0),0)/filteredDefPlays.length).toFixed(1)} yds/play`} accent={TK.red} />
                  <TkStatCard label="Sacks" value={filteredDefPlays.filter(p=>p.outcome?.includes("Sack")).length} accent={TK.red} />
                  <TkStatCard label="TFLs + Sacks" value={filteredDefPlays.filter(p=>p.outcome?.includes("TFL")||p.outcome?.includes("Sack")).length} accent={TK.primary} />
                </div>

                {/* Defense trend chart */}
                {defByGame.length >= 2 && (() => {
                  const active = TK_DEF_METRICS.filter(m => defenseTrendMetrics.includes(m.key));
                  return (
                    <TkCollapsible title="Trend Chart" subtitle="Game-over-game · select up to 4 metrics" defaultOpen>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
                        {TK_DEF_METRICS.map(m => {
                          const on = defenseTrendMetrics.includes(m.key);
                          const ci = defenseTrendMetrics.indexOf(m.key);
                          const cc = on ? TK_CHART_COLORS[ci % TK_CHART_COLORS.length] : undefined;
                          return <button key={m.key} onClick={() => setDefenseTrendMetrics(prev => prev.includes(m.key)?(prev.length>1?prev.filter(k=>k!==m.key):prev):prev.length<4?[...prev,m.key]:prev)} style={{ padding:"4px 12px", borderRadius:99, fontSize:12, fontWeight:on?700:500, border:`1.5px solid ${on?cc:"#d1d5db"}`, background:on?cc:"#f8fafc", color:on?"#fff":"#6b7280", cursor:"pointer", fontFamily:"inherit" }}>{m.label}</button>;
                        })}
                        {defenseTrendMetrics.length>=4 && <span style={{ fontSize:11, color:"#9ca3af", alignSelf:"center" }}>Max 4</span>}
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:10 }}>
                        {active.map((m,mi) => <div key={m.key} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, fontWeight:600, color:"#374151" }}><div style={{ width:18, height:3, borderRadius:2, background:TK_CHART_COLORS[mi%TK_CHART_COLORS.length] }}/>{m.label}</div>)}
                      </div>
                      <TkTrendChart gameData={defByGame} metrics={active} />
                    </TkCollapsible>
                  );
                })()}

                {/* Per-player defense table */}
                {byPlayerDef.length > 0 && (
                  <TkCollapsible title="Player Stats — Defense" defaultOpen>
                    <div style={{ overflowX:"auto" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:640 }}>
                        <thead><tr style={{ background:"#991b1b" }}>
                          {["Player","Pos","Tkl","Ast","TFL","Sacks","INTs","FF","PBU"].map((h,i) => (
                            <th key={h} style={{ padding:"8px 10px", fontWeight:700, color:"#fff", fontSize:11, textTransform:"uppercase", textAlign:i<2?"left":"center", position:i===0?"sticky":undefined, left:i===0?0:undefined, zIndex:i===0?3:undefined, background:i===0?"#991b1b":undefined, boxShadow:i===0?"2px 0 5px rgba(0,0,0,0.1)":undefined }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {byPlayerDef.map((p,ri) => {
                            const bg = ri%2===0?"#fff":"#fafafa";
                            return (
                              <tr key={p.id} style={{ borderBottom:"1px solid #f3f4f6", background:bg }}>
                                <td style={{ padding:"9px 10px", fontWeight:700, color:"#111827", position:"sticky", left:0, background:bg, boxShadow:"2px 0 5px rgba(0,0,0,0.07)", whiteSpace:"nowrap" }}>{p.name}</td>
                                <td style={{ padding:"9px 10px" }}>{p.positions.map(pos => <TkBadge key={pos} color="red">{pos}</TkBadge>)}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, color:"#111827" }}>{p.tackles||"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{p.assists||"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:TK.red, fontWeight:700 }}>{p.tfls||"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center" }}>{p.sacks>0?<TkBadge color="red">{p.sacks}</TkBadge>:"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center" }}>{p.ints>0?<TkBadge color="green">{p.ints}</TkBadge>:"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{p.forcedFumbles||"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{p.pbu||"—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </TkCollapsible>
                )}

                {/* Defensive call breakdown */}
                {byDefCode.length > 0 && (
                  <TkCollapsible title="Defensive Call Breakdown" subtitle="By play call">
                    <div style={{ overflowX:"auto" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead><tr style={{ background:"#991b1b" }}>
                          {["Call","Plays","Yds Allowed/Play","TDs Allowed","Sacks","TFL","INT"].map((h,i) => (
                            <th key={h} style={{ padding:"8px 10px", fontWeight:700, color:"#fff", fontSize:11, textTransform:"uppercase", textAlign:i===0?"left":"center", position:i===0?"sticky":undefined, left:i===0?0:undefined, zIndex:i===0?3:undefined, background:i===0?"#991b1b":undefined, boxShadow:i===0?"2px 0 5px rgba(0,0,0,0.1)":undefined }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {byDefCode.map((r,ri) => {
                            const bg = ri%2===0?"#fff":"#fafafa";
                            return (
                              <tr key={r.code} style={{ borderBottom:"1px solid #f3f4f6", background:bg }}>
                                <td style={{ padding:"9px 10px", fontWeight:700, color:"#111827", position:"sticky", left:0, background:bg, boxShadow:"2px 0 5px rgba(0,0,0,0.07)", whiteSpace:"nowrap" }}>{r.code}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.plays}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, color:TK.red }}>{r.plays>0?(r.yardsAllowed/r.plays).toFixed(1):"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.tdsAllowed||"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center" }}>{r.sacks>0?<TkBadge color="red">{r.sacks}</TkBadge>:"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.tfls||"—"}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center" }}>{r.ints>0?<TkBadge color="green">{r.ints}</TkBadge>:"—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </TkCollapsible>
                )}
              </>)}
            </>)}

            {/* ── SPECIAL TEAMS ANALYTICS ────────────────────────────────── */}
            {analyticsSubTab === "Special Teams" && (<>
              {filteredStPlays.length === 0 ? (
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:60, textAlign:"center", color:"#9ca3af", fontSize:15 }}>No special teams plays logged yet.</div>
              ) : (<>
                <div style={{ display:"grid", gridTemplateColumns:cols4, gap:14 }}>
                  <TkStatCard label="ST Plays" value={filteredStPlays.length} accent="#7c3aed" />
                  <TkStatCard label="FGs Made" value={filteredStPlays.filter(p=>(p.stType==="Field Goal Attempt"||p.stType==="PAT (1pt)")&&p.outcome==="Good").length} accent="#7c3aed" />
                  <TkStatCard label="Punts" value={filteredStPlays.filter(p=>p.stType==="Punt").length} accent="#7c3aed" />
                  <TkStatCard label="Kick Returns" value={filteredStPlays.filter(p=>p.stType==="Kick Return").length} accent="#7c3aed" />
                </div>
                <TkCollapsible title="ST Breakdown by Type" defaultOpen>
                  {Object.entries(filteredStPlays.reduce((acc,p)=>{ acc[p.stType]=(acc[p.stType]||[]); acc[p.stType].push(p); return acc; },{})).map(([type,plays]) => (
                    <div key={type} style={{ marginBottom:16 }}>
                      <div style={{ fontSize:13, fontWeight:800, color:"#374151", marginBottom:6 }}>{type} <span style={{ fontWeight:500, color:"#9ca3af" }}>({plays.length} plays)</span></div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {Object.entries(plays.reduce((acc,p)=>{ acc[p.outcome]=(acc[p.outcome]||0)+1; return acc; },{})).sort((a,b)=>b[1]-a[1]).map(([outcome,cnt]) => (
                          <span key={outcome} style={{ fontSize:12, background:"#f3f4f6", color:"#374151", padding:"3px 10px", borderRadius:99 }}>
                            {outcome}: <strong>{cnt}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </TkCollapsible>

                {/* Play (play-code) breakdown */}
                {byStCode.length > 0 && (
                  <TkCollapsible title="Play Breakdown" subtitle="By play call">
                    <div style={{ overflowX:"auto" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead><tr style={{ background:"#6d28d9" }}>
                          {["Play","Plays","Total Yds","Yds/Play"].map((h,i) => (
                            <th key={h} style={{ padding:"8px 10px", fontWeight:700, color:"#fff", fontSize:11, textTransform:"uppercase", textAlign:i===0?"left":"center", position:i===0?"sticky":undefined, left:i===0?0:undefined, zIndex:i===0?3:undefined, background:i===0?"#6d28d9":undefined, boxShadow:i===0?"2px 0 5px rgba(0,0,0,0.1)":undefined }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {byStCode.map((r,ri) => {
                            const bg = ri%2===0?"#fff":"#fafafa";
                            return (
                              <tr key={r.code} style={{ borderBottom:"1px solid #f3f4f6", background:bg }}>
                                <td style={{ padding:"9px 10px", fontWeight:700, color:"#111827", position:"sticky", left:0, background:bg, boxShadow:"2px 0 5px rgba(0,0,0,0.07)", whiteSpace:"nowrap" }}>{r.code}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.plays}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.yards}</td>
                                <td style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, color:"#6d28d9" }}>{r.plays>0?(r.yards/r.plays).toFixed(1):"—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </TkCollapsible>
                )}
              </>)}
            </>)}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* GAME SUMMARY — sub-tab under Analytics                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {tab === "Analytics" && analyticsSubTab === "Game Summary" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20, marginTop:20 }}>
            {games.length === 0 ? (
              <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:60, textAlign:"center", color:"#9ca3af" }}>No games configured. Add games in Settings → General.</div>
            ) : games.map(game => {
              const gOffPlays = plays.filter(p => p.game === game);
              const gDefPlays = defPlays.filter(p => p.game === game);
              const hasData   = gOffPlays.length > 0 || gDefPlays.length > 0;
              const score     = gameScores[game] || {};

              // Offense
              const offYards = gOffPlays.reduce((a,b)=>a+(Number(b.yardsGained)||0),0);
              const offTDs   = gOffPlays.filter(p=>p.outcome==="TD").length;

              // Defense
              const defYards = gDefPlays.reduce((a,b)=>a+(Number(b.yardsAllowed)||0),0);
              const defSacks = gDefPlays.filter(p=>p.outcome?.includes("Sack")).length;

              // Top performers
              const rushMap = {};
              gOffPlays.filter(p=>p.carrier).forEach(p => { rushMap[p.carrier]=(rushMap[p.carrier]||0)+(Number(p.yardsGained)||0); });
              const topRusherId  = Object.entries(rushMap).sort((a,b)=>b[1]-a[1])[0]?.[0];
              const topRusher    = topRusherId ? players.find(pl=>String(pl.id)===String(topRusherId)) : null;

              const recMap = {};
              gOffPlays.filter(p=>p.receiver&&!["Incomplete","Drop"].includes(p.outcome)&&p.outcome)
                       .forEach(p => { recMap[p.receiver]=(recMap[p.receiver]||0)+(Number(p.yardsGained)||0); });
              const topReceiverId = Object.entries(recMap).sort((a,b)=>b[1]-a[1])[0]?.[0];
              const topReceiver   = topReceiverId ? players.find(pl=>String(pl.id)===String(topReceiverId)) : null;

              const tklMap = {};
              gDefPlays.filter(p=>p.primaryTackler).forEach(p => { tklMap[p.primaryTackler]=(tklMap[p.primaryTackler]||0)+1; });
              const topTacklerId = Object.entries(tklMap).sort((a,b)=>b[1]-a[1])[0]?.[0];
              const topTackler   = topTacklerId ? players.find(pl=>String(pl.id)===String(topTacklerId)) : null;

              const winStatus = (score.us != null && score.them != null && (score.us !== "" && score.them !== ""))
                ? (Number(score.us) > Number(score.them) ? "W" : Number(score.us) < Number(score.them) ? "L" : "T")
                : null;

              return (
                <div key={game} style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
                  {/* Header */}
                  <div style={{ background:TK.headerBg, padding:"16px 24px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                      <div style={{ fontSize:17, fontWeight:900, color:"#fff" }}>{game}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <input type="number" min="0" placeholder="Us"
                          value={score.us ?? ""}
                          onChange={e => saveGameScore(game, { ...score, us:e.target.value===""?null:Number(e.target.value) })}
                          style={{ width:52, padding:"5px 8px", borderRadius:6, border:"1px solid rgba(255,255,255,0.3)", background:"rgba(255,255,255,0.12)", color:"#fff", fontFamily:"inherit", fontWeight:800, fontSize:18, textAlign:"center", outline:"none" }} />
                        <span style={{ color:"rgba(255,255,255,0.6)", fontWeight:700, fontSize:16 }}>–</span>
                        <input type="number" min="0" placeholder="Them"
                          value={score.them ?? ""}
                          onChange={e => saveGameScore(game, { ...score, them:e.target.value===""?null:Number(e.target.value) })}
                          style={{ width:52, padding:"5px 8px", borderRadius:6, border:"1px solid rgba(255,255,255,0.3)", background:"rgba(255,255,255,0.12)", color:"#fff", fontFamily:"inherit", fontWeight:800, fontSize:18, textAlign:"center", outline:"none" }} />
                        {winStatus && (
                          <span style={{ padding:"3px 10px", borderRadius:999, fontSize:13, fontWeight:800, background: winStatus==="W"?"#ffe4e6":winStatus==="L"?"#fee2e2":"#f3f4f6", color: winStatus==="W"?"#881337":winStatus==="L"?"#991b1b":"#374151" }}>{winStatus}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!hasData ? (
                    <div style={{ padding:"24px", textAlign:"center", color:"#9ca3af", fontSize:13 }}>No plays logged for this game.</div>
                  ) : (
                    <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>
                      {/* Offense + Defense stat rows */}
                      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:14 }}>
                        {gOffPlays.length > 0 && (
                          <div style={{ background:"#fff1f2", borderRadius:12, padding:"14px 16px", border:"1px solid #fecdd3" }}>
                            <div style={{ fontSize:11, fontWeight:800, color:TK.primary, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>⚔️ Offense</div>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8, textAlign:"center" }}>
                              {[
                                { label:"Plays",     val:gOffPlays.length },
                                { label:"Yards",     val:offYards },
                                { label:"TDs",       val:offTDs },
                                { label:"Yds/Play",  val:gOffPlays.length>0?(offYards/gOffPlays.length).toFixed(1):0 },
                                { label:"1st Downs", val:gOffPlays.filter(p=>p.outcome==="First Down"||p.outcome==="TD").length },
                                { label:"3rd%",      val:(() => { const t3=gOffPlays.filter(p=>p.down==="3"); return t3.length>0?`${Math.round(t3.filter(p=>p.outcome==="First Down"||p.outcome==="TD").length/t3.length*100)}%`:"—"; })() },
                              ].map(s => (
                                <div key={s.label}>
                                  <div style={{ fontSize:18, fontWeight:900, color:TK.primaryDark }}>{s.val}</div>
                                  <div style={{ fontSize:10, color:"#6b7280", fontWeight:600, textTransform:"uppercase", letterSpacing:0.4 }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {gDefPlays.length > 0 && (
                          <div style={{ background:"#fef2f2", borderRadius:12, padding:"14px 16px", border:"1px solid #fecaca" }}>
                            <div style={{ fontSize:11, fontWeight:800, color:TK.red, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>🛡 Defense</div>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8, textAlign:"center" }}>
                              {[
                                { label:"Plays",       val:gDefPlays.length },
                                { label:"Yds Allowed", val:defYards },
                                { label:"TDs Allowed", val:gDefPlays.filter(p=>p.outcome?.includes("TD Allowed")).length },
                                { label:"Yds/Play",    val:gDefPlays.length>0?(defYards/gDefPlays.length).toFixed(1):0 },
                                { label:"Sacks",       val:defSacks },
                                { label:"TFLs",        val:gDefPlays.filter(p=>p.outcome?.includes("TFL")).length },
                              ].map(s => (
                                <div key={s.label}>
                                  <div style={{ fontSize:18, fontWeight:900, color:"#991b1b" }}>{s.val}</div>
                                  <div style={{ fontSize:10, color:"#6b7280", fontWeight:600, textTransform:"uppercase", letterSpacing:0.4 }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Top performers */}
                      {(topRusher || topReceiver || topTackler) && (
                        <div>
                          <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Top Performers</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                            {topRusher && (
                              <div style={{ background:"#fff1f2", border:"1px solid #fecdd3", borderRadius:10, padding:"9px 14px" }}>
                                <div style={{ fontSize:10, color:TK.primary, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:2 }}>🏃 Top Rusher</div>
                                <div style={{ fontSize:14, fontWeight:800, color:"#111827" }}>{topRusher.name}</div>
                                <div style={{ fontSize:12, color:"#6b7280" }}>{rushMap[topRusherId]} yds · {gOffPlays.filter(p=>String(p.carrier)===String(topRusherId)).length} car</div>
                              </div>
                            )}
                            {topReceiver && (
                              <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, padding:"9px 14px" }}>
                                <div style={{ fontSize:10, color:"#1d4ed8", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:2 }}>📡 Top Receiver</div>
                                <div style={{ fontSize:14, fontWeight:800, color:"#111827" }}>{topReceiver.name}</div>
                                <div style={{ fontSize:12, color:"#6b7280" }}>{recMap[topReceiverId]} yds</div>
                              </div>
                            )}
                            {topTackler && (
                              <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"9px 14px" }}>
                                <div style={{ fontSize:10, color:TK.red, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:2 }}>🛡 Top Tackler</div>
                                <div style={{ fontSize:14, fontWeight:800, color:"#111827" }}>{topTackler.name}</div>
                                <div style={{ fontSize:12, color:"#6b7280" }}>{tklMap[topTacklerId]} tackles</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* REPORT CARDS — sub-tab under Analytics                             */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {tab === "Analytics" && analyticsSubTab === "Report Cards" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20, marginTop:20 }}>
            {selectedPlayer ? (() => {
              const pl = players.find(p => String(p.id) === String(selectedPlayer));
              if (!pl) { setSelectedPlayer(null); return null; }

              // Season totals — offense
              const offStats = {
                carries:    plays.filter(p=>String(p.carrier)===String(pl.id)).length,
                rushYards:  plays.filter(p=>String(p.carrier)===String(pl.id)).reduce((a,b)=>a+(Number(b.yardsGained)||0),0),
                rushTDs:    plays.filter(p=>String(p.carrier)===String(pl.id)&&p.outcome==="TD").length,
                targets:    plays.filter(p=>String(p.receiver)===String(pl.id)).length,
                receptions: plays.filter(p=>String(p.receiver)===String(pl.id)&&!["Incomplete","Drop"].includes(p.outcome)&&p.outcome).length,
                recYards:   plays.filter(p=>String(p.receiver)===String(pl.id)&&!["Incomplete","Drop"].includes(p.outcome)&&p.outcome).reduce((a,b)=>a+(Number(b.yardsGained)||0),0),
                recTDs:     plays.filter(p=>String(p.receiver)===String(pl.id)&&p.outcome==="TD").length,
              };
              const hasOff = offStats.carries>0 || offStats.targets>0;

              // Season totals — defense
              const defStats = {
                tackles:      defPlays.filter(p=>String(p.primaryTackler)===String(pl.id)).length,
                assists:      defPlays.filter(p=>String(p.secondaryTackler)===String(pl.id)&&p.secondaryTackler!==p.primaryTackler).length,
                tfls:         defPlays.filter(p=>String(p.primaryTackler)===String(pl.id)&&p.outcome?.includes("TFL")).length,
                sacks:        defPlays.filter(p=>String(p.primaryTackler)===String(pl.id)&&p.outcome?.includes("Sack")).length,
                ints:         defPlays.filter(p=>String(p.primaryTackler)===String(pl.id)&&p.outcome?.includes("INT")).length,
                forcedFumbles:defPlays.filter(p=>String(p.primaryTackler)===String(pl.id)&&p.outcome?.includes("Forced Fumble")).length,
                pbu:          defPlays.filter(p=>String(p.primaryTackler)===String(pl.id)&&p.playerAction?.includes("PBU")).length,
              };
              const hasDef = defStats.tackles>0 || defStats.assists>0 || defStats.ints>0;

              // Last game with plays
              const pid = String(pl.id);
              const lastGame = [...games].reverse().find(g =>
                plays.some(p=>(String(p.carrier)===pid||String(p.receiver)===pid)&&p.game===g) ||
                defPlays.some(p=>(String(p.primaryTackler)===pid||String(p.secondaryTackler)===pid)&&p.game===g)
              );
              const lgOff = lastGame ? {
                carries:    plays.filter(p=>p.game===lastGame&&String(p.carrier)===pid).length,
                rushYards:  plays.filter(p=>p.game===lastGame&&String(p.carrier)===pid).reduce((a,b)=>a+(Number(b.yardsGained)||0),0),
                rushTDs:    plays.filter(p=>p.game===lastGame&&String(p.carrier)===pid&&p.outcome==="TD").length,
                targets:    plays.filter(p=>p.game===lastGame&&String(p.receiver)===pid).length,
                receptions: plays.filter(p=>p.game===lastGame&&String(p.receiver)===pid&&!["Incomplete","Drop"].includes(p.outcome)&&p.outcome).length,
                recYards:   plays.filter(p=>p.game===lastGame&&String(p.receiver)===pid&&!["Incomplete","Drop"].includes(p.outcome)&&p.outcome).reduce((a,b)=>a+(Number(b.yardsGained)||0),0),
                recTDs:     plays.filter(p=>p.game===lastGame&&String(p.receiver)===pid&&p.outcome==="TD").length,
              } : null;
              const lgDef = lastGame ? {
                tackles: defPlays.filter(p=>p.game===lastGame&&String(p.primaryTackler)===pid).length,
                assists: defPlays.filter(p=>p.game===lastGame&&String(p.secondaryTackler)===pid).length,
                tfls:    defPlays.filter(p=>p.game===lastGame&&String(p.primaryTackler)===pid&&p.outcome?.includes("TFL")).length,
                sacks:   defPlays.filter(p=>p.game===lastGame&&String(p.primaryTackler)===pid&&p.outcome?.includes("Sack")).length,
                ints:    defPlays.filter(p=>p.game===lastGame&&String(p.primaryTackler)===pid&&p.outcome?.includes("INT")).length,
              } : null;

              const note = playerNotes[pid] || "";

              return (
                <>
                  <button onClick={() => setSelectedPlayer(null)} style={{ alignSelf:"flex-start", display:"flex", alignItems:"center", gap:6, padding:"6px 0", background:"none", border:"none", cursor:"pointer", fontSize:14, fontWeight:700, color:TK.primary, fontFamily:"inherit" }}>
                    ← All Players
                  </button>

                  {/* Player header */}
                  <div style={{ background:TK.headerBg, borderRadius:16, padding:"20px 24px", display:"flex", alignItems:"center", gap:16 }}>
                    <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:900, color:"#fff", flexShrink:0 }}>
                      {pl.number ? `#${pl.number}` : pl.name[0]}
                    </div>
                    <div>
                      <div style={{ fontSize:20, fontWeight:900, color:"#fff" }}>{pl.name}</div>
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>
                        {getPositions(pl).map(pos => <TkBadge key={pos} color="green">{pos}</TkBadge>)}
                      </div>
                    </div>
                  </div>

                  {/* Season offense */}
                  {hasOff && (
                    <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:TK.primary, marginBottom:14 }}>Season — Offense</div>
                      <div style={{ display:"grid", gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)", gap:10 }}>
                        {[
                          { label:"Carries",    val:offStats.carries||"—" },
                          { label:"Rush Yds",   val:offStats.rushYards||"—" },
                          { label:"Yds/Carry",  val:offStats.carries>0?(offStats.rushYards/offStats.carries).toFixed(1):"—" },
                          { label:"Rush TDs",   val:offStats.rushTDs||"—" },
                          { label:"Targets",    val:offStats.targets||"—" },
                          { label:"Receptions", val:offStats.receptions||"—" },
                          { label:"Rec Yards",  val:offStats.recYards||"—" },
                          { label:"Rec TDs",    val:offStats.recTDs||"—" },
                        ].map(s => (
                          <div key={s.label} style={{ textAlign:"center", padding:"10px 4px", borderRadius:10, background:"#fff1f2" }}>
                            <div style={{ fontSize:20, fontWeight:900, color:TK.primaryDark }}>{s.val}</div>
                            <div style={{ fontSize:10, color:"#6b7280", fontWeight:600, textTransform:"uppercase", letterSpacing:0.4, marginTop:2 }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Season defense */}
                  {hasDef && (
                    <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:TK.red, marginBottom:14 }}>Season — Defense</div>
                      <div style={{ display:"grid", gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)", gap:10 }}>
                        {[
                          { label:"Tackles", val:defStats.tackles||"—" },
                          { label:"Assists",  val:defStats.assists||"—" },
                          { label:"TFLs",     val:defStats.tfls||"—" },
                          { label:"Sacks",    val:defStats.sacks||"—" },
                          { label:"INTs",     val:defStats.ints||"—" },
                          { label:"FF",       val:defStats.forcedFumbles||"—" },
                          { label:"PBU",      val:defStats.pbu||"—" },
                        ].map(s => (
                          <div key={s.label} style={{ textAlign:"center", padding:"10px 4px", borderRadius:10, background:"#fef2f2" }}>
                            <div style={{ fontSize:20, fontWeight:900, color:"#991b1b" }}>{s.val}</div>
                            <div style={{ fontSize:10, color:"#6b7280", fontWeight:600, textTransform:"uppercase", letterSpacing:0.4, marginTop:2 }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Last game highlights */}
                  {lastGame && (lgOff?.carries > 0 || lgOff?.targets > 0 || lgDef?.tackles > 0) && (
                    <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:"#374151", marginBottom:10 }}>Last Game — {lastGame}</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                        {lgOff?.carries > 0 && <span style={{ fontSize:13, background:"#fff1f2", color:TK.primaryDark, fontWeight:700, padding:"6px 12px", borderRadius:8 }}>🏃 {lgOff.carries} car · {lgOff.rushYards} rush yds{lgOff.rushTDs>0?` · ${lgOff.rushTDs} TD`:""}</span>}
                        {lgOff?.targets > 0 && <span style={{ fontSize:13, background:"#eff6ff", color:"#1e40af", fontWeight:700, padding:"6px 12px", borderRadius:8 }}>📡 {lgOff.receptions}/{lgOff.targets} rec · {lgOff.recYards} yds{lgOff.recTDs>0?` · ${lgOff.recTDs} TD`:""}</span>}
                        {lgDef?.tackles > 0 && <span style={{ fontSize:13, background:"#fef2f2", color:"#991b1b", fontWeight:700, padding:"6px 12px", borderRadius:8 }}>🛡 {lgDef.tackles} tkl{lgDef.assists>0?` · ${lgDef.assists} ast`:""}{lgDef.sacks>0?` · ${lgDef.sacks} sack`:""}{lgDef.tfls>0?` · ${lgDef.tfls} TFL`:""}{lgDef.ints>0?` · ${lgDef.ints} INT`:""}</span>}
                      </div>
                    </div>
                  )}

                  {/* Focus Areas */}
                  <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                    <div style={{ fontSize:14, fontWeight:800, color:"#374151", marginBottom:6 }}>Focus Areas</div>
                    <div style={{ fontSize:12, color:"#9ca3af", marginBottom:10 }}>Coach notes for this player. Saved automatically.</div>
                    <textarea
                      placeholder="e.g. Work on route running from the slot. Great run blocking this week."
                      value={note}
                      onChange={e => savePlayerNote(pid, e.target.value)}
                      style={{ width:"100%", minHeight:120, padding:"10px 12px", borderRadius:8, border:"1.5px solid #d1d5db", fontFamily:"inherit", fontSize:14, color:"#111827", resize:"vertical", boxSizing:"border-box", outline:"none", lineHeight:1.6 }}
                    />
                  </div>
                </>
              );
            })() : (
              <>
                <div style={{ fontSize:20, fontWeight:900, color:"#111827" }}>Report Cards</div>
                {players.length === 0 ? (
                  <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:60, textAlign:"center", color:"#9ca3af" }}>No players added yet. Add players in Settings → General.</div>
                ) : (
                  <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3, 1fr)", gap:14 }}>
                    {[...players].sort((a,b)=>a.name.localeCompare(b.name)).map(pl => {
                      const pid = String(pl.id);
                      const hasOff = plays.some(p=>String(p.carrier)===pid||String(p.receiver)===pid);
                      const hasDef = defPlays.some(p=>String(p.primaryTackler)===pid||String(p.secondaryTackler)===pid);
                      const offTDs = plays.filter(p=>(String(p.carrier)===pid||String(p.receiver)===pid)&&p.outcome==="TD").length;
                      const tklCnt = defPlays.filter(p=>String(p.primaryTackler)===pid).length;
                      const hasNote = !!playerNotes[pid];
                      return (
                        <button key={pl.id} onClick={() => setSelectedPlayer(pl.id)}
                          style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e5e7eb", padding:"16px", textAlign:"left", cursor:"pointer", fontFamily:"inherit" }}
                          onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(21,128,61,0.13)"}
                          onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                            <div style={{ width:38, height:38, borderRadius:"50%", background:TK.primaryLight, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:900, color:TK.primaryDark, flexShrink:0 }}>
                              {pl.number ? `#${pl.number}` : pl.name[0]}
                            </div>
                            <div>
                              <div style={{ fontSize:14, fontWeight:800, color:"#111827" }}>{pl.name}</div>
                              <div style={{ display:"flex", gap:3, flexWrap:"wrap", marginTop:2 }}>
                                {getPositions(pl).map(pos => <TkBadge key={pos} color="green">{pos}</TkBadge>)}
                              </div>
                            </div>
                          </div>
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            {hasOff && offTDs > 0 && <span style={{ fontSize:11, background:"#fff1f2", color:TK.primaryDark, fontWeight:700, padding:"2px 8px", borderRadius:6 }}>{offTDs} TD{offTDs!==1?"s":""}</span>}
                            {hasDef && tklCnt > 0 && <span style={{ fontSize:11, background:"#fef2f2", color:"#991b1b", fontWeight:700, padding:"2px 8px", borderRadius:6 }}>{tklCnt} Tkl</span>}
                            {hasNote && <span style={{ fontSize:11, background:"#fef9c3", color:"#854d0e", fontWeight:700, padding:"2px 8px", borderRadius:6 }}>📝 Notes</span>}
                            {!hasOff && !hasDef && <span style={{ fontSize:11, color:"#d1d5db" }}>No plays yet</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PLAYBOOK TAB                                                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {tab === "Playbook" && (
          <TacklePlaybook
            instanceId={instanceId}
            tk={TK}
            playCodes={playCodes}
            onAddPlayCode={(code) => savePlayCodes([...playCodes, code])}
          />
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SETTINGS TAB                                                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {tab === "Settings" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            {/* Settings sub-tabs */}
            <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:2 }}>
              {["general","offense","defense","special teams"].map(st => (
                <button key={st} onClick={() => setSettingsTab(st)} style={{
                  padding:"8px 16px", borderRadius:8, border:"none", fontWeight:700, fontSize:12,
                  cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap",
                  background: settingsTab===st ? TK.buttonBg : "#e5e7eb",
                  color: settingsTab===st ? "#fff" : "#374151",
                }}>{st.charAt(0).toUpperCase()+st.slice(1)}</button>
              ))}
            </div>

            {/* General: Players + Games */}
            {settingsTab === "general" && (
              <>
                {/* Players */}
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Players</div>

                  {/* Add player form */}
                  <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                    <input style={{ ...inp, padding:"9px 12px", flex:2 }} placeholder="Full name" value={newPlayer.name} onChange={e => setNewPlayer(p => ({ ...p, name:e.target.value }))} />
                    <input style={{ ...inp, padding:"9px 12px", width:72 }} placeholder="#" value={newPlayer.number} onChange={e => setNewPlayer(p => ({ ...p, number:e.target.value }))} />
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", marginBottom:8, letterSpacing:0.5 }}>POSITIONS — tap to select (choose all that apply)</div>
                    {TK_POSITION_CATEGORIES.map((cat, ci) => {
                      const group = positions.filter(p => p.category === cat.key);
                      if (!group.length) return null;
                      const catColor = ci === 0 ? TK.primary : "#1d4ed8";
                      return (
                        <div key={cat.key} style={{ marginBottom:8 }}>
                          <div style={{ fontSize:10, fontWeight:800, color:catColor, textTransform:"uppercase", letterSpacing:0.8, marginBottom:5 }}>{cat.label}</div>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                            {group.map(pos => {
                              const sel = newPlayer.positions.includes(pos.name);
                              return (
                                <button key={pos.id} onClick={() => setNewPlayer(p => ({ ...p, positions:sel?p.positions.filter(x=>x!==pos.name):[...p.positions,pos.name] }))}
                                  style={{ padding:"4px 10px", borderRadius:99, fontSize:12, fontWeight:sel?700:500, border:`1.5px solid ${sel?TK.primary:"#d1d5db"}`, background:sel?TK.primary:"#f8fafc", color:sel?"#fff":"#6b7280", cursor:"pointer", fontFamily:"inherit" }}>
                                  {pos.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {positions.filter(p => !p.category).length > 0 && (
                      <div style={{ marginBottom:4 }}>
                        <div style={{ fontSize:10, fontWeight:800, color:"#9ca3af", textTransform:"uppercase", letterSpacing:0.8, marginBottom:5 }}>Other</div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                          {positions.filter(p => !p.category).map(pos => {
                            const sel = newPlayer.positions.includes(pos.name);
                            return (
                              <button key={pos.id} onClick={() => setNewPlayer(p => ({ ...p, positions:sel?p.positions.filter(x=>x!==pos.name):[...p.positions,pos.name] }))}
                                style={{ padding:"4px 10px", borderRadius:99, fontSize:12, fontWeight:sel?700:500, border:`1.5px solid ${sel?TK.primary:"#d1d5db"}`, background:sel?TK.primary:"#f8fafc", color:sel?"#fff":"#6b7280", cursor:"pointer", fontFamily:"inherit" }}>
                                {pos.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={() => {
                    if (newPlayer.name.trim() && newPlayer.positions.length > 0) {
                      savePlayers([...players, { id:Date.now(), name:newPlayer.name.trim(), number:newPlayer.number, positions:newPlayer.positions }]);
                      setNewPlayer({ name:"", number:"", positions:[] });
                    }
                  }} style={{ padding:"9px 20px", background:TK.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13, marginBottom:20 }}>
                    Add Player
                  </button>

                  {/* Player list */}
                  <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:400, overflowY:"auto" }}>
                    {[...players].sort((a,b)=>a.name.localeCompare(b.name)).map(pl => (
                      <div key={pl.id} style={{ padding:"10px 14px", background:"#f8fafc", borderRadius:10, border:"1px solid #e5e7eb" }}>
                        {editingPlayer?.id===pl.id ? (
                          <>
                            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                              <input autoFocus style={{ ...inp, flex:2, padding:"6px 10px", fontSize:13 }} value={editingPlayer.name} onChange={e => setEditingPlayer(ep => ({ ...ep, name:e.target.value }))} />
                              <input style={{ ...inp, width:64, padding:"6px 10px", fontSize:13 }} value={editingPlayer.number||""} onChange={e => setEditingPlayer(ep => ({ ...ep, number:e.target.value }))} placeholder="#" />
                            </div>
                            <div style={{ marginBottom:10 }}>
                              {TK_POSITION_CATEGORIES.map((cat, ci) => {
                                const group = positions.filter(p => p.category === cat.key);
                                if (!group.length) return null;
                                const catColor = ci === 0 ? TK.primary : "#1d4ed8";
                                return (
                                  <div key={cat.key} style={{ marginBottom:6 }}>
                                    <div style={{ fontSize:10, fontWeight:800, color:catColor, textTransform:"uppercase", letterSpacing:0.8, marginBottom:4 }}>{cat.label}</div>
                                    <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                                      {group.map(pos => {
                                        const epPos = editingPlayer.positions || (editingPlayer.position ? [editingPlayer.position] : []);
                                        const sel = epPos.includes(pos.name);
                                        return (
                                          <button key={pos.id} onClick={() => setEditingPlayer(ep => {
                                            const cur = ep.positions || (ep.position ? [ep.position] : []);
                                            return { ...ep, positions:sel?cur.filter(x=>x!==pos.name):[...cur,pos.name], position:undefined };
                                          })}
                                            style={{ padding:"3px 9px", borderRadius:99, fontSize:11, fontWeight:sel?700:500, border:`1.5px solid ${sel?TK.primary:"#d1d5db"}`, background:sel?TK.primary:"#f8fafc", color:sel?"#fff":"#6b7280", cursor:"pointer", fontFamily:"inherit" }}>
                                            {pos.name}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                              {positions.filter(p => !p.category).length > 0 && (
                                <div>
                                  <div style={{ fontSize:10, fontWeight:800, color:"#9ca3af", textTransform:"uppercase", letterSpacing:0.8, marginBottom:4 }}>Other</div>
                                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                                    {positions.filter(p => !p.category).map(pos => {
                                      const epPos = editingPlayer.positions || (editingPlayer.position ? [editingPlayer.position] : []);
                                      const sel = epPos.includes(pos.name);
                                      return (
                                        <button key={pos.id} onClick={() => setEditingPlayer(ep => {
                                          const cur = ep.positions || (ep.position ? [ep.position] : []);
                                          return { ...ep, positions:sel?cur.filter(x=>x!==pos.name):[...cur,pos.name], position:undefined };
                                        })}
                                          style={{ padding:"3px 9px", borderRadius:99, fontSize:11, fontWeight:sel?700:500, border:`1.5px solid ${sel?TK.primary:"#d1d5db"}`, background:sel?TK.primary:"#f8fafc", color:sel?"#fff":"#6b7280", cursor:"pointer", fontFamily:"inherit" }}>
                                          {pos.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div style={{ display:"flex", gap:6 }}>
                              <button onClick={() => { if(editingPlayer.name.trim()) savePlayers(players.map(p=>p.id===pl.id?{...p,...editingPlayer}:p)); setEditingPlayer(null); }}
                                style={{ border:"none", background:"#ffe4e6", color:"#881337", borderRadius:6, padding:"5px 12px", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>Save</button>
                              <button onClick={() => setEditingPlayer(null)}
                                style={{ border:"none", background:"#f3f4f6", color:"#6b7280", borderRadius:6, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>Cancel</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                              <span style={{ fontSize:13, fontWeight:700, color:"#111827", flex:1 }}>{pl.name}{pl.number?` #${pl.number}`:""}</span>
                              <button onClick={() => setEditingPlayer({ ...pl, positions:getPositions(pl) })} style={{ border:"none", background:"none", color:"#6b7280", cursor:"pointer", fontSize:13, padding:"0 3px" }}>✏️</button>
                              <button onClick={() => { if(window.confirm(`Delete ${pl.name}?`)) savePlayers(players.filter(p=>p.id!==pl.id)); }}
                                style={{ border:"none", background:"none", color:"#ef4444", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                            </div>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                              {getPositions(pl).map(pos => <TkBadge key={pos} color="green">{pos}</TkBadge>)}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Positions */}
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:4 }}>Positions</div>
                  <div style={{ fontSize:12, color:"#9ca3af", marginBottom:16 }}>Assign each position to Offense or Defense so they group in the player form.</div>

                  {/* Add form */}
                  <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                    <input style={{ ...inp, flex:2, minWidth:80 }} placeholder="e.g. OLB, Nickel" value={newPositionName} onChange={e => setNewPositionName(e.target.value)}
                      onKeyDown={e => { if(e.key==="Enter"&&newPositionName.trim()){savePositions([...positions,{id:Date.now(),name:newPositionName.trim(),category:newPositionCat}]);setNewPositionName("");}}} />
                    <select style={{ ...inp, flex:1, minWidth:100 }} value={newPositionCat} onChange={e => setNewPositionCat(e.target.value)}>
                      {TK_POSITION_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      <option value="">Other</option>
                    </select>
                    <button onClick={() => { if(newPositionName.trim()){savePositions([...positions,{id:Date.now(),name:newPositionName.trim(),category:newPositionCat}]);setNewPositionName("");}}}
                      style={{ padding:"9px 16px", background:TK.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13, whiteSpace:"nowrap" }}>Add</button>
                  </div>

                  {/* Grouped chips */}
                  {TK_POSITION_CATEGORIES.map((cat, ci) => {
                    const group = positions.filter(p => p.category === cat.key);
                    if (!group.length) return null;
                    const catColor = ci === 0 ? TK.primary : "#1d4ed8";
                    const catBg    = ci === 0 ? TK.primaryLight : "#dbeafe";
                    const catBorder= ci === 0 ? TK.primaryLight : "#93c5fd";
                    return (
                      <div key={cat.key} style={{ marginBottom:14 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:catColor, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{cat.label}</div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                          {group.map(p => (
                            <div key={p.id} style={{ background:catBg, border:`1.5px solid ${catBorder}`, borderRadius:8, padding:"5px 12px", display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ fontSize:13, fontWeight:700, color:catColor }}>{p.name}</span>
                              <button onClick={() => savePositions(positions.filter(x=>x.id!==p.id))} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:14, padding:0, lineHeight:1 }}>×</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {positions.filter(p => !p.category).length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Other</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                        {positions.filter(p => !p.category).map(p => (
                          <div key={p.id} style={{ background:"#f3f4f6", border:"1.5px solid #e5e7eb", borderRadius:8, padding:"5px 12px", display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontSize:13, fontWeight:700, color:"#374151" }}>{p.name}</span>
                            <button onClick={() => savePositions(positions.filter(x=>x.id!==p.id))} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:14, padding:0, lineHeight:1 }}>×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {positions.length === 0 && (
                    <div style={{ fontSize:13, color:"#d1d5db", textAlign:"center", padding:"20px 0" }}>No positions yet. Add one above.</div>
                  )}
                </div>

                {/* Games */}
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Games</div>
                  <TkStringList items={games}
                    onAdd={v => saveGames([...games, v])}
                    onEdit={(i, v) => saveGames(games.map((x,j)=>j===i?v:x))}
                    onDelete={i => saveGames(games.filter((_,j)=>j!==i))}
                    placeholder="e.g. vs. Franklin" />
                </div>

                {/* Tags */}
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Play Tags</div>
                  <TkStringList items={tags}
                    onAdd={v => saveTags([...tags, v])}
                    onEdit={(i, v) => saveTags(tags.map((x,j)=>j===i?v:x))}
                    onDelete={i => saveTags(tags.filter((_,j)=>j!==i))}
                    placeholder="e.g. Red Zone, 2-Minute" />
                </div>

                {/* Color Theme */}
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:4 }}>Color Theme</div>
                  <div style={{ fontSize:12, color:"#6b7280", marginBottom:16 }}>Choose your team's primary color. The full palette is derived automatically.</div>

                  {/* Preset swatches */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
                    {TK_PRESET_COLORS.map(({ label, hex }) => (
                      <button key={hex} title={label} onClick={() => { setThemeColor(hex); saveThemeColor(hex); }}
                        style={{ width:32, height:32, borderRadius:8, background:hex, border: themeColor.toLowerCase()===hex.toLowerCase() ? "3px solid #111827" : "2px solid rgba(0,0,0,0.12)", cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.18)", flexShrink:0, transition:"transform 0.1s" }}
                        onMouseEnter={e=>e.currentTarget.style.transform="scale(1.15)"}
                        onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
                      />
                    ))}
                  </div>

                  {/* Color wheel + hex input + live preview */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                    <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(themeColor)?themeColor:"#be123c"}
                      onChange={e => { setThemeColor(e.target.value); }}
                      onBlur={e => { if(/^#[0-9a-fA-F]{6}$/.test(e.target.value)) saveThemeColor(e.target.value); }}
                      style={{ width:44, height:44, padding:3, borderRadius:8, border:"1.5px solid #d1d5db", cursor:"pointer", background:"none", flexShrink:0 }} />
                    <input type="text" value={themeColor} placeholder="#be123c"
                      onChange={e => {
                        const v = e.target.value;
                        setThemeColor(v);
                        if (/^#[0-9a-fA-F]{6}$/.test(v)) saveThemeColor(v);
                      }}
                      style={{ ...inp, width:110, fontFamily:"monospace", letterSpacing:1, flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:120, height:40, borderRadius:8, background:TK.headerBg, display:"flex", alignItems:"center", paddingLeft:14, gap:8 }}>
                      <div style={{ width:22, height:22, borderRadius:6, background:TK.primary, border:"2px solid rgba(255,255,255,0.4)" }} />
                      <span style={{ color:"#fff", fontSize:12, fontWeight:700, opacity:0.9 }}>Header preview</span>
                    </div>
                  </div>
                </div>

                {/* Team Logo */}
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:4 }}>Team Logo</div>
                  <div style={{ fontSize:12, color:"#6b7280", marginBottom:16 }}>Appears in the header and game summaries.</div>
                  <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                    {logoUrl && (
                      <img src={logoUrl} alt="Team logo" style={{ width:80, height:80, objectFit:"cover", borderRadius:12, border:"1.5px solid #e5e7eb" }} />
                    )}
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <label style={{ padding:"9px 18px", background:TK.buttonBg, color:"#fff", borderRadius:8, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                        {logoUploading ? "Uploading…" : logoUrl ? "Replace Logo" : "Upload Logo"}
                        <input type="file" accept="image/*" style={{ display:"none" }} disabled={logoUploading}
                          onChange={e => { const file = e.target.files[0]; if (file) handleLogoUpload(file); e.target.value = ""; }} />
                      </label>
                      {logoUrl && (
                        <button onClick={() => { if (window.confirm("Remove team logo?")) handleLogoDelete(); }}
                          style={{ padding:"9px 18px", background:"#fee2e2", color:"#dc2626", border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                          Remove Logo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Offense settings */}
            {settingsTab === "offense" && (
              <>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Formations</div>
                  <TkStringList items={formations}
                    onAdd={v => saveFormations([...formations, v])}
                    onEdit={(i, v) => saveFormations(formations.map((x,j)=>j===i?v:x))}
                    onDelete={i => saveFormations(formations.filter((_,j)=>j!==i))}
                    placeholder="e.g. Shotgun, I-Form" />
                </div>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Personnel Groups</div>
                  <TkStringList items={personnel}
                    onAdd={v => savePersonnel([...personnel, v])}
                    onEdit={(i, v) => savePersonnel(personnel.map((x,j)=>j===i?v:x))}
                    onDelete={i => savePersonnel(personnel.filter((_,j)=>j!==i))}
                    placeholder="e.g. 11, 21, 22" />
                </div>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:4 }}>Blocking Schemes</div>
                  <div style={{ fontSize:12, color:"#9ca3af", marginBottom:16 }}>Assign each scheme to a category so they group together in the logger.</div>

                  {/* Add form */}
                  <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                    <input style={{ ...inp, flex:2, minWidth:120 }} placeholder="e.g. Inside Zone, Slide Protect" value={newBlockingScheme} onChange={e => setNewBlockingScheme(e.target.value)}
                      onKeyDown={e => { if(e.key==="Enter"&&newBlockingScheme.trim()){saveBlockingSchemes([...blockingSchemes,{id:Date.now(),name:newBlockingScheme.trim(),category:newBlockingSchemeCat}]);setNewBlockingScheme("");}}} />
                    <select style={{ ...inp, flex:1, minWidth:90 }} value={newBlockingSchemeCat} onChange={e => setNewBlockingSchemeCat(e.target.value)}>
                      {TK_PLAY_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                    <button onClick={() => { if(newBlockingScheme.trim()){saveBlockingSchemes([...blockingSchemes,{id:Date.now(),name:newBlockingScheme.trim(),category:newBlockingSchemeCat}]);setNewBlockingScheme("");}}}
                      style={{ padding:"9px 16px", background:TK.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13, whiteSpace:"nowrap" }}>Add</button>
                  </div>

                  {/* Schemes grouped by category */}
                  {TK_PLAY_CATEGORIES.map(cat => {
                    const group = blockingSchemes.filter(s => s.category === cat.key);
                    if (!group.length) return null;
                    return (
                      <div key={cat.key} style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:cat.color, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{cat.label}</div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                          {group.map(s => (
                            <div key={s.id} style={{ background:cat.bg, border:`1.5px solid ${cat.border}`, borderRadius:8, padding:"5px 12px", display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ fontSize:13, fontWeight:700, color:cat.color }}>{s.name}</span>
                              <button onClick={() => saveBlockingSchemes(blockingSchemes.filter(x=>x.id!==s.id))} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:14, padding:0, lineHeight:1 }}>×</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {/* Legacy / uncategorized */}
                  {blockingSchemes.filter(s => !s.category).length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:"#9ca3af", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Uncategorized</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                        {blockingSchemes.filter(s => !s.category).map(s => (
                          <div key={s.id} style={{ background:"#f3f4f6", border:"1.5px solid #e5e7eb", borderRadius:8, padding:"5px 12px", display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontSize:13, fontWeight:700, color:"#374151" }}>{s.name}</span>
                            <button onClick={() => saveBlockingSchemes(blockingSchemes.filter(x=>x.id!==s.id))} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:14, padding:0, lineHeight:1 }}>×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {blockingSchemes.length === 0 && (
                    <div style={{ fontSize:13, color:"#d1d5db", textAlign:"center", padding:"20px 0" }}>No blocking schemes yet. Add one above.</div>
                  )}
                </div>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Offensive Outcomes</div>
                  <TkStringList items={offOutcomes}
                    onAdd={v => saveOffOutcomes([...offOutcomes, v])}
                    onEdit={(i, v) => saveOffOutcomes(offOutcomes.map((x,j)=>j===i?v:x))}
                    onDelete={i => saveOffOutcomes(offOutcomes.filter((_,j)=>j!==i))}
                    placeholder="e.g. First Down, Fumble" />
                </div>
                <PlayCodeManager unit="Offense" playCodes={playCodes} savePlayCodes={savePlayCodes}
                  TK={TK} isMobile={isMobile} inp={inp} placeholder="e.g. 24 Power, Z-Post, Jet Sweep" />
              </>
            )}

            {/* Defense settings */}
            {settingsTab === "defense" && (
              <>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Defensive Outcomes</div>
                  <TkStringList items={defOutcomes}
                    onAdd={v => saveDefOutcomes([...defOutcomes, v])}
                    onEdit={(i, v) => saveDefOutcomes(defOutcomes.map((x,j)=>j===i?v:x))}
                    onDelete={i => saveDefOutcomes(defOutcomes.filter((_,j)=>j!==i))}
                    placeholder="e.g. Sack, TFL" />
                </div>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Player Actions</div>
                  <TkStringList items={defActions}
                    onAdd={v => saveDefActions([...defActions, v])}
                    onEdit={(i, v) => saveDefActions(defActions.map((x,j)=>j===i?v:x))}
                    onDelete={i => saveDefActions(defActions.filter((_,j)=>j!==i))}
                    placeholder="e.g. Blitz, Zone Drop" />
                </div>
                <PlayCodeManager unit="Defense" playCodes={playCodes} savePlayCodes={savePlayCodes}
                  TK={TK} isMobile={isMobile} inp={inp} placeholder="e.g. Cover 3, Double A Gap, Nickel Fire" />
              </>
            )}

            {/* Special Teams settings */}
            {settingsTab === "special teams" && (
              <>
              <PlayCodeManager unit="Special Teams" playCodes={playCodes} savePlayCodes={savePlayCodes}
                TK={TK} isMobile={isMobile} inp={inp} placeholder="e.g. Punt Safe, Kick Return Left" />
              <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:4 }}>Special Teams Outcomes</div>
                <div style={{ fontSize:12, color:"#6b7280", marginBottom:20 }}>Outcomes are organised by play type. Edit as needed.</div>
                {TK_ST_TYPES.map(stType => (
                  <div key={stType} style={{ marginBottom:24 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:"#374151", marginBottom:8, padding:"6px 10px", background:"#f8fafc", borderRadius:6 }}>{stType}</div>
                    <TkStringList
                      items={stOutcomes[stType] || []}
                      onAdd={v => saveStOutcomes({ ...stOutcomes, [stType]:[...(stOutcomes[stType]||[]),v] })}
                      onEdit={(i, v) => saveStOutcomes({ ...stOutcomes, [stType]:(stOutcomes[stType]||[]).map((x,j)=>j===i?v:x) })}
                      onDelete={i => saveStOutcomes({ ...stOutcomes, [stType]:(stOutcomes[stType]||[]).filter((_,j)=>j!==i) })}
                      placeholder={`Add ${stType} outcome`} />
                  </div>
                ))}
              </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
