import { useState, useMemo, useEffect } from "react";
import React from "react";

// ── Shared game view (read-only, decoded from URL) ──────────────────────────
function SharedGameView() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("share");
  if (!encoded) return null;
  let data;
  try {
    data = JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>Invalid share link.</div>;
  }
  const { game, score, plays, defPlays: gdPlays = [], players, tdOutcome } = data;
  const totalYards = plays.reduce((a, b) => a + (Number(b.yardsGained) || 0), 0);
  const tds = plays.filter(p => p.outcome === tdOutcome).length;
  const isPassPlay = p => p.playType === "Pass";
  const resultColor = score.result === "W" ? "#059669" : score.result === "L" ? "#dc2626" : "#6b7280";

  // Offensive per-player stats
  const byPlayer = {};
  const ensureP = (pid) => {
    if (!byPlayer[pid]) {
      const pl = players.find(x => x.id === Number(pid));
      if (!pl) return false;
      byPlayer[pid] = { name: pl.name, position: pl.position, attempts: 0, receptions: 0, recGain: 0, recLoss: 0, incompletions: 0, runs: 0, runGain: 0, runLoss: 0, tds: 0, ints: 0, drops: 0, throwAways: 0, sacks: 0, yards: 0, isThrower: false, isReceiver: false, isRunner: false };
    }
    return true;
  };
  plays.forEach(p => {
    const o = (p.outcome || "").trim();
    const TD = tdOutcome;
    const notComplete = ["Incomplete","Drop","Interception","INT","Throw Away","Sack"];
    if (p.thrower && isPassPlay(p) && ensureP(p.thrower)) {
      const s = byPlayer[p.thrower]; s.isThrower = true;
      if (o !== "Throw Away" && o !== "Sack") s.attempts++;
      if (o === "Interception" || o === "INT") s.ints++;
      if (o === "Throw Away") s.throwAways++;
      if (o === "Sack") s.sacks++;
      if (o === "Drop") s.drops++;
      if (o === "Incomplete") s.incompletions++;
      if (o === TD) s.tds++;
      if (!notComplete.includes(o) && o !== "") { s.receptions++; s.yards += Number(p.yardsGained)||0; if ((Number(p.yardsGained)||0) > 0 || o === TD) s.recGain++; if ((Number(p.yardsGained)||0) < 0) s.recLoss++; }
    }
    if (p.receiver && p.receiver !== p.thrower && isPassPlay(p) && ensureP(p.receiver)) {
      const s = byPlayer[p.receiver]; s.isReceiver = true; s.attempts++;
      if (o === "Incomplete") s.incompletions++;
      if (o === "Drop") s.drops++;
      if (o === TD) s.tds++;
      if (!notComplete.includes(o) && o !== "") { s.receptions++; s.yards += Number(p.yardsGained)||0; if ((Number(p.yardsGained)||0) > 0 || o === TD) s.recGain++; if ((Number(p.yardsGained)||0) < 0) s.recLoss++; }
    }
    if (p.carrier && !isPassPlay(p) && ensureP(p.carrier)) {
      const s = byPlayer[p.carrier]; s.isRunner = true; s.runs++; s.yards += Number(p.yardsGained)||0;
      if ((Number(p.yardsGained)||0) > 0 || o === TD) s.runGain++; if ((Number(p.yardsGained)||0) < 0) s.runLoss++;
      if (o === TD) s.tds++;
    }
  });

  const throwers = Object.values(byPlayer).filter(p => p.isThrower).sort((a,b) => a.name.localeCompare(b.name));
  const recRunners = Object.values(byPlayer).filter(p => (p.isReceiver || p.isRunner) && !p.isThrower).sort((a,b) => a.name.localeCompare(b.name));

  // Defensive stats
  const co = (o) => gdPlays.filter(p => (p.outcome||"").trim() === o).length;
  const ca = (a) => gdPlays.filter(p => (p.playerAction||"").trim() === a).length;
  const totalYdsAllowed = gdPlays.reduce((a, b) => a + (Number(b.yardsAllowed)||0), 0);
  const tdAllowed = co("Touchdown Allowed");
  const sackTime = co("Sack - Time"); const sackBlitz = co("Sack - Blitz");
  const intOutcome = co("INT");
  const passIncD = co("Pass Incomplete"); const passGainD = co("Pass Allowed - Gain"); const passLossD = co("Pass Allowed - Loss");
  const runGainD = co("Run - Gain"); const runLossD = co("Run - Loss");
  const passPlaysD = gdPlays.filter(p => p.playType === "Pass");
  const runPlaysD = gdPlays.filter(p => p.playType === "Run");
  const passYdsD = passPlaysD.reduce((a,b) => a+(Number(b.yardsAllowed)||0), 0);
  const runYdsD = runPlaysD.reduce((a,b) => a+(Number(b.yardsAllowed)||0), 0);
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

  const thStyle = { padding: "8px 10px", textAlign: "center", fontWeight: 700, color: "#fff", fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" };
  const tdStyle = (color) => ({ padding: "8px 10px", textAlign: "center", color: color || "#374151", fontSize: 12 });

  const card = (label, val, sub) => (
    <div key={label} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e5e7eb", padding: "14px 18px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: "#111827" }}>{val}</div>
      {sub && <div style={{ fontSize: 11, color: "#6b7280" }}>{sub}</div>}
    </div>
  );

  const [pdfLoading, setPdfLoading] = React.useState(false);

  const handleDownloadPDF = () => {
    const el = document.getElementById("share-content");
    if (!el) return;
    setPdfLoading(true);

    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    Promise.all([
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"),
    ]).then(() => {
      window.html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#f4f6fa" }).then(canvas => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
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
    }).catch(() => {
      alert("Failed to load PDF libraries. Please check your internet connection.");
      setPdfLoading(false);
    });
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#f4f6fa", minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Download button (outside captured area) */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button onClick={handleDownloadPDF} disabled={pdfLoading} style={{ padding: "9px 20px", background: pdfLoading ? "#6b7280" : "#1a2f5e", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: pdfLoading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {pdfLoading ? "⏳ Generating..." : "⬇ Download PDF"}
          </button>
        </div>

        {/* Captured content */}
        <div id="share-content" style={{ display: "flex", flexDirection: "column", gap: 20, padding: 8 }}>
          {/* Header */}
          <div style={{ background: "linear-gradient(135deg, #000 0%, #111 100%)", borderRadius: 16, padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{game}</div>
              <div style={{ fontSize: 13, color: "#a8b8c8", marginTop: 2 }}>Game Summary · {plays.length} off / {gdPlays.length} def plays</div>
            </div>
            {(score.us !== "" || score.them !== "") && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#fff" }}>{score.us} — {score.them}</div>
                {score.result && <div style={{ fontSize: 14, fontWeight: 800, color: resultColor }}>{score.result === "W" ? "WIN" : score.result === "L" ? "LOSS" : "TIE"}</div>}
              </div>
            )}
          </div>

          {/* ── OFFENSE ── */}
          <div style={{ fontSize: 13, fontWeight: 900, color: "#1a2f5e", textTransform: "uppercase", letterSpacing: 1 }}>Offense</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {card("Total Plays", plays.length)}
            {card("Total Yards", totalYards)}
            {card("Touchdowns", tds)}
          </div>

          {throwers.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 20, overflowX: "auto" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 12 }}>Throwers</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr style={{ background: "#1a2f5e" }}>
                  {["Player","Pos","Att","Rec","Cmp%","TD%","INT%","Rec+","Rec-","Inc","TDs","INTs","Drops","T/A","Sacks","Yards"].map((h,i) => (
                    <th key={h} style={{ ...thStyle, textAlign: i < 2 ? "left" : "center" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {throwers.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
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
                      <td style={{ ...tdStyle("#4a6fa5"), fontWeight:700 }}>{p.yards>0?`+${p.yards}`:p.yards||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {recRunners.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 20, overflowX: "auto" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 12 }}>Receivers & Runners</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr style={{ background: "#1a2f5e" }}>
                  {["Player","Pos","Att","Rec","Cmp%","TD%","Rec+","Rec-","Inc","Drops","Runs","Run+","Run-","TDs","Yards"].map((h,i) => (
                    <th key={h} style={{ ...thStyle, textAlign: i < 2 ? "left" : "center" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {recRunners.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                      <td style={{ padding:"7px 10px", fontWeight:700, color:"#111827", fontSize:11 }}>{p.name}</td>
                      <td style={{ padding:"7px 10px" }}><span style={{ background:"#e8eef7", color:"#1a2f5e", padding:"1px 6px", borderRadius:999, fontSize:10, fontWeight:700 }}>{p.position}</span></td>
                      <td style={tdStyle()}>{p.attempts||"—"}</td>
                      <td style={tdStyle()}>{p.receptions||"—"}</td>
                      <td style={tdStyle("#6366f1")}>{p.attempts>0?`${Math.round(p.receptions/p.attempts*100)}%`:"—"}</td>
                      <td style={tdStyle("#059669")}>{p.attempts>0?`${(p.tds/p.attempts*100).toFixed(1)}%`:"—"}</td>
                      <td style={tdStyle("#059669")}>{p.recGain||"—"}</td>
                      <td style={tdStyle("#dc2626")}>{p.recLoss||"—"}</td>
                      <td style={tdStyle("#6b7280")}>{p.incompletions||"—"}</td>
                      <td style={tdStyle("#6b7280")}>{p.drops||"—"}</td>
                      <td style={tdStyle()}>{p.runs||"—"}</td>
                      <td style={tdStyle("#059669")}>{p.runGain||"—"}</td>
                      <td style={tdStyle("#dc2626")}>{p.runLoss||"—"}</td>
                      <td style={tdStyle()}>{p.tds>0?p.tds:"—"}</td>
                      <td style={{ ...tdStyle("#4a6fa5"), fontWeight:700 }}>{p.yards>0?`+${p.yards}`:p.yards||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── DEFENSE ── */}
          {gdPlays.length > 0 && (<>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#dc2626", textTransform: "uppercase", letterSpacing: 1 }}>Defense</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {card("Plays Defended", gdPlays.length)}
              {card("Yards Allowed", totalYdsAllowed, `${(totalYdsAllowed/gdPlays.length).toFixed(1)} yds/play`)}
              {card("TDs Allowed", tdAllowed)}
              {card("Sacks / INTs", `${sackTime+sackBlitz} / ${intOutcome}`, `Time: ${sackTime} · Blitz: ${sackBlitz}`)}
            </div>

            {/* Pass vs Run */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e5e7eb", padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", marginBottom: 12 }}>Pass vs Run Allowed</div>
              {[["Pass", passPlaysD.length, passYdsD], ["Run", runPlaysD.length, runYdsD]].map(([type, count, yards]) => {
                const pct = gdPlays.length > 0 ? Math.round(count / gdPlays.length * 100) : 0;
                return (
                  <div key={type} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600 }}>{type}</span>
                      <span style={{ color: "#9ca3af" }}>{count} plays · {count>0?(yards/count).toFixed(1):0} yds/play · {pct}%</span>
                    </div>
                    <div style={{ height: 7, background: "#f3f4f6", borderRadius: 99 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: "#dc2626", borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Play Outcomes table */}
            {Object.keys(outcomeCounts).length > 0 && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 20, overflowX: "auto" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 12 }}>Play Outcomes</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr style={{ background: "#dc2626" }}>
                  {["Outcome","Count","% of Plays"].map((h, i) => (
                    <th key={h} style={{ ...thStyle, textAlign: i === 0 ? "left" : "center" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {Object.entries(outcomeCounts).sort((a,b)=>b[1]-a[1]).map(([outcome, count], i) => {
                    const pct = Math.round(count / gdPlays.length * 100);
                    const isNeg = ["Touchdown Allowed","Pass Allowed - Gain","Run - Gain","XP Allowed"].includes(outcome);
                    return (
                      <tr key={outcome} style={{ borderBottom: "1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                        <td style={{ padding:"7px 10px", fontWeight:600, color:"#374151", fontSize:11 }}>{outcome}</td>
                        <td style={{ padding:"7px 10px", textAlign:"center", fontWeight:700, color: isNeg ? "#dc2626" : "#059669" }}>{count}</td>
                        <td style={{ padding:"7px 10px", textAlign:"center", color:"#6b7280" }}>{pct}%</td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f0f4f8" }}>
                    <td style={{ padding:"8px 10px", fontWeight:900, color:"#111827", fontSize:11 }}>TOTAL</td>
                    <td style={{ padding:"8px 10px", textAlign:"center", fontWeight:800, color:"#111827" }}>{gdPlays.length}</td>
                    <td style={{ padding:"8px 10px", textAlign:"center", fontWeight:800, color:"#111827" }}>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            )}

            {/* Player Actions table */}
            {playerActionRows.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 20, overflowX: "auto" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 12 }}>Player Actions</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr style={{ background: "#dc2626" }}>
                  {["Player","PBUs","Flags Pulled","INTs","Sacks"].map((h, i) => (
                    <th key={h} style={{ ...thStyle, textAlign: i === 0 ? "left" : "center" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {playerActionRows.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                      <td style={{ padding:"7px 10px", fontWeight:700, color:"#111827", fontSize:11 }}>{p.name}</td>
                      <td style={{ padding:"7px 10px", textAlign:"center", color:"#6366f1", fontWeight:700 }}>{p.pbu||"—"}</td>
                      <td style={{ padding:"7px 10px", textAlign:"center", color:"#4a6fa5", fontWeight:700 }}>{p.flagPull||"—"}</td>
                      <td style={{ padding:"7px 10px", textAlign:"center", color:"#059669", fontWeight:700 }}>{p.intAction||"—"}</td>
                      <td style={{ padding:"7px 10px", textAlign:"center", color:"#059669", fontWeight:700 }}>{p.sackAction||"—"}</td>
                    </tr>
                  ))}
                  {(() => {
                    const t = { pbu:0, flagPull:0, intAction:0, sackAction:0 };
                    playerActionRows.forEach(p => Object.keys(t).forEach(k => { t[k] += p[k]||0; }));
                    return (
                      <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f0f4f8" }}>
                        <td style={{ padding:"8px 10px", fontWeight:900, color:"#111827", fontSize:11 }}>TOTALS</td>
                        {[t.pbu, t.flagPull, t.intAction, t.sackAction].map((v,i) => (
                          <td key={i} style={{ padding:"8px 10px", textAlign:"center", fontWeight:800, color:"#111827" }}>{v||"—"}</td>
                        ))}
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
            )}
          </>)}

          <div style={{ textAlign: "center", fontSize: 11, color: "#9ca3af" }}>Generated by Coacher</div>
        </div>
      </div>
    </div>
  );
}

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);

  return [value, setValue];
}

const THEME = {
  headerBg: "linear-gradient(135deg, #000000 0%, #111111 100%)",
  primary: "#4a6fa5",
  primaryDark: "#1a2f5e",
  primaryLight: "#e8eef7",
  primaryText: "#1a2f5e",
  accent: "#a8b8c8",
  accentGlow: "#c8d8e8",
  iconGradient: "linear-gradient(135deg, #a8b8c8, #0a1628)",
  tabActive: "#fff",
  tabInactive: "#ffffff",
  badgePosition: "background:#e8eef7;color:#1a2f5e",
  buttonBg: "#1a2f5e",
  saveBg: "#d1fae5",
  saveColor: "#065f46",
};

const PLAY_TYPES = ["Pass", "Run"];
const DEFAULT_OUTCOMES = ["Reception - Gain", "Reception - Loss", "Incomplete", "Drop", "TD", "INT", "Run - Gain", "Run - Loss", "Throw Away", "Sack", "XP Converted - 1pt", "XP Converted - 2pt", "XP Converted - 3pt"];
const DEFAULT_POSITIONS = ["QB", "WR"];

const initialPlayers = [
  { id: 1, name: "Reed", position: "QB" },
  { id: 2, name: "Jones", position: "WR" },
  { id: 3, name: "Hafoka", position: "WR" },
  { id: 4, name: "Witt", position: "WR" },
  { id: 5, name: "Davis", position: "WR" },
  { id: 6, name: "Tyson", position: "WR" },
  { id: 7, name: "Cohen", position: "WR" },
  { id: 8, name: "Corbin", position: "WR" },
  { id: 9, name: "Jack", position: "WR" },
  { id: 10, name: "Tate", position: "WR" },
];

const TABS = ["Play Logger", "Play Log", "Analytics", "Game Summary", "Report Cards", "Manage"];
const DEFAULT_DEF_OUTCOMES = ["Pass Incomplete", "Pass Allowed - Gain", "Pass Allowed - Loss", "Run - Gain", "Run - Loss", "Touchdown Allowed", "XP Allowed", "INT", "Sack - Time", "Sack - Blitz"];
const DEFAULT_PLAYER_ACTIONS = ["PBU", "Flag Pull", "INT", "Sack"];

const successOutcomes = new Set(["TD", "Reception - Gain", "Run - Gain"]);

function Badge({ color, children }) {
  const colors = {
    green: "background:#d1fae5;color:#065f46",
    red: "background:#fee2e2;color:#991b1b",
    blue: "background:#dbeafe;color:#1e40af",
    yellow: "background:#fef3c7;color:#92400e",
    gray: "background:#f3f4f6;color:#374151",
    purple: THEME.badgePosition,
  };
  return (
    <span style={{
      padding: "2px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      fontFamily: "inherit",
      ...(Object.fromEntries(colors[color].split(";").map(s => {
        const [k, v] = s.split(":");
        const camel = k.replace(/-([a-z])/g, (_, l) => l.toUpperCase());
        return [camel, v];
      })))
    }}>{children}</span>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "#fff",
      border: "1.5px solid #e5e7eb",
      borderRadius: 14,
      padding: "18px 22px",
      display: "flex",
      flexDirection: "column",
      gap: 2,
      borderLeft: accent ? `4px solid ${accent}` : undefined,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#111827", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function FootballCoach() {
  // Show shared game view if ?share= param is present
  if (new URLSearchParams(window.location.search).get("share")) {
    return <SharedGameView />;
  }
  const [tab, setTab] = useState("Play Logger");
  const [plays, setPlays] = useLocalStorage("coachlog_plays", []);
  const [games, setGames] = useLocalStorage("coachlog_games", ["Game 1", "Game 2", "Game 3", "Game 4", "Game 5", "Game 6", "Game 7", "Game 8"]);
  const [players, setPlayers] = useLocalStorage("coachlog_players", initialPlayers);
  const [playCodes, setPlayCodes] = useLocalStorage("coachlog_playcodes", [
    { id: 1, code: "D1" }, { id: 2, code: "D2" }, { id: 3, code: "D3" },
    { id: 4, code: "D4" }, { id: 5, code: "D5" }, { id: 6, code: "T1" },
    { id: 7, code: "T2" }, { id: 8, code: "T3" }, { id: 9, code: "T4" },
    { id: 10, code: "T5" }, { id: 11, code: "M1" }, { id: 12, code: "M2" },
    { id: 13, code: "M3" }, { id: 14, code: "M4" },
  ]);

  const [positions, setPositions] = useLocalStorage("coachlog_positions", DEFAULT_POSITIONS);
  const [outcomes, setOutcomes] = useLocalStorage("coachlog_outcomes", DEFAULT_OUTCOMES);
  const [tdOutcome, setTdOutcome] = useLocalStorage("coachlog_tdoutcome", "TD");
  const [gameScores, setGameScores] = useLocalStorage("coachlog_gamescores", {}); // { gameName: { us, them, result } }
  const [coachNotes, setCoachNotes] = useLocalStorage("coachlog_coachnotes", {}); // { playerId: string }
  const [defPlays, setDefPlays] = useLocalStorage("coachlog_defplays", []);
  const [defOutcomes, setDefOutcomes] = useLocalStorage("coachlog_defoutcomes", DEFAULT_DEF_OUTCOMES);
  const [playerActions, setPlayerActions] = useLocalStorage("coachlog_playeractions", DEFAULT_PLAYER_ACTIONS);
  const [defForm, setDefForm] = useState({
    game: "Game 1", quarter: "1", down: "1", distance: "", playType: "", player: "", outcome: "", playerAction: "", yardsAllowed: "", notes: "",
  });
  const df = (k, v) => setDefForm(p => ({ ...p, [k]: v }));
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [pendingImport, setPendingImport] = useState(null); // holds parsed backup data waiting for user choice

  // Log Play form state
  const [form, setForm] = useState({
    game: "Game 1",
    quarter: "1",
    down: "1",
    distance: "",
    playCode: "",
    playType: "",
    carrier: "",
    thrower: "",
    receiver: "",
    outcome: "",
    yardsGained: "",
    notes: "",
  });

  // Manage state
  const [newGame, setNewGame] = useState("");
  const [editingGame, setEditingGame] = useState(null); // { index, value }
  const [newPlayer, setNewPlayer] = useState({ name: "", position: "" });
  const [newCode, setNewCode] = useState({ code: "" });
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [newPosition, setNewPosition] = useState("");
  const [editingPosition, setEditingPosition] = useState(null); // { index, value }
  const [newOutcome, setNewOutcome] = useState("");
  const [editingOutcome, setEditingOutcome] = useState(null); // { index, value }
  const [newDefOutcome, setNewDefOutcome] = useState("");
  const [editingDefOutcome, setEditingDefOutcome] = useState(null); // { index, value }
  const [newPlayerAction, setNewPlayerAction] = useState("");
  const [editingPlayerAction, setEditingPlayerAction] = useState(null); // { index, value }

  // Analytics filter
  const [filterGame, setFilterGame] = useState("All");
  const [analyticsSubTab, setAnalyticsSubTab] = useState("Offense");

  // Play Log filters & edit state
  const [logFilterGame, setLogFilterGame] = useState("All");
  const [logFilterPlayer, setLogFilterPlayer] = useState("All");
  const [logFilterSide, setLogFilterSide] = useState("All"); // All / Offense / Defense
  const [logFilterCode, setLogFilterCode] = useState("All");
  const [editingPlay, setEditingPlay] = useState(null); // { play, side } where side = "offense"|"defense"

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleLogPlay = () => {
    if (!form.outcome || !form.playType) return;
    const play = {
      id: Date.now(),
      ...form,
      yardsGained: Number(form.yardsGained) || 0,
      timestamp: new Date().toISOString(),
    };
    setPlays(p => [play, ...p]);
    setForm(prev => ({
      ...prev,
      down: String(Math.min(4, Number(prev.down) + 1)),
      playCode: "",
      playType: "",
      carrier: "",
      thrower: "",
      receiver: "",
      outcome: "",
      yardsGained: "",
      notes: "",
    }));
  };

  const filteredPlays = useMemo(() =>
    filterGame === "All" ? plays : plays.filter(p => p.game === filterGame),
    [plays, filterGame]
  );

  const analytics = useMemo(() => {
    const fp = filteredPlays;
    if (!fp.length) return null;
    const TD = tdOutcome;
    const isPassPlay = (p) => p.playType === "Pass";
    const isSuccess = (p) => {
      const o = (p.outcome || "").trim();
      if (o === TD) return true;                          // TD always success
      if (isPassPlay(p)) return p.yardsGained > 0;       // Rec+ = positive yards on pass
      return p.yardsGained > 0;                          // Run+ = positive yards on run
    };

    const total = fp.length;
    const successful = fp.filter(isSuccess).length;
    const tds = fp.filter(p => (p.outcome || "").trim() === TD).length;
    const totalYards = fp.reduce((a, b) => a + b.yardsGained, 0);

    // By play type
    const byType = {};
    fp.forEach(p => {
      if (!byType[p.playType]) byType[p.playType] = { count: 0, success: 0, yards: 0 };
      byType[p.playType].count++;
      byType[p.playType].yards += p.yardsGained;
      if (isSuccess(p)) byType[p.playType].success++;
    });

    // Detailed per-player stats
    const isRunPlay  = (p) => !isPassPlay(p);

    const byPlayer = {};
    const ensurePlayer = (pid) => {
      if (!byPlayer[pid]) {
        const pl = players.find(x => x.id === Number(pid));
        if (!pl) return false;
        byPlayer[pid] = {
          name: pl.name, position: pl.position,
          attempts: 0,        // pass attempts (thrower)
          receptions: 0,      // caught passes (receiver, gain or TD)
          recGain: 0,         // receptions with positive yards
          recLoss: 0,         // receptions with negative yards
          incompletions: 0,   // incomplete passes targeted at receiver
          runs: 0,            // run plays (carrier)
          runGain: 0,
          runLoss: 0,
          tds: 0,
          ints: 0,            // interceptions thrown (thrower)
          drops: 0,           // drops (receiver)
          throwAways: 0,      // throw aways (thrower)
          sacks: 0,           // sacks (thrower)
          yards: 0,
        };
      }
      return true;
    };

    fp.forEach(p => {
      const o = (p.outcome || "").trim();

      // --- THROWER stats (QB only — tracked separately from receiver stats) ---
      if (p.thrower && isPassPlay(p)) {
        if (!ensurePlayer(p.thrower)) return;
        const s = byPlayer[p.thrower];
        s.isThrower = true;
        if (o !== "Throw Away" && o !== "Sack") s.attempts++;
        if (o === "Interception" || o === "INT") s.ints++;
        if (o === "Throw Away")   s.throwAways++;
        if (o === "Sack")         s.sacks++;
        if (o === "Drop")         s.drops++;
        if (o === "Incomplete")   s.incompletions++;
        if (o === TD) s.tds++;
        // Credit yards/receptions on any completed pass (not inc/drop/int/throwaway/sack)
        if (!["Incomplete","Drop","Interception","INT","Throw Away","Sack"].includes(o) && o !== "") {
          s.receptions++;
          s.yards += p.yardsGained;
          if (p.yardsGained > 0 || o === TD) s.recGain++;
          if (p.yardsGained < 0) s.recLoss++;
        }
      }

      // --- RECEIVER stats ---
      if (p.receiver && p.receiver !== p.thrower && isPassPlay(p)) {
        if (!ensurePlayer(p.receiver)) return;
        const s = byPlayer[p.receiver];
        s.isReceiver = true;
        s.attempts++;
        if (o === "Incomplete")   s.incompletions++;
        if (o === "Drop")         s.drops++;
        if (o === TD) s.tds++;
        // Credit yards/receptions on any completed pass (not inc/drop/int/throwaway/sack)
        if (!["Incomplete","Drop","Interception","INT","Throw Away","Sack"].includes(o) && o !== "") {
          s.receptions++;
          s.yards += p.yardsGained;
          if (p.yardsGained > 0 || o === TD) s.recGain++;
          if (p.yardsGained < 0) s.recLoss++;
        }
      }

      // --- CARRIER stats (run plays) ---
      if (p.carrier && isRunPlay(p)) {
        if (!ensurePlayer(p.carrier)) return;
        const s = byPlayer[p.carrier];
        s.isRunner = true;
        s.runs++;
        s.yards += p.yardsGained;
        if (p.yardsGained > 0 || o === TD) s.runGain++;
        if (p.yardsGained < 0) s.runLoss++;
        if (o === TD) s.tds++;
      }

      // --- CARRIER on a pass play (e.g. screen/sweep where carrier is logged) ---
      if (p.carrier && isPassPlay(p) && o === TD) {
        if (ensurePlayer(p.carrier)) {
          byPlayer[p.carrier].isRunner = true;
          byPlayer[p.carrier].tds++;
        }
      }
    });

    // Totals row
    const totals = {
      name: "TOTALS", position: "", isTotal: true,
      attempts: 0, receptions: 0, recGain: 0, recLoss: 0,
      incompletions: 0, runs: 0, runGain: 0, runLoss: 0,
      tds: 0, ints: 0, drops: 0, throwAways: 0, sacks: 0, yards: 0,
    };
    Object.values(byPlayer).forEach(s => {
      Object.keys(totals).forEach(k => {
        if (typeof totals[k] === "number") totals[k] += s[k] || 0;
      });
    });

    // Detailed stats by play code
    const emptyStats = () => ({
      attempts: 0, receptions: 0, recGain: 0, recLoss: 0,
      incompletions: 0, runs: 0, runGain: 0, runLoss: 0,
      tds: 0, ints: 0, drops: 0, throwAways: 0, sacks: 0, yards: 0,
    });

    const byCode = {};
    fp.filter(p => p.playCode).forEach(p => {
      const o = (p.outcome || "").trim();
      if (!byCode[p.playCode]) {
        const pc = playCodes.find(x => x.code === p.playCode);
        byCode[p.playCode] = { code: p.playCode, ...emptyStats() };
      }
      const s = byCode[p.playCode];
      if (isPassPlay(p)) {
        if (o !== "Throw Away" && o !== "Sack") s.attempts++;
        if (o === "Interception" || o === "INT")  s.ints++;
        if (o === "Throw Away")    s.throwAways++;
        if (o === "Sack")          s.sacks++;
        if (o === "Drop")          s.drops++;
        if (o === "Incomplete")    s.incompletions++;
        if (!["Incomplete","Drop","Interception","INT","Throw Away","Sack"].includes(o) && o !== "") {
          s.receptions++;
          if (p.yardsGained > 0 || o === TD) s.recGain++;
          if (p.yardsGained < 0) s.recLoss++;
        }
      } else {
        s.runs++;
        if (p.yardsGained > 0 || o === TD) s.runGain++;
        if (p.yardsGained < 0) s.runLoss++;
      }
      if (o === TD) s.tds++;
      s.yards += Number(p.yardsGained) || 0;
    });

    // Totals for play code table
    const codeTotals = emptyStats();
    Object.values(byCode).forEach(s => {
      Object.keys(codeTotals).forEach(k => { codeTotals[k] += s[k] || 0; });
    });

    return { total, successful, tds, totalYards, byType, byPlayer, totals, byCode, codeTotals };
  }, [filteredPlays, players, playCodes, tdOutcome]);

  const outcomeColor = (o) => {
    if (o === tdOutcome) return "green";
    if (["Reception - Gain", "Run - Gain", "First Down", "Gain"].includes(o)) return "blue";
    if (["Interception", "INT", "Fumble"].includes(o)) return "red";
    if (["Reception - Loss", "Run - Loss", "Loss"].includes(o)) return "red";
    return "gray";
  };

  const inputStyle = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 8,
    border: "1.5px solid #d1d5db",
    fontSize: 14,
    fontFamily: "inherit",
    background: "#fff",
    color: "#111827",
    boxSizing: "border-box",
    outline: "none",
  };

  const labelStyle = { fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4, display: "block", letterSpacing: 0.3 };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6fa", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{
        background: THEME.headerBg,
        padding: "0 0 0 0",
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "22px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}><img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAQABAADASIAAhEBAxEB/8QAHQABAAEEAwEAAAAAAAAAAAAAAAIBBgcIBAUJA//EAGcQAAEDAgMCBwoGDAkLAwEFCQIAAwQBBQYHEhEiCBMhMkJSYhQxQVFhcoKSorIVI3GBkcIWJDNDU2N1obGzwdIJJSc0N0RzdKMmNTZkZYOTw9Hi8BdU4fIYOFVWhIWUtPEoRpWk0//EABwBAQACAwEBAQAAAAAAAAAAAAACBQEEBgMHCP/EAEIRAAEEAAMFBAcHAwMDBQEBAAABAgMEBRESBhMhMTIiQVFxFCMzQmGBsTRSkaHB0fAVJOE1YnIlQ0QWU4Ki8SaS/9oADAMBAAIRAxEAPwDTxVVFVepAIiIAikiAiikiAiikiAiikiAiilpRARRSUdKAIpIgIopIgIopIgIoikgIopKKAIpaUQEUUtKICKIiAIiIAikiAiiIgCKSigCKSICKKWlEBFFJEBFE0ppUQETSmlAERFIBEUtKAiiIgCIiAIikgIopIgIoiKICIikAiIgCIiAIiIAiIogIiKQCIpICKIpKIIoikgIoiaUAREQBFJFIEUUk0qIIopaUUgRRSRARRSRARRSRARREQBERAEUtKjpQBFJEBFFJFEEUUkQEUTSikAiKSiCKIikAiKSAiilpTSgIopaVFAERFEBUVUQFEVVRAVREQBEUkAREUgEREAREQBERAEUVJAEREAREQBERAEREARFFRMkkUU1ICSIikYCIiAiikooZCIiAkiipIYCIiAIiIAiiiGSSKKkgCIiGAiiiiCSIoqQJIooomQpKKICSihIpGAiIgCIiAak1IiAIiptFRMlUUNY9ZOMFZ1AmihxnZTjOymoE0UNYqWsessGCqKu0esqIAiIgCIikAiIgCIiiAiIgCkoogJIiKQCIiAIiIAiIgCIiAIiIAiIgIkikiGSKkiIYCIiAIiIAiIgCIiAipIiGQooiAkiiiGCSKKkgCIooCSiSakQyERFEBERSMBURFEFURFIBSREAREQEURFEyEREA1IiIAiIgJIoogJImpRUjAREUTIUlFBQEkRFIwRRSRRMhEUVIwSREQEUUlFDIREQBNSIgJIoogJIoogCIiAIiIApKKIAiIogkooiAIiIAiIgCKhEIqBH1RWdQPoi+O0usopqB99o9ZR1ivkijqB9eM7KhrJRVdKjqJEtta9JRX3ixZEt4Wo7Drzpd4GwqVaq+cP5OZkXwRch4TuDbRffJI0ZH29K85bMUKZyORCTY3O6UMf7PIqLPlo4MOMX6CV0vFpt49IaEbxD6o6faV0weC1aw2d34vlPV6VGIdA94iVPNtLhcPVKhtMw6w73TVuqVrtpSi22LgyYNq3pG+3wT8fxX7q1vvOGHGcxZOELW7WSQ3IoMYzps114zQNa7Fs0MZp4hqWB2ekxPSlgy1oWylabFdmZOA75gG6R7bfe5uOkNca3xDuumnVWn7F0cW13CVbZdyjw3XIcLR3S8I7rWqukdtfKrBkzHsRzF4KazmOauSnX1Si7W3YfvlyjFKttnuEyOJaCcYjG4NK+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FJRUkAREUgEREARRRDIREQBSUVJAFFSUUAREQBEUkBFERAEREAREQBERAEREAUlFEAREQBERAFJRRRAREQBERAFJRRAEREAREQBERSAREUQERFIBERRARFJARVCAaqqIYPgYVHvr7wJUqDKblQ5LsZ9otoOtnUSGvkrRFAgGqw5viZa4z1llwhrjAo1b8ZsHc41OQZjNBGQHy05p/mLzlsLhjE1ixPBpNw/dGJzfS4uvxjfnDzhXn3Ua08C59mvF0ss4JtonSIckOa6ydRKi5jEtma9rtxdh35FvVxWSLsv4oegzLcaMDpNMtMAREbtREQHV0iJYuzEzzwlhqjsS1OfDlxpyaGC+ICvaPpejqWtuMMyMY4rjhFvN8fdjiNKcS1sbA/KVB51flVm121LyrUobJxtdrsu1fA958YXlC3IvDMLMHEuNplXLxPKscS2tRGdxhr5B8Py121VoUGtV9Bb2d/6FMabF18ULIm6GJkhSSSOeubiAtjRTRF6HmEREARFIUBFFJRQBERDIRNKICSipKKkAiIgJKKkooAiIgCIiAIiIAiIgJIiIYCIiAIiICKkiIAoqSICKIiGQiIogkiipKRgIiIAoqSICKISKJkKSiiAko6kRAE0oiAlpUUUkBFERAUJEJEMFUVFVDIREQElFEQDUiIpAIiKICIiAIiKQJKKIgCIiiAiIpAkooiAIiIAiIgCIiAIiKICIikAiIgCIiiAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCkoogCIiAKiqiGCigTdNvJyL6Is6TJ8qN18K+giNOaqosGAiIpAIiKICIiAIiIAiIpGQiIogKSiiAkopqRAEREAREQBERAEREAREUgEREAREUQFJRRASREUjAREQBRREMhERAERFEBERASRRRSMElHUiIZCIiAIiKICIiAIiIAiIgCIikYKIiKICqKaUQBERAEREAREUgEREAREQBERAEREARFTUgKoiIAiKiiCqKiqgCImpAERFIBETUgCIiAIiIAiIgCIiiAiIpAIiIAiIogIiIAiIgCIiAIiIAiIhkIiIAiIgCIiGAiIpAIiIAiIgCIiAIiIAiIgCIiAIiIAiakQBERAERFEyEREMBERSAREQBERRARUVUAREQBERSAREQBERAERFEBERSAREQBERAERFEBERSARFRRBVERAEREAREQBFREBVEVEBVERAURFVAf//Z" alt="Spartan" style={{ width: 44, height: 44, borderRadius: 6 }} /></div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: -0.5 }}>Coacher</div>
              <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>Football Analytics</div>
            </div>
          </div>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 2 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "10px 22px",
                border: "none",
                background: tab === t ? "#fff" : "transparent",
                color: tab === t ? "#1a0a0a" : THEME.tabInactive,
                fontWeight: tab === t ? 800 : 500,
                fontSize: 14,
                borderRadius: "10px 10px 0 0",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px" }}>

        {/* ───── PLAY LOGGER TAB ───── */}
        {tab === "Play Logger" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Sub-tab switcher */}
            <div style={{ display: "flex", gap: 8 }}>
              {["Offense", "Defense"].map(st => (
                <button key={st} onClick={() => setAnalyticsSubTab(st)} style={{
                  padding: "8px 22px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                  background: analyticsSubTab === st ? THEME.buttonBg : "#e5e7eb",
                  color: analyticsSubTab === st ? "#fff" : "#374151",
                }}>{st}</button>
              ))}
            </div>

        {analyticsSubTab === "Offense" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
            {/* Form */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 28 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 22 }}>Log a Play</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Game</label>
                  <select style={inputStyle} value={form.game} onChange={e => f("game", e.target.value)}>
                    {games.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Quarter</label>
                  <select style={inputStyle} value={form.quarter} onChange={e => f("quarter", e.target.value)}>
                    {["1","2","3","4","OT"].map(q => <option key={q}>{q}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Down</label>
                  <select style={inputStyle} value={form.down} onChange={e => f("down", e.target.value)}>
                    {["1","2","3","4"].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Distance (yards)</label>
                  <input style={inputStyle} type="number" placeholder="e.g. 10" value={form.distance} onChange={e => f("distance", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Play Code</label>
                  <select style={inputStyle} value={form.playCode} onChange={e => f("playCode", e.target.value)}>
                    <option value="">— Select —</option>
                    {playCodes.map(pc => <option key={pc.id} value={pc.code}>{pc.code}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Play Type *</label>
                  <select style={inputStyle} value={form.playType} onChange={e => f("playType", e.target.value)}>
                    <option value="">— Select —</option>
                    {PLAY_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Outcome *</label>
                  <select style={inputStyle} value={form.outcome} onChange={e => f("outcome", e.target.value)}>
                    <option value="">— Select —</option>
                    {outcomes.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Thrower</label>
                  <select style={inputStyle} value={form.thrower} onChange={e => f("thrower", e.target.value)}>
                    <option value="">— None —</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Receiver</label>
                  <select style={inputStyle} value={form.receiver} onChange={e => f("receiver", e.target.value)}>
                    <option value="">— None —</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Ball Carrier</label>
                  <select style={inputStyle} value={form.carrier} onChange={e => f("carrier", e.target.value)}>
                    <option value="">— None —</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={labelStyle}>Yards Gained</label>
                  <input style={inputStyle} type="number" placeholder="0" value={form.yardsGained} onChange={e => f("yardsGained", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <input style={inputStyle} placeholder="Optional notes..." value={form.notes} onChange={e => f("notes", e.target.value)} />
                </div>
              </div>

              <button onClick={handleLogPlay} disabled={!form.outcome || !form.playType} style={{
                width: "100%",
                padding: "13px",
                background: (!form.outcome || !form.playType) ? "#e5e7eb" : `linear-gradient(135deg, ${THEME.primaryDark}, ${THEME.primary})`,
                color: (!form.outcome || !form.playType) ? "#9ca3af" : "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 800,
                cursor: (!form.outcome || !form.playType) ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                letterSpacing: 0.3,
              }}>+ Log This Play</button>
            </div>

            {/* Recent plays */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>Recent Plays</div>
              {plays.length === 0 && (
                <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e5e7eb", padding: 28, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                  No plays logged yet.<br />Fill in the form to get started.
                </div>
              )}
              {plays.slice(0, 10).map(p => {
                const carrier = players.find(pl => pl.id === Number(p.carrier));
                const receiver = players.find(pl => pl.id === Number(p.receiver));
                return (
                  <div key={p.id} style={{
                    background: "#fff", borderRadius: 12, border: "1.5px solid #e5e7eb",
                    padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>
                        {p.game} · Q{p.quarter} · {p.down}{["st","nd","rd","th"][Math.min(Number(p.down)-1,3)] || "th"} & {p.distance || "?"}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Badge color={outcomeColor(p.outcome)}>{p.outcome}</Badge>
                        <button onClick={() => setPlays(ps => ps.filter(x => x.id !== p.id))} title="Delete play" style={{ border: "none", background: "none", color: "#d1d5db", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1, marginLeft: 2 }}>×</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      <strong>{p.playType}</strong>
                      {p.playCode && <> · <span style={{ color: THEME.primary, fontWeight: 700 }}>{p.playCode}</span></>}
                      {carrier && <> · Carrier: {carrier.name}</>}
                      {receiver && <> · Rcvr: {receiver.name}</>}
                    </div>
                    <div style={{ fontSize: 12, color: p.yardsGained > 0 ? "#059669" : p.yardsGained < 0 ? "#dc2626" : "#6b7280", fontWeight: 700 }}>
                      {p.yardsGained > 0 ? "+" : ""}{p.yardsGained} yards
                    </div>
                    {p.notes && <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>{p.notes}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Defensive sub-tab ── */}
        {analyticsSubTab === "Defense" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
            {/* Form */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 28 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 22 }}>Log a Defensive Play</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Game</label>
                  <select style={inputStyle} value={defForm.game} onChange={e => df("game", e.target.value)}>
                    {games.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Quarter</label>
                  <select style={inputStyle} value={defForm.quarter} onChange={e => df("quarter", e.target.value)}>
                    {["1","2","3","4","OT"].map(q => <option key={q}>{q}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Down</label>
                  <select style={inputStyle} value={defForm.down} onChange={e => df("down", e.target.value)}>
                    {["1","2","3","4"].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Distance (yards)</label>
                  <input style={inputStyle} type="number" placeholder="e.g. 10" value={defForm.distance} onChange={e => df("distance", e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Play Type</label>
                  <select style={inputStyle} value={defForm.playType} onChange={e => df("playType", e.target.value)}>
                    <option value="">— Select —</option>
                    <option>Pass</option>
                    <option>Run</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Outcome *</label>
                  <select style={inputStyle} value={defForm.outcome} onChange={e => df("outcome", e.target.value)}>
                    <option value="">— Select —</option>
                    {defOutcomes.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Player Action</label>
                  <select style={inputStyle} value={defForm.playerAction} onChange={e => df("playerAction", e.target.value)}>
                    <option value="">— None —</option>
                    {playerActions.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Player Who Made the Play</label>
                  <select style={inputStyle} value={defForm.player} onChange={e => df("player", e.target.value)}>
                    <option value="">— None —</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Yards Allowed</label>
                  <input style={inputStyle} type="number" placeholder="0" value={defForm.yardsAllowed} onChange={e => df("yardsAllowed", e.target.value)} />
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Notes</label>
                <input style={inputStyle} placeholder="Optional notes..." value={defForm.notes} onChange={e => df("notes", e.target.value)} />
              </div>

              <button onClick={() => {
                if (!defForm.outcome) return;
                const play = { id: Date.now(), ...defForm, yardsAllowed: Number(defForm.yardsAllowed) || 0, timestamp: new Date().toISOString() };
                setDefPlays(p => [play, ...p]);
                setDefForm(prev => ({ ...prev, down: String(Math.min(4, Number(prev.down) + 1)), playType: "", player: "", outcome: "", playerAction: "", yardsAllowed: "", notes: "" }));
              }} style={{ width: "100%", padding: "13px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                + Log Defensive Play
              </button>
            </div>

            {/* Recent plays panel */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Recent Plays</div>
              {defPlays.length === 0 ? (
                <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", marginTop: 40 }}>No defensive plays logged yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {defPlays.slice(0, 10).map(p => {
                    const pl = players.find(x => x.id === Number(p.player));
                    return (
                      <div key={p.id} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 999 }}>{p.outcome}</span>
                            {p.playerAction && <span style={{ fontSize: 11, fontWeight: 700, background: "#e0f2fe", color: "#0369a1", padding: "2px 8px", borderRadius: 999 }}>{p.playerAction}</span>}
                            {p.playType && <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#f3f4f6", padding: "2px 8px", borderRadius: 999 }}>{p.playType}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "#374151" }}>
                            {p.game} · Q{p.quarter} · {p.down}&{p.distance}
                            {pl && <span style={{ fontWeight: 700 }}> · {pl.name}</span>}
                            {p.yardsAllowed > 0 && <span style={{ color: "#dc2626" }}> · {p.yardsAllowed} yds allowed</span>}
                          </div>
                          {p.notes && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{p.notes}</div>}
                        </div>
                        <button onClick={() => setDefPlays(prev => prev.filter(x => x.id !== p.id))}
                          style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, fontFamily: "inherit", padding: "0 2px" }}>×</button>
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
          // Merge offense and defense plays with a side tag
          const allPlays = [
            ...plays.map(p => ({ ...p, side: "offense" })),
            ...defPlays.map(p => ({ ...p, side: "defense" })),
          ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

          const filtered = allPlays.filter(p => {
            if (logFilterGame !== "All" && p.game !== logFilterGame) return false;
            if (logFilterSide !== "All" && p.side !== logFilterSide.toLowerCase()) return false;
            if (logFilterCode !== "All" && p.playCode !== logFilterCode) return false;
            if (logFilterPlayer !== "All") {
              const pid = String(logFilterPlayer);
              const inPlay = p.side === "offense"
                ? [String(p.carrier), String(p.thrower), String(p.receiver)].includes(pid)
                : String(p.player) === pid;
              if (!inPlay) return false;
            }
            return true;
          });

          const selStyle = { padding: "7px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 13, fontFamily: "inherit", color: "#111827", background: "#fff" };

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Filters */}
              <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e5e7eb", padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Filter:</span>
                <select style={selStyle} value={logFilterSide} onChange={e => setLogFilterSide(e.target.value)}>
                  <option value="All">All Plays</option>
                  <option value="offense">Offense</option>
                  <option value="defense">Defense</option>
                </select>
                <select style={selStyle} value={logFilterGame} onChange={e => setLogFilterGame(e.target.value)}>
                  <option value="All">All Games</option>
                  {games.map(g => <option key={g}>{g}</option>)}
                </select>
                <select style={selStyle} value={logFilterPlayer} onChange={e => setLogFilterPlayer(e.target.value)}>
                  <option value="All">All Players</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select style={selStyle} value={logFilterCode} onChange={e => setLogFilterCode(e.target.value)}>
                  <option value="All">All Play Codes</option>
                  {playCodes.map(pc => <option key={pc.id} value={pc.code}>{pc.code}</option>)}
                </select>
                <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>{filtered.length} play{filtered.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Play list */}
              {filtered.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 60, textAlign: "center", color: "#9ca3af", fontSize: 15 }}>
                  No plays match your filters.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filtered.map(p => {
                    const pl = p.side === "offense"
                      ? null
                      : players.find(x => x.id === Number(p.player));
                    const thrower  = players.find(x => x.id === Number(p.thrower));
                    const receiver = players.find(x => x.id === Number(p.receiver));
                    const carrier  = players.find(x => x.id === Number(p.carrier));
                    const isEditing = editingPlay?.play.id === p.id;

                    return (
                      <div key={p.id} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${p.side === "offense" ? "#e5e7eb" : "#fee2e2"}`, padding: "14px 18px" }}>
                        {isEditing ? (
                          /* ── Edit mode ── */
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <select style={selStyle} value={editingPlay.play.game} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, game: e.target.value } }))}>
                                {games.map(g => <option key={g}>{g}</option>)}
                              </select>
                              <select style={selStyle} value={editingPlay.play.quarter} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, quarter: e.target.value } }))}>
                                {["1","2","3","4","OT"].map(q => <option key={q}>{q}</option>)}
                              </select>
                              <select style={selStyle} value={editingPlay.play.down} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, down: e.target.value } }))}>
                                {["1","2","3","4"].map(d => <option key={d}>{d}</option>)}
                              </select>
                              <input style={{ ...selStyle, width: 80 }} type="number" placeholder="Dist" value={editingPlay.play.distance} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, distance: e.target.value } }))} />
                              <select style={selStyle} value={editingPlay.play.playType} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, playType: e.target.value } }))}>
                                <option value="">— Type —</option>
                                <option>Pass</option><option>Run</option>
                              </select>
                              {p.side === "offense" && (
                                <select style={selStyle} value={editingPlay.play.playCode} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, playCode: e.target.value } }))}>
                                  <option value="">— Code —</option>
                                  {playCodes.map(pc => <option key={pc.id} value={pc.code}>{pc.code}</option>)}
                                </select>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {p.side === "offense" ? (<>
                                <select style={selStyle} value={editingPlay.play.thrower} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, thrower: e.target.value } }))}>
                                  <option value="">— Thrower —</option>
                                  {players.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select>
                                <select style={selStyle} value={editingPlay.play.receiver} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, receiver: e.target.value } }))}>
                                  <option value="">— Receiver —</option>
                                  {players.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select>
                                <select style={selStyle} value={editingPlay.play.carrier} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, carrier: e.target.value } }))}>
                                  <option value="">— Carrier —</option>
                                  {players.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select>
                                <select style={selStyle} value={editingPlay.play.outcome} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, outcome: e.target.value } }))}>
                                  <option value="">— Outcome —</option>
                                  {outcomes.map(o => <option key={o}>{o}</option>)}
                                </select>
                                <input style={{ ...selStyle, width: 90 }} type="number" placeholder="Yards" value={editingPlay.play.yardsGained} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, yardsGained: e.target.value } }))} />
                              </>) : (<>
                                <select style={selStyle} value={editingPlay.play.player} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, player: e.target.value } }))}>
                                  <option value="">— Player —</option>
                                  {players.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select>
                                <select style={selStyle} value={editingPlay.play.outcome} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, outcome: e.target.value } }))}>
                                  <option value="">— Outcome —</option>
                                  {defOutcomes.map(o => <option key={o}>{o}</option>)}
                                </select>
                                <input style={{ ...selStyle, width: 110 }} type="number" placeholder="Yds Allowed" value={editingPlay.play.yardsAllowed} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, yardsAllowed: e.target.value } }))} />
                              </>)}
                              <input style={{ ...selStyle, flex: 1, minWidth: 160 }} placeholder="Notes" value={editingPlay.play.notes} onChange={e => setEditingPlay(ep => ({ ...ep, play: { ...ep.play, notes: e.target.value } }))} />
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => {
                                if (p.side === "offense") {
                                  setPlays(prev => prev.map(x => x.id === editingPlay.play.id ? { ...editingPlay.play, yardsGained: Number(editingPlay.play.yardsGained) || 0 } : x));
                                } else {
                                  setDefPlays(prev => prev.map(x => x.id === editingPlay.play.id ? { ...editingPlay.play, yardsAllowed: Number(editingPlay.play.yardsAllowed) || 0 } : x));
                                }
                                setEditingPlay(null);
                              }} style={{ padding: "7px 16px", background: "#059669", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Save</button>
                              <button onClick={() => setEditingPlay(null)} style={{ padding: "7px 16px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          /* ── View mode ── */
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: p.side === "offense" ? "#dbeafe" : "#fee2e2", color: p.side === "offense" ? "#1e40af" : "#991b1b" }}>{p.side === "offense" ? "OFF" : "DEF"}</span>
                                {p.outcome && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#f3f4f6", color: "#374151" }}>{p.outcome}</span>}
                                {p.playType && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#f3f4f6", color: "#6b7280" }}>{p.playType}</span>}
                                {p.playCode && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#e8eef7", color: "#1a2f5e" }}>{p.playCode}</span>}
                              </div>
                              <div style={{ fontSize: 12, color: "#374151" }}>
                                <span style={{ fontWeight: 700 }}>{p.game}</span> · Q{p.quarter} · {p.down}&{p.distance || "?"}
                                {p.side === "offense" ? (<>
                                  {thrower  && <span> · 🏈 {thrower.name}</span>}
                                  {receiver && <span> · 🙌 {receiver.name}</span>}
                                  {carrier  && <span> · 🏃 {carrier.name}</span>}
                                  {p.yardsGained !== undefined && <span style={{ fontWeight: 700, color: p.yardsGained > 0 ? "#059669" : p.yardsGained < 0 ? "#dc2626" : "#6b7280" }}> · {p.yardsGained > 0 ? `+${p.yardsGained}` : p.yardsGained} yds</span>}
                                </>) : (<>
                                  {pl && <span> · {pl.name}</span>}
                                  {p.yardsAllowed > 0 && <span style={{ color: "#dc2626", fontWeight: 700 }}> · {p.yardsAllowed} yds allowed</span>}
                                </>)}
                              </div>
                              {p.notes && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{p.notes}</div>}
                            </div>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <button onClick={() => setEditingPlay({ play: { ...p }, side: p.side })} style={{ border: "none", background: "#f3f4f6", color: "#374151", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>✏️ Edit</button>
                              <button onClick={() => { if (window.confirm("Delete this play?")) { if (p.side === "offense") setPlays(prev => prev.filter(x => x.id !== p.id)); else setDefPlays(prev => prev.filter(x => x.id !== p.id)); }}} style={{ border: "none", background: "#fee2e2", color: "#991b1b", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>× Delete</button>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Sub-tab switcher + game filter */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {["Offense", "Defense"].map(st => (
                  <button key={st} onClick={() => setAnalyticsSubTab(st)} style={{
                    padding: "8px 22px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                    background: analyticsSubTab === st ? THEME.buttonBg : "#e5e7eb",
                    color: analyticsSubTab === st ? "#fff" : "#374151",
                  }}>{st}</button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Filter by Game:</span>
                <select style={{ ...inputStyle, width: "auto", minWidth: 160 }} value={filterGame} onChange={e => setFilterGame(e.target.value)}>
                  <option value="All">All Games</option>
                  {games.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>

            {/* ── OFFENSE ── */}
            {analyticsSubTab === "Offense" && (!analytics ? (
              <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 60, textAlign: "center", color: "#9ca3af", fontSize: 15 }}>
                No plays logged yet. Head to <strong>Play Logger</strong> to get started.
              </div>
            ) : (
              <>
                {/* Overview cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                  <StatCard label="Total Plays" value={analytics.total} accent={THEME.primary} />
                  <StatCard label="Success Rate" value={`${Math.round(analytics.successful / analytics.total * 100)}%`} sub={`${analytics.successful} successful plays`} accent="#059669" />
                  <StatCard label="Touchdowns" value={analytics.tds} accent="#d97706" />
                  <StatCard label="Total Yards" value={analytics.totalYards} sub={`${(analytics.totalYards / analytics.total).toFixed(1)} yds/play`} accent={THEME.accent} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                  {(() => {
                    const totalAtt = Object.values(analytics.byPlayer).filter(p => p.isThrower).reduce((a, p) => a + (p.attempts || 0), 0);
                    const totalRec = Object.values(analytics.byPlayer).filter(p => p.isThrower).reduce((a, p) => a + (p.receptions || 0), 0);
                    const totalInts = Object.values(analytics.byPlayer).filter(p => p.isThrower).reduce((a, p) => a + (p.ints || 0), 0);
                    const compPct = totalAtt > 0 ? `${Math.round(totalRec / totalAtt * 100)}%` : "—";
                    const tdRatio = totalAtt > 0 ? `${(analytics.tds / totalAtt * 100).toFixed(1)}%` : "—";
                    const intRatio = totalAtt > 0 ? `${(totalInts / totalAtt * 100).toFixed(1)}%` : "—";
                    return (<>
                      <StatCard label="Completion %" value={compPct} sub={totalAtt > 0 ? `${totalRec} of ${totalAtt} attempts` : "No pass attempts"} accent="#6366f1" />
                      <StatCard label="TD Ratio" value={tdRatio} sub={totalAtt > 0 ? `${analytics.tds} TDs on ${totalAtt} attempts` : "No pass attempts"} accent="#059669" />
                      <StatCard label="INT Ratio" value={intRatio} sub={totalAtt > 0 ? `${totalInts} INTs on ${totalAtt} attempts` : "No pass attempts"} accent="#dc2626" />
                    </>);
                  })()}
                </div>

                {/* By play type */}
                <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 18 }}>Play Type Breakdown</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {Object.entries(analytics.byType).sort((a, b) => b[1].count - a[1].count).map(([type, data]) => {
                      const pct = Math.round(data.success / data.count * 100);
                      return (
                        <div key={type}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, color: "#374151" }}>{type}</span>
                            <span style={{ color: "#9ca3af" }}>{data.count} plays · {pct}% success · {(data.yards / data.count).toFixed(1)} yds/play</span>
                          </div>
                          <div style={{ height: 10, background: "#f3f4f6", borderRadius: 99 }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: THEME.primary, borderRadius: 99 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Stats by Play Code */}
                {Object.keys(analytics.byCode).length > 0 && (
                <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24, overflowX: "auto" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 4 }}>Stats by Play Code</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>Att = Pass Attempts · Rec = Receptions · Cmp% = Completion % · TD% / INT% = per attempt · T/A = Throw Aways</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: THEME.buttonBg }}>
                        {["Play Code","Att","Rec","Cmp%","TD%","INT%","Rec+","Rec-","Inc","Runs","Run+","Run-","TDs","INTs","Drops","T/A","Sacks","Yards"].map((h, i) => (
                          <th key={h} style={{ padding: "9px 10px", textAlign: i < 1 ? "left" : "center", fontWeight: 700, color: "#fff", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(analytics.byCode).sort((a, b) => a.code.localeCompare(b.code)).map((s, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ padding: "9px 10px", fontWeight: 800, color: THEME.primary, whiteSpace: "nowrap" }}>{s.code}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#374151" }}>{s.attempts || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#374151" }}>{s.receptions || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#6366f1", fontWeight: 700 }}>{s.attempts > 0 ? `${Math.round(s.receptions / s.attempts * 100)}%` : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#059669", fontWeight: 700 }}>{s.attempts > 0 ? `${(s.tds / s.attempts * 100).toFixed(1)}%` : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#dc2626", fontWeight: 700 }}>{s.attempts > 0 ? `${(s.ints / s.attempts * 100).toFixed(1)}%` : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#059669", fontWeight: 600 }}>{s.recGain || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#dc2626", fontWeight: 600 }}>{s.recLoss || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#6b7280" }}>{s.incompletions || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#374151" }}>{s.runs || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#059669", fontWeight: 600 }}>{s.runGain || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#dc2626", fontWeight: 600 }}>{s.runLoss || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center" }}>{s.tds > 0 ? <Badge color="green">{s.tds}</Badge> : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center" }}>{s.ints > 0 ? <Badge color="red">{s.ints}</Badge> : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#6b7280" }}>{s.drops || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#6b7280" }}>{s.throwAways || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center" }}>{s.sacks > 0 ? <Badge color="yellow">{s.sacks}</Badge> : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", fontWeight: 700, color: THEME.primary }}>{s.yards > 0 ? `+${s.yards}` : s.yards}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f0f4f8" }}>
                        <td style={{ padding: "10px 10px", fontWeight: 900, color: "#111827", fontSize: 11, letterSpacing: 0.5, colSpan: 2 }}>TOTALS</td>
                        {(() => {
                          const ct = analytics.codeTotals;
                          const cmpPct = ct.attempts > 0 ? `${Math.round(ct.receptions / ct.attempts * 100)}%` : "—";
                          const tdPct  = ct.attempts > 0 ? `${(ct.tds / ct.attempts * 100).toFixed(1)}%` : "—";
                          const intPct = ct.attempts > 0 ? `${(ct.ints / ct.attempts * 100).toFixed(1)}%` : "—";
                          return [ct.attempts, ct.receptions, cmpPct, tdPct, intPct, ct.recGain, ct.recLoss, ct.incompletions, ct.runs, ct.runGain, ct.runLoss, ct.tds, ct.ints, ct.drops, ct.throwAways, ct.sacks, ct.yards].map((v, i) => (
                            <td key={i} style={{ padding: "10px 10px", textAlign: "center", fontWeight: 800, color: "#111827" }}>{v || "—"}</td>
                          ));
                        })()}
                      </tr>
                    </tbody>
                  </table>
                </div>
                )}

                {/* Stats by Player — Throwers */}
                {Object.values(analytics.byPlayer).some(p => p.isThrower) && (
                <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24, overflowX: "auto" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 4 }}>Stats by Player — Throwers</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>Att = Pass Attempts · Inc = Incompletions · T/A = Throw Aways · Cmp% = Completion % · TD% / INT% = per attempt</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 700 }}>
                    <thead>
                      <tr style={{ background: THEME.buttonBg }}>
                        {["Player","Pos","Att","Rec","Cmp%","TD%","INT%","Rec+","Rec-","Inc","TDs","INTs","Drops","T/A","Sacks","Yards"].map((h, i) => (
                          <th key={h} style={{ padding: "9px 10px", textAlign: i < 2 ? "left" : "center", fontWeight: 700, color: "#fff", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(analytics.byPlayer)
                        .filter(p => p.isThrower)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((p, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ padding: "9px 10px", fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>{p.name}</td>
                          <td style={{ padding: "9px 10px" }}><Badge color="purple">{p.position}</Badge></td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#374151" }}>{p.attempts || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#374151" }}>{p.receptions || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#6366f1", fontWeight: 700 }}>{p.attempts > 0 ? `${Math.round(p.receptions / p.attempts * 100)}%` : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#059669", fontWeight: 700 }}>{p.attempts > 0 ? `${(p.tds / p.attempts * 100).toFixed(1)}%` : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#dc2626", fontWeight: 700 }}>{p.attempts > 0 ? `${(p.ints / p.attempts * 100).toFixed(1)}%` : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#059669", fontWeight: 600 }}>{p.recGain || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#dc2626", fontWeight: 600 }}>{p.recLoss || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#6b7280" }}>{p.incompletions || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center" }}>{p.tds > 0 ? <Badge color="green">{p.tds}</Badge> : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center" }}>{p.ints > 0 ? <Badge color="red">{p.ints}</Badge> : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#6b7280" }}>{p.drops || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#6b7280" }}>{p.throwAways || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center" }}>{p.sacks > 0 ? <Badge color="yellow">{p.sacks}</Badge> : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", fontWeight: 700, color: THEME.primary }}>{p.yards > 0 ? `+${p.yards}` : p.yards || "—"}</td>
                        </tr>
                      ))}
                      {(() => {
                        const rows = Object.values(analytics.byPlayer).filter(p => p.isThrower);
                        const t = { attempts: 0, receptions: 0, recGain: 0, recLoss: 0, incompletions: 0, tds: 0, ints: 0, drops: 0, throwAways: 0, sacks: 0, yards: 0 };
                        rows.forEach(p => { Object.keys(t).forEach(k => { t[k] += p[k] || 0; }); });
                        const cmpPct = t.attempts > 0 ? `${Math.round(t.receptions / t.attempts * 100)}%` : "—";
                        const tdPct  = t.attempts > 0 ? `${(t.tds / t.attempts * 100).toFixed(1)}%` : "—";
                        const intPct = t.attempts > 0 ? `${(t.ints / t.attempts * 100).toFixed(1)}%` : "—";
                        return (
                          <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f0f4f8" }}>
                            <td style={{ padding: "10px 10px", fontWeight: 900, color: "#111827", fontSize: 11, letterSpacing: 0.5 }}>TOTALS</td>
                            <td></td>
                            {[t.attempts, t.receptions, cmpPct, tdPct, intPct, t.recGain, t.recLoss, t.incompletions, t.tds, t.ints, t.drops, t.throwAways, t.sacks, t.yards].map((v, i) => (
                              <td key={i} style={{ padding: "10px 10px", textAlign: "center", fontWeight: 800, color: "#111827" }}>{v || "—"}</td>
                            ))}
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
                )}

                {/* Stats by Player — Receivers & Runners */}
                {Object.values(analytics.byPlayer).some(p => (p.isReceiver || p.isRunner) && !p.isThrower) && (
                <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24, overflowX: "auto" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 4 }}>Stats by Player — Receivers & Runners</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>Att = Times targeted · Rec = Receptions · Cmp% = catch rate · TD% = TDs per target · Rec+ / Rec- = Gain/Loss · Inc = Incompletions</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 800 }}>
                    <thead>
                      <tr style={{ background: THEME.buttonBg }}>
                        {["Player","Pos","Att","Rec","Cmp%","TD%","Rec+","Rec-","Inc","Drops","Runs","Run+","Run-","TDs","Yards"].map((h, i) => (
                          <th key={h} style={{ padding: "9px 10px", textAlign: i < 2 ? "left" : "center", fontWeight: 700, color: "#fff", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(analytics.byPlayer)
                        .filter(p => (p.isReceiver || p.isRunner) && !p.isThrower)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((p, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ padding: "9px 10px", fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>{p.name}</td>
                          <td style={{ padding: "9px 10px" }}><Badge color="purple">{p.position}</Badge></td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#374151" }}>{p.attempts || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#374151" }}>{p.receptions || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#6366f1", fontWeight: 700 }}>{p.attempts > 0 ? `${Math.round(p.receptions / p.attempts * 100)}%` : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#059669", fontWeight: 700 }}>{p.attempts > 0 ? `${(p.tds / p.attempts * 100).toFixed(1)}%` : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#059669", fontWeight: 600 }}>{p.recGain || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#dc2626", fontWeight: 600 }}>{p.recLoss || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#6b7280" }}>{p.incompletions || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#6b7280" }}>{p.drops || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#374151" }}>{p.runs || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#059669", fontWeight: 600 }}>{p.runGain || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "#dc2626", fontWeight: 600 }}>{p.runLoss || "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center" }}>{p.tds > 0 ? <Badge color="green">{p.tds}</Badge> : "—"}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", fontWeight: 700, color: THEME.primary }}>{p.yards > 0 ? `+${p.yards}` : p.yards || "—"}</td>
                        </tr>
                      ))}
                      {(() => {
                        const rows = Object.values(analytics.byPlayer).filter(p => (p.isReceiver || p.isRunner) && !p.isThrower);
                        const t = { attempts: 0, receptions: 0, recGain: 0, recLoss: 0, incompletions: 0, drops: 0, runs: 0, runGain: 0, runLoss: 0, tds: 0, yards: 0 };
                        rows.forEach(p => { Object.keys(t).forEach(k => { t[k] += p[k] || 0; }); });
                        const cmpPct = t.attempts > 0 ? `${Math.round(t.receptions / t.attempts * 100)}%` : "—";
                        const tdPct  = t.attempts > 0 ? `${(t.tds / t.attempts * 100).toFixed(1)}%` : "—";
                        return (
                          <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f0f4f8" }}>
                            <td style={{ padding: "10px 10px", fontWeight: 900, color: "#111827", fontSize: 11, letterSpacing: 0.5 }}>TOTALS</td>
                            <td></td>
                            {[t.attempts, t.receptions, cmpPct, tdPct, t.recGain, t.recLoss, t.incompletions, t.drops, t.runs, t.runGain, t.runLoss, t.tds, t.yards].map((v, i) => (
                              <td key={i} style={{ padding: "10px 10px", textAlign: "center", fontWeight: 800, color: "#111827" }}>{v || "—"}</td>
                            ))}
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
                )}
              </>
            ))}

            {/* ── DEFENSE ── */}
            {analyticsSubTab === "Defense" && (() => {
              const fp = filterGame === "All" ? defPlays : defPlays.filter(p => p.game === filterGame);
              if (!fp.length) return (
                <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 60, textAlign: "center", color: "#9ca3af", fontSize: 15 }}>
                  No defensive plays logged yet. Head to <strong>Play Logger</strong> to get started.
                </div>
              );

              const totalPlays = fp.length;
              const totalYardsAllowed = fp.reduce((a, b) => a + (Number(b.yardsAllowed) || 0), 0);

              // Outcome counts (play-level)
              const countOutcome = (o) => fp.filter(p => (p.outcome || "").trim() === o).length;
              const countOutcomePartial = (str) => fp.filter(p => (p.outcome || "").includes(str)).length;
              const tdAllowed    = countOutcome("Touchdown Allowed");
              const xpAllowed    = countOutcome("XP Allowed");
              const passIncomplete = countOutcome("Pass Incomplete");
              const passGain     = countOutcome("Pass Allowed - Gain");
              const passLoss     = countOutcome("Pass Allowed - Loss");
              const runGain      = countOutcome("Run - Gain");
              const runLoss      = countOutcome("Run - Loss");
              const sackTime     = countOutcome("Sack - Time");
              const sackBlitz    = countOutcome("Sack - Blitz");
              const intOutcome   = countOutcome("INT");
              const totalSacks   = sackTime + sackBlitz;

              // Player action counts (individual player level)
              const countAction = (a) => fp.filter(p => (p.playerAction || "").trim() === a).length;
              const pbuCount    = countAction("PBU");
              const flagCount   = countAction("Flag Pull");
              const intAction   = countAction("INT");
              const sackAction  = countAction("Sack");

              // Play type breakdown
              const passPlays = fp.filter(p => p.playType === "Pass");
              const runPlays  = fp.filter(p => p.playType === "Run");
              const passYards = passPlays.reduce((a, b) => a + (Number(b.yardsAllowed) || 0), 0);
              const runYards  = runPlays.reduce((a, b) => a + (Number(b.yardsAllowed) || 0), 0);

              // Stats by player — split into outcome stats and player action stats
              const byDPlayer = {};
              fp.forEach(p => {
                const o = (p.outcome || "").trim();
                const a = (p.playerAction || "").trim();
                const pid = p.player;
                if (!pid) return;
                const pl = players.find(x => x.id === Number(pid));
                if (!pl) return;
                if (!byDPlayer[pid]) byDPlayer[pid] = {
                  name: pl.name, position: pl.position,
                  plays: 0, yardsAllowed: 0,
                  // Outcome stats
                  tdAllowed: 0, passIncomplete: 0, passGain: 0, passLoss: 0,
                  runGain: 0, runLoss: 0, sackTime: 0, sackBlitz: 0, intOutcome: 0,
                  // Player action stats
                  pbu: 0, flagPull: 0, intAction: 0, sackAction: 0,
                };
                const s = byDPlayer[pid];
                s.plays++;
                s.yardsAllowed += Number(p.yardsAllowed) || 0;
                // Outcomes
                if (o === "Touchdown Allowed")    s.tdAllowed++;
                if (o === "Pass Incomplete")       s.passIncomplete++;
                if (o === "Pass Allowed - Gain")   s.passGain++;
                if (o === "Pass Allowed - Loss")   s.passLoss++;
                if (o === "Run - Gain")            s.runGain++;
                if (o === "Run - Loss")            s.runLoss++;
                if (o === "Sack - Time")           s.sackTime++;
                if (o === "Sack - Blitz")          s.sackBlitz++;
                if (o === "INT")                   s.intOutcome++;
                // Player actions
                if (a === "PBU")       s.pbu++;
                if (a === "Flag Pull") s.flagPull++;
                if (a === "INT")       s.intAction++;
                if (a === "Sack")      s.sackAction++;
              });

              // Stats by game
              const byGame = {};
              games.forEach(g => {
                const gp = fp.filter(p => p.game === g);
                if (!gp.length) return;
                const co = (o) => gp.filter(p => (p.outcome||"").trim() === o).length;
                const ca = (a) => gp.filter(p => (p.playerAction||"").trim() === a).length;
                byGame[g] = {
                  plays: gp.length,
                  yardsAllowed: gp.reduce((a, b) => a + (Number(b.yardsAllowed) || 0), 0),
                  tdAllowed: co("Touchdown Allowed"),
                  passIncomplete: co("Pass Incomplete"),
                  passGain: co("Pass Allowed - Gain"),
                  passLoss: co("Pass Allowed - Loss"),
                  runGain: co("Run - Gain"),
                  runLoss: co("Run - Loss"),
                  sacks: co("Sack - Time") + co("Sack - Blitz"),
                  intOutcome: co("INT"),
                  pbu: ca("PBU"),
                  flagPull: ca("Flag Pull"),
                  intAction: ca("INT"),
                  sackAction: ca("Sack"),
                };
              });

              const thStyle = { padding: "9px 10px", fontWeight: 700, color: "#fff", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap" };

              return (
                <>
                  {/* Overview — Play Outcomes */}
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Play Outcomes</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    <StatCard label="Total Plays" value={totalPlays} accent="#dc2626" />
                    <StatCard label="Yards Allowed" value={totalYardsAllowed} sub={`${(totalYardsAllowed / totalPlays).toFixed(1)} yds/play`} accent="#f59e0b" />
                    <StatCard label="TDs Allowed" value={tdAllowed} accent="#dc2626" />
                    <StatCard label="Sacks (Time / Blitz)" value={`${sackTime} / ${sackBlitz}`} sub={`${totalSacks} total`} accent="#059669" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
                    <StatCard label="Pass Incomplete" value={passIncomplete} accent="#6366f1" />
                    <StatCard label="Pass Allow - Gain" value={passGain} accent="#f59e0b" />
                    <StatCard label="Pass Allow - Loss" value={passLoss} accent="#059669" />
                    <StatCard label="Run - Gain" value={runGain} accent="#f59e0b" />
                    <StatCard label="Run - Loss" value={runLoss} accent="#059669" />
                  </div>

                  {/* Overview — Player Actions */}
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Player Actions</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    <StatCard label="PBUs" value={pbuCount} accent="#6366f1" />
                    <StatCard label="Flag Pulls" value={flagCount} accent="#4a6fa5" />
                    <StatCard label="INTs" value={intAction} accent="#059669" />
                    <StatCard label="Sacks" value={sackAction} accent="#059669" />
                  </div>

                  {/* Pass vs Run Allowed */}
                  <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 18 }}>Pass vs Run Allowed</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {[["Pass", passPlays.length, passYards], ["Run", runPlays.length, runYards]].map(([type, count, yards]) => {
                        const pct = totalPlays > 0 ? Math.round(count / totalPlays * 100) : 0;
                        return (
                          <div key={type}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, color: "#374151" }}>{type}</span>
                              <span style={{ color: "#9ca3af" }}>{count} plays · {count > 0 ? (yards / count).toFixed(1) : 0} yds/play · {pct}% of plays</span>
                            </div>
                            <div style={{ height: 10, background: "#f3f4f6", borderRadius: 99 }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: "#dc2626", borderRadius: 99 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Stats by Player */}
                  {Object.keys(byDPlayer).length > 0 && (
                  <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24, overflowX: "auto" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 4 }}>Stats by Player</div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>Based on Player Action logged per play</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#dc2626" }}>
                          {["Player","Pos","PBUs","Flags Pulled","INTs","Sacks"].map((h, i) => (
                            <th key={h} style={{ ...thStyle, textAlign: i < 2 ? "left" : "center" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(byDPlayer).sort((a, b) => a.name.localeCompare(b.name)).map((p, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ padding: "9px 10px", fontWeight: 700, color: "#111827" }}>{p.name}</td>
                            <td style={{ padding: "9px 10px" }}><Badge color="purple">{p.position}</Badge></td>
                            <td style={{ padding: "9px 10px", textAlign: "center", color: "#6366f1", fontWeight: 700 }}>{p.pbu || "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center", color: "#4a6fa5", fontWeight: 700 }}>{p.flagPull || "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center" }}>{p.intAction > 0 ? <Badge color="green">{p.intAction}</Badge> : "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center" }}>{p.sackAction > 0 ? <Badge color="green">{p.sackAction}</Badge> : "—"}</td>
                          </tr>
                        ))}
                        {(() => {
                          const rows = Object.values(byDPlayer);
                          const t = { pbu:0, flagPull:0, intAction:0, sackAction:0 };
                          rows.forEach(p => Object.keys(t).forEach(k => { t[k] += p[k] || 0; }));
                          return (
                            <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f0f4f8" }}>
                              <td style={{ padding: "10px 10px", fontWeight: 900, color: "#111827", fontSize: 11 }}>TOTALS</td>
                              <td></td>
                              {[t.pbu, t.flagPull, t.intAction, t.sackAction].map((v, i) => (
                                <td key={i} style={{ padding: "10px 10px", textAlign: "center", fontWeight: 800, color: "#111827" }}>{v || "—"}</td>
                              ))}
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                  )}

                  {/* Stats by Game */}
                  {Object.keys(byGame).length > 0 && (
                  <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24, overflowX: "auto" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Stats by Game</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#dc2626" }}>
                          {["Game","Plays","Yds Allow","TD Allow","Pass Inc","Pass+","Pass-","Run+","Run-","Sacks","INT","PBU","Flag","INT (Act)","Sack (Act)"].map((h, i) => (
                            <th key={h} style={{ ...thStyle, textAlign: i === 0 ? "left" : "center" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(byGame).map(([g, d], i) => (
                          <tr key={g} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ padding: "9px 10px", fontWeight: 700, color: "#111827" }}>{g}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center" }}>{d.plays}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center", color: "#dc2626", fontWeight: 700 }}>{d.yardsAllowed || "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center" }}>{d.tdAllowed > 0 ? <Badge color="red">{d.tdAllowed}</Badge> : "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center", color: "#6366f1", fontWeight: 600 }}>{d.passIncomplete || "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center", color: "#dc2626", fontWeight: 600 }}>{d.passGain || "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center", color: "#059669", fontWeight: 600 }}>{d.passLoss || "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center", color: "#dc2626", fontWeight: 600 }}>{d.runGain || "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center", color: "#059669", fontWeight: 600 }}>{d.runLoss || "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center" }}>{d.sacks > 0 ? <Badge color="green">{d.sacks}</Badge> : "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center" }}>{d.intOutcome > 0 ? <Badge color="green">{d.intOutcome}</Badge> : "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center", color: "#6366f1", fontWeight: 600 }}>{d.pbu || "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center", color: "#4a6fa5", fontWeight: 600 }}>{d.flagPull || "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center" }}>{d.intAction > 0 ? <Badge color="green">{d.intAction}</Badge> : "—"}</td>
                            <td style={{ padding: "9px 10px", textAlign: "center" }}>{d.sackAction > 0 ? <Badge color="green">{d.sackAction}</Badge> : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
                </>
              );
            })()}
          </div>
        )}


        {/* ───── GAME SUMMARY TAB ───── */}
        {tab === "Game Summary" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {games.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 60, textAlign: "center", color: "#9ca3af", fontSize: 15 }}>
                No games yet. Add games in the <strong>Manage</strong> tab.
              </div>
            ) : games.map(game => {
              const gPlays = plays.filter(p => p.game === game);
              const score = gameScores[game] || { us: "", them: "", result: "" };
              const totalYards = gPlays.reduce((a, b) => a + b.yardsGained, 0);
              const tds = gPlays.filter(p => p.outcome === tdOutcome).length;
              const isPassPlay = p => p.playType === "Pass";
              const passPlays = gPlays.filter(isPassPlay);
              const runPlays = gPlays.filter(p => !isPassPlay(p));

              // Play type breakdown
              const typeBreakdown = {};
              gPlays.forEach(p => {
                if (!typeBreakdown[p.playType]) typeBreakdown[p.playType] = { count: 0, yards: 0, success: 0 };
                typeBreakdown[p.playType].count++;
                typeBreakdown[p.playType].yards += p.yardsGained;
                if (successOutcomes.has(p.outcome)) typeBreakdown[p.playType].success++;
              });

              // Result breakdown
              const resultBreakdown = {};
              gPlays.forEach(p => {
                resultBreakdown[p.outcome] = (resultBreakdown[p.outcome] || 0) + 1;
              });

              // Top performers
              const perfMap = {};
              gPlays.forEach(p => {
                [p.carrier, p.receiver, p.thrower].filter(Boolean).forEach(pid => {
                  const pl = players.find(x => x.id === Number(pid));
                  if (!pl) return;
                  if (!perfMap[pid]) perfMap[pid] = { name: pl.name, position: pl.position, yards: 0, tds: 0, plays: 0 };
                  perfMap[pid].yards += p.yardsGained;
                  perfMap[pid].plays++;
                  if (p.outcome === tdOutcome) perfMap[pid].tds++;
                });
              });
              const topPerfs = Object.values(perfMap).sort((a, b) => b.yards - a.yards).slice(0, 3);

              const resultColor = score.result === "W" ? "#059669" : score.result === "L" ? "#dc2626" : "#6b7280";

              return (
                <div key={game} style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", overflow: "hidden" }}>
                  {/* Game header */}
                  <div style={{ background: THEME.buttonBg, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>{game}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {/* Score inputs */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input placeholder="Us" type="number" value={score.us} onChange={e => setGameScores(gs => ({ ...gs, [game]: { ...score, us: e.target.value } }))}
                          style={{ width: 52, padding: "5px 8px", borderRadius: 6, border: "none", fontSize: 14, fontWeight: 700, textAlign: "center", fontFamily: "inherit" }} />
                        <span style={{ color: "#fff", fontWeight: 700 }}>—</span>
                        <input placeholder="Them" type="number" value={score.them} onChange={e => setGameScores(gs => ({ ...gs, [game]: { ...score, them: e.target.value } }))}
                          style={{ width: 52, padding: "5px 8px", borderRadius: 6, border: "none", fontSize: 14, fontWeight: 700, textAlign: "center", fontFamily: "inherit" }} />
                      </div>
                      {/* W/L/T selector */}
                      {["W","L","T"].map(r => (
                        <button key={r} onClick={() => setGameScores(gs => ({ ...gs, [game]: { ...score, result: r } }))}
                          style={{ padding: "5px 12px", borderRadius: 6, border: "none", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                            background: score.result === r ? (r === "W" ? "#059669" : r === "L" ? "#dc2626" : "#6b7280") : "rgba(255,255,255,0.15)",
                            color: "#fff" }}>{r}</button>
                      ))}
                      {gPlays.length > 0 && <span style={{ color: "#a8b8c8", fontSize: 12 }}>{gPlays.length} plays</span>}
                      {gPlays.length > 0 && (
                        <>
                        <button onClick={() => {
                          const gdPlaysShare = defPlays.filter(p => p.game === game); const payload = { game, score, plays: gPlays, defPlays: gdPlaysShare, players, tdOutcome };
                          const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
                          const url = `${window.location.origin}${window.location.pathname}?share=${encoded}`;
                          navigator.clipboard.writeText(url).then(() => alert("Share link copied to clipboard!")).catch(() => prompt("Copy this link:", url));
                        }} style={{ padding: "5px 12px", borderRadius: 6, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", background: "rgba(255,255,255,0.15)", color: "#fff" }}>
                          🔗 Share
                        </button>
                        <button onClick={() => {
                          const gdPlaysShare = defPlays.filter(p => p.game === game); const payload = { game, score, plays: gPlays, defPlays: gdPlaysShare, players, tdOutcome };
                          const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
                          const url = `${window.location.origin}${window.location.pathname}?share=${encoded}`;
                          window.open(url, "_blank");
                        }} style={{ padding: "5px 12px", borderRadius: 6, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", background: "rgba(255,255,255,0.15)", color: "#fff" }}>
                          ⬇ PDF
                        </button>
                        </>
                      )}
                    </div>
                  </div>

                  {gPlays.length === 0 ? (
                    <div style={{ padding: 28, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No plays logged for this game yet.</div>
                  ) : (
                    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                      {/* Overview stats */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                        <StatCard label="Total Plays" value={gPlays.length} accent={THEME.primary} />
                        <StatCard label="Total Yards" value={totalYards} sub={`${(totalYards / gPlays.length).toFixed(1)} yds/play`} accent={THEME.accent} />
                        <StatCard label="Touchdowns" value={tds} accent="#d97706" />
                        <StatCard label="Pass / Run" value={`${passPlays.length} / ${runPlays.length}`} sub={`${Math.round(passPlays.length / gPlays.length * 100)}% pass`} accent="#6b7280" />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                        {/* Play type breakdown */}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#374151", marginBottom: 10 }}>Play Type Breakdown</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                            {Object.entries(typeBreakdown).sort((a, b) => b[1].count - a[1].count).map(([type, d]) => {
                              const pct = Math.round(d.count / gPlays.length * 100);
                              return (
                                <div key={type}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                                    <span style={{ fontWeight: 600, color: "#374151" }}>{type}</span>
                                    <span style={{ color: "#9ca3af" }}>{d.count} plays · {(d.yards / d.count).toFixed(1)} yds</span>
                                  </div>
                                  <div style={{ height: 7, background: "#f3f4f6", borderRadius: 99 }}>
                                    <div style={{ height: "100%", width: `${pct}%`, background: THEME.primary, borderRadius: 99 }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Result breakdown */}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#374151", marginBottom: 10 }}>Play Result Breakdown</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {Object.entries(resultBreakdown).sort((a, b) => b[1] - a[1]).map(([outcome, count]) => {
                              const pct = Math.round(count / gPlays.length * 100);
                              const col = successOutcomes.has(outcome) ? "#059669" : ["Interception","Fumble","Loss","Sack"].includes(outcome) ? "#dc2626" : "#6b7280";
                              return (
                                <div key={outcome} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", width: 90, flexShrink: 0 }}>{outcome}</span>
                                  <div style={{ flex: 1, height: 7, background: "#f3f4f6", borderRadius: 99 }}>
                                    <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 99 }} />
                                  </div>
                                  <span style={{ fontSize: 12, color: "#9ca3af", width: 28, textAlign: "right" }}>{count}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Top performers */}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#374151", marginBottom: 10 }}>Top Performers</div>
                          {topPerfs.length === 0 ? <div style={{ fontSize: 12, color: "#9ca3af" }}>No player data logged.</div> : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {topPerfs.map((p, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: THEME.buttonBg, color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{p.name}</div>
                                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{p.position} · {p.plays} plays</div>
                                  </div>
                                  <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: THEME.primary }}>{p.yards > 0 ? `+${p.yards}` : p.yards} yds</div>
                                    {p.tds > 0 && <div style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>{p.tds} TD</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Defensive stats for this game ── */}
                  {(() => {
                    const gdPlays = defPlays.filter(p => p.game === game);
                    if (!gdPlays.length) return (
                      <div style={{ padding: "0 24px 20px", color: "#9ca3af", fontSize: 13 }}>No defensive plays logged for this game.</div>
                    );

                    const co = (o) => gdPlays.filter(p => (p.outcome||"").trim() === o).length;
                    const ca = (a) => gdPlays.filter(p => (p.playerAction||"").trim() === a).length;
                    const totalYdsAllowed = gdPlays.reduce((a, b) => a + (Number(b.yardsAllowed)||0), 0);
                    const tdAllowed   = co("Touchdown Allowed");
                    const sackTime    = co("Sack - Time");
                    const sackBlitz   = co("Sack - Blitz");
                    const intOutcome  = co("INT");
                    const passInc     = co("Pass Incomplete");
                    const passGain    = co("Pass Allowed - Gain");
                    const passLoss    = co("Pass Allowed - Loss");
                    const runGain     = co("Run - Gain");
                    const runLoss     = co("Run - Loss");
                    const passPlaysD  = gdPlays.filter(p => p.playType === "Pass");
                    const runPlaysD   = gdPlays.filter(p => p.playType === "Run");
                    const passYdsD    = passPlaysD.reduce((a, b) => a + (Number(b.yardsAllowed)||0), 0);
                    const runYdsD     = runPlaysD.reduce((a, b) => a + (Number(b.yardsAllowed)||0), 0);

                    // Outcome breakdown counts
                    const outcomeCounts = {};
                    gdPlays.forEach(p => {
                      const o = (p.outcome||"").trim();
                      if (o) outcomeCounts[o] = (outcomeCounts[o]||0) + 1;
                    });

                    // Player action stats
                    const playerActionMap = {};
                    gdPlays.forEach(p => {
                      const a = (p.playerAction||"").trim();
                      if (!a || !p.player) return;
                      const pl = players.find(x => x.id === Number(p.player));
                      if (!pl) return;
                      if (!playerActionMap[p.player]) playerActionMap[p.player] = { name: pl.name, pbu:0, flagPull:0, intAction:0, sackAction:0 };
                      const s = playerActionMap[p.player];
                      if (a === "PBU")       s.pbu++;
                      if (a === "Flag Pull") s.flagPull++;
                      if (a === "INT")       s.intAction++;
                      if (a === "Sack")      s.sackAction++;
                    });
                    const playerActionRows = Object.values(playerActionMap).filter(p => p.pbu||p.flagPull||p.intAction||p.sackAction).sort((a,b) => a.name.localeCompare(b.name));

                    return (
                      <div style={{ borderTop: "2px solid #f3f4f6", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "#dc2626", textTransform: "uppercase", letterSpacing: 0.5 }}>Defense</div>

                        {/* Overview */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                          <StatCard label="Plays Defended" value={gdPlays.length} accent="#dc2626" />
                          <StatCard label="Yards Allowed" value={totalYdsAllowed} sub={`${(totalYdsAllowed/gdPlays.length).toFixed(1)} yds/play`} accent="#f59e0b" />
                          <StatCard label="TDs Allowed" value={tdAllowed} accent="#dc2626" />
                          <StatCard label="Sacks / INTs" value={`${sackTime+sackBlitz} / ${intOutcome}`} sub={`Time: ${sackTime} · Blitz: ${sackBlitz}`} accent="#059669" />
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                          {/* Pass vs Run */}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "#374151", marginBottom: 10 }}>Pass vs Run Allowed</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                              {[["Pass", passPlaysD.length, passYdsD], ["Run", runPlaysD.length, runYdsD]].map(([type, count, yards]) => {
                                const pct = gdPlays.length > 0 ? Math.round(count / gdPlays.length * 100) : 0;
                                return (
                                  <div key={type}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                                      <span style={{ fontWeight: 600, color: "#374151" }}>{type}</span>
                                      <span style={{ color: "#9ca3af" }}>{count} · {count > 0 ? (yards/count).toFixed(1) : 0} yds</span>
                                    </div>
                                    <div style={{ height: 7, background: "#f3f4f6", borderRadius: 99 }}>
                                      <div style={{ height: "100%", width: `${pct}%`, background: "#dc2626", borderRadius: 99 }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Outcome breakdown */}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "#374151", marginBottom: 10 }}>Play Outcome Breakdown</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {Object.entries(outcomeCounts).sort((a,b) => b[1]-a[1]).map(([outcome, count]) => {
                                const pct = Math.round(count / gdPlays.length * 100);
                                const col = ["Touchdown Allowed","Pass Allowed - Gain","Run - Gain","XP Allowed"].includes(outcome) ? "#dc2626" : ["Pass Incomplete","Pass Allowed - Loss","Run - Loss"].includes(outcome) ? "#059669" : ["Sack - Time","Sack - Blitz","INT"].includes(outcome) ? "#059669" : "#6b7280";
                                return (
                                  <div key={outcome} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "#374151", width: 120, flexShrink: 0 }}>{outcome}</span>
                                    <div style={{ flex: 1, height: 6, background: "#f3f4f6", borderRadius: 99 }}>
                                      <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 99 }} />
                                    </div>
                                    <span style={{ fontSize: 11, color: "#9ca3af", width: 20, textAlign: "right" }}>{count}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Player action stats */}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "#374151", marginBottom: 10 }}>Player Actions</div>
                            {playerActionRows.length === 0 ? (
                              <div style={{ fontSize: 12, color: "#9ca3af" }}>No player actions logged.</div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {playerActionRows.map((p, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#f8fafc", borderRadius: 8 }}>
                                    <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#111827" }}>{p.name}</div>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      {p.pbu > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: "#e0e7ff", color: "#4338ca", padding: "1px 6px", borderRadius: 999 }}>{p.pbu} PBU</span>}
                                      {p.flagPull > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: "#dbeafe", color: "#1d4ed8", padding: "1px 6px", borderRadius: 999 }}>{p.flagPull} Flag</span>}
                                      {p.intAction > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: "#d1fae5", color: "#065f46", padding: "1px 6px", borderRadius: 999 }}>{p.intAction} INT</span>}
                                      {p.sackAction > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: "#d1fae5", color: "#065f46", padding: "1px 6px", borderRadius: 999 }}>{p.sackAction} Sack</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}

        {/* ───── REPORT CARDS TAB ───── */}
        {tab === "Report Cards" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>Click any player to view their full report card.</div>
            {/* Player grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
              {players.sort((a, b) => a.name.localeCompare(b.name)).map(pl => {
                const plPlays = plays.filter(p => [p.carrier, p.receiver, p.thrower].includes(String(pl.id)));
                const tds = plPlays.filter(p => p.outcome === tdOutcome).length;
                const yards = plPlays.reduce((a, b) => a + b.yardsGained, 0);
                return (
                  <button key={pl.id} onClick={() => setSelectedPlayer(pl)} style={{
                    background: "#fff", border: `1.5px solid ${THEME.primary}`, borderRadius: 14, padding: "18px 16px",
                    cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s",
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 4 }}>{pl.name}</div>
                    <Badge color="purple">{pl.position}</Badge>
                    <div style={{ marginTop: 10, display: "flex", gap: 12 }}>
                      <div><div style={{ fontSize: 18, fontWeight: 900, color: THEME.primary }}>{plPlays.length}</div><div style={{ fontSize: 10, color: "#9ca3af" }}>PLAYS</div></div>
                      <div><div style={{ fontSize: 18, fontWeight: 900, color: "#059669" }}>{tds}</div><div style={{ fontSize: 10, color: "#9ca3af" }}>TDs</div></div>
                      <div><div style={{ fontSize: 18, fontWeight: 900, color: THEME.accent }}>{yards}</div><div style={{ fontSize: 10, color: "#9ca3af" }}>YDS</div></div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Modal */}
            {selectedPlayer && (() => {
              const pl = selectedPlayer;
              const isPassPlay = p => p.playType === "Pass";
              const plPlays = plays.filter(p => [p.carrier, p.receiver, p.thrower].includes(String(pl.id)));

              // Full stat line
              const stats = { attempts: 0, receptions: 0, recGain: 0, recLoss: 0, incompletions: 0, runs: 0, runGain: 0, runLoss: 0, tds: 0, ints: 0, drops: 0, throwAways: 0, sacks: 0, yards: 0 };
              plPlays.forEach(p => {
                const o = (p.outcome || "").trim();
                if (p.thrower === String(pl.id) && isPassPlay(p)) {
                  if (o !== "Throw Away" && o !== "Sack") stats.attempts++;
                  if (o === "Interception" || o === "INT") stats.ints++;
                  if (o === "Throw Away") stats.throwAways++;
                  if (o === "Sack") stats.sacks++;
                  if (o === "Drop") stats.drops++;
                  if (o === "Incomplete") stats.incompletions++;
                  if (o === tdOutcome) stats.tds++;
                  if (!["Incomplete","Drop","Interception","INT","Throw Away","Sack"].includes(o) && o !== "") {
                    stats.receptions++;
                    stats.yards += p.yardsGained;
                    if (p.yardsGained > 0 || o === tdOutcome) stats.recGain++;
                    if (p.yardsGained < 0) stats.recLoss++;
                  }
                }
                if (p.receiver === String(pl.id) && p.thrower !== String(pl.id) && isPassPlay(p)) {
                  stats.attempts++;
                  if (o === "Incomplete") stats.incompletions++;
                  if (o === "Drop") stats.drops++;
                  if (o === tdOutcome) stats.tds++;
                  if (!["Incomplete","Drop","Interception","INT","Throw Away","Sack"].includes(o) && o !== "") {
                    stats.receptions++;
                    stats.yards += p.yardsGained;
                    if (p.yardsGained > 0 || o === tdOutcome) stats.recGain++;
                    if (p.yardsGained < 0) stats.recLoss++;
                  }
                }
                if (p.carrier === String(pl.id) && !isPassPlay(p)) {
                  stats.isRunner = true;
                  stats.runs++; stats.yards += p.yardsGained;
                  if (p.yardsGained > 0 || o === tdOutcome) stats.runGain++;
                  if (p.yardsGained < 0) stats.runLoss++;
                  if (o === tdOutcome) stats.tds++;
                }
                // Carrier on a pass play TD (e.g. screen/sweep)
                if (p.carrier === String(pl.id) && isPassPlay(p) && o === tdOutcome) {
                  stats.tds++;
                }
              });

              // Game-by-game breakdown
              const byGame = {};
              games.forEach(g => {
                const gp = plays.filter(p => p.game === g && [p.carrier, p.receiver, p.thrower].includes(String(pl.id)));
                if (gp.length > 0) byGame[g] = { plays: gp.length, yards: gp.reduce((a, b) => a + b.yardsGained, 0), tds: gp.filter(p => p.outcome === tdOutcome).length };
              });

              // Strengths & areas to improve
              const strengths = [], areas = [];
              if (stats.tds >= 2) strengths.push("Scoring threat — multiple TDs");
              if (stats.receptions > 0 && stats.recGain / stats.receptions >= 0.7) strengths.push("Reliable receiver — high catch-for-gain rate");
              if (stats.runs > 0 && stats.runGain / stats.runs >= 0.6) strengths.push("Consistent ball carrier — gaining on most runs");
              if (stats.attempts > 0 && stats.ints === 0) strengths.push("Ball security — no interceptions");
              if (stats.drops > 1) areas.push(`Catching — ${stats.drops} drops logged`);
              if (stats.ints > 0) areas.push(`Decision making — ${stats.ints} INT${stats.ints > 1 ? "s" : ""} thrown`);
              if (stats.runs > 0 && stats.runLoss / stats.runs >= 0.3) areas.push("Run efficiency — high rate of negative runs");
              if (stats.sacks > 1) areas.push(`Pocket presence — ${stats.sacks} sacks taken`);
              if (strengths.length === 0) strengths.push("Keep logging plays to unlock insights");
              if (areas.length === 0) areas.push("No major concerns — keep it up!");

              const note = coachNotes[pl.id] || "";

              return (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
                  onClick={e => { if (e.target === e.currentTarget) setSelectedPlayer(null); }}>
                  <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
                    {/* Modal header */}
                    <div style={{ background: THEME.buttonBg, padding: "20px 28px", borderRadius: "20px 20px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>{pl.name}</div>
                        <div style={{ fontSize: 12, color: "#a8b8c8", marginTop: 2 }}>{pl.position} · {plPlays.length} total plays</div>
                      </div>
                      <button onClick={() => setSelectedPlayer(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}>×</button>
                    </div>

                    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 24 }}>
                      {/* Full stat line */}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 12 }}>Full Stat Line</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                          {[["Attempts", stats.attempts], ["Receptions", stats.receptions], ["Rec+", stats.recGain], ["Rec-", stats.recLoss], ["Inc", stats.incompletions], ["Runs", stats.runs], ["Run+", stats.runGain], ["Run-", stats.runLoss], ["TDs", stats.tds], ["INTs", stats.ints], ["Drops", stats.drops], ["T/A", stats.throwAways], ["Sacks", stats.sacks], ["Yards", stats.yards]].map(([label, val]) => (
                            <div key={label} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                              <div style={{ fontSize: 20, fontWeight: 900, color: label === "TDs" ? "#059669" : label === "INTs" || label === "Drops" ? "#dc2626" : THEME.primary }}>{val}</div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Strengths & areas */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div style={{ background: "#f0fdf4", borderRadius: 12, padding: 16, border: "1px solid #bbf7d0" }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#065f46", marginBottom: 10 }}>💪 Strengths</div>
                          {strengths.map((s, i) => <div key={i} style={{ fontSize: 12, color: "#374151", marginBottom: 6, paddingLeft: 8, borderLeft: "3px solid #059669" }}>{s}</div>)}
                        </div>
                        <div style={{ background: "#fff7ed", borderRadius: 12, padding: 16, border: "1px solid #fed7aa" }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#92400e", marginBottom: 10 }}>📈 Areas to Improve</div>
                          {areas.map((a, i) => <div key={i} style={{ fontSize: 12, color: "#374151", marginBottom: 6, paddingLeft: 8, borderLeft: "3px solid #f59e0b" }}>{a}</div>)}
                        </div>
                      </div>

                      {/* Game by game */}
                      {Object.keys(byGame).length > 0 && (
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 12 }}>Game-by-Game Breakdown</div>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: "#f8fafc" }}>
                                {["Game", "Plays", "Yards", "TDs"].map(h => (
                                  <th key={h} style={{ padding: "8px 12px", textAlign: h === "Game" ? "left" : "center", fontWeight: 700, color: "#9ca3af", fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(byGame).map(([g, d], i) => (
                                <tr key={g} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                                  <td style={{ padding: "9px 12px", fontWeight: 600, color: "#374151" }}>{g}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "center", color: "#6b7280" }}>{d.plays}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "center", fontWeight: 700, color: THEME.primary }}>{d.yards > 0 ? `+${d.yards}` : d.yards}</td>
                                  <td style={{ padding: "9px 12px", textAlign: "center" }}>{d.tds > 0 ? <Badge color="green">{d.tds}</Badge> : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Coach notes */}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 8 }}>Coach Notes</div>
                        <textarea value={note} onChange={e => setCoachNotes(n => ({ ...n, [pl.id]: e.target.value }))}
                          placeholder={`Private notes about ${pl.name}...`}
                          style={{ width: "100%", minHeight: 90, padding: "10px 12px", borderRadius: 10, border: "1.5px solid #d1d5db", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none", color: "#374151" }} />
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
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>

            {/* Games */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Games</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="e.g. Week 3 vs Eagles" value={newGame} onChange={e => setNewGame(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && newGame.trim()) { setGames(g => [...g, newGame.trim()]); setNewGame(""); }}} />
                <button onClick={() => { if (newGame.trim()) { setGames(g => [...g, newGame.trim()]); setNewGame(""); } }} style={{
                  padding: "9px 16px", background: THEME.buttonBg, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                }}>Add</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {games.map((g, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                    {editingGame?.index === i ? (
                      <>
                        <input autoFocus style={{ ...inputStyle, flex: 1, padding: "5px 8px", fontSize: 13 }}
                          value={editingGame.value}
                          onChange={e => setEditingGame(eg => ({ ...eg, value: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const newName = editingGame.value.trim();
                              if (newName) {
                                setGames(gs => gs.map((x, j) => j === i ? newName : x));
                                setPlays(ps => ps.map(p => p.game === g ? { ...p, game: newName } : p));
                              }
                              setEditingGame(null);
                            }
                            if (e.key === "Escape") setEditingGame(null);
                          }} />
                        <button onClick={() => {
                          const newName = editingGame.value.trim();
                          if (newName) {
                            setGames(gs => gs.map((x, j) => j === i ? newName : x));
                            setPlays(ps => ps.map(p => p.game === g ? { ...p, game: newName } : p));
                          }
                          setEditingGame(null);
                        }} style={{ border: "none", background: "#d1fae5", color: "#065f46", borderRadius: 6, padding: "4px 10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Save</button>
                        <button onClick={() => setEditingGame(null)} style={{ border: "none", background: "none", color: "#9ca3af", cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1 }}>🏟 {g}</span>
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>{plays.filter(p => p.game === g).length} plays</span>
                        <button onClick={() => setEditingGame({ index: i, value: g })} style={{ border: "none", background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13, padding: "0 4px" }} title="Rename">✏️</button>
                        <button onClick={() => {
                          if (window.confirm(`Delete "${g}"? Plays logged under this game will remain but won't be linked to a game.`)) {
                            setGames(gs => gs.filter((_, j) => j !== i));
                          }
                        }} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 15, padding: 0 }}>×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Players */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Players</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                <input style={inputStyle} placeholder="Name" value={newPlayer.name} onChange={e => setNewPlayer(p => ({ ...p, name: e.target.value }))} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <select style={inputStyle} value={newPlayer.position} onChange={e => setNewPlayer(p => ({ ...p, position: e.target.value }))}>
                    <option value="">— Position —</option>
                    {positions.map(pos => <option key={pos}>{pos}</option>)}
                  </select>
                </div>
                <button onClick={() => {
                  if (newPlayer.name.trim()) {
                    setPlayers(p => [...p, { ...newPlayer, id: Date.now() }]);
                    setNewPlayer({ name: "", position: "" });
                  }
                }} style={{ padding: "9px", background: THEME.buttonBg, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                  Add Player
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {players.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#374151", flex: 1 }}>{p.name}</span>
                    <Badge color="purple">{p.position}</Badge>
                    <button onClick={() => setPlayers(pl => pl.filter(x => x.id !== p.id))} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Play Codes */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Play Codes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                <input style={inputStyle} placeholder="Code (e.g. Z32)" value={newCode.code} onChange={e => setNewCode(c => ({ ...c, code: e.target.value }))} />
                <button onClick={() => {
                  if (newCode.code.trim()) {
                    setPlayCodes(c => [...c, { ...newCode, id: Date.now() }]);
                    setNewCode({ code: "" });
                  }
                }} style={{ padding: "9px", background: THEME.buttonBg, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                  Add Code
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {playCodes.map(pc => (
                  <div key={pc.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: THEME.primary }}>{pc.code}</div>
                    </div>
                    <button onClick={() => setPlayCodes(c => c.filter(x => x.id !== pc.id))} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Positions */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Positions</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="e.g. WR4, LS, K" value={newPosition}
                  onChange={e => setNewPosition(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && newPosition.trim()) { setPositions(p => [...p, newPosition.trim()]); setNewPosition(""); }}} />
                <button onClick={() => { if (newPosition.trim()) { setPositions(p => [...p, newPosition.trim()]); setNewPosition(""); } }}
                  style={{ padding: "9px 14px", background: THEME.buttonBg, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Add</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {positions.map((pos, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#f8fafc", borderRadius: 8 }}>
                    {editingPosition?.index === i ? (
                      <>
                        <input autoFocus style={{ ...inputStyle, flex: 1, padding: "4px 8px", fontSize: 13 }}
                          value={editingPosition.value}
                          onChange={e => setEditingPosition(ep => ({ ...ep, value: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const val = editingPosition.value.trim();
                              if (val) {
                                setPositions(ps => ps.map((x, j) => j === i ? val : x));
                                setPlayers(pl => pl.map(p => p.position === pos ? { ...p, position: val } : p));
                              }
                              setEditingPosition(null);
                            }
                            if (e.key === "Escape") setEditingPosition(null);
                          }} />
                        <button onClick={() => {
                          const val = editingPosition.value.trim();
                          if (val) {
                            setPositions(ps => ps.map((x, j) => j === i ? val : x));
                            setPlayers(pl => pl.map(p => p.position === pos ? { ...p, position: val } : p));
                          }
                          setEditingPosition(null);
                        }} style={{ border: "none", background: "#d1fae5", color: "#065f46", borderRadius: 6, padding: "3px 8px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Save</button>
                        <button onClick={() => setEditingPosition(null)} style={{ border: "none", background: "none", color: "#9ca3af", cursor: "pointer", fontSize: 15, padding: 0 }}>×</button>
                      </>
                    ) : (
                      <>
                        <Badge color="purple">{pos}</Badge>
                        <span style={{ fontSize: 11, color: "#9ca3af", flex: 1 }}>{players.filter(p => p.position === pos).length} players</span>
                        <button onClick={() => setEditingPosition({ index: i, value: pos })} style={{ border: "none", background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13, padding: "0 2px" }} title="Rename">✏️</button>
                        <button onClick={() => {
                          if (window.confirm(`Delete position "${pos}"?`)) setPositions(ps => ps.filter((_, j) => j !== i));
                        }} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 15, padding: 0 }}>×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Offensive Outcomes */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Offensive Outcomes</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="e.g. Sack, Safety" value={newOutcome}
                  onChange={e => setNewOutcome(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && newOutcome.trim()) { setOutcomes(o => [...o, newOutcome.trim()]); setNewOutcome(""); }}} />
                <button onClick={() => { if (newOutcome.trim()) { setOutcomes(o => [...o, newOutcome.trim()]); setNewOutcome(""); } }}
                  style={{ padding: "9px 14px", background: THEME.buttonBg, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Add</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {outcomes.map((o, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#f8fafc", borderRadius: 8 }}>
                    {editingOutcome?.index === i ? (
                      <>
                        <input autoFocus style={{ ...inputStyle, flex: 1, padding: "4px 8px", fontSize: 13 }}
                          value={editingOutcome.value}
                          onChange={e => setEditingOutcome(eo => ({ ...eo, value: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === "Enter") { const val = editingOutcome.value.trim(); if (val) setOutcomes(os => os.map((x, j) => j === i ? val : x)); setEditingOutcome(null); }
                            if (e.key === "Escape") setEditingOutcome(null);
                          }} />
                        <button onClick={() => { const val = editingOutcome.value.trim(); if (val) setOutcomes(os => os.map((x, j) => j === i ? val : x)); setEditingOutcome(null); }} style={{ border: "none", background: "#d1fae5", color: "#065f46", borderRadius: 6, padding: "3px 8px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Save</button>
                        <button onClick={() => setEditingOutcome(null)} style={{ border: "none", background: "none", color: "#9ca3af", cursor: "pointer", fontSize: 15, padding: 0 }}>×</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1 }}>{o}</span>
                        <button onClick={() => setEditingOutcome({ index: i, value: o })} style={{ border: "none", background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13, padding: "0 2px" }} title="Rename">✏️</button>
                        <button onClick={() => { if (window.confirm(`Delete outcome "${o}"?`)) setOutcomes(os => os.filter((_, j) => j !== i)); }} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 15, padding: 0 }}>×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Defensive Outcomes */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Defensive Outcomes</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="e.g. Fumble Recovery, Safety" value={newDefOutcome}
                  onChange={e => setNewDefOutcome(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && newDefOutcome.trim()) { setDefOutcomes(o => [...o, newDefOutcome.trim()]); setNewDefOutcome(""); }}} />
                <button onClick={() => { if (newDefOutcome.trim()) { setDefOutcomes(o => [...o, newDefOutcome.trim()]); setNewDefOutcome(""); } }}
                  style={{ padding: "9px 14px", background: THEME.buttonBg, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Add</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {defOutcomes.map((o, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#f8fafc", borderRadius: 8 }}>
                    {editingDefOutcome?.index === i ? (
                      <>
                        <input autoFocus style={{ ...inputStyle, flex: 1, padding: "4px 8px", fontSize: 13 }}
                          value={editingDefOutcome.value}
                          onChange={e => setEditingDefOutcome(eo => ({ ...eo, value: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === "Enter") { const val = editingDefOutcome.value.trim(); if (val) setDefOutcomes(os => os.map((x, j) => j === i ? val : x)); setEditingDefOutcome(null); }
                            if (e.key === "Escape") setEditingDefOutcome(null);
                          }} />
                        <button onClick={() => { const val = editingDefOutcome.value.trim(); if (val) setDefOutcomes(os => os.map((x, j) => j === i ? val : x)); setEditingDefOutcome(null); }} style={{ border: "none", background: "#d1fae5", color: "#065f46", borderRadius: 6, padding: "3px 8px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Save</button>
                        <button onClick={() => setEditingDefOutcome(null)} style={{ border: "none", background: "none", color: "#9ca3af", cursor: "pointer", fontSize: 15, padding: 0 }}>×</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1 }}>{o}</span>
                        <button onClick={() => setEditingDefOutcome({ index: i, value: o })} style={{ border: "none", background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13, padding: "0 2px" }} title="Rename">✏️</button>
                        <button onClick={() => { if (window.confirm(`Delete outcome "${o}"?`)) setDefOutcomes(os => os.filter((_, j) => j !== i)); }} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 15, padding: 0 }}>×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Player Actions */}
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Player Actions</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="e.g. Tackle, Strip" value={newPlayerAction}
                  onChange={e => setNewPlayerAction(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && newPlayerAction.trim()) { setPlayerActions(a => [...a, newPlayerAction.trim()]); setNewPlayerAction(""); }}} />
                <button onClick={() => { if (newPlayerAction.trim()) { setPlayerActions(a => [...a, newPlayerAction.trim()]); setNewPlayerAction(""); } }}
                  style={{ padding: "9px 14px", background: THEME.buttonBg, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Add</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {playerActions.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#f8fafc", borderRadius: 8 }}>
                    {editingPlayerAction?.index === i ? (
                      <>
                        <input autoFocus style={{ ...inputStyle, flex: 1, padding: "4px 8px", fontSize: 13 }}
                          value={editingPlayerAction.value}
                          onChange={e => setEditingPlayerAction(ea => ({ ...ea, value: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === "Enter") { const val = editingPlayerAction.value.trim(); if (val) setPlayerActions(as => as.map((x, j) => j === i ? val : x)); setEditingPlayerAction(null); }
                            if (e.key === "Escape") setEditingPlayerAction(null);
                          }} />
                        <button onClick={() => { const val = editingPlayerAction.value.trim(); if (val) setPlayerActions(as => as.map((x, j) => j === i ? val : x)); setEditingPlayerAction(null); }} style={{ border: "none", background: "#d1fae5", color: "#065f46", borderRadius: 6, padding: "3px 8px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Save</button>
                        <button onClick={() => setEditingPlayerAction(null)} style={{ border: "none", background: "none", color: "#9ca3af", cursor: "pointer", fontSize: 15, padding: 0 }}>×</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1 }}>{a}</span>
                        <button onClick={() => setEditingPlayerAction({ index: i, value: a })} style={{ border: "none", background: "none", color: "#6b7280", cursor: "pointer", fontSize: 13, padding: "0 2px" }} title="Rename">✏️</button>
                        <button onClick={() => { if (window.confirm(`Delete action "${a}"?`)) setPlayerActions(as => as.filter((_, j) => j !== i)); }} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 15, padding: 0 }}>×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>Data Management</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Your data is saved automatically in your browser. Export a backup anytime.</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>TD Outcome:</label>
                <select value={tdOutcome} onChange={e => setTdOutcome(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 13, fontFamily: "inherit", color: "#111827" }}>
                  {outcomes.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <button onClick={() => {
                const data = { plays, games, players, playCodes, defPlays, defOutcomes, playerActions, exported: new Date().toISOString() };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = "coachlog-backup.json"; a.click();
                URL.revokeObjectURL(url);
              }} style={{ padding: "9px 18px", background: THEME.buttonBg, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                ⬇ Export Backup
              </button>
              <label style={{ padding: "9px 18px", background: "#e0f2fe", color: "#0369a1", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                ⬆ Import Backup
                <input type="file" accept=".json" style={{ display: "none" }} onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = evt => {
                    try {
                      const data = JSON.parse(evt.target.result);
                      if (!data.plays) { alert("Invalid backup file."); return; }
                      setPendingImport(data);
                    } catch {
                      alert("Failed to read backup file. Make sure it's a valid Coacher backup.");
                    }
                  };
                  reader.readAsText(file);
                  e.target.value = "";
                }} />
              </label>

              {/* Import choice modal */}
              {pendingImport && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                  <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 440, padding: 32, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#111827", marginBottom: 8 }}>Import Backup</div>
                    <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>
                      Found <strong>{pendingImport.plays.length} plays</strong> in this backup. How would you like to import?
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <button onClick={() => {
                        if (pendingImport.plays)        setPlays(pendingImport.plays);
                        if (pendingImport.games)        setGames(pendingImport.games);
                        if (pendingImport.players)      setPlayers(pendingImport.players);
                        if (pendingImport.playCodes)    setPlayCodes(pendingImport.playCodes);
                        if (pendingImport.defPlays)     setDefPlays(pendingImport.defPlays);
                        if (pendingImport.defOutcomes)  setDefOutcomes(pendingImport.defOutcomes);
                        if (pendingImport.playerActions) setPlayerActions(pendingImport.playerActions);
                        setPendingImport(null);
                        alert("Import successful! All data replaced.");
                      }} style={{ padding: "12px 18px", background: THEME.buttonBg, color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 14, textAlign: "left" }}>
                        🔄 Replace Everything
                        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>Replaces all plays, games, players, and play codes</div>
                      </button>
                      <button onClick={() => {
                        const existingIds = new Set(plays.map(p => p.id));
                        const newPlays = pendingImport.plays.filter(p => !existingIds.has(p.id));
                        const existingDefIds = new Set(defPlays.map(p => p.id));
                        const newDefPlays = (pendingImport.defPlays || []).filter(p => !existingDefIds.has(p.id));
                        if (newPlays.length === 0 && newDefPlays.length === 0) {
                          alert("No new plays found — all plays in the backup already exist.");
                        } else {
                          if (newPlays.length > 0) setPlays(prev => [...prev, ...newPlays]);
                          if (newDefPlays.length > 0) setDefPlays(prev => [...prev, ...newDefPlays]);
                          alert(`Added ${newPlays.length} offensive and ${newDefPlays.length} defensive play${newPlays.length + newDefPlays.length !== 1 ? "s" : ""} from backup.`);
                        }
                        setPendingImport(null);
                      }} style={{ padding: "12px 18px", background: "#e0f2fe", color: "#0369a1", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 14, textAlign: "left" }}>
                        ➕ Add New Plays Only
                        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>Merges new plays, keeps your current setup</div>
                      </button>
                      <button onClick={() => setPendingImport(null)}
                        style={{ padding: "10px 18px", background: "#f3f4f6", color: "#6b7280", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                        Cancel Import
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <button onClick={() => {
                if (window.confirm("Are you sure you want to delete ALL plays? This cannot be undone.")) {
                  setPlays([]);
                }
              }} style={{ padding: "9px 18px", background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                🗑 Clear All Plays
              </button>
            </div>
          </div>

          </div>
        )}
      </div>
    </div>
  );
}
