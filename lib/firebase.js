import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app, _auth, _provider;

const isClient = () => typeof window !== "undefined";

function ensureInit() {
  if (!isClient()) return null;
  if (!app) {
    app = initializeApp(firebaseConfig);
    _auth = getAuth(app);
    _provider = new GoogleAuthProvider();
  }
  return { auth: _auth, provider: _provider };
}

export function subscribeAuth(cb) {
  const ctx = ensureInit();
  if (!ctx) return () => {};
  return onAuthStateChanged(ctx.auth, cb);
}

export async function login() {
  const ctx = ensureInit();
  if (!ctx) return null;
  try {
    const res = await signInWithPopup(ctx.auth, _provider);
    return res.user;
  } catch (e) {
    console.error(e);
    return null;
  }
}

export async function logout() {
  const ctx = ensureInit();
  if (!ctx) return;
  try { await signOut(ctx.auth); } catch(e) { console.error(e); }
}