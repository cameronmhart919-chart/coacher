// ── admin.jsx ─────────────────────────────────────────────────────────────────
//
// Super Admin Portal for Coacher
// Access: only the account whose UID matches SUPER_ADMIN_UID below.
//
// What it does:
//   - Create new team instances (e.g. "Westview Football")
//   - View all instances and their data counts
//   - Create the first admin user for each instance
//   - Delete instances
//
// Deploy this as a separate page/route in your app, e.g. /admin
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  getDoc,
  writeBatch,
} from "firebase/firestore";

// ── Firebase init (reuse existing app if already initialized) ─────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Secondary app for creating users without signing out the super admin
const secondaryApp  = initializeApp(firebaseConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);

// ── IMPORTANT: Replace this with YOUR Firebase UID ───────────────────────────
// Find it in Firebase Console → Authentication → your account row → UID column
// Or log in and run: firebase.auth().currentUser.uid in the browser console
const SUPER_ADMIN_UID = "CuOYiU4XqVZys1sR8TFUXr3fZkL2"; // ← replace this
// ─────────────────────────────────────────────────────────────────────────────

// ── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  dark:    "#0a0f1e",
  primary: "#1a2f5e",
  accent:  "#4a6fa5",
  light:   "#e8eef7",
  danger:  "#dc2626",
  success: "#059669",
};

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1.5px solid #d1d5db", fontSize: 14, fontFamily: "inherit",
  background: "#fff", color: "#111827", boxSizing: "border-box", outline: "none",
};
const labelStyle = {
  fontSize: 12, fontWeight: 700, color: "#374151",
  marginBottom: 4, display: "block", letterSpacing: 0.3,
};
const btnStyle = (bg, color = "#fff") => ({
  padding: "9px 18px", background: bg, color, border: "none",
  borderRadius: 8, fontWeight: 700, fontSize: 13,
  cursor: "pointer", fontFamily: "inherit",
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const generateInstanceId = () =>
  Math.random().toString(36).slice(2, 10) +
  Math.random().toString(36).slice(2, 10);

// ── Login screen ──────────────────────────────────────────────────────────────
function AdminLogin() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError("Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.dark, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#111827" }}>Coacher Admin</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Super admin access only</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              style={inputStyle} placeholder="admin@example.com" />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              style={inputStyle} placeholder="••••••••" />
          </div>
          {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: "9px 12px", borderRadius: 8, fontSize: 13 }}>{error}</div>}
          <button onClick={handleLogin} disabled={loading || !email || !password}
            style={{ ...btnStyle(loading || !email || !password ? "#e5e7eb" : T.primary, loading || !email || !password ? "#9ca3af" : "#fff"), padding: "12px", fontSize: 15, cursor: loading || !email || !password ? "not-allowed" : "pointer" }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Access denied screen ──────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div style={{ minHeight: "100vh", background: T.dark, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", color: "#fff" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Access Denied</div>
        <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 8, marginBottom: 24 }}>This portal is restricted to the super admin account.</div>
        <button onClick={() => signOut(auth)} style={btnStyle(T.danger)}>Sign Out</button>
      </div>
    </div>
  );
}

