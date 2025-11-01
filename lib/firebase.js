import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app;
let authInstance;
let providerInstance;

function isClient() {
  return typeof window !== "undefined";
}

function ensureInit() {
  if (!isClient()) return null;
  if (!app) {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    providerInstance = new GoogleAuthProvider();
  }
  return { auth: authInstance, provider: providerInstance };
}

export function subscribeAuth(callback) {
  const ctx = ensureInit();
  if (!ctx) return () => {};
  return onAuthStateChanged(ctx.auth, callback);
}

export async function login() {
  const ctx = ensureInit();
  if (!ctx) return null;
  try {
    const result = await signInWithPopup(ctx.auth, providerInstance);
    return result.user;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function logout() {
  const ctx = ensureInit();
  if (!ctx) return;
  try {
    await signOut(ctx.auth);
  } catch (err) {
    console.error(err);
  }
}