import { useState, useMemo, useEffect, useCallback } from "react";
import React from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  getDoc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

const storage = getStorage(app);

// ── Firebase init ────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Helpers ──────────────────────────────────────────────────────────────────
// Returns the Firestore path root for an instance's data
const instanceData = (instanceId) => `data/${instanceId}`;

// ── Shared game view (read-only, decoded from URL) ───────────────────────────
function SharedGameView() {
  const params  = new URLSearchParams(window.location.search);
  const encoded = params.get("share");
  if (!encoded) return null;
  let data;
  try {
    data = JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>Invalid share link.</div>;
  }
  const { game, score, plays, defPlays: gdPlays = [], players, tdOutcome, logoUrl } = data;
  const totalYards = plays.reduce((a, b) => a + (Number(b.yardsGained) || 0), 0);
  const tds        = plays.filter(p => p.outcome === tdOutcome).length;
  const isPassPlay = p => p.playType === "Pass";
  const resultColor = score.result === "W" ? "#059669" : score.result === "L" ? "#dc2626" : "#6b7280";

  const byPlayer = {};
  const ensureP  = (pid) => {
    if (!byPlayer[pid]) {
      const pl = players.find(x => x.id === Number(pid));
      if (!pl) return false;
      byPlayer[pid] = {
        name: pl.name, position: pl.position,
        attempts: 0, receptions: 0, recGain: 0, recLoss: 0,
        incompletions: 0, tds: 0, ints: 0, drops: 0, throwAways: 0, sacks: 0,
        yards: 0, xp1: 0, xp2: 0, xp3: 0, isThrower: false, isReceiver: false, isRunner: false,
        recRunStats: { attempts:0, receptions:0, recGain:0, recLoss:0, incompletions:0, drops:0, runs:0, runGain:0, runLoss:0, tds:0, yards:0, xp1:0, xp2:0, xp3:0, xpm1:0, xpm2:0, xpm3:0 },
      };
    }
    return true;
  };

  plays.forEach(p => {
    const o = (p.outcome || "").trim();
    const TD = tdOutcome;
    const xpOuts = ["XP Converted - 1pt","XP Converted - 2pt","XP Converted - 3pt"];
    const notComplete = ["Incomplete","Drop","Interception","INT","Throw Away","Sack",...xpOuts];
    if (p.thrower && isPassPlay(p) && ensureP(p.thrower)) {
      const s = byPlayer[p.thrower]; s.isThrower = true;
      if (o !== "Throw Away" && o !== "Sack") s.attempts++;
      if (o === "Interception" || o === "INT") s.ints++;
      if (o === "Throw Away") s.throwAways++;
      if (o === "Sack") s.sacks++;
      if (o === "Drop") s.drops++;
      if (o === "Incomplete") s.incompletions++;
      if (o === TD) s.tds++;
      if (o === "XP Converted - 1pt") { s.xp1++; s.recGain++; s.receptions++; s.yards += Number(p.yardsGained)||0; }
      if (o === "XP Converted - 2pt") { s.xp2++; s.recGain++; s.receptions++; s.yards += Number(p.yardsGained)||0; }
      if (o === "XP Converted - 3pt") { s.xp3++; s.recGain++; s.receptions++; s.yards += Number(p.yardsGained)||0; }
      if (!notComplete.includes(o) && o !== "") { s.receptions++; s.yards += Number(p.yardsGained)||0; if ((Number(p.yardsGained)||0) > 0 || o === TD) s.recGain++; if ((Number(p.yardsGained)||0) < 0) s.recLoss++; }
    }
    if (p.receiver && p.receiver !== p.thrower && isPassPlay(p) && ensureP(p.receiver)) {
      byPlayer[p.receiver].isReceiver = true;
      const r = byPlayer[p.receiver].recRunStats; r.attempts++;
      if (o === "Incomplete") r.incompletions++;
      if (o === "Drop") r.drops++;
      if (o === TD) r.tds++;
      if (o === "XP Converted - 1pt") { r.xp1++; r.recGain++; r.receptions++; r.yards += Number(p.yardsGained)||0; }
      if (o === "XP Converted - 2pt") { r.xp2++; r.recGain++; r.receptions++; r.yards += Number(p.yardsGained)||0; }
      if (o === "XP Converted - 3pt") { r.xp3++; r.recGain++; r.receptions++; r.yards += Number(p.yardsGained)||0; }
      if (o === "XP Missed - 1pt") r.xpm1++;
      if (o === "XP Missed - 2pt") r.xpm2++;
      if (o === "XP Missed - 3pt") r.xpm3++;
      if (!notComplete.includes(o) && o !== "") { r.receptions++; r.yards += Number(p.yardsGained)||0; if ((Number(p.yardsGained)||0) > 0 || o === TD) r.recGain++; if ((Number(p.yardsGained)||0) < 0) r.recLoss++; }
    }
    if (p.carrier && !isPassPlay(p) && ensureP(p.carrier)) {
      byPlayer[p.carrier].isRunner = true;
      const r = byPlayer[p.carrier].recRunStats;
      r.runs++; r.yards += Number(p.yardsGained)||0;
      if ((Number(p.yardsGained)||0) > 0 || o === TD) r.runGain++;
      if ((Number(p.yardsGained)||0) < 0) r.runLoss++;
      if (o === TD) r.tds++;
    }
  });

  const throwers   = Object.values(byPlayer).filter(p => p.isThrower).sort((a,b) => a.name.localeCompare(b.name));
  const recRunners = Object.values(byPlayer).filter(p => (p.isReceiver || p.isRunner)).sort((a,b) => a.name.localeCompare(b.name));

  const co = (o) => gdPlays.filter(p => (p.outcome||"").trim() === o).length;
  const totalYdsAllowed = gdPlays.reduce((a, b) => a + (Number(b.yardsAllowed)||0), 0);
  const tdAllowed   = co("Touchdown Allowed");
  const sackTime    = co("Sack - Time"); const sackBlitz = co("Sack - Blitz");
  const intOutcome  = co("INT");
  const passPlaysD  = gdPlays.filter(p => p.playType === "Pass");
  const runPlaysD   = gdPlays.filter(p => p.playType === "Run");
  const passYdsD    = passPlaysD.reduce((a,b) => a+(Number(b.yardsAllowed)||0), 0);
  const runYdsD     = runPlaysD.reduce((a,b)  => a+(Number(b.yardsAllowed)||0), 0);
  const outcomeCounts = {};
  gdPlays.forEach(p => { const o=(p.outcome||"").trim(); if(o) outcomeCounts[o]=(outcomeCounts[o]||0)+1; });
  const playerActionMap = {};
  gdPlays.forEach(p => {
    const a=(p.playerAction||"").trim(); if(!a||!p.player) return;
    const pl=players.find(x=>x.id===Number(p.player)); if(!pl) return;
    if(!playerActionMap[p.player]) playerActionMap[p.player]={name:pl.name,pbu:0,flagPull:0,intAction:0,sackAction:0};
    const s=playerActionMap[p.player];
    if(a==="PBU")s.pbu++; if(a==="Flag Pull")s.flagPull++; if(a==="INT")s.intAction++; if(a==="Sack")s.sackAction++;
  });
  const playerActionRows = Object.values(playerActionMap).filter(p=>p.pbu||p.flagPull||p.intAction||p.sackAction).sort((a,b)=>a.name.localeCompare(b.name));

  const thStyle = { padding:"8px 10px", textAlign:"center", fontWeight:700, color:"#fff", fontSize:11, textTransform:"uppercase", whiteSpace:"nowrap" };
  const tdStyle = (color) => ({ padding:"8px 10px", textAlign:"center", color: color || "#374151", fontSize:12 });

  const card = (label, val, sub) => (
    <div key={label} style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:"14px 18px" }}>
      <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:1 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:900, color:"#111827" }}>{val}</div>
      {sub && <div style={{ fontSize:11, color:"#6b7280" }}>{sub}</div>}
    </div>
  );

  const [pdfLoading, setPdfLoading] = React.useState(false);

  const handleDownloadPDF = () => {
    const el = document.getElementById("share-content");
    if (!el) return;
    setPdfLoading(true);
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    Promise.all([
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"),
    ]).then(() => {
      window.html2canvas(el, { scale:2, useCORS:true, backgroundColor:"#f4f6fa" }).then(canvas => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation:"portrait", unit:"px", format:"a4" });
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = (canvas.height * pdfW) / canvas.width;
        const pageH = pdf.internal.pageSize.getHeight();
        const imgData = canvas.toDataURL("image/png");
        let yPos = 0;
        while (yPos < pdfH) {
          if (yPos > 0) pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, -yPos, pdfW, pdfH);
          yPos += pageH;
        }
        pdf.save(`${game}-summary.pdf`);
        setPdfLoading(false);
      });
    }).catch(() => { alert("Failed to load PDF libraries."); setPdfLoading(false); });
  };

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif", background:"#f4f6fa", minHeight:"100vh", padding:24 }}>
      <div style={{ maxWidth:960, margin:"0 auto", display:"flex", flexDirection:"column", gap:4 }}>
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:8 }}>
          <button onClick={handleDownloadPDF} disabled={pdfLoading} style={{ padding:"9px 20px", background:pdfLoading?"#6b7280":"#1a2f5e", color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor:pdfLoading?"not-allowed":"pointer", fontFamily:"inherit" }}>
            {pdfLoading ? "⏳ Generating..." : "⬇ Download PDF"}
          </button>
        </div>
        <div id="share-content" style={{ display:"flex", flexDirection:"column", gap:20, padding:8 }}>
          <div style={{ background:"linear-gradient(135deg, #000 0%, #111 100%)", borderRadius:16, padding:"20px 28px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              {logoUrl && <img src={logoUrl} alt="logo" style={{ width:44, height:44, objectFit:"cover", borderRadius:10 }} />}
          <div>
            <div style={{ fontSize:22, fontWeight:900, color:"#fff" }}>{game}</div>
            <div style={{ fontSize:13, color:"#a8b8c8", marginTop:2 }}>Game Summary · {plays.length} off / {gdPlays.length} def plays</div>
          </div>
        </div>
            {(score.us !== "" || score.them !== "") && (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:32, fontWeight:900, color:"#fff" }}>{score.us} — {score.them}</div>
                {score.result && <div style={{ fontSize:14, fontWeight:800, color:resultColor }}>{score.result === "W" ? "WIN" : score.result === "L" ? "LOSS" : "TIE"}</div>}
              </div>
            )}
          </div>
          <div style={{ fontSize:13, fontWeight:900, color:"#1a2f5e", textTransform:"uppercase", letterSpacing:1 }}>Offense</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12 }}>
            {card("Total Plays", plays.length)}
            {card("Total Yards", totalYards)}
            {card("Touchdowns", tds)}
          </div>
          {throwers.length > 0 && (
            <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:20, overflowX:"auto" }}>
              <div style={{ fontSize:14, fontWeight:800, color:"#111827", marginBottom:12 }}>Throwers</div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead><tr style={{ background:"#1a2f5e" }}>
                  {["Player","Pos","Att","Rec","Cmp%","TD%","INT%","Rec+","Rec-","Inc","TDs","INTs","Drops","T/A","Sacks","XP-1","XP-2","XP-3","Yards"].map((h,i) => (
                    <th key={h} style={{ ...thStyle, textAlign:i<2?"left":"center" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {throwers.map((p, i) => (
                    <tr key={i} style={{ borderBottom:"1px solid #f3f4f6", background:i%2===0?"#fff":"#fafafa" }}>
                      <td style={{ padding:"7px 10px", fontWeight:700, color:"#111827", fontSize:11 }}>{p.name}</td>
                      <td style={{ padding:"7px 10px" }}><span style={{ background:"#e8eef7", color:"#1a2f5e", padding:"1px 6px", borderRadius:999, fontSize:10, fontWeight:700 }}>{p.position}</span></td>
                      <td style={tdStyle()}>{p.attempts||"—"}</td>
                      <td style={tdStyle()}>{p.receptions||"—"}</td>
                      <td style={tdStyle("#6366f1")}>{p.attempts>0?`${Math.round(p.receptions/p.attempts*100)}%`:"—"}</td>
                      <td style={tdStyle("#059669")}>{p.attempts>0?`${(p.tds/p.attempts*100).toFixed(1)}%`:"—"}</td>
                      <td style={tdStyle("#dc2626")}>{p.attempts>0?`${(p.ints/p.attempts*100).toFixed(1)}%`:"—"}</td>
                      <td style={tdStyle("#059669")}>{p.recGain||"—"}</td>
                      <td style={tdStyle("#dc2626")}>{p.recLoss||"—"}</td>
                      <td style={tdStyle("#6b7280")}>{p.incompletions||"—"}</td>
                      <td style={tdStyle()}>{p.tds>0?p.tds:"—"}</td>
                      <td style={tdStyle("#dc2626")}>{p.ints>0?p.ints:"—"}</td>
                      <td style={tdStyle("#6b7280")}>{p.drops||"—"}</td>
                      <td style={tdStyle("#6b7280")}>{p.throwAways||"—"}</td>
                      <td style={tdStyle()}>{p.sacks||"—"}</td>
                      <td style={tdStyle("#059669")}>{p.xp1||"—"}</td>
                      <td style={tdStyle("#059669")}>{p.xp2||"—"}</td>
                      <td style={tdStyle("#059669")}>{p.xp3||"—"}</td>
                      <td style={{ ...tdStyle("#4a6fa5"), fontWeight:700 }}>{p.yards>0?`+${p.yards}`:p.yards||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {recRunners.length > 0 && (
            <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:20, overflowX:"auto" }}>
              <div style={{ fontSize:14, fontWeight:800, color:"#111827", marginBottom:12 }}>Receivers & Runners</div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead><tr style={{ background:"#1a2f5e" }}>
                  {["Player","Pos","Att","Rec","Cmp%","TD%","Rec+","Rec-","Inc","Drops","Runs","Run+","Run-","TDs","XP-1","XP-2","XP-3","Yards"].map((h,i) => (
                    <th key={h} style={{ ...thStyle, textAlign:i<2?"left":"center" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {recRunners.map((p, i) => {
                    const r = p.recRunStats;
                    return (
                      <tr key={i} style={{ borderBottom:"1px solid #f3f4f6", background:i%2===0?"#fff":"#fafafa" }}>
                        <td style={{ padding:"7px 10px", fontWeight:700, color:"#111827", fontSize:11 }}>{p.name}</td>
                        <td style={{ padding:"7px 10px" }}><span style={{ background:"#e8eef7", color:"#1a2f5e", padding:"1px 6px", borderRadius:999, fontSize:10, fontWeight:700 }}>{p.position}</span></td>
                        <td style={tdStyle()}>{r.attempts||"—"}</td>
                        <td style={tdStyle()}>{r.receptions||"—"}</td>
                        <td style={tdStyle("#6366f1")}>{r.attempts>0?`${Math.round(r.receptions/r.attempts*100)}%`:"—"}</td>
                        <td style={tdStyle("#059669")}>{r.attempts>0?`${(r.tds/r.attempts*100).toFixed(1)}%`:"—"}</td>
                        <td style={tdStyle("#059669")}>{r.recGain||"—"}</td>
                        <td style={tdStyle("#dc2626")}>{r.recLoss||"—"}</td>
                        <td style={tdStyle("#6b7280")}>{r.incompletions||"—"}</td>
                        <td style={tdStyle("#6b7280")}>{r.drops||"—"}</td>
                        <td style={tdStyle()}>{r.runs||"—"}</td>
                        <td style={tdStyle("#059669")}>{r.runGain||"—"}</td>
                        <td style={tdStyle("#dc2626")}>{r.runLoss||"—"}</td>
                        <td style={tdStyle()}>{r.tds>0?r.tds:"—"}</td>
                        <td style={tdStyle("#059669")}>{r.xp1||"—"}</td>
                        <td style={tdStyle("#059669")}>{r.xp2||"—"}</td>
                        <td style={tdStyle("#059669")}>{r.xp3||"—"}</td>
                        <td style={{ ...tdStyle("#4a6fa5"), fontWeight:700 }}>{r.yards>0?`+${r.yards}`:r.yards||"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {gdPlays.length > 0 && (<>
            <div style={{ fontSize:13, fontWeight:900, color:"#dc2626", textTransform:"uppercase", letterSpacing:1 }}>Defense</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12 }}>
              {card("Plays Defended", gdPlays.length)}
              {card("Yards Allowed", totalYdsAllowed, `${(totalYdsAllowed/gdPlays.length).toFixed(1)} yds/play`)}
              {card("TDs Allowed", tdAllowed)}
              {card("Sacks / INTs", `${sackTime+sackBlitz} / ${intOutcome}`, `Time: ${sackTime} · Blitz: ${sackBlitz}`)}
            </div>
            <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:16 }}>
              <div style={{ fontSize:13, fontWeight:800, color:"#111827", marginBottom:12 }}>Pass vs Run Allowed</div>
              {[["Pass", passPlaysD.length, passYdsD], ["Run", runPlaysD.length, runYdsD]].map(([type, count, yards]) => {
                const pct = gdPlays.length > 0 ? Math.round(count / gdPlays.length * 100) : 0;
                return (
                  <div key={type} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}>
                      <span style={{ fontWeight:600 }}>{type}</span>
                      <span style={{ color:"#9ca3af" }}>{count} plays · {count>0?(yards/count).toFixed(1):0} yds/play · {pct}%</span>
                    </div>
                    <div style={{ height:7, background:"#f3f4f6", borderRadius:99 }}>
                      <div style={{ height:"100%", width:`${pct}%`, background:"#dc2626", borderRadius:99 }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {Object.keys(outcomeCounts).length > 0 && (
              <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:20, overflowX:"auto" }}>
                <div style={{ fontSize:14, fontWeight:800, color:"#111827", marginBottom:12 }}>Play Outcomes</div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead><tr style={{ background:"#dc2626" }}>
                    {["Outcome","Count","% of Plays"].map((h,i) => <th key={h} style={{ ...thStyle, textAlign:i===0?"left":"center" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {Object.entries(outcomeCounts).sort((a,b)=>b[1]-a[1]).map(([outcome, count], i) => {
                      const pct = Math.round(count / gdPlays.length * 100);
                      const isNeg = ["Touchdown Allowed","Pass Allowed - Gain","Run - Gain","XP Allowed"].includes(outcome);
                      return (
                        <tr key={outcome} style={{ borderBottom:"1px solid #f3f4f6", background:i%2===0?"#fff":"#fafafa" }}>
                          <td style={{ padding:"7px 10px", fontWeight:600, color:"#374151", fontSize:11 }}>{outcome}</td>
                          <td style={{ padding:"7px 10px", textAlign:"center", fontWeight:700, color:isNeg?"#dc2626":"#059669" }}>{count}</td>
                          <td style={{ padding:"7px 10px", textAlign:"center", color:"#6b7280" }}>{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {playerActionRows.length > 0 && (
              <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:20, overflowX:"auto" }}>
                <div style={{ fontSize:14, fontWeight:800, color:"#111827", marginBottom:12 }}>Player Actions</div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead><tr style={{ background:"#dc2626" }}>
                    {["Player","PBUs","Flags Pulled","INTs","Sacks"].map((h,i) => <th key={h} style={{ ...thStyle, textAlign:i===0?"left":"center" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {playerActionRows.map((p, i) => (
                      <tr key={i} style={{ borderBottom:"1px solid #f3f4f6", background:i%2===0?"#fff":"#fafafa" }}>
                        <td style={{ padding:"7px 10px", fontWeight:700, color:"#111827", fontSize:11 }}>{p.name}</td>
                        <td style={{ padding:"7px 10px", textAlign:"center", color:"#6366f1", fontWeight:700 }}>{p.pbu||"—"}</td>
                        <td style={{ padding:"7px 10px", textAlign:"center", color:"#4a6fa5", fontWeight:700 }}>{p.flagPull||"—"}</td>
                        <td style={{ padding:"7px 10px", textAlign:"center", color:"#059669", fontWeight:700 }}>{p.intAction||"—"}</td>
                        <td style={{ padding:"7px 10px", textAlign:"center", color:"#059669", fontWeight:700 }}>{p.sackAction||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>)}
          <div style={{ textAlign:"center", fontSize:11, color:"#9ca3af" }}>Generated by Coacher</div>
        </div>
      </div>
    </div>
  );
}

// ── Constants & theme ────────────────────────────────────────────────────────
const THEME = {
  headerBg:    "linear-gradient(135deg, #000000 0%, #111111 100%)",
  primary:     "#4a6fa5",
  primaryDark: "#1a2f5e",
  primaryLight:"#e8eef7",
  primaryText: "#1a2f5e",
  accent:      "#a8b8c8",
  accentGlow:  "#c8d8e8",
  iconGradient:"linear-gradient(135deg, #a8b8c8, #0a1628)",
  tabActive:   "#fff",
  tabInactive: "#ffffff",
  badgePosition:"background:#e8eef7;color:#1a2f5e",
  buttonBg:    "#1a2f5e",
  saveBg:      "#d1fae5",
  saveColor:   "#065f46",
};

const PLAY_TYPES       = ["Pass", "Run"];
const DEFAULT_OUTCOMES = ["Reception - Gain","Reception - Loss","Incomplete","Drop","TD","INT","Run - Gain","Run - Loss","Throw Away","Sack","XP Converted - 1pt","XP Converted - 2pt","XP Converted - 3pt","XP Missed - 1pt","XP Missed - 2pt","XP Missed - 3pt"];
const DEFAULT_POSITIONS= ["QB","WR"];
const DEFAULT_DEF_OUTCOMES  = ["Pass Incomplete","Pass Allowed - Gain","Pass Allowed - Loss","Run - Gain","Run - Loss","Touchdown Allowed","XP Allowed","INT","Sack - Time","Sack - Blitz"];
const DEFAULT_PLAYER_ACTIONS= ["PBU","Flag Pull","INT","Sack"];
const DEFAULT_GAMES    = ["Game 1","Game 2","Game 3","Game 4","Game 5","Game 6","Game 7","Game 8"];
const DEFAULT_PLAY_CODES = [
  { id:1, code:"D1" },{ id:2, code:"D2" },{ id:3, code:"D3" },{ id:4, code:"D4" },{ id:5, code:"D5" },
  { id:6, code:"T1" },{ id:7, code:"T2" },{ id:8, code:"T3" },{ id:9, code:"T4" },{ id:10, code:"T5" },
  { id:11, code:"M1" },{ id:12, code:"M2" },{ id:13, code:"M3" },{ id:14, code:"M4" },
];
const initialPlayers = [
  { id:1, name:"Reed",   position:"QB" }, { id:2,  name:"Jones",  position:"WR" },
  { id:3, name:"Hafoka", position:"WR" }, { id:4,  name:"Witt",   position:"WR" },
  { id:5, name:"Davis",  position:"WR" }, { id:6,  name:"Tyson",  position:"WR" },
  { id:7, name:"Cohen",  position:"WR" }, { id:8,  name:"Corbin", position:"WR" },
  { id:9, name:"Jack",   position:"WR" }, { id:10, name:"Tate",   position:"WR" },
];

const TABS = ["Play Logger","Play Log","Analytics","Game Summary","Report Cards","Manage","Team"];
const successOutcomes = new Set(["TD","Reception - Gain","Run - Gain"]);

// ── Badge ────────────────────────────────────────────────────────────────────
function Badge({ color, children }) {
  const colors = {
    green:  "background:#d1fae5;color:#065f46",
    red:    "background:#fee2e2;color:#991b1b",
    blue:   "background:#dbeafe;color:#1e40af",
    yellow: "background:#fef3c7;color:#92400e",
    gray:   "background:#f3f4f6;color:#374151",
    purple: THEME.badgePosition,
  };
  return (
    <span style={{
      padding:"2px 10px", borderRadius:999, fontSize:12, fontWeight:700, fontFamily:"inherit",
      ...(Object.fromEntries((colors[color]||colors.gray).split(";").map(s => {
        const [k,v] = s.split(":");
        const camel = k.replace(/-([a-z])/g, (_,l) => l.toUpperCase());
        return [camel, v];
      })))
    }}>{children}</span>
  );
}

// ── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background:"#fff", border:"1.5px solid #e5e7eb", borderRadius:14, padding:"18px 22px", display:"flex", flexDirection:"column", gap:2, borderLeft:accent?`4px solid ${accent}`:undefined }}>
      <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", letterSpacing:1, textTransform:"uppercase" }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:900, color:"#111827", lineHeight:1.1 }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>{sub}</div>}
    </div>
  );
}

// ── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f4f6fa", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans', system-ui, sans-serif" }}>
      <div style={{ background:"#fff", borderRadius:20, border:"1.5px solid #e5e7eb", padding:"40px 36px", width:"100%", maxWidth:400, boxShadow:"0 8px 40px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:56, height:56, background:THEME.primaryDark, borderRadius:16, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", fontSize:28 }}>🏈</div>
          <div style={{ fontSize:24, fontWeight:900, color:"#111827" }}>Coacher</div>
          <div style={{ fontSize:13, color:"#6b7280", marginTop:4 }}>Sign in to your team account</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="coach@team.com"
              style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1.5px solid #d1d5db", fontSize:14, fontFamily:"inherit", boxSizing:"border-box", outline:"none" }}
            />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="••••••••"
              style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1.5px solid #d1d5db", fontSize:14, fontFamily:"inherit", boxSizing:"border-box", outline:"none" }}
            />
          </div>
          {error && <div style={{ background:"#fee2e2", color:"#991b1b", padding:"9px 12px", borderRadius:8, fontSize:13 }}>{error}</div>}
          <button onClick={handleLogin} disabled={loading || !email || !password}
            style={{ padding:"12px", background:loading||!email||!password?"#e5e7eb":THEME.primaryDark, color:loading||!email||!password?"#9ca3af":"#fff", border:"none", borderRadius:10, fontWeight:800, fontSize:15, cursor:loading||!email||!password?"not-allowed":"pointer", fontFamily:"inherit" }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function FootballCoach() {
  // Show shared game view if ?share= param is present
  if (new URLSearchParams(window.location.search).get("share")) return <SharedGameView />;

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [authUser,    setAuthUser]    = useState(null);   // Firebase user object
  const [userProfile, setUserProfile] = useState(null);   // { instanceId, role, name }
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setUserProfile(snap.data());
        else setUserProfile(null);
      } else {
        setUserProfile(null);
      }
      setAuthLoading(false);
    });
  }, []);

  const instanceId = userProfile?.instanceId;

  // ── Firestore real-time state ────────────────────────────────────────────
  const [plays,         setPlays]         = useState([]);
  const [defPlays,      setDefPlays]      = useState([]);
  const [players,       setPlayers]       = useState(initialPlayers);
  const [games,         setGames]         = useState(DEFAULT_GAMES);
  const [playCodes,     setPlayCodes]     = useState(DEFAULT_PLAY_CODES);
  const [positions,     setPositions]     = useState(DEFAULT_POSITIONS);
  const [outcomes,      setOutcomes]      = useState(DEFAULT_OUTCOMES);
  const [defOutcomes,   setDefOutcomes]   = useState(DEFAULT_DEF_OUTCOMES);
  const [playerActions, setPlayerActions] = useState(DEFAULT_PLAYER_ACTIONS);
  const [gameScores,    setGameScores]    = useState({});
  const [coachNotes,    setCoachNotes]    = useState({});
  const [tdOutcome,     setTdOutcome]     = useState("TD");
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [teamUsers,     setTeamUsers]     = useState([]);
  const [dataLoading,   setDataLoading]   = useState(true);

  // ── Subscribe to Firestore collections ──────────────────────────────────
  useEffect(() => {
    if (!instanceId) return;
    const base = instanceData(instanceId);
    const unsubs = [];

    const listenCol = (colName, setter, transform) => {
      const ref = collection(db, base, colName);
      const unsub = onSnapshot(ref, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setter(transform ? transform(docs) : docs);
      });
      unsubs.push(unsub);
    };

    const listenDoc = (docName, setter) => {
      const ref = doc(db, base, docName);
      const unsub = onSnapshot(ref, snap => {
        if (snap.exists()) setter(snap.data());
      });
      unsubs.push(unsub);
    };

    listenCol("plays",    setPlays,    docs => docs.sort((a,b) => (b.timestamp||"").localeCompare(a.timestamp||"")));
    listenCol("defPlays", setDefPlays, docs => docs.sort((a,b) => (b.timestamp||"").localeCompare(a.timestamp||"")));

    listenDoc("config/players",       snap => setPlayers(snap.players || initialPlayers));
    listenDoc("config/games",         snap => setGames(snap.games || DEFAULT_GAMES));
    listenDoc("config/playCodes",     snap => setPlayCodes(snap.playCodes || DEFAULT_PLAY_CODES));
    listenDoc("config/positions",     snap => setPositions(snap.positions || DEFAULT_POSITIONS));
    listenDoc("config/outcomes",      snap => setOutcomes(snap.outcomes || DEFAULT_OUTCOMES));
    listenDoc("config/defOutcomes",   snap => setDefOutcomes(snap.defOutcomes || DEFAULT_DEF_OUTCOMES));
    listenDoc("config/playerActions", snap => setPlayerActions(snap.playerActions || DEFAULT_PLAYER_ACTIONS));
    listenDoc("config/gameScores",    snap => setGameScores(snap || {}));
    listenDoc("config/coachNotes",    snap => setCoachNotes(snap || {}));
    listenDoc("config/settings", snap => { 
      if (snap.tdOutcome) setTdOutcome(snap.tdOutcome); 
      if (snap.logoUrl) setLogoUrl(snap.logoUrl);
      else setLogoUrl(null);
    });

    // Listen to team users
    const usersUnsub = onSnapshot(
      collection(db, "users"),
      snap => {
        const members = snap.docs
          .map(d => ({ uid: d.id, ...d.data() }))
          .filter(u => u.instanceId === instanceId);
        setTeamUsers(members);
      }
    );
    unsubs.push(usersUnsub);

    setDataLoading(false);
    return () => unsubs.forEach(u => u());
  }, [instanceId]);

  // ── Firestore write helpers ──────────────────────────────────────────────
  const base = instanceId ? instanceData(instanceId) : null;

  const saveConfig = useCallback(async (configKey, value) => {
    if (!base) return;
    await setDoc(doc(db, base, `config/${configKey}`), value, { merge: true });
  }, [base]);

  const addPlay = useCallback(async (play) => {
    if (!base) return;
    await addDoc(collection(db, base, "plays"), { ...play, timestamp: new Date().toISOString() });
  }, [base]);

  const deletePlay = useCallback(async (playId) => {
    if (!base) return;
    await deleteDoc(doc(db, base, "plays", playId));
  }, [base]);

  const updatePlay = useCallback(async (playId, updates) => {
    if (!base) return;
    await updateDoc(doc(db, base, "plays", playId), updates);
  }, [base]);

  const addDefPlay = useCallback(async (play) => {
    if (!base) return;
    await addDoc(collection(db, base, "defPlays"), { ...play, timestamp: new Date().toISOString() });
  }, [base]);

  const deleteDefPlay = useCallback(async (playId) => {
    if (!base) return;
    await deleteDoc(doc(db, base, "defPlays", playId));
  }, [base]);

  const updateDefPlay = useCallback(async (playId, updates) => {
    if (!base) return;
    await updateDoc(doc(db, base, "defPlays", playId), updates);
  }, [base]);

  // Wrappers that save config and update local state for instant UI response
  const savePlayers       = (val) => { setPlayers(val);       saveConfig("players",       { players: val }); };
  const saveGames         = (val) => { setGames(val);         saveConfig("games",         { games: val }); };
  const savePlayCodes     = (val) => { setPlayCodes(val);     saveConfig("playCodes",     { playCodes: val }); };
  const savePositions     = (val) => { setPositions(val);     saveConfig("positions",     { positions: val }); };
  const saveOutcomes      = (val) => { setOutcomes(val);      saveConfig("outcomes",      { outcomes: val }); };
  const saveDefOutcomes   = (val) => { setDefOutcomes(val);   saveConfig("defOutcomes",   { defOutcomes: val }); };
  const savePlayerActions = (val) => { setPlayerActions(val); saveConfig("playerActions", { playerActions: val }); };
  const saveTdOutcome     = (val) => { setTdOutcome(val);     saveConfig("settings",      { tdOutcome: val }); };

  const handleLogoUpload = async (file) => {
  if (!base || !file) return;
  setLogoUploading(true);
  try {
    const storageRef = ref(storage, `instances/${instanceId}/logo`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    setLogoUrl(url);
    await setDoc(doc(db, base, "config/settings"), { logoUrl: url }, { merge: true });
  } catch (e) {
    alert("Logo upload failed: " + e.message);
  } finally {
    setLogoUploading(false);
  }
};

const handleLogoDelete = async () => {
  if (!base) return;
  try {
    const storageRef = ref(storage, `instances/${instanceId}/logo`);
    await deleteObject(storageRef);
    setLogoUrl(null);
    await setDoc(doc(db, base, "config/settings"), { logoUrl: null }, { merge: true });
  } catch (e) {
    alert("Logo delete failed: " + e.message);
  }
};

  const saveGameScore = async (game, score) => {
    if (!base) return;
    const updated = { ...gameScores, [game]: score };
    setGameScores(updated);
    await setDoc(doc(db, base, "config/gameScores"), updated, { merge: true });
  };

  const saveCoachNote = async (playerId, note) => {
    if (!base) return;
    const updated = { ...coachNotes, [playerId]: note };
    setCoachNotes(updated);
    await setDoc(doc(db, base, "config/coachNotes"), updated, { merge: true });
  };

  // ── localStorage → Firestore import ─────────────────────────────────────
  const [importing, setImporting] = useState(false);

  const handleImportFromLocalStorage = async () => {
    if (!base) return;
    setImporting(true);
    try {
      const get = (key, def) => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; } };
      const lsPlays    = get("coachlog_plays", []);
      const lsDefPlays = get("coachlog_defplays", []);
      const lsPlayers  = get("coachlog_players", null);
      const lsGames    = get("coachlog_games", null);
      const lsCodes    = get("coachlog_playcodes", null);
      const lsPos      = get("coachlog_positions", null);
      const lsOut      = get("coachlog_outcomes", null);
      const lsDefOut   = get("coachlog_defoutcomes", null);
      const lsPA       = get("coachlog_playeractions", null);
      const lsScores   = get("coachlog_gamescores", null);
      const lsNotes    = get("coachlog_coachnotes", null);
      const lsTd       = get("coachlog_tdoutcome", null);

      const batch = writeBatch(db);

      // Batch write plays
      lsPlays.forEach(p => {
        const ref = doc(collection(db, base, "plays"));
        batch.set(ref, { ...p, timestamp: p.timestamp || new Date().toISOString() });
      });
      lsDefPlays.forEach(p => {
        const ref = doc(collection(db, base, "defPlays"));
        batch.set(ref, { ...p, timestamp: p.timestamp || new Date().toISOString() });
      });

      // Commit plays in chunks (Firestore batch limit = 500)
      await batch.commit();

      // Config docs
      if (lsPlayers)  await setDoc(doc(db, base, "config/players"),       { players: lsPlayers }, { merge: true });
      if (lsGames)    await setDoc(doc(db, base, "config/games"),          { games: lsGames }, { merge: true });
      if (lsCodes)    await setDoc(doc(db, base, "config/playCodes"),      { playCodes: lsCodes }, { merge: true });
      if (lsPos)      await setDoc(doc(db, base, "config/positions"),      { positions: lsPos }, { merge: true });
      if (lsOut)      await setDoc(doc(db, base, "config/outcomes"),       { outcomes: lsOut }, { merge: true });
      if (lsDefOut)   await setDoc(doc(db, base, "config/defOutcomes"),    { defOutcomes: lsDefOut }, { merge: true });
      if (lsPA)       await setDoc(doc(db, base, "config/playerActions"),  { playerActions: lsPA }, { merge: true });
      if (lsScores)   await setDoc(doc(db, base, "config/gameScores"),     lsScores, { merge: true });
      if (lsNotes)    await setDoc(doc(db, base, "config/coachNotes"),     lsNotes, { merge: true });
      if (lsTd)       await setDoc(doc(db, base, "config/settings"),       { tdOutcome: lsTd }, { merge: true });

      alert(`✅ Import complete! ${lsPlays.length} offensive and ${lsDefPlays.length} defensive plays migrated to the cloud.`);
    } catch (e) {
      alert("Import failed: " + e.message);
    } finally {
      setImporting(false);
    }
  };

  // ── Local UI state ───────────────────────────────────────────────────────
  const [tab, setTab] = useState("Play Logger");

  const [form, setForm] = useState({
    game:"Game 1", quarter:"1", down:"1", distance:"", playCode:"",
    playType:"", carrier:"", thrower:"", receiver:"", outcome:"", yardsGained:"", notes:"",
  });
  const f = (k,v) => setForm(p => ({ ...p, [k]: v }));

  const [defForm, setDefForm] = useState({
    game:"Game 1", quarter:"1", down:"1", distance:"", playType:"",
    player:"", outcome:"", playerAction:"", yardsAllowed:"", notes:"",
  });
  const df = (k,v) => setDefForm(p => ({ ...p, [k]: v }));

  const [analyticsSubTab,   setAnalyticsSubTab]   = useState("Offense");
  const [filterGame,        setFilterGame]         = useState("All");
  const [logFilterGame,     setLogFilterGame]      = useState("All");
  const [logFilterPlayer,   setLogFilterPlayer]    = useState("All");
  const [logFilterSide,     setLogFilterSide]      = useState("All");
  const [logFilterCode,     setLogFilterCode]      = useState("All");
  const [editingPlay,       setEditingPlay]        = useState(null);
  const [selectedPlayer,    setSelectedPlayer]     = useState(null);
  const [pendingImport,     setPendingImport]      = useState(null);

  // Manage tab edit states
  const [newGame,             setNewGame]             = useState("");
  const [editingGame,         setEditingGame]         = useState(null);
  const [newPlayer,           setNewPlayer]           = useState({ name:"", position:"" });
  const [newCode,             setNewCode]             = useState({ code:"" });
  const [editingPlayer,       setEditingPlayer]       = useState(null);
  const [newPosition,         setNewPosition]         = useState("");
  const [editingPosition,     setEditingPosition]     = useState(null);
  const [newOutcome,          setNewOutcome]          = useState("");
  const [editingOutcome,      setEditingOutcome]      = useState(null);
  const [newDefOutcome,       setNewDefOutcome]       = useState("");
  const [editingDefOutcome,   setEditingDefOutcome]   = useState(null);
  const [newPlayerAction,     setNewPlayerAction]     = useState("");
  const [editingPlayerAction, setEditingPlayerAction] = useState(null);

  // Team tab state
  const [newUserEmail,    setNewUserEmail]    = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName,     setNewUserName]     = useState("");
  const [newUserRole,     setNewUserRole]     = useState("coach");
  const [teamMsg,         setTeamMsg]         = useState("");

  // ── Computed / analytics ─────────────────────────────────────────────────
  const filteredPlays = useMemo(() => {
    if (!plays || !Array.isArray(plays)) return [];
    return filterGame === "All" ? plays : plays.filter(p => p.game === filterGame);
}, [plays, filterGame]);

  const analytics = useMemo(() => {
    const fp = filteredPlays;
    if (!fp || !fp.length) return null;
    const TD = tdOutcome;
    const isPassPlay = (p) => p.playType === "Pass";
    const isSuccess  = (p) => {
      const o = (p.outcome || "").trim();
      if (o === TD) return true;
      return p.yardsGained > 0;
    };
    const total      = fp.length;
    const successful = fp.filter(isSuccess).length;
    const tds        = fp.filter(p => (p.outcome || "").trim() === TD).length;
    const totalYards = fp.reduce((a, b) => a + b.yardsGained, 0);

    const byType = {};
    fp.forEach(p => {
      if (!byType[p.playType]) byType[p.playType] = { count:0, success:0, yards:0 };
      byType[p.playType].count++;
      byType[p.playType].yards += p.yardsGained;
      if (isSuccess(p)) byType[p.playType].success++;
    });

    const isRunPlay = (p) => !isPassPlay(p);
    const byPlayer  = {};
    const ensurePlayer = (pid) => {
      if (!byPlayer[pid]) {
        const pl = players.find(x => x.id === Number(pid));
        if (!pl) return false;
        byPlayer[pid] = {
          name:pl.name, position:pl.position,
          attempts:0, receptions:0, recGain:0, recLoss:0, incompletions:0,
          runs:0, runGain:0, runLoss:0, tds:0, ints:0, drops:0, throwAways:0, sacks:0, yards:0,
          isThrower:false, isReceiver:false, isRunner:false,
          xp1:0, xp2:0, xp3:0,
          recRunStats:{ attempts:0, receptions:0, recGain:0, recLoss:0, incompletions:0, drops:0, runs:0, runGain:0, runLoss:0, tds:0, yards:0, xp1:0, xp2:0, xp3:0, xpm1:0, xpm2:0, xpm3:0 },
        };
      }
      return true;
    };

    fp.forEach(p => {
      const o = (p.outcome || "").trim();
      const xpOuts = ["XP Converted - 1pt","XP Converted - 2pt","XP Converted - 3pt"];
      const notComplete = ["Incomplete","Drop","Interception","INT","Throw Away","Sack",...xpOuts];

      if (p.thrower && isPassPlay(p)) {
        if (!ensurePlayer(p.thrower)) return;
        const s = byPlayer[p.thrower]; s.isThrower = true;
        if (o !== "Throw Away" && o !== "Sack") s.attempts++;
        if (o === "Interception" || o === "INT") s.ints++;
        if (o === "Throw Away") s.throwAways++;
        if (o === "Sack") s.sacks++;
        if (o === "Drop") s.drops++;
        if (o === "Incomplete") s.incompletions++;
        if (o === TD) s.tds++;
        if (o === "XP Converted - 1pt") { s.xp1++; s.recGain++; s.receptions++; s.yards += p.yardsGained; }
        if (o === "XP Converted - 2pt") { s.xp2++; s.recGain++; s.receptions++; s.yards += p.yardsGained; }
        if (o === "XP Converted - 3pt") { s.xp3++; s.recGain++; s.receptions++; s.yards += p.yardsGained; }
        if (!notComplete.includes(o) && o !== "") { s.receptions++; s.yards += p.yardsGained; if (p.yardsGained > 0 || o === TD) s.recGain++; if (p.yardsGained < 0) s.recLoss++; }
      }
      if (p.receiver && p.receiver !== p.thrower && isPassPlay(p)) {
        if (!ensurePlayer(p.receiver)) return;
        byPlayer[p.receiver].isReceiver = true;
        const s = byPlayer[p.receiver].recRunStats; s.attempts++;
        if (o === "Incomplete") s.incompletions++;
        if (o === "Drop") s.drops++;
        if (o === TD) s.tds++;
        if (o === "XP Converted - 1pt") { s.xp1++; s.recGain++; s.receptions++; s.yards += p.yardsGained; }
        if (o === "XP Converted - 2pt") { s.xp2++; s.recGain++; s.receptions++; s.yards += p.yardsGained; }
        if (o === "XP Converted - 3pt") { s.xp3++; s.recGain++; s.receptions++; s.yards += p.yardsGained; }
        if (o === "XP Missed - 1pt") s.xpm1++;
        if (o === "XP Missed - 2pt") s.xpm2++;
        if (o === "XP Missed - 3pt") s.xpm3++;
        if (!notComplete.includes(o) && o !== "") { s.receptions++; s.yards += p.yardsGained; if (p.yardsGained > 0 || o === TD) s.recGain++; if (p.yardsGained < 0) s.recLoss++; }
      }
      if (p.carrier && isRunPlay(p)) {
        if (!ensurePlayer(p.carrier)) return;
        byPlayer[p.carrier].isRunner = true;
        const s = byPlayer[p.carrier].recRunStats;
        s.runs++; s.yards += p.yardsGained;
        if (p.yardsGained > 0 || o === TD) s.runGain++;
        if (p.yardsGained < 0) s.runLoss++;
        if (o === TD) s.tds++;
      }
      if (p.carrier && isPassPlay(p) && o === TD) {
        if (ensurePlayer(p.carrier)) { byPlayer[p.carrier].isRunner = true; byPlayer[p.carrier].recRunStats.tds++; }
      }
    });

    const totals = { name:"TOTALS", position:"", isTotal:true, attempts:0, receptions:0, recGain:0, recLoss:0, incompletions:0, runs:0, runGain:0, runLoss:0, tds:0, ints:0, drops:0, throwAways:0, sacks:0, yards:0 };
    Object.values(byPlayer).forEach(s => { Object.keys(totals).forEach(k => { if (typeof totals[k] === "number") totals[k] += s[k] || 0; }); });

    const emptyStats = () => ({ attempts:0, receptions:0, recGain:0, recLoss:0, incompletions:0, runs:0, runGain:0, runLoss:0, tds:0, ints:0, drops:0, throwAways:0, sacks:0, xp1:0, xp2:0, xp3:0, xpm1:0, xpm2:0, xpm3:0, yards:0 });
    const byCode = {};
    fp.filter(p => p.playCode).forEach(p => {
      const o = (p.outcome || "").trim();
      const xpOuts = ["XP Converted - 1pt","XP Converted - 2pt","XP Converted - 3pt"];
      if (!byCode[p.playCode]) byCode[p.playCode] = { code:p.playCode, ...emptyStats() };
      const s = byCode[p.playCode];
      if (isPassPlay(p)) {
        if (o !== "Throw Away" && o !== "Sack") s.attempts++;
        if (o === "Interception" || o === "INT") s.ints++;
        if (o === "Throw Away") s.throwAways++;
        if (o === "Sack") s.sacks++;
        if (o === "Drop") s.drops++;
        if (o === "Incomplete") s.incompletions++;
        if (o === "XP Converted - 1pt") { s.xp1++; s.recGain++; s.receptions++; }
        if (o === "XP Converted - 2pt") { s.xp2++; s.recGain++; s.receptions++; }
        if (o === "XP Converted - 3pt") { s.xp3++; s.recGain++; s.receptions++; }
        if (o === "XP Missed - 1pt") s.xpm1++;
        if (o === "XP Missed - 2pt") s.xpm2++;
        if (o === "XP Missed - 3pt") s.xpm3++;
        if (!["Incomplete","Drop","Interception","INT","Throw Away","Sack",...xpOuts].includes(o) && o !== "") { s.receptions++; if (p.yardsGained > 0 || o === TD) s.recGain++; if (p.yardsGained < 0) s.recLoss++; }
      } else {
        s.runs++;
        if (p.yardsGained > 0 || o === TD) s.runGain++;
        if (p.yardsGained < 0) s.runLoss++;
      }
      if (o === TD) s.tds++;
      s.yards += Number(p.yardsGained) || 0;
    });
    const codeTotals = emptyStats();
    Object.values(byCode).forEach(s => { Object.keys(codeTotals).forEach(k => { codeTotals[k] += s[k] || 0; }); });

    return { total, successful, tds, totalYards, byType, byPlayer, totals, byCode, codeTotals };
  }, [filteredPlays, players, playCodes, tdOutcome]);

  const outcomeColor = (o) => {
    if (o === tdOutcome) return "green";
    if (["Reception - Gain","Run - Gain","First Down","Gain"].includes(o)) return "blue";
    if (["Interception","INT","Fumble","Reception - Loss","Run - Loss","Loss"].includes(o)) return "red";
    return "gray";
  };

  const inputStyle = { width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #d1d5db", fontSize:14, fontFamily:"inherit", background:"#fff", color:"#111827", boxSizing:"border-box", outline:"none" };
  const labelStyle = { fontSize:12, fontWeight:700, color:"#374151", marginBottom:4, display:"block", letterSpacing:0.3 };
  const thStyle    = { padding:"9px 10px", textAlign:"center", fontWeight:700, color:"#fff", fontSize:11, letterSpacing:0.4, textTransform:"uppercase", whiteSpace:"nowrap" };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLogPlay = async () => {
    if (!form.outcome || !form.playType) return;
    const play = { ...form, yardsGained: Number(form.yardsGained) || 0 };
    await addPlay(play);
    setForm(prev => ({
      ...prev,
      down: String(Math.min(4, Number(prev.down) + 1)),
      playCode:"", playType:"", carrier:"", thrower:"", receiver:"", outcome:"", yardsGained:"", notes:"",
    }));
  };

  const handleLogDefPlay = async () => {
    if (!defForm.outcome) return;
    const play = { ...defForm, yardsAllowed: Number(defForm.yardsAllowed) || 0 };
    await addDefPlay(play);
    setDefForm(prev => ({
      ...prev,
      down: String(Math.min(4, Number(prev.down) + 1)),
      playType:"", player:"", outcome:"", playerAction:"", yardsAllowed:"", notes:"",
    }));
  };

// ── Auth guard ───────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans', system-ui, sans-serif", background:"#f4f6fa" }}>
      <div style={{ fontSize:16, color:"#6b7280" }}>Loading...</div>
    </div>
  );
  if (!authUser) return <LoginScreen />;
  if (!userProfile) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans', system-ui, sans-serif", background:"#f4f6fa" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:16, color:"#374151", marginBottom:16 }}>Account not configured. Contact your administrator.</div>
        <button onClick={() => signOut(auth)} style={{ padding:"9px 20px", background:"#dc2626", color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Sign Out</button>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#f4f6fa", fontFamily:"'DM Sans', system-ui, sans-serif" }}>
      {/* ── Header ── */}
      <div style={{ background:THEME.headerBg, boxShadow:"0 4px 24px rgba(0,0,0,0.18)" }}>
        <div style={{ maxWidth:960, margin:"0 auto", padding:"22px 24px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
           <div style={{ width:44, height:44, borderRadius:12, background:"transparent", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
          {logoUrl 
           ? <img src={logoUrl} alt="Team logo" style={{ width:44, height:44, objectFit:"cover", borderRadius:12 }} />
            : <span style={{ fontSize:28 }}>🏈</span>
           }
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:22, fontWeight:900, color:"#fff", letterSpacing:-0.5 }}>Coacher</div>
              <div style={{ fontSize:12, color:"#a8b8c8", marginTop:1 }}>
                {userProfile?.name || authUser?.email} · {userProfile?.role === "admin" ? "Admin" : "Coach"}
              </div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button onClick={handleImportFromLocalStorage} disabled={importing}
                style={{ padding:"7px 14px", background:"rgba(255,255,255,0.12)", color:"#fff", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, fontWeight:700, fontSize:12, cursor:importing?"not-allowed":"pointer", fontFamily:"inherit" }}>
                {importing ? "Importing..." : "⬆ Import Local Data"}
              </button>
              <button onClick={() => signOut(auth)}
                style={{ padding:"7px 14px", background:"rgba(220,38,38,0.2)", color:"#fca5a5", border:"1px solid rgba(220,38,38,0.3)", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                Sign Out
              </button>
            </div>
          </div>
          {/* Tabs */}
          <div style={{ display:"flex", gap:2, overflowX:"auto" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding:"10px 18px", background:"none", border:"none", borderBottom:tab===t?"3px solid #fff":"3px solid transparent",
                color:tab===t?"#fff":"rgba(255,255,255,0.55)", fontWeight:tab===t?800:500, fontSize:13,
                cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap", transition:"all 0.15s",
              }}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth:960, margin:"0 auto", padding:"28px 24px" }}>

        {/* ───── PLAY LOGGER TAB ───── */}
        {tab === "Play Logger" && (
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
            {/* Offense / Defense sub-toggle */}
            <div style={{ display:"flex", gap:8 }}>
              {["Offense","Defense"].map(side => (
                <button key={side} onClick={() => setAnalyticsSubTab(side)} style={{
                  padding:"9px 20px", borderRadius:8, border:"none", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                  background:analyticsSubTab===side?(side==="Offense"?THEME.primaryDark:"#dc2626"):"#e5e7eb",
                  color:analyticsSubTab===side?"#fff":"#374151",
                }}>{side}</button>
              ))}
            </div>

            {/* Offensive form */}
            {analyticsSubTab === "Offense" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:24 }}>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:28 }}>
                  <div style={{ fontSize:18, fontWeight:800, color:"#111827", marginBottom:22 }}>Log an Offensive Play</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
                    <div><label style={labelStyle}>Game</label>
                      <select style={inputStyle} value={form.game} onChange={e => f("game", e.target.value)}>
                        {games.map(g => <option key={g}>{g}</option>)}
                      </select>
                    </div>
                    <div><label style={labelStyle}>Quarter</label>
                      <select style={inputStyle} value={form.quarter} onChange={e => f("quarter", e.target.value)}>
                        {["1","2","3","4","OT"].map(q => <option key={q}>{q}</option>)}
                      </select>
                    </div>
                    <div><label style={labelStyle}>Down</label>
                      <select style={inputStyle} value={form.down} onChange={e => f("down", e.target.value)}>
                        {["1","2","3","4"].map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                    <div><label style={labelStyle}>Distance (yards)</label>
                      <input style={inputStyle} type="number" placeholder="e.g. 10" value={form.distance} onChange={e => f("distance", e.target.value)} />
                    </div>
                    <div><label style={labelStyle}>Play Code</label>
                      <select style={inputStyle} value={form.playCode} onChange={e => f("playCode", e.target.value)}>
                        <option value="">— Select —</option>
                        {playCodes.map(pc => <option key={pc.id} value={pc.code}>{pc.code}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                    <div><label style={labelStyle}>Play Type *</label>
                      <select style={inputStyle} value={form.playType} onChange={e => f("playType", e.target.value)}>
                        <option value="">— Select —</option>
                        {PLAY_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div><label style={labelStyle}>Outcome *</label>
                      <select style={inputStyle} value={form.outcome} onChange={e => f("outcome", e.target.value)}>
                        <option value="">— Select —</option>
                        {outcomes.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
                    <div><label style={labelStyle}>Thrower</label>
                      <select style={inputStyle} value={form.thrower} onChange={e => f("thrower", e.target.value)}>
                        <option value="">— None —</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div><label style={labelStyle}>Receiver</label>
                      <select style={inputStyle} value={form.receiver} onChange={e => f("receiver", e.target.value)}>
                        <option value="">— None —</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div><label style={labelStyle}>Ball Carrier</label>
                      <select style={inputStyle} value={form.carrier} onChange={e => f("carrier", e.target.value)}>
                        <option value="">— None —</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:14, marginBottom:20 }}>
                    <div><label style={labelStyle}>Yards Gained</label>
                      <input style={inputStyle} type="number" placeholder="0" value={form.yardsGained} onChange={e => f("yardsGained", e.target.value)} />
                    </div>
                    <div><label style={labelStyle}>Notes</label>
                      <input style={inputStyle} placeholder="Optional notes..." value={form.notes} onChange={e => f("notes", e.target.value)} />
                    </div>
                  </div>
                  <button onClick={handleLogPlay} disabled={!form.outcome || !form.playType} style={{
                    width:"100%", padding:"13px",
                    background:(!form.outcome||!form.playType)?"#e5e7eb":`linear-gradient(135deg, ${THEME.primaryDark}, ${THEME.primary})`,
                    color:(!form.outcome||!form.playType)?"#9ca3af":"#fff",
                    border:"none", borderRadius:10, fontSize:15, fontWeight:800,
                    cursor:(!form.outcome||!form.playType)?"not-allowed":"pointer", fontFamily:"inherit",
                  }}>+ Log This Play</button>
                </div>

                {/* Recent offensive plays */}
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:"#111827" }}>Recent Plays</div>
                  {plays.length === 0 && (
                    <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e5e7eb", padding:28, textAlign:"center", color:"#9ca3af", fontSize:14 }}>
                      No plays logged yet.
                    </div>
                  )}
                  {plays.slice(0,10).map(p => {
                    const carrier  = players.find(pl => pl.id === Number(p.carrier));
                    const receiver = players.find(pl => pl.id === Number(p.receiver));
                    return (
                      <div key={p.id} style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e5e7eb", padding:"14px 16px", display:"flex", flexDirection:"column", gap:6 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ fontSize:13, fontWeight:800, color:"#111827" }}>
                            {p.game} · Q{p.quarter} · {p.down}{["st","nd","rd","th"][Math.min(Number(p.down)-1,3)]||"th"} & {p.distance||"?"}
                          </span>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <Badge color={outcomeColor(p.outcome)}>{p.outcome}</Badge>
                            <button onClick={() => deletePlay(p.id)} style={{ border:"none", background:"none", color:"#d1d5db", cursor:"pointer", fontSize:16, padding:0 }}>×</button>
                          </div>
                        </div>
                        <div style={{ fontSize:12, color:"#6b7280" }}>
                          <strong>{p.playType}</strong>
                          {p.playCode && <> · <span style={{ color:THEME.primary, fontWeight:700 }}>{p.playCode}</span></>}
                          {carrier  && <> · Carrier: {carrier.name}</>}
                          {receiver && <> · Rcvr: {receiver.name}</>}
                        </div>
                        <div style={{ fontSize:12, color:p.yardsGained>0?"#059669":p.yardsGained<0?"#dc2626":"#6b7280", fontWeight:700 }}>
                          {p.yardsGained>0?"+":""}{p.yardsGained} yards
                        </div>
                        {p.notes && <div style={{ fontSize:11, color:"#9ca3af", fontStyle:"italic" }}>{p.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Defensive form */}
            {analyticsSubTab === "Defense" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:24 }}>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:28 }}>
                  <div style={{ fontSize:18, fontWeight:800, color:"#111827", marginBottom:22 }}>Log a Defensive Play</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
                    <div><label style={labelStyle}>Game</label>
                      <select style={inputStyle} value={defForm.game} onChange={e => df("game", e.target.value)}>
                        {games.map(g => <option key={g}>{g}</option>)}
                      </select>
                    </div>
                    <div><label style={labelStyle}>Quarter</label>
                      <select style={inputStyle} value={defForm.quarter} onChange={e => df("quarter", e.target.value)}>
                        {["1","2","3","4","OT"].map(q => <option key={q}>{q}</option>)}
                      </select>
                    </div>
                    <div><label style={labelStyle}>Down</label>
                      <select style={inputStyle} value={defForm.down} onChange={e => df("down", e.target.value)}>
                        {["1","2","3","4"].map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                    <div><label style={labelStyle}>Distance (yards)</label>
                      <input style={inputStyle} type="number" placeholder="e.g. 10" value={defForm.distance} onChange={e => df("distance", e.target.value)} />
                    </div>
                    <div><label style={labelStyle}>Play Type</label>
                      <select style={inputStyle} value={defForm.playType} onChange={e => df("playType", e.target.value)}>
                        <option value="">— Select —</option>
                        <option>Pass</option><option>Run</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                    <div><label style={labelStyle}>Outcome *</label>
                      <select style={inputStyle} value={defForm.outcome} onChange={e => df("outcome", e.target.value)}>
                        <option value="">— Select —</option>
                        {defOutcomes.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div><label style={labelStyle}>Player Action</label>
                      <select style={inputStyle} value={defForm.playerAction} onChange={e => df("playerAction", e.target.value)}>
                        <option value="">— None —</option>
                        {playerActions.map(a => <option key={a}>{a}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                    <div><label style={labelStyle}>Player Who Made the Play</label>
                      <select style={inputStyle} value={defForm.player} onChange={e => df("player", e.target.value)}>
                        <option value="">— None —</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div><label style={labelStyle}>Yards Allowed</label>
                      <input style={inputStyle} type="number" placeholder="0" value={defForm.yardsAllowed} onChange={e => df("yardsAllowed", e.target.value)} />
                    </div>
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <label style={labelStyle}>Notes</label>
                    <input style={inputStyle} placeholder="Optional notes..." value={defForm.notes} onChange={e => df("notes", e.target.value)} />
                  </div>
                  <button onClick={handleLogDefPlay} disabled={!defForm.outcome} style={{
                    width:"100%", padding:"13px", background:!defForm.outcome?"#e5e7eb":"#dc2626",
                    color:!defForm.outcome?"#9ca3af":"#fff", border:"none", borderRadius:10,
                    fontWeight:800, fontSize:15, cursor:!defForm.outcome?"not-allowed":"pointer", fontFamily:"inherit",
                  }}>+ Log Defensive Play</button>
                </div>

                {/* Recent defensive plays */}
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:"#111827", marginBottom:16 }}>Recent Plays</div>
                  {defPlays.length === 0 ? (
                    <div style={{ color:"#9ca3af", fontSize:13, textAlign:"center", marginTop:40 }}>No defensive plays logged yet.</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {defPlays.slice(0,10).map(p => {
                        const pl = players.find(x => x.id === Number(p.player));
                        return (
                          <div key={p.id} style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                            <div style={{ flex:1 }}>
                              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                                <span style={{ fontSize:11, fontWeight:700, background:"#fee2e2", color:"#991b1b", padding:"2px 8px", borderRadius:999 }}>{p.outcome}</span>
                                {p.playerAction && <span style={{ fontSize:11, fontWeight:700, background:"#e0f2fe", color:"#0369a1", padding:"2px 8px", borderRadius:999 }}>{p.playerAction}</span>}
                                {p.playType && <span style={{ fontSize:11, fontWeight:600, color:"#6b7280", background:"#f3f4f6", padding:"2px 8px", borderRadius:999 }}>{p.playType}</span>}
                              </div>
                              <div style={{ fontSize:12, color:"#374151" }}>
                                {p.game} · Q{p.quarter} · {p.down}&{p.distance}
                                {pl && <span style={{ fontWeight:700 }}> · {pl.name}</span>}
                                {p.yardsAllowed > 0 && <span style={{ color:"#dc2626" }}> · {p.yardsAllowed} yds allowed</span>}
                              </div>
                              {p.notes && <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{p.notes}</div>}
                            </div>
                            <button onClick={() => deleteDefPlay(p.id)} style={{ background:"none", border:"none", color:"#dc2626", cursor:"pointer", fontSize:16, padding:"0 2px" }}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ───── PLAY LOG TAB ───── */}
        {tab === "Play Log" && (() => {
          const allPlays = [
            ...plays.map(p    => ({ ...p, side:"offense" })),
            ...defPlays.map(p => ({ ...p, side:"defense" })),
          ].sort((a,b) => (b.timestamp||"").localeCompare(a.timestamp||""));

          const filtered = allPlays.filter(p => {
            if (logFilterGame   !== "All" && p.game  !== logFilterGame) return false;
            if (logFilterSide   !== "All" && p.side  !== logFilterSide.toLowerCase()) return false;
            if (logFilterCode   !== "All" && p.playCode !== logFilterCode) return false;
            if (logFilterPlayer !== "All") {
              const pid = String(logFilterPlayer);
              const inPlay = p.side === "offense"
                ? [String(p.carrier), String(p.thrower), String(p.receiver)].includes(pid)
                : String(p.player) === pid;
              if (!inPlay) return false;
            }
            return true;
          });

          const selStyle = { padding:"7px 12px", borderRadius:8, border:"1.5px solid #d1d5db", fontSize:13, fontFamily:"inherit", color:"#111827", background:"#fff" };

          return (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e5e7eb", padding:"16px 20px", display:"flex", flexWrap:"wrap", gap:12, alignItems:"center" }}>
                <span style={{ fontSize:13, fontWeight:700, color:"#374151" }}>Filter:</span>
                <select style={selStyle} value={logFilterSide}   onChange={e => setLogFilterSide(e.target.value)}>
                  <option value="All">All Plays</option><option value="offense">Offense</option><option value="defense">Defense</option>
                </select>
                <select style={selStyle} value={logFilterGame}   onChange={e => setLogFilterGame(e.target.value)}>
                  <option value="All">All Games</option>
                  {games.map(g => <option key={g}>{g}</option>)}
                </select>
                <select style={selStyle} value={logFilterPlayer} onChange={e => setLogFilterPlayer(e.target.value)}>
                  <option value="All">All Players</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select style={selStyle} value={logFilterCode}   onChange={e => setLogFilterCode(e.target.value)}>
                  <option value="All">All Play Codes</option>
                  {playCodes.map(pc => <option key={pc.id} value={pc.code}>{pc.code}</option>)}
                </select>
                <span style={{ fontSize:12, color:"#9ca3af", marginLeft:"auto" }}>{filtered.length} play{filtered.length!==1?"s":""}</span>
              </div>

              {filtered.length === 0 ? (
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:60, textAlign:"center", color:"#9ca3af", fontSize:15 }}>No plays match your filters.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {filtered.map(p => {
                    const pl       = p.side === "defense" ? players.find(x => x.id === Number(p.player)) : null;
                    const thrower  = players.find(x => x.id === Number(p.thrower));
                    const receiver = players.find(x => x.id === Number(p.receiver));
                    const carrier  = players.find(x => x.id === Number(p.carrier));
                    const isEditing = editingPlay?.play.id === p.id;

                    return (
                      <div key={p.id} style={{ background:"#fff", borderRadius:12, border:`1.5px solid ${p.side==="offense"?"#e5e7eb":"#fee2e2"}`, padding:"14px 18px" }}>
                        {isEditing ? (
                          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                            <div style={{ fontSize:13, fontWeight:800, color:"#111827" }}>Edit Play</div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                              <div><label style={labelStyle}>Game</label>
                                <select style={inputStyle} value={editingPlay.play.game} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, game: e.target.value } }))}>
                                  {games.map(g => <option key={g}>{g}</option>)}
                                </select>
                              </div>
                              <div><label style={labelStyle}>Quarter</label>
                                <select style={inputStyle} value={editingPlay.play.quarter} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, quarter: e.target.value } }))}>
                                  {["1","2","3","4","OT"].map(q => <option key={q}>{q}</option>)}
                                </select>
                              </div>
                              <div><label style={labelStyle}>Down</label>
                                <select style={inputStyle} value={editingPlay.play.down} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, down: e.target.value } }))}>
                                  {["1","2","3","4"].map(d => <option key={d}>{d}</option>)}
                                </select>
                              </div>
                            </div>
                            {p.side === "offense" ? (
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                <div><label style={labelStyle}>Play Type</label>
                                  <select style={inputStyle} value={editingPlay.play.playType} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, playType: e.target.value } }))}>
                                    {PLAY_TYPES.map(t => <option key={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div><label style={labelStyle}>Outcome</label>
                                  <select style={inputStyle} value={editingPlay.play.outcome} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, outcome: e.target.value } }))}>
                                    {outcomes.map(o => <option key={o}>{o}</option>)}
                                  </select>
                                </div>
                                <div><label style={labelStyle}>Yards Gained</label>
                                  <input style={inputStyle} type="number" value={editingPlay.play.yardsGained} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, yardsGained: Number(e.target.value) } }))} />
                                </div>
                                <div><label style={labelStyle}>Notes</label>
                                  <input style={inputStyle} value={editingPlay.play.notes||""} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, notes: e.target.value } }))} />
                                </div>
                              </div>
                            ) : (
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                <div><label style={labelStyle}>Outcome</label>
                                  <select style={inputStyle} value={editingPlay.play.outcome} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, outcome: e.target.value } }))}>
                                    {defOutcomes.map(o => <option key={o}>{o}</option>)}
                                  </select>
                                </div>
                                <div><label style={labelStyle}>Yards Allowed</label>
                                  <input style={inputStyle} type="number" value={editingPlay.play.yardsAllowed} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, yardsAllowed: Number(e.target.value) } }))} />
                                </div>
                              </div>
                            )}
                            <div style={{ display:"flex", gap:8 }}>
                              <button onClick={async () => {
                                const { id, side, ...updates } = editingPlay.play;
                                if (side === "offense") await updatePlay(id, updates);
                                else await updateDefPlay(id, updates);
                                setEditingPlay(null);
                              }} style={{ padding:"8px 16px", background:THEME.primaryDark, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Save</button>
                              <button onClick={() => setEditingPlay(null)} style={{ padding:"8px 16px", background:"#f3f4f6", color:"#374151", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                            <div style={{ flex:1 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                                <span style={{ fontSize:11, fontWeight:700, background:p.side==="offense"?"#e8eef7":"#fee2e2", color:p.side==="offense"?"#1a2f5e":"#991b1b", padding:"2px 8px", borderRadius:999 }}>{p.side==="offense"?"OFF":"DEF"}</span>
                                <span style={{ fontSize:13, fontWeight:800, color:"#111827" }}>{p.game} · Q{p.quarter} · {p.down}& {p.distance||"?"}</span>
                                <Badge color={outcomeColor(p.outcome)}>{p.outcome}</Badge>
                              </div>
                              <div style={{ fontSize:12, color:"#6b7280" }}>
                                <strong>{p.playType}</strong>
                                {p.playCode && <> · <span style={{ color:THEME.primary, fontWeight:700 }}>{p.playCode}</span></>}
                                {thrower  && <> · Thrower: {thrower.name}</>}
                                {receiver && <> · Rcvr: {receiver.name}</>}
                                {carrier  && <> · Carrier: {carrier.name}</>}
                                {pl       && <> · {pl.name}</>}
                                {p.side==="offense" && <span style={{ color:p.yardsGained>0?"#059669":p.yardsGained<0?"#dc2626":"#6b7280", fontWeight:700 }}> · {p.yardsGained>0?"+":""}{p.yardsGained} yds</span>}
                                {p.side==="defense" && p.yardsAllowed>0 && <span style={{ color:"#dc2626", fontWeight:700 }}> · {p.yardsAllowed} yds allowed</span>}
                              </div>
                              {p.notes && <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>{p.notes}</div>}
                            </div>
                            <div style={{ display:"flex", gap:6 }}>
                              <button onClick={() => setEditingPlay({ play: p, side: p.side })} style={{ border:"none", background:"#f3f4f6", color:"#374151", borderRadius:6, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>✏️</button>
                              <button onClick={() => p.side==="offense" ? deletePlay(p.id) : deleteDefPlay(p.id)} style={{ border:"none", background:"#fee2e2", color:"#dc2626", borderRadius:6, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>🗑</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ───── ANALYTICS TAB ───── */}
        {tab === "Analytics" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            {/* Filter + sub-tabs */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
              <div style={{ display:"flex", gap:8 }}>
                {["Offense","Defense"].map(side => (
                  <button key={side} onClick={() => setAnalyticsSubTab(side)} style={{
                    padding:"9px 20px", borderRadius:8, border:"none", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                    background:analyticsSubTab===side?(side==="Offense"?THEME.primaryDark:"#dc2626"):"#e5e7eb",
                    color:analyticsSubTab===side?"#fff":"#374151",
                  }}>{side}</button>
                ))}
              </div>
              <select value={filterGame} onChange={e => setFilterGame(e.target.value)} style={{ padding:"8px 12px", borderRadius:8, border:"1.5px solid #d1d5db", fontSize:13, fontFamily:"inherit" }}>
                <option value="All">All Games</option>
                {games.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>

            {/* Offense analytics */}
            {analyticsSubTab === "Offense" && (<>
              {!analytics ? (
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:60, textAlign:"center", color:"#9ca3af", fontSize:15 }}>
                  No offensive plays logged yet. Head to <strong>Play Logger</strong> to get started.
                </div>
              ) : (<>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:14 }}>
                  <StatCard label="Total Plays"   value={analytics.total}      accent={THEME.primary} />
                  <StatCard label="Successful"    value={`${analytics.successful} (${Math.round(analytics.successful/analytics.total*100)}%)`} accent="#059669" />
                  <StatCard label="Touchdowns"    value={analytics.tds}        accent="#059669" />
                  <StatCard label="Total Yards"   value={`+${analytics.totalYards}`} accent={THEME.primary} />
                </div>

                {/* Play type breakdown */}
                {Object.entries(analytics.byType).length > 0 && (
                  <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                    <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Play Type Breakdown</div>
                    {Object.entries(analytics.byType).map(([type, d]) => {
                      const pct = Math.round(d.count / analytics.total * 100);
                      const sucPct = d.count > 0 ? Math.round(d.success / d.count * 100) : 0;
                      return (
                        <div key={type} style={{ marginBottom:14 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:13 }}>
                            <span style={{ fontWeight:700 }}>{type}</span>
                            <span style={{ color:"#6b7280" }}>{d.count} plays · {d.count>0?(d.yards/d.count).toFixed(1):0} yds/play · {sucPct}% success · {pct}% of plays</span>
                          </div>
                          <div style={{ height:8, background:"#f3f4f6", borderRadius:99 }}>
                            <div style={{ height:"100%", width:`${pct}%`, background:THEME.primary, borderRadius:99 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Throwers table */}
                {Object.values(analytics.byPlayer).some(p => p.isThrower) && (
                  <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24, overflowX:"auto" }}>
                    <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:4 }}>Stats by Player — Throwers</div>
                    <div style={{ fontSize:12, color:"#9ca3af", marginBottom:16 }}>Att = Pass attempts · Rec = Completions · Cmp% = completion rate · TD% = TDs per attempt · INT% = INT rate</div>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:900 }}>
                      <thead><tr style={{ background:THEME.buttonBg }}>
                        {["Player","Pos","Att","Rec","Cmp%","TD%","INT%","Rec+","Rec-","Inc","TDs","INTs","Drops","T/A","Sacks","XP-1","XP-2","XP-3","Yards"].map((h,i) => (
                          <th key={h} style={{ ...thStyle, textAlign:i<2?"left":"center" }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {Object.values(analytics.byPlayer).filter(p=>p.isThrower).sort((a,b)=>a.name.localeCompare(b.name)).map((p,i) => (
                          <tr key={i} style={{ borderBottom:"1px solid #f3f4f6", background:i%2===0?"#fff":"#fafafa" }}>
                            <td style={{ padding:"9px 10px", fontWeight:700, color:"#111827" }}>{p.name}</td>
                            <td style={{ padding:"9px 10px" }}><Badge color="purple">{p.position}</Badge></td>
                            <td style={{ padding:"9px 10px", textAlign:"center" }}>{p.attempts||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center" }}>{p.receptions||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#6366f1", fontWeight:700 }}>{p.attempts>0?`${Math.round(p.receptions/p.attempts*100)}%`:"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#059669", fontWeight:700 }}>{p.attempts>0?`${(p.tds/p.attempts*100).toFixed(1)}%`:"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#dc2626", fontWeight:700 }}>{p.attempts>0?`${(p.ints/p.attempts*100).toFixed(1)}%`:"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#059669" }}>{p.recGain||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#dc2626" }}>{p.recLoss||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{p.incompletions||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center" }}>{p.tds>0?<Badge color="green">{p.tds}</Badge>:"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center" }}>{p.ints>0?<Badge color="red">{p.ints}</Badge>:"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{p.drops||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{p.throwAways||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center" }}>{p.sacks||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#059669" }}>{p.xp1||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#059669" }}>{p.xp2||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#059669" }}>{p.xp3||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, color:THEME.primary }}>{p.yards>0?`+${p.yards}`:p.yards||"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Receivers & Runners table */}
                {Object.values(analytics.byPlayer).some(p=>(p.isReceiver||p.isRunner)) && (
                  <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24, overflowX:"auto" }}>
                    <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:4 }}>Stats by Player — Receivers & Runners</div>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:800 }}>
                      <thead><tr style={{ background:THEME.buttonBg }}>
                        {["Player","Pos","Att","Rec","Cmp%","TD%","Rec+","Rec-","Inc","Drops","Runs","Run+","Run-","TDs","XP-1","XP-2","XP-3","Yards"].map((h,i) => (
                          <th key={h} style={{ ...thStyle, textAlign:i<2?"left":"center" }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {Object.values(analytics.byPlayer).filter(p=>(p.isReceiver||p.isRunner)).sort((a,b)=>a.name.localeCompare(b.name)).map((p,i) => {
                          const r = p.recRunStats;
                          return (
                            <tr key={i} style={{ borderBottom:"1px solid #f3f4f6", background:i%2===0?"#fff":"#fafafa" }}>
                              <td style={{ padding:"9px 10px", fontWeight:700, color:"#111827" }}>{p.name}</td>
                              <td style={{ padding:"9px 10px" }}><Badge color="purple">{p.position}</Badge></td>
                              <td style={{ padding:"9px 10px", textAlign:"center" }}>{r.attempts||"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center" }}>{r.receptions||"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", color:"#6366f1", fontWeight:700 }}>{r.attempts>0?`${Math.round(r.receptions/r.attempts*100)}%`:"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", color:"#059669", fontWeight:700 }}>{r.attempts>0?`${(r.tds/r.attempts*100).toFixed(1)}%`:"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", color:"#059669" }}>{r.recGain||"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", color:"#dc2626" }}>{r.recLoss||"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.incompletions||"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{r.drops||"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center" }}>{r.runs||"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", color:"#059669" }}>{r.runGain||"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", color:"#dc2626" }}>{r.runLoss||"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center" }}>{r.tds>0?<Badge color="green">{r.tds}</Badge>:"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", color:"#059669" }}>{r.xp1||"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", color:"#059669" }}>{r.xp2||"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", color:"#059669" }}>{r.xp3||"—"}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, color:THEME.primary }}>{r.yards>0?`+${r.yards}`:r.yards||"—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>)}
            </>)}

            {/* Defense analytics */}
            {analyticsSubTab === "Defense" && (() => {
              const fp = filterGame === "All" ? defPlays : defPlays.filter(p => p.game === filterGame);
              if (!fp.length) return (
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:60, textAlign:"center", color:"#9ca3af", fontSize:15 }}>
                  No defensive plays logged yet. Head to <strong>Play Logger</strong> to get started.
                </div>
              );
              const totalPlays       = fp.length;
              const totalYardsAllowed = fp.reduce((a,b) => a+(Number(b.yardsAllowed)||0), 0);
              const countO = (o) => fp.filter(p => (p.outcome||"").trim() === o).length;
              const tdAllowed    = countO("Touchdown Allowed");
              const sackTime     = countO("Sack - Time");
              const sackBlitz    = countO("Sack - Blitz");
              const intOutcome   = countO("INT");
              const passPlaysD   = fp.filter(p => p.playType === "Pass");
              const runPlaysD    = fp.filter(p => p.playType === "Run");
              const passYdsD     = passPlaysD.reduce((a,b)=>a+(Number(b.yardsAllowed)||0),0);
              const runYdsD      = runPlaysD.reduce((a,b) =>a+(Number(b.yardsAllowed)||0),0);

              const outcomeCounts = {};
              fp.forEach(p => { const o=(p.outcome||"").trim(); if(o) outcomeCounts[o]=(outcomeCounts[o]||0)+1; });

              const byDPlayer = {};
              fp.forEach(p => {
                const a=(p.playerAction||"").trim(); if(!a||!p.player) return;
                const pl=players.find(x=>x.id===Number(p.player)); if(!pl) return;
                if(!byDPlayer[p.player]) byDPlayer[p.player]={name:pl.name,position:pl.position,pbu:0,flagPull:0,intAction:0,sackAction:0};
                const s=byDPlayer[p.player];
                if(a==="PBU")s.pbu++; if(a==="Flag Pull")s.flagPull++; if(a==="INT")s.intAction++; if(a==="Sack")s.sackAction++;
              });
              const byGame = {};
              fp.forEach(p => {
                if(!byGame[p.game]) byGame[p.game]={plays:0,yardsAllowed:0,tdAllowed:0,passIncomplete:0,passGain:0,passLoss:0,runGain:0,runLoss:0,sacks:0,intOutcome:0,pbu:0,flagPull:0,intAction:0,sackAction:0};
                const s=byGame[p.game]; const o=(p.outcome||"").trim(); const a=(p.playerAction||"").trim();
                s.plays++; s.yardsAllowed+=Number(p.yardsAllowed)||0;
                if(o==="Touchdown Allowed")s.tdAllowed++;
                if(o==="Pass Incomplete")s.passIncomplete++;
                if(o==="Pass Allowed - Gain")s.passGain++;
                if(o==="Pass Allowed - Loss")s.passLoss++;
                if(o==="Run - Gain")s.runGain++;
                if(o==="Run - Loss")s.runLoss++;
                if(o==="Sack - Time"||o==="Sack - Blitz")s.sacks++;
                if(o==="INT")s.intOutcome++;
                if(a==="PBU")s.pbu++; if(a==="Flag Pull")s.flagPull++; if(a==="INT")s.intAction++; if(a==="Sack")s.sackAction++;
              });

              return (<>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:14 }}>
                  <StatCard label="Plays Defended"  value={totalPlays} accent="#dc2626" />
                  <StatCard label="Yards Allowed"   value={totalYardsAllowed} sub={`${(totalYardsAllowed/totalPlays).toFixed(1)} yds/play`} accent="#dc2626" />
                  <StatCard label="TDs Allowed"     value={tdAllowed}  accent="#dc2626" />
                  <StatCard label="Sacks / INTs"    value={`${sackTime+sackBlitz} / ${intOutcome}`} sub={`Time: ${sackTime} · Blitz: ${sackBlitz}`} accent="#059669" />
                </div>
                <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Pass vs Run Allowed</div>
                  {[["Pass",passPlaysD.length,passYdsD],["Run",runPlaysD.length,runYdsD]].map(([type,count,yards]) => {
                    const pct = totalPlays>0?Math.round(count/totalPlays*100):0;
                    return (
                      <div key={type} style={{ marginBottom:14 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
                          <span style={{ fontWeight:700 }}>{type}</span>
                          <span style={{ color:"#6b7280" }}>{count} plays · {count>0?(yards/count).toFixed(1):0} yds/play · {pct}%</span>
                        </div>
                        <div style={{ height:8, background:"#f3f4f6", borderRadius:99 }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:"#dc2626", borderRadius:99 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {Object.keys(outcomeCounts).length > 0 && (
                  <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24, overflowX:"auto" }}>
                    <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Play Outcomes</div>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                      <thead><tr style={{ background:"#dc2626" }}>
                        {["Outcome","Count","% of Plays"].map((h,i) => <th key={h} style={{ ...thStyle, textAlign:i===0?"left":"center" }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {Object.entries(outcomeCounts).sort((a,b)=>b[1]-a[1]).map(([outcome,count],i) => {
                          const pct = Math.round(count/totalPlays*100);
                          const isNeg = ["Touchdown Allowed","Pass Allowed - Gain","Run - Gain","XP Allowed"].includes(outcome);
                          return (
                            <tr key={outcome} style={{ borderBottom:"1px solid #f3f4f6", background:i%2===0?"#fff":"#fafafa" }}>
                              <td style={{ padding:"9px 10px", fontWeight:600 }}>{outcome}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", fontWeight:700, color:isNeg?"#dc2626":"#059669" }}>{count}</td>
                              <td style={{ padding:"9px 10px", textAlign:"center", color:"#6b7280" }}>{pct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {Object.values(byDPlayer).length > 0 && (
                  <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24, overflowX:"auto" }}>
                    <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Player Actions</div>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                      <thead><tr style={{ background:"#dc2626" }}>
                        {["Player","Pos","PBUs","Flags Pulled","INTs","Sacks"].map((h,i) => <th key={h} style={{ ...thStyle, textAlign:i<2?"left":"center" }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {Object.values(byDPlayer).sort((a,b)=>a.name.localeCompare(b.name)).map((p,i) => (
                          <tr key={i} style={{ borderBottom:"1px solid #f3f4f6", background:i%2===0?"#fff":"#fafafa" }}>
                            <td style={{ padding:"9px 10px", fontWeight:700 }}>{p.name}</td>
                            <td style={{ padding:"9px 10px" }}><Badge color="purple">{p.position}</Badge></td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#6366f1", fontWeight:700 }}>{p.pbu||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center", color:"#4a6fa5", fontWeight:700 }}>{p.flagPull||"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center" }}>{p.intAction>0?<Badge color="green">{p.intAction}</Badge>:"—"}</td>
                            <td style={{ padding:"9px 10px", textAlign:"center" }}>{p.sackAction>0?<Badge color="green">{p.sackAction}</Badge>:"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>);
            })()}
          </div>
        )}

        {/* ───── GAME SUMMARY TAB ───── */}
        {tab === "Game Summary" && (
          <div style={{ display:"flex", flexDirection:"column", gap:28 }}>
            {games.length === 0 ? (
              <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:60, textAlign:"center", color:"#9ca3af", fontSize:15 }}>No games yet.</div>
            ) : games.map(game => {
              const gPlays  = plays.filter(p => p.game === game);
              const gDPlays = defPlays.filter(p => p.game === game);
              const score   = gameScores[game] || { us:"", them:"", result:"" };
              const totalYards = gPlays.reduce((a,b) => a+b.yardsGained, 0);
              const tds        = gPlays.filter(p => p.outcome === tdOutcome).length;
              const passPlays  = gPlays.filter(p => p.playType === "Pass");
              const runPlays   = gPlays.filter(p => p.playType !== "Pass");
              const resultColor = score.result==="W"?"#059669":score.result==="L"?"#dc2626":"#6b7280";

              const resultBreakdown = {};
              gPlays.forEach(p => { resultBreakdown[p.outcome]=(resultBreakdown[p.outcome]||0)+1; });

              const perfMap = {};
              gPlays.forEach(p => {
                [p.carrier,p.receiver,p.thrower].filter(Boolean).forEach(pid => {
                  const pl = players.find(x => x.id === Number(pid)); if(!pl) return;
                  if(!perfMap[pid]) perfMap[pid]={name:pl.name,position:pl.position,yards:0,tds:0,plays:0};
                  perfMap[pid].yards += p.yardsGained; perfMap[pid].plays++;
                  if(p.outcome===tdOutcome) perfMap[pid].tds++;
                });
              });
              const topPerfs = Object.values(perfMap).sort((a,b)=>b.yards-a.yards).slice(0,3);

              // Share link
              const shareData = { game, score, plays:gPlays, defPlays:gDPlays, players, tdOutcome, logoUrl };
              const shareLink = `${window.location.origin}${window.location.pathname}?share=${btoa(encodeURIComponent(JSON.stringify(shareData)))}`;

              return (
                <div key={game} style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", overflow:"hidden" }}>
                  {/* Game header */}
                  <div style={{ background:THEME.buttonBg, padding:"18px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                    <div>
                      <div style={{ fontSize:18, fontWeight:900, color:"#fff" }}>{game}</div>
                      <div style={{ fontSize:12, color:"#a8b8c8", marginTop:2 }}>{gPlays.length} off plays · {gDPlays.length} def plays</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                      {/* Score inputs */}
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <input type="number" placeholder="Us" value={score.us}
                          onChange={e => saveGameScore(game, { ...score, us:e.target.value })}
                          style={{ width:56, padding:"6px 8px", borderRadius:6, border:"1px solid rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.1)", color:"#fff", fontSize:16, fontWeight:800, textAlign:"center", fontFamily:"inherit" }} />
                        <span style={{ color:"#fff", fontWeight:700 }}>—</span>
                        <input type="number" placeholder="Them" value={score.them}
                          onChange={e => saveGameScore(game, { ...score, them:e.target.value })}
                          style={{ width:56, padding:"6px 8px", borderRadius:6, border:"1px solid rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.1)", color:"#fff", fontSize:16, fontWeight:800, textAlign:"center", fontFamily:"inherit" }} />
                        <select value={score.result||""}
                          onChange={e => saveGameScore(game, { ...score, result:e.target.value })}
                          style={{ padding:"6px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.1)", color:resultColor||"#fff", fontWeight:800, fontSize:13, fontFamily:"inherit" }}>
                          <option value="">Result</option>
                          <option value="W" style={{ color:"#059669" }}>W</option>
                          <option value="L" style={{ color:"#dc2626" }}>L</option>
                          <option value="T" style={{ color:"#6b7280" }}>T</option>
                        </select>
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(shareLink); alert("Share link copied!"); }}
                        style={{ padding:"7px 14px", background:"rgba(255,255,255,0.12)", color:"#fff", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                        🔗 Share
                      </button>
                    </div>
                  </div>

                  {gPlays.length === 0 && gDPlays.length === 0 ? (
                    <div style={{ padding:32, textAlign:"center", color:"#9ca3af" }}>No plays logged for this game yet.</div>
                  ) : (
                    <div style={{ padding:24, display:"flex", flexDirection:"column", gap:20 }}>
                      {/* Offense summary */}
                      {gPlays.length > 0 && (
                        <div>
                          <div style={{ fontSize:13, fontWeight:800, color:THEME.primaryDark, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Offense</div>
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:16 }}>
                            <StatCard label="Plays" value={gPlays.length} />
                            <StatCard label="Yards" value={`+${totalYards}`} accent={THEME.primary} />
                            <StatCard label="TDs"   value={tds} accent="#059669" />
                            <StatCard label="Avg Yds" value={(gPlays.length>0?totalYards/gPlays.length:0).toFixed(1)} />
                          </div>
                          {topPerfs.length > 0 && (
                            <div>
                              <div style={{ fontSize:13, fontWeight:800, color:"#374151", marginBottom:10 }}>Top Performers</div>
                              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                                {topPerfs.map((p,i) => (
                                  <div key={i} style={{ background:"#f8fafc", borderRadius:10, padding:"10px 16px", display:"flex", alignItems:"center", gap:10 }}>
                                    <div style={{ width:28, height:28, borderRadius:999, background:THEME.primaryLight, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:THEME.primaryDark }}>{i+1}</div>
                                    <div>
                                      <div style={{ fontSize:13, fontWeight:800, color:"#111827" }}>{p.name}</div>
                                      <div style={{ fontSize:11, color:"#6b7280" }}>{p.yards>0?"+":""}{p.yards} yds · {p.tds} TDs</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div style={{ marginTop:16 }}>
                            <div style={{ fontSize:13, fontWeight:800, color:"#374151", marginBottom:10 }}>Outcomes</div>
                            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                              {Object.entries(resultBreakdown).sort((a,b)=>b[1]-a[1]).map(([outcome,count]) => {
                                const pct = Math.round(count/gPlays.length*100);
                                return (
                                  <div key={outcome} style={{ display:"flex", alignItems:"center", gap:10 }}>
                                    <Badge color={outcomeColor(outcome)}>{outcome}</Badge>
                                    <div style={{ flex:1, height:6, background:"#f3f4f6", borderRadius:99 }}>
                                      <div style={{ height:"100%", width:`${pct}%`, background:THEME.primary, borderRadius:99 }} />
                                    </div>
                                    <span style={{ fontSize:11, color:"#9ca3af", width:20, textAlign:"right" }}>{count}</span>
                                  </div>
                                );
                              })}
                            </div>
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

        {/* ───── REPORT CARDS TAB ───── */}
        {tab === "Report Cards" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <div style={{ fontSize:13, color:"#6b7280" }}>Click any player to view their full report card.</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:14 }}>
              {players.sort((a,b)=>a.name.localeCompare(b.name)).map(pl => {
                const plPlays = plays.filter(p => [p.carrier,p.receiver,p.thrower].includes(String(pl.id)));
                const tds     = plPlays.filter(p => p.outcome===tdOutcome).length;
                const yards   = plPlays.reduce((a,b)=>a+b.yardsGained,0);
                return (
                  <button key={pl.id} onClick={() => setSelectedPlayer(pl)} style={{
                    background:"#fff", border:`1.5px solid ${THEME.primary}`, borderRadius:14, padding:"18px 16px",
                    cursor:"pointer", textAlign:"left", fontFamily:"inherit",
                  }}>
                    <div style={{ fontSize:15, fontWeight:800, color:"#111827", marginBottom:4 }}>{pl.name}</div>
                    <Badge color="purple">{pl.position}</Badge>
                    <div style={{ marginTop:10, display:"flex", gap:12 }}>
                      <div><div style={{ fontSize:18, fontWeight:900, color:THEME.primary }}>{plPlays.length}</div><div style={{ fontSize:10, color:"#9ca3af" }}>PLAYS</div></div>
                      <div><div style={{ fontSize:18, fontWeight:900, color:"#059669" }}>{tds}</div><div style={{ fontSize:10, color:"#9ca3af" }}>TDs</div></div>
                      <div><div style={{ fontSize:18, fontWeight:900, color:THEME.accent }}>{yards}</div><div style={{ fontSize:10, color:"#9ca3af" }}>YDS</div></div>
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedPlayer && (() => {
              const pl = selectedPlayer;
              const isPassPlay = p => p.playType === "Pass";
              const plPlays = plays.filter(p => [p.carrier,p.receiver,p.thrower].includes(String(pl.id)));
              const stats = { attempts:0,receptions:0,recGain:0,recLoss:0,incompletions:0,runs:0,runGain:0,runLoss:0,tds:0,ints:0,drops:0,throwAways:0,sacks:0,yards:0 };
              plPlays.forEach(p => {
                const o = (p.outcome||"").trim();
                const xpOuts = ["XP Converted - 1pt","XP Converted - 2pt","XP Converted - 3pt"];
                if(p.thrower===String(pl.id)&&isPassPlay(p)){
                  if(o!=="Throw Away"&&o!=="Sack")stats.attempts++;
                  if(o==="Interception"||o==="INT")stats.ints++;
                  if(o==="Throw Away")stats.throwAways++;
                  if(o==="Sack")stats.sacks++;
                  if(o==="Drop")stats.drops++;
                  if(o==="Incomplete")stats.incompletions++;
                  if(o===tdOutcome)stats.tds++;
                  if(xpOuts.includes(o)){stats.receptions++;stats.recGain++;stats.yards+=p.yardsGained;}
                  if(!["Incomplete","Drop","Interception","INT","Throw Away","Sack",...xpOuts].includes(o)&&o!==""){stats.receptions++;stats.yards+=p.yardsGained;if(p.yardsGained>0||o===tdOutcome)stats.recGain++;if(p.yardsGained<0)stats.recLoss++;}
                }
                if(p.receiver===String(pl.id)&&p.thrower!==String(pl.id)&&isPassPlay(p)){
                  stats.attempts++;
                  if(o==="Incomplete")stats.incompletions++;
                  if(o==="Drop")stats.drops++;
                  if(o===tdOutcome)stats.tds++;
                  if(xpOuts.includes(o)){stats.receptions++;stats.recGain++;stats.yards+=p.yardsGained;}
                  if(!["Incomplete","Drop","Interception","INT","Throw Away","Sack",...xpOuts].includes(o)&&o!==""){stats.receptions++;stats.yards+=p.yardsGained;if(p.yardsGained>0||o===tdOutcome)stats.recGain++;if(p.yardsGained<0)stats.recLoss++;}
                }
                if(p.carrier===String(pl.id)&&!isPassPlay(p)){
                  stats.runs++;stats.yards+=p.yardsGained;
                  if(p.yardsGained>0||o===tdOutcome)stats.runGain++;
                  if(p.yardsGained<0)stats.runLoss++;
                  if(o===tdOutcome)stats.tds++;
                }
                if(p.carrier===String(pl.id)&&isPassPlay(p)&&o===tdOutcome)stats.tds++;
              });

              const byGame = {};
              games.forEach(g => {
                const gp=plays.filter(p=>p.game===g&&[p.carrier,p.receiver,p.thrower].includes(String(pl.id)));
                if(gp.length>0) byGame[g]={plays:gp.length,yards:gp.reduce((a,b)=>a+b.yardsGained,0),tds:gp.filter(p=>p.outcome===tdOutcome).length};
              });

              const strengths=[], areas=[];
              if(stats.tds>=2)strengths.push("Scoring threat — multiple TDs");
              if(stats.receptions>0&&stats.recGain/stats.receptions>=0.7)strengths.push("Reliable receiver — high catch-for-gain rate");
              if(stats.runs>0&&stats.runGain/stats.runs>=0.6)strengths.push("Consistent ball carrier");
              if(stats.attempts>0&&stats.ints===0)strengths.push("Ball security — no interceptions");
              if(stats.drops>1)areas.push(`Catching — ${stats.drops} drops logged`);
              if(stats.ints>0)areas.push(`Decision making — ${stats.ints} INT${stats.ints>1?"s":""} thrown`);
              if(stats.runs>0&&stats.runLoss/stats.runs>=0.3)areas.push("Run efficiency — high rate of negative runs");
              if(stats.sacks>1)areas.push(`Pocket presence — ${stats.sacks} sacks taken`);
              if(strengths.length===0)strengths.push("Keep logging plays to unlock insights");
              if(areas.length===0)areas.push("No major concerns — keep it up!");

              const note = coachNotes[pl.id] || "";

              return (
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
                  onClick={e => { if(e.target===e.currentTarget)setSelectedPlayer(null); }}>
                  <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:720, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
                    <div style={{ background:THEME.buttonBg, padding:"20px 28px", borderRadius:"20px 20px 0 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontSize:20, fontWeight:900, color:"#fff" }}>{pl.name}</div>
                        <div style={{ fontSize:12, color:"#a8b8c8", marginTop:2 }}>{pl.position} · {plPlays.length} total plays</div>
                      </div>
                      <button onClick={() => setSelectedPlayer(null)} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:18, fontFamily:"inherit" }}>×</button>
                    </div>
                    <div style={{ padding:28, display:"flex", flexDirection:"column", gap:24 }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:800, color:"#111827", marginBottom:12 }}>Full Stat Line</div>
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:10 }}>
                          {[["Attempts",stats.attempts],["Receptions",stats.receptions],["Rec+",stats.recGain],["Rec-",stats.recLoss],["Inc",stats.incompletions],["Runs",stats.runs],["Run+",stats.runGain],["Run-",stats.runLoss],["TDs",stats.tds],["INTs",stats.ints],["Drops",stats.drops],["T/A",stats.throwAways],["Sacks",stats.sacks],["Yards",stats.yards]].map(([label,val]) => (
                            <div key={label} style={{ background:"#f8fafc", borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
                              <div style={{ fontSize:20, fontWeight:900, color:label==="TDs"?"#059669":label==="INTs"||label==="Drops"?"#dc2626":THEME.primary }}>{val}</div>
                              <div style={{ fontSize:10, fontWeight:700, color:"#9ca3af", textTransform:"uppercase", letterSpacing:0.5 }}>{label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                        <div style={{ background:"#f0fdf4", borderRadius:12, padding:16, border:"1px solid #bbf7d0" }}>
                          <div style={{ fontSize:13, fontWeight:800, color:"#065f46", marginBottom:10 }}>💪 Strengths</div>
                          {strengths.map((s,i) => <div key={i} style={{ fontSize:12, color:"#374151", marginBottom:6, paddingLeft:8, borderLeft:"3px solid #059669" }}>{s}</div>)}
                        </div>
                        <div style={{ background:"#fff7ed", borderRadius:12, padding:16, border:"1px solid #fed7aa" }}>
                          <div style={{ fontSize:13, fontWeight:800, color:"#92400e", marginBottom:10 }}>📈 Areas to Improve</div>
                          {areas.map((a,i) => <div key={i} style={{ fontSize:12, color:"#374151", marginBottom:6, paddingLeft:8, borderLeft:"3px solid #f59e0b" }}>{a}</div>)}
                        </div>
                      </div>
                      {Object.keys(byGame).length > 0 && (
                        <div>
                          <div style={{ fontSize:14, fontWeight:800, color:"#111827", marginBottom:12 }}>Game-by-Game Breakdown</div>
                          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                            <thead><tr style={{ background:"#f8fafc" }}>
                              {["Game","Plays","Yards","TDs"].map(h => <th key={h} style={{ padding:"8px 12px", textAlign:h==="Game"?"left":"center", fontWeight:700, color:"#9ca3af", fontSize:11, textTransform:"uppercase" }}>{h}</th>)}
                            </tr></thead>
                            <tbody>
                              {Object.entries(byGame).map(([g,d],i) => (
                                <tr key={g} style={{ borderBottom:"1px solid #f3f4f6", background:i%2===0?"#fff":"#fafafa" }}>
                                  <td style={{ padding:"9px 12px", fontWeight:600 }}>{g}</td>
                                  <td style={{ padding:"9px 12px", textAlign:"center", color:"#6b7280" }}>{d.plays}</td>
                                  <td style={{ padding:"9px 12px", textAlign:"center", fontWeight:700, color:THEME.primary }}>{d.yards>0?`+${d.yards}`:d.yards}</td>
                                  <td style={{ padding:"9px 12px", textAlign:"center" }}>{d.tds>0?<Badge color="green">{d.tds}</Badge>:"—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize:14, fontWeight:800, color:"#111827", marginBottom:8 }}>Coach Notes</div>
                        <textarea value={note} onChange={e => saveCoachNote(pl.id, e.target.value)}
                          placeholder="Add private notes about this player..."
                          style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1.5px solid #d1d5db", fontSize:13, fontFamily:"inherit", minHeight:80, resize:"vertical", boxSizing:"border-box" }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ───── MANAGE TAB ───── */}
        {tab === "Manage" && (
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>

            {/* Logo Upload */}
<div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
  <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:4 }}>Team Logo</div>
  <div style={{ fontSize:12, color:"#6b7280", marginBottom:16 }}>Upload your team logo. Appears in the header, game summaries, and PDF exports. Admin only.</div>
  {userProfile?.role === "admin" && (
    <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
      {logoUrl && (
        <img src={logoUrl} alt="Team logo" style={{ width:80, height:80, objectFit:"cover", borderRadius:12, border:"1.5px solid #e5e7eb" }} />
      )}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        <label style={{ padding:"9px 18px", background:THEME.buttonBg, color:"#fff", borderRadius:8, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
          {logoUploading ? "Uploading..." : logoUrl ? "Replace Logo" : "Upload Logo"}
          <input type="file" accept="image/*" style={{ display:"none" }} disabled={logoUploading}
            onChange={e => { const file = e.target.files[0]; if (file) handleLogoUpload(file); e.target.value=""; }} />
        </label>
        {logoUrl && (
          <button onClick={() => { if(window.confirm("Delete team logo?")) handleLogoDelete(); }}
            style={{ padding:"9px 18px", background:"#fee2e2", color:"#dc2626", border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            Remove Logo
          </button>
        )}
      </div>
    </div>
  )}
  {userProfile?.role !== "admin" && (
    <div style={{ fontSize:13, color:"#9ca3af" }}>Only admins can upload a logo.</div>
  )}
</div>
            {/* Games */}
            <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Games</div>
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                <input style={{ ...inputStyle, flex:1 }} placeholder="e.g. Game 9" value={newGame} onChange={e => setNewGame(e.target.value)}
                  onKeyDown={e => { if(e.key==="Enter"&&newGame.trim()){saveGames([...games,newGame.trim()]);setNewGame("");} }} />
                <button onClick={() => { if(newGame.trim()){saveGames([...games,newGame.trim()]);setNewGame("");} }}
                  style={{ padding:"9px 14px", background:THEME.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Add</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:280, overflowY:"auto" }}>
                {games.map((g,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", background:"#f8fafc", borderRadius:8 }}>
                    {editingGame?.index===i ? (
                      <>
                        <input autoFocus style={{ ...inputStyle, flex:1, padding:"4px 8px", fontSize:13 }} value={editingGame.value}
                          onChange={e => setEditingGame(eg => ({ ...eg, value:e.target.value }))}
                          onKeyDown={e => { if(e.key==="Enter"){const v=editingGame.value.trim();if(v){const ng=[...games];ng[i]=v;saveGames(ng);}setEditingGame(null);} if(e.key==="Escape")setEditingGame(null); }} />
                        <button onClick={() => { const v=editingGame.value.trim();if(v){const ng=[...games];ng[i]=v;saveGames(ng);}setEditingGame(null); }} style={{ border:"none", background:"#d1fae5", color:"#065f46", borderRadius:6, padding:"3px 8px", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>Save</button>
                        <button onClick={() => setEditingGame(null)} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize:13, fontWeight:600, color:"#374151", flex:1 }}>{g}</span>
                        <button onClick={() => setEditingGame({ index:i, value:g })} style={{ border:"none", background:"none", color:"#6b7280", cursor:"pointer", fontSize:13, padding:"0 2px" }}>✏️</button>
                        <button onClick={() => { if(window.confirm(`Delete "${g}"?`))saveGames(games.filter((_,j)=>j!==i)); }} style={{ border:"none", background:"none", color:"#ef4444", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Players */}
            <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Players</div>
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                <input style={{ ...inputStyle, flex:2 }} placeholder="Player name" value={newPlayer.name} onChange={e => setNewPlayer(p => ({ ...p, name:e.target.value }))} />
                <select style={{ ...inputStyle, flex:1 }} value={newPlayer.position} onChange={e => setNewPlayer(p => ({ ...p, position:e.target.value }))}>
                  <option value="">Position</option>
                  {positions.map(pos => <option key={pos}>{pos}</option>)}
                </select>
                <button onClick={() => {
                  if(newPlayer.name.trim()&&newPlayer.position){
                    const updated=[...players,{ id:Date.now(), name:newPlayer.name.trim(), position:newPlayer.position }];
                    savePlayers(updated); setNewPlayer({ name:"", position:"" });
                  }
                }} style={{ padding:"9px 14px", background:THEME.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Add</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:320, overflowY:"auto" }}>
                {players.sort((a,b)=>a.name.localeCompare(b.name)).map((pl,i) => (
                  <div key={pl.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"#f8fafc", borderRadius:8 }}>
                    {editingPlayer?.id===pl.id ? (
                      <>
                        <input autoFocus style={{ ...inputStyle, flex:2, padding:"4px 8px", fontSize:13 }} value={editingPlayer.name}
                          onChange={e => setEditingPlayer(ep => ({ ...ep, name:e.target.value }))} />
                        <select style={{ ...inputStyle, flex:1, padding:"4px 8px", fontSize:13 }} value={editingPlayer.position}
                          onChange={e => setEditingPlayer(ep => ({ ...ep, position:e.target.value }))}>
                          {positions.map(pos => <option key={pos}>{pos}</option>)}
                        </select>
                        <button onClick={() => {
                          const v=editingPlayer.name.trim();
                          if(v){savePlayers(players.map(p=>p.id===pl.id?{...p,name:v,position:editingPlayer.position}:p));}
                          setEditingPlayer(null);
                        }} style={{ border:"none", background:"#d1fae5", color:"#065f46", borderRadius:6, padding:"3px 8px", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>Save</button>
                        <button onClick={() => setEditingPlayer(null)} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize:13, fontWeight:700, color:"#111827", flex:2 }}>{pl.name}</span>
                        <Badge color="purple">{pl.position}</Badge>
                        <button onClick={() => setEditingPlayer({ id:pl.id, name:pl.name, position:pl.position })} style={{ border:"none", background:"none", color:"#6b7280", cursor:"pointer", fontSize:13, padding:"0 2px", marginLeft:"auto" }}>✏️</button>
                        <button onClick={() => { if(window.confirm(`Delete ${pl.name}?`))savePlayers(players.filter(p=>p.id!==pl.id)); }} style={{ border:"none", background:"none", color:"#ef4444", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Play Codes */}
            <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Play Codes</div>
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                <input style={{ ...inputStyle, flex:1 }} placeholder="e.g. S1" value={newCode.code} onChange={e => setNewCode({ code:e.target.value })}
                  onKeyDown={e => { if(e.key==="Enter"&&newCode.code.trim()){savePlayCodes([...playCodes,{ id:Date.now(), code:newCode.code.trim() }]);setNewCode({ code:"" });} }} />
                <button onClick={() => { if(newCode.code.trim()){savePlayCodes([...playCodes,{ id:Date.now(), code:newCode.code.trim() }]);setNewCode({ code:"" });} }}
                  style={{ padding:"9px 14px", background:THEME.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Add</button>
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {playCodes.map(pc => (
                  <div key={pc.id} style={{ background:"#e8eef7", borderRadius:8, padding:"5px 12px", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:THEME.primaryDark }}>{pc.code}</span>
                    <button onClick={() => { if(window.confirm(`Delete code "${pc.code}"?`))savePlayCodes(playCodes.filter(p=>p.id!==pc.id)); }} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:13, padding:0 }}>×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Positions */}
            <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Positions</div>
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                <input style={{ ...inputStyle, flex:1 }} placeholder="e.g. RB, TE" value={newPosition} onChange={e => setNewPosition(e.target.value)}
                  onKeyDown={e => { if(e.key==="Enter"&&newPosition.trim()){savePositions([...positions,newPosition.trim()]);setNewPosition("");} }} />
                <button onClick={() => { if(newPosition.trim()){savePositions([...positions,newPosition.trim()]);setNewPosition("");} }}
                  style={{ padding:"9px 14px", background:THEME.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Add</button>
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {positions.map((pos,i) => (
                  <div key={i} style={{ background:"#e8eef7", borderRadius:8, padding:"5px 12px", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:THEME.primaryDark }}>{pos}</span>
                    <button onClick={() => savePositions(positions.filter((_,j)=>j!==i))} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:13, padding:0 }}>×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Offensive Outcomes */}
            <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Offensive Outcomes</div>
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                <input style={{ ...inputStyle, flex:1 }} placeholder="e.g. Penalty, Fumble" value={newOutcome} onChange={e => setNewOutcome(e.target.value)}
                  onKeyDown={e => { if(e.key==="Enter"&&newOutcome.trim()){saveOutcomes([...outcomes,newOutcome.trim()]);setNewOutcome("");} }} />
                <button onClick={() => { if(newOutcome.trim()){saveOutcomes([...outcomes,newOutcome.trim()]);setNewOutcome("");} }}
                  style={{ padding:"9px 14px", background:THEME.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Add</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:280, overflowY:"auto" }}>
                {outcomes.map((o,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", background:"#f8fafc", borderRadius:8 }}>
                    {editingOutcome?.index===i ? (
                      <>
                        <input autoFocus style={{ ...inputStyle, flex:1, padding:"4px 8px", fontSize:13 }} value={editingOutcome.value}
                          onChange={e => setEditingOutcome(eo => ({ ...eo, value:e.target.value }))}
                          onKeyDown={e => { if(e.key==="Enter"){const v=editingOutcome.value.trim();if(v)saveOutcomes(outcomes.map((x,j)=>j===i?v:x));setEditingOutcome(null);} if(e.key==="Escape")setEditingOutcome(null); }} />
                        <button onClick={() => { const v=editingOutcome.value.trim();if(v)saveOutcomes(outcomes.map((x,j)=>j===i?v:x));setEditingOutcome(null); }} style={{ border:"none", background:"#d1fae5", color:"#065f46", borderRadius:6, padding:"3px 8px", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>Save</button>
                        <button onClick={() => setEditingOutcome(null)} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize:13, fontWeight:600, color:"#374151", flex:1 }}>{o}</span>
                        <button onClick={() => setEditingOutcome({ index:i, value:o })} style={{ border:"none", background:"none", color:"#6b7280", cursor:"pointer", fontSize:13, padding:"0 2px" }}>✏️</button>
                        <button onClick={() => { if(window.confirm(`Delete "${o}"?`))saveOutcomes(outcomes.filter((_,j)=>j!==i)); }} style={{ border:"none", background:"none", color:"#ef4444", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Defensive Outcomes */}
            <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Defensive Outcomes</div>
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                <input style={{ ...inputStyle, flex:1 }} placeholder="e.g. Safety, Fumble Recovery" value={newDefOutcome} onChange={e => setNewDefOutcome(e.target.value)}
                  onKeyDown={e => { if(e.key==="Enter"&&newDefOutcome.trim()){saveDefOutcomes([...defOutcomes,newDefOutcome.trim()]);setNewDefOutcome("");} }} />
                <button onClick={() => { if(newDefOutcome.trim()){saveDefOutcomes([...defOutcomes,newDefOutcome.trim()]);setNewDefOutcome("");} }}
                  style={{ padding:"9px 14px", background:THEME.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Add</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:280, overflowY:"auto" }}>
                {defOutcomes.map((o,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", background:"#f8fafc", borderRadius:8 }}>
                    {editingDefOutcome?.index===i ? (
                      <>
                        <input autoFocus style={{ ...inputStyle, flex:1, padding:"4px 8px", fontSize:13 }} value={editingDefOutcome.value}
                          onChange={e => setEditingDefOutcome(eo => ({ ...eo, value:e.target.value }))}
                          onKeyDown={e => { if(e.key==="Enter"){const v=editingDefOutcome.value.trim();if(v)saveDefOutcomes(defOutcomes.map((x,j)=>j===i?v:x));setEditingDefOutcome(null);} if(e.key==="Escape")setEditingDefOutcome(null); }} />
                        <button onClick={() => { const v=editingDefOutcome.value.trim();if(v)saveDefOutcomes(defOutcomes.map((x,j)=>j===i?v:x));setEditingDefOutcome(null); }} style={{ border:"none", background:"#d1fae5", color:"#065f46", borderRadius:6, padding:"3px 8px", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>Save</button>
                        <button onClick={() => setEditingDefOutcome(null)} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize:13, fontWeight:600, color:"#374151", flex:1 }}>{o}</span>
                        <button onClick={() => setEditingDefOutcome({ index:i, value:o })} style={{ border:"none", background:"none", color:"#6b7280", cursor:"pointer", fontSize:13, padding:"0 2px" }}>✏️</button>
                        <button onClick={() => { if(window.confirm(`Delete "${o}"?`))saveDefOutcomes(defOutcomes.filter((_,j)=>j!==i)); }} style={{ border:"none", background:"none", color:"#ef4444", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Player Actions */}
            <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Player Actions</div>
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                <input style={{ ...inputStyle, flex:1 }} placeholder="e.g. Tackle, Strip" value={newPlayerAction} onChange={e => setNewPlayerAction(e.target.value)}
                  onKeyDown={e => { if(e.key==="Enter"&&newPlayerAction.trim()){savePlayerActions([...playerActions,newPlayerAction.trim()]);setNewPlayerAction("");} }} />
                <button onClick={() => { if(newPlayerAction.trim()){savePlayerActions([...playerActions,newPlayerAction.trim()]);setNewPlayerAction("");} }}
                  style={{ padding:"9px 14px", background:THEME.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Add</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:280, overflowY:"auto" }}>
                {playerActions.map((a,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", background:"#f8fafc", borderRadius:8 }}>
                    {editingPlayerAction?.index===i ? (
                      <>
                        <input autoFocus style={{ ...inputStyle, flex:1, padding:"4px 8px", fontSize:13 }} value={editingPlayerAction.value}
                          onChange={e => setEditingPlayerAction(ea => ({ ...ea, value:e.target.value }))}
                          onKeyDown={e => { if(e.key==="Enter"){const v=editingPlayerAction.value.trim();if(v)savePlayerActions(playerActions.map((x,j)=>j===i?v:x));setEditingPlayerAction(null);} if(e.key==="Escape")setEditingPlayerAction(null); }} />
                        <button onClick={() => { const v=editingPlayerAction.value.trim();if(v)savePlayerActions(playerActions.map((x,j)=>j===i?v:x));setEditingPlayerAction(null); }} style={{ border:"none", background:"#d1fae5", color:"#065f46", borderRadius:6, padding:"3px 8px", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>Save</button>
                        <button onClick={() => setEditingPlayerAction(null)} style={{ border:"none", background:"none", color:"#9ca3af", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize:13, fontWeight:600, color:"#374151", flex:1 }}>{a}</span>
                        <button onClick={() => setEditingPlayerAction({ index:i, value:a })} style={{ border:"none", background:"none", color:"#6b7280", cursor:"pointer", fontSize:13, padding:"0 2px" }}>✏️</button>
                        <button onClick={() => { if(window.confirm(`Delete "${a}"?`))savePlayerActions(playerActions.filter((_,j)=>j!==i)); }} style={{ border:"none", background:"none", color:"#ef4444", cursor:"pointer", fontSize:15, padding:0 }}>×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Data Management */}
            <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:20, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:"#111827" }}>Data Management</div>
                <div style={{ fontSize:12, color:"#6b7280" }}>Your data is saved to the cloud in real-time. Export a backup anytime.</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:"#374151", whiteSpace:"nowrap" }}>TD Outcome:</label>
                  <select value={tdOutcome} onChange={e => saveTdOutcome(e.target.value)}
                    style={{ padding:"7px 10px", borderRadius:8, border:"1.5px solid #d1d5db", fontSize:13, fontFamily:"inherit", color:"#111827" }}>
                    {outcomes.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <button onClick={() => {
                  const data = { plays, games, players, playCodes, defPlays, defOutcomes, playerActions, exported:new Date().toISOString() };
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement("a"); a.href=url; a.download="coachlog-backup.json"; a.click();
                  URL.revokeObjectURL(url);
                }} style={{ padding:"9px 18px", background:THEME.buttonBg, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
                  ⬇ Export Backup
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ───── TEAM TAB ───── */}
        {tab === "Team" && (
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
            {/* Team members list */}
            <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:16 }}>Team Members</div>
              {teamUsers.length === 0 ? (
                <div style={{ color:"#9ca3af", fontSize:13, textAlign:"center", padding:32 }}>No team members found.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {teamUsers.map(u => (
                    <div key={u.uid} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:"#f8fafc", borderRadius:10 }}>
                      <div style={{ width:36, height:36, borderRadius:999, background:u.role==="admin"?THEME.primaryDark:"#e8eef7", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>
                        {u.role==="admin"?"👑":"🏈"}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>{u.name||"Unnamed"}</div>
                        <div style={{ fontSize:12, color:"#6b7280" }}>{u.email||u.uid}</div>
                      </div>
                      <Badge color={u.role==="admin"?"blue":"gray"}>{u.role==="admin"?"Admin":"Coach"}</Badge>
                      {u.uid === authUser?.uid && <Badge color="green">You</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add new user — admin only */}
            {userProfile?.role === "admin" && (
              <div style={{ background:"#fff", borderRadius:16, border:"1.5px solid #e5e7eb", padding:24 }}>
                <div style={{ fontSize:16, fontWeight:800, color:"#111827", marginBottom:4 }}>Add Team Member</div>
                <div style={{ fontSize:12, color:"#6b7280", marginBottom:16 }}>New coaches will receive an email invite. They sign in with the credentials you set here.</div>
                {teamMsg && (
                  <div style={{ background:teamMsg.startsWith("✅")?"#d1fae5":"#fee2e2", color:teamMsg.startsWith("✅")?"#065f46":"#991b1b", padding:"9px 12px", borderRadius:8, fontSize:13, marginBottom:14 }}>{teamMsg}</div>
                )}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                  <div>
                    <label style={labelStyle}>Name</label>
                    <input style={inputStyle} placeholder="Coach Smith" value={newUserName} onChange={e => setNewUserName(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select style={inputStyle} value={newUserRole} onChange={e => setNewUserRole(e.target.value)}>
                      <option value="coach">Coach</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input style={inputStyle} type="email" placeholder="coach@team.com" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Temporary Password</label>
                    <input style={inputStyle} type="password" placeholder="min 6 characters" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} />
                  </div>
                </div>
                <div style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#92400e", marginBottom:14 }}>
                  ⚠️ Creating users requires calling the Firebase Admin SDK from a secure backend. For now, create new users directly in <strong>Firebase Console → Authentication → Add User</strong>, then add their <code>uid</code>, <code>instanceId: "{instanceId}"</code>, <code>role: "{newUserRole}"</code>, and <code>name</code> to the <code>users</code> collection manually.
                </div>
                <div style={{ fontSize:12, color:"#6b7280" }}>
                  New user details to add in Firestore <code>users/{"{uid}"}</code>:
                  <pre style={{ background:"#f8fafc", borderRadius:8, padding:"10px 14px", marginTop:8, fontSize:11, overflowX:"auto" }}>{JSON.stringify({ instanceId, role:newUserRole, name:newUserName||"(set name)", email:newUserEmail||"(set email)" }, null, 2)}</pre>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
