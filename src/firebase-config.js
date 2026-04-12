// ── firebase-config.js ───────────────────────────────────────────────────────
//
// This file initializes Firebase and exports the auth and db instances used
// throughout the app. All sensitive values are pulled from environment
// variables — never hardcode your Firebase keys here.
//
// Vercel env var names (set these in your Vercel project settings):
//   REACT_APP_FIREBASE_API_KEY
//   REACT_APP_FIREBASE_AUTH_DOMAIN
//   REACT_APP_FIREBASE_PROJECT_ID
//   REACT_APP_FIREBASE_STORAGE_BUCKET
//   REACT_APP_FIREBASE_MESSAGING_SENDER_ID
//   REACT_APP_FIREBASE_APP_ID
//
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
export default app;
