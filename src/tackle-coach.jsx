import { useState, useEffect, useMemo } from "react";
import { getApps } from "firebase/app";
import {
  getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, setDoc,
} from "firebase/firestore";
import { getAuth, signOut } from "firebase/auth";

// ── Re-use the Firebase app already initialised by football-coach.jsx ─────────
const getDb   = () => getFirestore(getApps()[0]);
const getAuthInst = () => getAuth(getApps()[0]);

// ── Firestore helpers ─────────────────────────────────────────────────────────
const tkBase   = (id) => `data/${id}`;
const tkColRef = (id, col)      => collection(getDb(), tkBase(id), col);
const tkDocRef = (id, ...segs)  => doc(getDb(), tkBase(id), ...segs);

// ── Theme ─────────────────────────────────────────────────────────────────────
const TK = {
  primary:      "#15803d",
  primaryDark:  "#14532d",
  primaryLight: "#dcfce7",
  buttonBg:     "#14532d",
  accent:       "#16a34a",
  headerBg:     "linear-gradient(135deg, #052e16 0%, #14532d 100%)",
  red:          "#dc2626",
};

// ── Default data ──────────────────────────────────────────────────────────────
const TK_POSITIONS = [
  "QB","RB","FB","WR","TE","C","G","T",    // offense
  "DE","DT","NT","LB","MLB","OLB","CB","S","FS","SS",  // defense
  "K","P","LS",                             // special teams
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
    green:  { background:"#dcfce7", color:"#14532d" },
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
                  style={{ border:"none", background:"#d1fae5", color:"#065f46", borderRadius:6, padding:"3px 8px", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>Save</button>
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
// ── TACKLE COACH MAIN COMPONENT ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function TackleCoach({ instanceId, authUser, userProfile, onSwitchPortal }) {
  const db   = getDb();
  const auth = getAuthInst();
  const base = tkBase(instanceId);

  // ── Responsive ──────────────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [tab,        setTab]        = useState("Log a Play +");
  const [logSubTab,  setLogSubTab]  = useState("Offense");
  const [settingsTab, setSettingsTab] = useState("general");
  const [filterGame, setFilterGame] = useState("All");

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
    listenDoc("tackle_config/positions",      snap => setPositions(snap.positions || TK_POSITIONS));
    listenDoc("tackle_config/formations",     snap => setFormations(snap.formations || TK_FORMATIONS));
    listenDoc("tackle_config/personnel",      snap => setPersonnel(snap.personnel || TK_PERSONNEL));
    listenDoc("tackle_config/blockingSchemes",snap => setBlockingSchemes(snap.schemes || TK_BLOCKING_SCHEMES));
    listenDoc("tackle_config/offOutcomes",    snap => setOffOutcomes(snap.outcomes || TK_OFF_OUTCOMES));
    listenDoc("tackle_config/defOutcomes",    snap => setDefOutcomes(snap.outcomes || TK_DEF_OUTCOMES));
    listenDoc("tackle_config/defActions",     snap => setDefActions(snap.actions || TK_DEF_ACTIONS));
    listenDoc("tackle_config/stOutcomes",     snap => setStOutcomes(snap.outcomes || TK_ST_OUTCOMES));
    listenDoc("tackle_config/tags",           snap => setTags(snap.tags || TK_DEFAULT_TAGS));
    listenDoc("tackle_config/playCodes",      snap => setPlayCodes(snap.codes || []));
    listenDoc("tackle_config/gameScores",     snap => setGameScores(snap || {}));
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
    playType:"", outcome:"",
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
    outcome:"", notes:"",
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
  const [newPlayer, setNewPlayer] = useState({ name:"", number:"", position:"" });
  const [editingPlayer, setEditingPlayer] = useState(null);

  // ── Analytics ────────────────────────────────────────────────────────────────
  const filteredOffPlays = useMemo(() =>
    filterGame === "All" ? plays : plays.filter(p => p.game === filterGame),
  [plays, filterGame]);
  const filteredDefPlays = useMemo(() =>
    filterGame === "All" ? defPlays : defPlays.filter(p => p.game === filterGame),
  [defPlays, filterGame]);

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
  const TABS = ["Log a Play +","Play History","Analytics","Settings"];

  return (
    <div style={{ minHeight:"100vh", background:"#f4f6fa", fontFamily:"'DM Sans', system-ui, sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background:TK.headerBg, boxShadow:"0 4px 24px rgba(0,0,0,0.25)" }}>
        <div style={{ maxWidth: isMobile ? undefined : 980, margin:"0 auto", padding: isMobile ? "14px 16px 0" : "20px 24px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom: isMobile ? 12 : 18 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>🏈</div>
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
          {/* Desktop tab row */}
          {!isMobile && (
            <div style={{ display:"flex", gap:2 }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding:"10px 20px", background:"none", border:"none",
                  borderBottom: tab===t ? "3px solid #fff" : "3px solid transparent",
                  color: tab===t ? "#fff" : "rgba(255,255,255,0.5)",
                  fontWeight: tab===t ? 800 : 500, fontSize:13,
                  cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap", transition:"all 0.15s",
                }}>{t}</button>
              ))}
            </div>
          )}
        </div>
      </div>

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
                  { icon:"⚙️", label:"Settings", tab:"Settings" },
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
              { icon:"📜", label:"History", tab:"Play History" },
              { icon:"📊", label:"Stats",   tab:"Analytics" },
              { icon:"⋯",  label:"More",    tab:null },
            ].map(item => {
              const isActive = item.tab ? tab === item.tab : tab === "Settings";
              return (
                <button key={item.label}
                  onClick={() => item.tab ? setTab(item.tab) : setMobileMoreOpen(o => !o)}
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
                    <div><label style={lbl}>Play Code</label>
                      <select style={mInp} value={form.playCode} onChange={e => f("playCode", e.target.value)}>
                        <option value="">— None —</option>
                        {playCodes.map(pc => <option key={pc.id} value={pc.code}>{pc.code}</option>)}
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
                        {blockingSchemes.map(s => <option key={s}>{s}</option>)}
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
                              background: p.outcome?.includes("TD") ? "#dcfce7" : p.outcome?.includes("Loss") || p.outcome?.includes("INT") || p.outcome?.includes("Fumble") ? "#fee2e2" : "#f3f4f6",
                              color: p.outcome?.includes("TD") ? "#14532d" : p.outcome?.includes("Loss") || p.outcome?.includes("INT") || p.outcome?.includes("Fumble") ? "#991b1b" : "#374151",
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
                    <div><label style={lbl}>Primary Tackler</label>
                      <select style={mInp} value={defForm.primaryTackler} onChange={e => df("primaryTackler", e.target.value)}>
                        <option value="">— None —</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <label style={lbl}>Secondary Tackler / Assist</label>
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
                            background: p.outcome?.includes("TD") ? "#dcfce7" : p.outcome?.includes("Loss")||p.outcome?.includes("INT")||p.outcome?.includes("Fumble") ? "#fee2e2" : "#f3f4f6",
                            color: p.outcome?.includes("TD") ? "#14532d" : p.outcome?.includes("Loss")||p.outcome?.includes("INT")||p.outcome?.includes("Fumble") ? "#991b1b" : "#374151",
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
            {/* Game filter */}
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <select value={filterGame} onChange={e => setFilterGame(e.target.value)}
                style={{ padding:"8px 12px", borderRadius:8, border:"1.5px solid #d1d5db", fontSize:13, fontFamily:"inherit" }}>
                <option value="All">All Games</option>
                {games.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>

            {/* Offensive stat cards */}
            {filteredOffPlays.length > 0 && (
              <>
                <div style={{ fontSize:14, fontWeight:800, color:TK.primaryDark, textTransform:"uppercase", letterSpacing:1 }}>Offense</div>
                <div style={{ display:"grid", gridTemplateColumns:cols4, gap:14 }}>
                  <TkStatCard label="Total Plays" value={filteredOffPlays.length} accent={TK.primary} />
                  <TkStatCard label="Total Yards"
                    value={`+${filteredOffPlays.reduce((a,b) => a+(Number(b.yardsGained)||0), 0)}`}
                    sub={`${(filteredOffPlays.reduce((a,b)=>a+(Number(b.yardsGained)||0),0)/filteredOffPlays.length).toFixed(1)} yds/play`}
                    accent={TK.primary} />
                  <TkStatCard label="Touchdowns" value={filteredOffPlays.filter(p=>p.outcome==="TD").length} accent={TK.primary} />
                  <TkStatCard label="Success Rate"
                    value={`${Math.round(filteredOffPlays.filter(p=>p.outcome==="TD"||p.outcome==="First Down"||(Number(p.yardsGained)||0)>0).length/filteredOffPlays.length*100)}%`}
                    accent={TK.primary} />
                </div>
                {/* Pass vs Run breakdown */}
                <TkCollapsible title="Pass vs Run Breakdown" defaultOpen>
                  {["Pass","Run"].map(type => {
                    const typePlays = filteredOffPlays.filter(p => {
                      const pt = (p.playType||"").toLowerCase();
                      return type==="Run"
                        ? pt==="run" || pt==="option" || pt==="qb sneak" || pt==="kneel"
                        : pt==="pass" || pt==="play action" || pt==="rpo" || pt==="screen";
                    });
                    const pct = filteredOffPlays.length>0 ? Math.round(typePlays.length/filteredOffPlays.length*100) : 0;
                    const yds = typePlays.reduce((a,b)=>a+(Number(b.yardsGained)||0),0);
                    return (
                      <div key={type} style={{ marginBottom:14 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
                          <span style={{ fontWeight:700 }}>{type}</span>
                          <span style={{ color:"#6b7280" }}>{typePlays.length} plays · {typePlays.length>0?(yds/typePlays.length).toFixed(1):0} yds/play · {pct}%</span>
                        </div>
                        <div style={{ height:8, background:"#f3f4f6", borderRadius:99 }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:TK.primary, borderRadius:99 }} />
                        </div>
                      </div>
                    );
                  })}
                </TkCollapsible>
                {/* Formation breakdown */}
                {filteredOffPlays.some(p=>p.formation) && (
                  <TkCollapsible title="Formation Usage">
                    {Object.entries(filteredOffPlays.reduce((acc,p) => {
                      if (p.formation) acc[p.formation]=(acc[p.formation]||0)+1;
                      return acc;
                    }, {})).sort((a,b)=>b[1]-a[1]).map(([form, count]) => {
                      const pct = Math.round(count/filteredOffPlays.length*100);
                      return (
                        <div key={form} style={{ marginBottom:10 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:3 }}>
                            <span style={{ fontWeight:700 }}>{form}</span>
                            <span style={{ color:"#6b7280" }}>{count} plays · {pct}%</span>
                          </div>
                          <div style={{ height:6, background:"#f3f4f6", borderRadius:99 }}>
                            <div style={{ height:"100%", width:`${pct}%`, background:TK.accent, borderRadius:99 }} />
                          </div>
                        </div>
                      );
                    })}
                  </TkCollapsible>
                )}
              </>
            )}

            {/* Defensive stat cards */}
            {filteredDefPlays.length > 0 && (
              <>
                <div style={{ fontSize:14, fontWeight:800, color:"#991b1b", textTransform:"uppercase", letterSpacing:1, marginTop:8 }}>Defense</div>
                <div style={{ display:"grid", gridTemplateColumns:cols4, gap:14 }}>
                  <TkStatCard label="Plays Defended" value={filteredDefPlays.length} accent={TK.red} />
                  <TkStatCard label="Yards Allowed"
                    value={filteredDefPlays.reduce((a,b)=>a+(Number(b.yardsAllowed)||0),0)}
                    sub={`${(filteredDefPlays.reduce((a,b)=>a+(Number(b.yardsAllowed)||0),0)/filteredDefPlays.length).toFixed(1)} yds/play`}
                    accent={TK.red} />
                  <TkStatCard label="Sacks" value={filteredDefPlays.filter(p=>p.outcome?.includes("Sack")).length} accent={TK.red} />
                  <TkStatCard label="TFLs + Sacks"
                    value={filteredDefPlays.filter(p=>p.outcome?.includes("TFL")||p.outcome?.includes("Sack")).length}
                    accent={TK.primary} />
                </div>
              </>
            )}

            {/* ST stat cards */}
            {stPlays.filter(p=>filterGame==="All"||p.game===filterGame).length > 0 && (
              <>
                <div style={{ fontSize:14, fontWeight:800, color:"#5b21b6", textTransform:"uppercase", letterSpacing:1, marginTop:8 }}>Special Teams</div>
                <div style={{ display:"grid", gridTemplateColumns:cols4, gap:14 }}>
                  <TkStatCard label="ST Plays" value={stPlays.filter(p=>filterGame==="All"||p.game===filterGame).length} accent="#7c3aed" />
                  <TkStatCard label="FGs Made" value={stPlays.filter(p=>(filterGame==="All"||p.game===filterGame)&&(p.stType==="Field Goal Attempt"||p.stType==="PAT (1pt)")&&p.outcome==="Good").length} accent="#7c3aed" />
                  <TkStatCard label="Punts" value={stPlays.filter(p=>(filterGame==="All"||p.game===filterGame)&&p.stType==="Punt").length} accent="#7c3aed" />
                  <TkStatCard label="Kick Returns" value={stPlays.filter(p=>(filterGame==="All"||p.game===filterGame)&&p.stType==="Kick Return").length} accent="#7c3aed" />
                </div>
              </>
            )}

            {filteredOffPlays.length === 0 && filteredDefPlays.length === 0 && stPlays.length === 0 && (
              <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:60, textAlign:"center", color:"#9ca3af", fontSize:15 }}>
                No plays logged yet. Head to <strong>Log a Play +</strong> to get started.
              </div>
            )}
          </div>
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
                  <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 80px 1fr", gap:8, marginBottom:12 }}>
                    <input style={{ ...inp, padding:"9px 12px" }} placeholder="Name" value={newPlayer.name} onChange={e => setNewPlayer(p => ({ ...p, name:e.target.value }))} />
                    <input style={{ ...inp, padding:"9px 12px" }} placeholder="#" value={newPlayer.number} onChange={e => setNewPlayer(p => ({ ...p, number:e.target.value }))} />
                    <select style={{ ...inp, padding:"9px 12px" }} value={newPlayer.position} onChange={e => setNewPlayer(p => ({ ...p, position:e.target.value }))}>
                      <option value="">Pos</option>
                      {positions.map(pos => <option key={pos}>{pos}</option>)}
                    </select>
                    <button onClick={() => {
                      if (newPlayer.name.trim() && newPlayer.position) {
                        savePlayers([...players, { id:Date.now(), ...newPlayer, name:newPlayer.name.trim() }]);
                        setNewPlayer({ name:"", number:"", position:"" });
                      }
                    }} style={{ padding:"9px 14px", background:TK.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Add</button>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:320, overflowY:"auto" }}>
                    {players.sort((a,b)=>a.name.localeCompare(b.name)).map((pl,i) => (
                      <div key={pl.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"#f8fafc", borderRadius:8 }}>
                        {editingPlayer?.id===pl.id ? (
                          <>
                            <input autoFocus style={{ ...inp, flex:2, padding:"4px 8px", fontSize:13 }} value={editingPlayer.name} onChange={e => setEditingPlayer(ep => ({ ...ep, name:e.target.value }))} />
                            <input style={{ ...inp, width:60, padding:"4px 8px", fontSize:13 }} value={editingPlayer.number||""} onChange={e => setEditingPlayer(ep => ({ ...ep, number:e.target.value }))} placeholder="#" />
                            <select style={{ ...inp, flex:1, padding:"4px 8px", fontSize:13 }} value={editingPlayer.position} onChange={e => setEditingPlayer(ep => ({ ...ep, position:e.target.value }))}>
                              {positions.map(pos => <option key={pos}>{pos}</option>)}
                            </select>
                            <button onClick={() => { if(editingPlayer.name.trim()) savePlayers(players.map(p=>p.id===pl.id?{...p,...editingPlayer}:p)); setEditingPlayer(null); }}
                              style={{ border:"none", background:"#d1fae5", color:"#065f46", borderRadius:6, padding:"3px 8px", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>Save</button>
                            <button onClick={() => setEditingPlayer(null)} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize:13, fontWeight:700, color:"#111827", flex:2 }}>{pl.name}</span>
                            {pl.number && <span style={{ fontSize:12, color:"#6b7280" }}>#{pl.number}</span>}
                            <TkBadge color="green">{pl.position}</TkBadge>
                            <button onClick={() => setEditingPlayer({ ...pl })} style={{ border:"none", background:"none", color:"#6b7280", cursor:"pointer", fontSize:13, padding:"0 2px", marginLeft:"auto" }}>✏️</button>
                            <button onClick={() => { if(window.confirm(`Delete ${pl.name}?`)) savePlayers(players.filter(p=>p.id!==pl.id)); }}
                              style={{ border:"none", background:"none", color:"#ef4444", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Positions */}
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Positions</div>
                  <TkStringList items={positions}
                    onAdd={v => savePositions([...positions, v])}
                    onEdit={(i, v) => savePositions(positions.map((x,j)=>j===i?v:x))}
                    onDelete={i => savePositions(positions.filter((_,j)=>j!==i))}
                    placeholder="e.g. OLB, DE" />
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
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Blocking Schemes</div>
                  <TkStringList items={blockingSchemes}
                    onAdd={v => saveBlockingSchemes([...blockingSchemes, v])}
                    onEdit={(i, v) => saveBlockingSchemes(blockingSchemes.map((x,j)=>j===i?v:x))}
                    onDelete={i => saveBlockingSchemes(blockingSchemes.filter((_,j)=>j!==i))}
                    placeholder="e.g. Power, Counter" />
                </div>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Offensive Outcomes</div>
                  <TkStringList items={offOutcomes}
                    onAdd={v => saveOffOutcomes([...offOutcomes, v])}
                    onEdit={(i, v) => saveOffOutcomes(offOutcomes.map((x,j)=>j===i?v:x))}
                    onDelete={i => saveOffOutcomes(offOutcomes.filter((_,j)=>j!==i))}
                    placeholder="e.g. First Down, Fumble" />
                </div>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Play Codes</div>
                  {(() => {
                    const [newCode, setNewCode] = useState("");
                    return (
                      <>
                        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                          <input style={{ ...inp, flex:1 }} placeholder="e.g. 24 Power" value={newCode} onChange={e => setNewCode(e.target.value)}
                            onKeyDown={e => { if(e.key==="Enter"&&newCode.trim()){savePlayCodes([...playCodes,{id:Date.now(),code:newCode.trim()}]);setNewCode("");}}} />
                          <button onClick={() => { if(newCode.trim()){savePlayCodes([...playCodes,{id:Date.now(),code:newCode.trim()}]);setNewCode("");}}}
                            style={{ padding:"9px 14px", background:TK.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Add</button>
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                          {playCodes.map(pc => (
                            <div key={pc.id} style={{ background:"#dcfce7", borderRadius:8, padding:"5px 12px", display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ fontSize:13, fontWeight:700, color:TK.primaryDark }}>{pc.code}</span>
                              <button onClick={() => savePlayCodes(playCodes.filter(p=>p.id!==pc.id))} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:13, padding:0 }}>×</button>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
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
              </>
            )}

            {/* Special Teams settings */}
            {settingsTab === "special teams" && (
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
            )}
          </div>
        )}

      </div>
    </div>
  );
}