// ── Main admin portal ─────────────────────────────────────────────────────────
function AdminPortal({ currentUser }) {
  const [instances,    setInstances]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState("instances"); // "instances" | "create"

  // Create instance form
  const [instName,     setInstName]     = useState("");
  const [instTeam,     setInstTeam]     = useState("");
  const [ownerName,    setOwnerName]    = useState("");
  const [ownerEmail,   setOwnerEmail]   = useState("");
  const [ownerPass,    setOwnerPass]    = useState("");
  const [creating,     setCreating]     = useState(false);
  const [createMsg,    setCreateMsg]    = useState("");

  // Instance detail modal
  const [detailInst,   setDetailInst]   = useState(null);
  const [detailUsers,  setDetailUsers]  = useState([]);
  const [detailCounts, setDetailCounts] = useState({});

  // Add user to instance form
  const [addName,      setAddName]      = useState("");
  const [addEmail,     setAddEmail]     = useState("");
  const [addPass,      setAddPass]      = useState("");
  const [addRole,      setAddRole]      = useState("coach");
  const [addMsg,       setAddMsg]       = useState("");
  const [adding,       setAdding]       = useState(false);

  // Load all instances
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "instances"), async snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // For each instance, get user count
      const enriched = await Promise.all(docs.map(async inst => {
        const usersSnap = await getDocs(collection(db, "users"));
        const members = usersSnap.docs.filter(d => d.data().instanceId === inst.id);
        return { ...inst, userCount: members.length };
      }));
      setInstances(enriched.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Load detail for selected instance
  useEffect(() => {
    if (!detailInst) return;
    const loadDetail = async () => {
      const usersSnap = await getDocs(collection(db, "users"));
      const members = usersSnap.docs
        .filter(d => d.data().instanceId === detailInst.id)
        .map(d => ({ uid: d.id, ...d.data() }));
      setDetailUsers(members);

      const base = `data/${detailInst.id}`;
      const [playsSnap, defPlaysSnap] = await Promise.all([
        getDocs(collection(db, base, "plays")),
        getDocs(collection(db, base, "defPlays")),
      ]);
      setDetailCounts({ plays: playsSnap.size, defPlays: defPlaysSnap.size });
    };
    loadDetail();
  }, [detailInst]);

  // ── Create new instance + owner account ─────────────────────────────────
  const handleCreateInstance = async () => {
    if (!instName.trim() || !ownerEmail.trim() || !ownerPass.trim()) {
      setCreateMsg("❌ Instance name, owner email, and password are required.");
      return;
    }
    if (ownerPass.length < 6) {
      setCreateMsg("❌ Password must be at least 6 characters.");
      return;
    }
    setCreating(true); setCreateMsg(""); console.log("Starting instance creation...");
    try {
      const instanceId = generateInstanceId();

      // 1. Create the owner Firebase Auth account
      console.log("Step 1 - creating auth user...");
      const cred = await createUserWithEmailAndPassword(secondaryAuth, ownerEmail.trim(), ownerPass);
      const ownerUid = cred.user.uid; 

      // 2. Write the instance document
      console.log("Step 2 - writing instance doc...");
      await setDoc(doc(db, "instances", instanceId), {
        name:      instName.trim(),
        teamName:  instTeam.trim() || instName.trim(),
        ownerId:   ownerUid,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.uid,
      }); 

      // 3. Write the owner user document
      console.log("Step 3 - writing user doc...");
      await setDoc(doc(db, "users", ownerUid), {
        instanceId,
        role:  "admin",
        name:  ownerName.trim() || "Head Coach",
        email: ownerEmail.trim(),
      });

      // 4. Seed default config for the instance
      console.log("Step 4 - seeding config...");
      const base = `data/${instanceId}`;
      const batch = writeBatch(db);
      batch.set(doc(db, base, "config/settings"),      { tdOutcome: "TD" });
      batch.set(doc(db, base, "config/games"),         { games: ["Game 1","Game 2","Game 3","Game 4","Game 5","Game 6","Game 7","Game 8"] });
      batch.set(doc(db, base, "config/positions"),     { positions: ["QB","WR"] });
      batch.set(doc(db, base, "config/outcomes"),      { outcomes: ["Reception - Gain","Reception - Loss","Incomplete","Drop","TD","INT","Run - Gain","Run - Loss","Throw Away","Sack","XP Converted - 1pt","XP Converted - 2pt","XP Converted - 3pt","XP Missed - 1pt","XP Missed - 2pt","XP Missed - 3pt"] });
      batch.set(doc(db, base, "config/defOutcomes"),   { defOutcomes: ["Pass Incomplete","Pass Allowed - Gain","Pass Allowed - Loss","Run - Gain","Run - Loss","Touchdown Allowed","XP Allowed","INT","Sack - Time","Sack - Blitz"] });
      batch.set(doc(db, base, "config/playerActions"), { playerActions: ["PBU","Flag Pull","INT","Sack"] });
      batch.set(doc(db, base, "config/playCodes"),     { playCodes: [{ id:1,code:"D1" },{ id:2,code:"D2" },{ id:3,code:"D3" },{ id:4,code:"T1" },{ id:5,code:"T2" },{ id:6,code:"M1" }] });
      batch.set(doc(db, base, "config/players"),       { players: [] });
      batch.set(doc(db, base, "config/gameScores"),    {});
      batch.set(doc(db, base, "config/coachNotes"),    {});
      await batch.commit(); console.log("Done!");

      setCreateMsg(`✅ Instance "${instName.trim()}" created! Owner: ${ownerEmail.trim()} · Instance ID: ${instanceId}`);
      setInstName(""); setInstTeam(""); setOwnerName(""); setOwnerEmail(""); setOwnerPass("");
    } catch (e) {
      setCreateMsg(`❌ Error: ${e.message}`);
    } finally {
      setCreating(false);
    }
  }; 

  // ── Add user to existing instance ─────────────────────────────────────────
  const handleAddUser = async () => {
    if (!addEmail.trim() || !addPass.trim() || !detailInst) return;
    if (addPass.length < 6) { setAddMsg("❌ Password must be at least 6 characters."); return; }
    setAdding(true); setAddMsg("");
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, addEmail.trim(), addPass);
      await setDoc(doc(db, "users", cred.user.uid), {
        instanceId: detailInst.id,
        role:  addRole,
        name:  addName.trim() || "Coach",
        email: addEmail.trim(),
      });
      setAddMsg(`✅ Added ${addEmail.trim()} as ${addRole} to ${detailInst.name}`);
      setAddName(""); setAddEmail(""); setAddPass(""); setAddRole("coach");
      // Refresh detail users
      const usersSnap = await getDocs(collection(db, "users"));
      setDetailUsers(usersSnap.docs.filter(d => d.data().instanceId === detailInst.id).map(d => ({ uid: d.id, ...d.data() })));
    } catch (e) {
      setAddMsg(`❌ Error: ${e.message}`);
    } finally {
      setAdding(false);
    }
  };

  // ── Delete instance ────────────────────────────────────────────────────────
  const handleDeleteInstance = async (inst) => {
    if (!window.confirm(`Delete instance "${inst.name}"? This cannot be undone. Play data will NOT be deleted automatically — you must clear Firestore manually.`)) return;
    await deleteDoc(doc(db, "instances", inst.id));
    if (detailInst?.id === inst.id) setDetailInst(null);
  };

  const tabs = [
    { id: "instances", label: "📋 All Instances" },
    { id: "create",    label: "➕ Create Instance" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6fa", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: T.dark, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", padding: "0" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <div style={{ fontSize: 28 }}>🔐</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>Coacher — Super Admin</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{currentUser.email}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a href="/" style={{ padding: "7px 14px", background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontWeight: 700, fontSize: 12, textDecoration: "none" }}>← App</a>
              <button onClick={() => signOut(auth)} style={{ padding: "7px 14px", background: "rgba(220,38,38,0.2)", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Sign Out</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                padding: "10px 18px", background: "none", border: "none",
                borderBottom: activeTab === t.id ? "3px solid #fff" : "3px solid transparent",
                color: activeTab === t.id ? "#fff" : "rgba(255,255,255,0.5)",
                fontWeight: activeTab === t.id ? 800 : 500, fontSize: 13,
                cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── ALL INSTANCES ── */}
        {activeTab === "instances" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#111827" }}>
                All Instances <span style={{ fontSize: 14, fontWeight: 500, color: "#9ca3af" }}>({instances.length})</span>
              </div>
              <button onClick={() => setActiveTab("create")} style={btnStyle(T.primary)}>➕ New Instance</button>
            </div>

            {loading ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: 60, textAlign: "center", color: "#9ca3af" }}>Loading...</div>
            ) : instances.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 60, textAlign: "center", color: "#9ca3af", fontSize: 15 }}>
                No instances yet. <button onClick={() => setActiveTab("create")} style={{ background: "none", border: "none", color: T.accent, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 15 }}>Create one →</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {instances.map(inst => (
                  <div key={inst.id} style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e5e7eb", padding: "18px 22px", display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{inst.name}</div>
                        {inst.teamName && inst.teamName !== inst.name && (
                          <span style={{ fontSize: 12, background: "#e8eef7", color: T.primary, padding: "2px 8px", borderRadius: 999, fontWeight: 700 }}>{inst.teamName}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        ID: <code style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 4 }}>{inst.id}</code>
                        {" · "}{inst.userCount} user{inst.userCount !== 1 ? "s" : ""}
                        {inst.createdAt && <> · Created {new Date(inst.createdAt).toLocaleDateString()}</>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setDetailInst(inst); setAddMsg(""); }}
                        style={btnStyle("#e8eef7", T.primary)}>View</button>
                      <button onClick={() => handleDeleteInstance(inst)}
                        style={btnStyle("#fee2e2", T.danger)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CREATE INSTANCE ── */}
        {activeTab === "create" && (
          <div style={{ maxWidth: 560 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#111827", marginBottom: 24 }}>Create New Instance</div>
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e5e7eb", padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>

              <div style={{ fontSize: 13, fontWeight: 800, color: T.primary, textTransform: "uppercase", letterSpacing: 1, borderBottom: "1.5px solid #e5e7eb", paddingBottom: 10 }}>Instance Details</div>

              <div>
                <label style={labelStyle}>Instance Name *</label>
                <input style={inputStyle} placeholder="e.g. Westview Football 2025" value={instName} onChange={e => setInstName(e.target.value)} />
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>This is the internal name you'll see in the admin portal.</div>
              </div>
              <div>
                <label style={labelStyle}>Team Name (optional)</label>
                <input style={inputStyle} placeholder="e.g. Westview Warriors" value={instTeam} onChange={e => setInstTeam(e.target.value)} />
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Displayed inside the app. Defaults to instance name if left blank.</div>
              </div>

              <div style={{ fontSize: 13, fontWeight: 800, color: T.primary, textTransform: "uppercase", letterSpacing: 1, borderBottom: "1.5px solid #e5e7eb", paddingBottom: 10, marginTop: 4 }}>Owner / Head Coach Account</div>

              <div>
                <label style={labelStyle}>Coach Name</label>
                <input style={inputStyle} placeholder="e.g. Coach Hart" value={ownerName} onChange={e => setOwnerName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input style={inputStyle} type="email" placeholder="headcoach@team.com" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Temporary Password *</label>
                <input style={inputStyle} type="password" placeholder="min 6 characters" value={ownerPass} onChange={e => setOwnerPass(e.target.value)} />
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>Share this with the head coach. They can change it after logging in.</div>
              </div>

              {createMsg && (
                <div style={{ background: createMsg.startsWith("✅") ? "#d1fae5" : "#fee2e2", color: createMsg.startsWith("✅") ? "#065f46" : "#991b1b", padding: "12px 14px", borderRadius: 8, fontSize: 13, lineHeight: 1.5 }}>
                  {createMsg}
                </div>
              )}

              <button onClick={handleCreateInstance} disabled={creating || !instName.trim() || !ownerEmail.trim() || !ownerPass.trim()}
                style={{ ...btnStyle(creating || !instName.trim() || !ownerEmail.trim() || !ownerPass.trim() ? "#e5e7eb" : T.primary, creating || !instName.trim() || !ownerEmail.trim() || !ownerPass.trim() ? "#9ca3af" : "#fff"), padding: "13px", fontSize: 15, cursor: creating ? "not-allowed" : "pointer" }}>
                {creating ? "Creating..." : "🚀 Create Instance & Owner Account"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── INSTANCE DETAIL MODAL ── */}
      {detailInst && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setDetailInst(null); }}>
          <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
            {/* Modal header */}
            <div style={{ background: T.dark, padding: "20px 28px", borderRadius: "20px 20px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{detailInst.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  ID: <code style={{ color: "#9ca3af" }}>{detailInst.id}</code>
                </div>
              </div>
              <button onClick={() => setDetailInst(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}>×</button>
            </div>

            <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Data counts */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  ["Users",      detailInst.userCount, "#4a6fa5"],
                  ["Off Plays",  detailCounts.plays ?? "…", "#059669"],
                  ["Def Plays",  detailCounts.defPlays ?? "…", "#dc2626"],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 18px", textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color }}>{val}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", fontWeight: 700, letterSpacing: 1 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Team members */}
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 12 }}>Team Members</div>
                {detailUsers.length === 0 ? (
                  <div style={{ color: "#9ca3af", fontSize: 13 }}>No users found.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {detailUsers.map(u => (
                      <div key={u.uid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 999, background: u.role === "admin" ? T.primary : "#e8eef7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                          {u.role === "admin" ? "👑" : "🏈"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{u.name || "Unnamed"}</div>
                          <div style={{ fontSize: 11, color: "#6b7280" }}>{u.email} · <code style={{ fontSize: 10 }}>{u.uid}</code></div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, background: u.role === "admin" ? "#dbeafe" : "#f3f4f6", color: u.role === "admin" ? "#1e40af" : "#374151", padding: "2px 8px", borderRadius: 999 }}>
                          {u.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add user to this instance */}
              <div style={{ borderTop: "1.5px solid #e5e7eb", paddingTop: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 14 }}>Add User to This Instance</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>Name</label>
                    <input style={inputStyle} placeholder="Coach Name" value={addName} onChange={e => setAddName(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select style={inputStyle} value={addRole} onChange={e => setAddRole(e.target.value)}>
                      <option value="coach">Coach</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input style={inputStyle} type="email" placeholder="coach@team.com" value={addEmail} onChange={e => setAddEmail(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Temporary Password</label>
                    <input style={inputStyle} type="password" placeholder="min 6 characters" value={addPass} onChange={e => setAddPass(e.target.value)} />
                  </div>
                </div>
                {addMsg && (
                  <div style={{ background: addMsg.startsWith("✅") ? "#d1fae5" : "#fee2e2", color: addMsg.startsWith("✅") ? "#065f46" : "#991b1b", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                    {addMsg}
                  </div>
                )}
                <button onClick={handleAddUser} disabled={adding || !addEmail.trim() || !addPass.trim()}
                  style={{ ...btnStyle(adding || !addEmail.trim() || !addPass.trim() ? "#e5e7eb" : T.primary, adding || !addEmail.trim() || !addPass.trim() ? "#9ca3af" : "#fff"), cursor: adding ? "not-allowed" : "pointer" }}>
                  {adding ? "Adding..." : "Add User"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function AdminApp() {
  const [authUser,  setAuthUser]  = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      setAuthUser(user);
      setAuthLoaded(true);
    });
  }, []);

  if (!authLoaded) return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
      <div style={{ color: "#6b7280", fontSize: 16 }}>Loading...</div>
    </div>
  );

  if (!authUser)                          return <AdminLogin />;
  if (authUser.uid !== SUPER_ADMIN_UID)   return <AccessDenied />;
  return <AdminPortal currentUser={authUser} />;
}
