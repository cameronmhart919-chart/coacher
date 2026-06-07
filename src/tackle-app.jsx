// ── tackle-app.jsx ────────────────────────────────────────────────────────────
//
// Auth wrapper that mounts the tackle-football portal (TackleCoach).
// TackleCoach expects auth to be resolved by its parent, so this component
// handles Firebase auth + user-profile loading (mirroring football-coach.jsx)
// and passes the resolved props down.
//
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase-config.js";   // ensures Firebase app is initialised
import TackleCoach from "./tackle-coach.jsx";

export default function TackleApp() {
  const navigate = useNavigate();
  const [authUser,    setAuthUser]    = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        setUserProfile(snap.exists() ? snap.data() : null);
      } else {
        setUserProfile(null);
      }
      setAuthLoading(false);
    });
  }, []);

  const wrap = (msg) => (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"system-ui, sans-serif", color:"#374151", flexDirection:"column", gap:12 }}>
      <div>{msg}</div>
      <button onClick={() => navigate("/")}
        style={{ padding:"8px 16px", borderRadius:8, border:"1.5px solid #d1d5db",
          background:"#fff", cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>
        Go to sign in
      </button>
    </div>
  );

  if (authLoading) return <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
    justifyContent:"center", fontFamily:"system-ui, sans-serif", color:"#9ca3af" }}>Loading…</div>;
  if (!authUser)    return wrap("Please sign in to use the tackle portal.");
  if (!userProfile) return wrap("No team profile found for this account.");

  return (
    <TackleCoach
      instanceId={userProfile.instanceId}
      authUser={authUser}
      userProfile={userProfile}
      onSwitchPortal={() => navigate("/")}
    />
  );
}
