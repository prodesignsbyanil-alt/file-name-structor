"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import ErrorBoundary from "@/components/ErrorBoundary";
import { subscribeAuth, loginWithEmail, logout, isValidEmail } from "@/lib/auth-local";

const isSVG = (f) => f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg");
const isVector = (f) => [".svg", ".eps", ".ai"].some(ext => f.name.toLowerCase().endsWith(ext));

/* =======================
   Naming helpers (strict)
   ======================= */

// এমন সব শব্দ যেগুলো টাইটেলে থাকতে চাই না
const BANNED = new Set([
  // টাইপ/ফাইল/টেক
  "xml","version","svg","eps","ai","file","files","format",
  // জেনেরিক আর্ট/ডিজাইন/কম্পোজিশন
  "art","artwork","image","images","graphic","graphics","vector","design",
  "element","elements","shape","shapes","illustration","illustrations",
  "template","templates","icon","icons","stock","bundle","collection",
  "pattern","patterns","composition","compositions","layout","background",
  // ফাঁপা শব্দ
  "modern","clean","decorative","new","create","creating","created","colors","color","palette"
]);

// খুব সাধারণ স্টপওয়ার্ড—টাইটেলে দরকার নেই
const STOP = new Set([
  "and","with","the","a","an","for","to","of","in","on","by","from","at","this","that","these","those","is","are","be"
]);

// শুধু লেটার-ওয়ার্ড রেখে (A–Z), banned/stop বাদ
function wordsOnly(s) {
  return (String(s || "").match(/[A-Za-z]+/g) || [])
    .map(w => w.toLowerCase())
    .filter(w => !BANNED.has(w) && !STOP.has(w));
}

// ✅ ৫–৮ শব্দ, sentence case (শুধু প্রথম শব্দ ক্যাপিটাল), কোনো generic fallback নয়
// কেবল: মডেলের টেক্সট + filename hint থেকে শব্দ নিয়ে বানাবে
function normalizeTo5to8(raw, hints = []) {
  const merged = [...wordsOnly(raw), ...hints.flatMap(wordsOnly)];

  // ইউনিক অর্ডারড সেট
  const out = [];
  const seen = new Set();
  for (const w of merged) {
    if (!seen.has(w)) { seen.add(w); out.push(w); }
  }

  // ৫–৮ সীমা (কোনো জেনেরিক শব্দ যোগ নয়)
  let words = out.slice(0, 8);
  // যদি ৫-এর কম হয়, hints থেকেই বাড়ানোর চেষ্টা (আবার generic নয়)
  if (words.length < 5) {
    const more = hints.flatMap(wordsOnly).filter(w => !seen.has(w));
    for (const w of more) {
      words.push(w);
      if (words.length >= 5) break;
    }
  }

  if (words.length === 0) return "Untitled";

  // sentence case
  words = words.map(w => w.toLowerCase());
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(" ");
}

// ✅ ইউনিক করতে suffix (a,b,c...)—৮ শব্দ সীমার ভেতরে
function uniqTitle(base, used) {
  if (!used.has(base)) { used.add(base); return base; }
  const abc = "abcdefghijklmnopqrstuvwxyz";
  const words = base.trim().split(/\s+/);
  let i = 0;
  while (true) {
    let k = i, suf = "";
    do { suf = abc[k % 26] + suf; k = Math.floor(k / 26) - 1; } while (k >= 0);
    const candidate = (words.length >= 8) ? [...words.slice(0, 7), suf].join(" ")
                                         : (base + " " + suf);
    if (!used.has(candidate)) { used.add(candidate); return candidate; }
    i++;
  }
}

/* =======================
   Rasterize SVG preview → PNG dataURL
   ======================= */
async function rasterizeToPNG(url, max = 512) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.max(img.width, img.height) / max || 1;
      const w = Math.round(img.width / scale);
      const h = Math.round(img.height / scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      try { resolve(c.toDataURL("image/png", 0.92)); } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = url; // previews[idx].url (objectURL)
  });
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [emailInput, setEmailInput] = useState("");
  const [provider, setProvider] = useState("OpenAI");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false); // 👁️
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [renamedMap, setRenamedMap] = useState({});
  const [progress, setProgress] = useState(0);
  const [renamedCount, setRenamedCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);

  const [statusMap, setStatusMap] = useState({}); // { [idx]: {state:'ok'|'pending'|'error', msg?:string} }
  const runningRef = useRef(false);
  const fileInputRef = useRef(null);
  const used = useRef(new Set());

  useEffect(() => { const unsub = subscribeAuth(setUser); return () => { if (typeof unsub === "function") unsub(); }; }, []);
  useEffect(() => { try { setApiKey(localStorage.getItem(`fns:key:${provider}`) || ""); } catch {} }, [provider]);
  useEffect(() => () => { previews.forEach(p => URL.revokeObjectURL(p.url)); }, [previews]);
  useEffect(() => {
    function onErr(e) {
      const m = (e?.error && e.error.message) || e?.message || "Client error";
      try { console.error(e); } catch {}
      toast.error(m);
    }
    window.addEventListener("error", onErr);
    return () => window.removeEventListener("error", onErr);
  }, []);

  async function handleLogin() {
    if (!isValidEmail(emailInput)) return toast.error("Enter a valid, non-disposable email.");
    const u = await loginWithEmail(emailInput);
    if (u) { setUser(u); toast.success("Logged in!"); } else { toast.error("Login failed."); }
  }
  async function handleLogout() { await logout(); setUser(null); }

  async function saveKey() {
    if (!apiKey) return toast.error("API key required");
    const res = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key: apiKey })
    });
    const data = await res.json();
    if (data.ok) {
      localStorage.setItem(`fns:key:${provider}`, apiKey);
      toast.success(`API key saved!${data.model ? " Model: " + data.model : ""}`);
    } else {
      toast.error(data.error || "Invalid key");
    }
  }

  function handleImport(e) {
    const sel = Array.from(e.target.files || []).filter(isVector);
    if (!sel.length) return toast.error("No SVG/EPS/AI files found.");
    setFiles(sel);
    setPreviews(sel.map(f => ({ name: f.name, url: URL.createObjectURL(f) })));
    setRenamedMap({});
    setRenamedCount(0);
    setProgress(0);
    setStatusMap({});
    used.current = new Set();
    toast.success(`${sel.length} files imported.`);
  }

  // API কল + ক্লায়েন্ট-সাইড strict ফরম্যাটিং (+ image preview)
  async function renameOne(i) {
    const file = files[i]; if (!file) return null;

    setStatusMap(m => ({ ...m, [i]: { state: "pending" } }));

    const fd = new FormData();
    fd.append("file", file);
    fd.append("key", apiKey);
    fd.append("provider", provider);

    // SVG হলে PNG প্রিভিউ পাঠাই (মডেলকে ভিজ্যুয়াল কনটেন্ট দেখাতে)
    try {
      if (isSVG(file) && previews[i]?.url) {
        const png = await rasterizeToPNG(previews[i].url, 512);
        if (png) fd.append("preview", png); // data:image/png;base64,...
      }
    } catch { /* ignore preview errors */ }

    const res = await fetch("/api/rename", { method: "POST", body: fd });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    if (data?.error) throw new Error(data.error);

    // ৫–৮ শব্দ + sentence case + ইউনিক
    let s = normalizeTo5to8(data?.newName || "Untitled", [file.name]);
    s = uniqTitle(s, used.current);

    setRenamedMap(m => ({ ...m, [i]: s }));
    setRenamedCount(c => c + 1);
    setStatusMap(m => ({ ...m, [i]: { state: "ok" } }));
    return s;
  }

  async function start() {
    if (!user) return toast.error("Login required.");
    if (!files.length) return toast.error("Import files first.");
    if (!apiKey) return toast.error("Save a valid API key.");

    setRunning(true);
    runningRef.current = true;
    setPaused(false);
    setProgress(0);
    setRenamedCount(0);
    setRenamedMap({});
    setStatusMap({});
    used.current = new Set();

    for (let i = 0; i < files.length; i++) {
      if (!runningRef.current) break;
      while (paused) {
        await new Promise(r => setTimeout(r, 200));
        if (!runningRef.current) break;
      }
      try { await renameOne(i); }
      catch (e) {
        console.error(e);
        setStatusMap(m => ({ ...m, [i]: { state: "error", msg: String(e?.message || e) } }));
        toast.error(String(e?.message || e));
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
      await new Promise(r => setTimeout(r, 30));
    }

    setRunning(false);
    runningRef.current = false;
    setPaused(false);
    toast.success("Processing finished.");
  }

  function stop() { setRunning(false); runningRef.current = false; setPaused(false); }
  function togglePause() { if (!runningRef.current) return; setPaused(p => !p); }

  // Clear: সব রিসেট + ইনপুট খালি
  function clearAll(){
    setRunning(false);
    runningRef.current = false;
    setPaused(false);
    try { previews.forEach(p => URL.revokeObjectURL(p.url)); } catch {}
    setFiles([]); setPreviews([]); setRenamedMap({});
    setProgress(0); setRenamedCount(0); setStatusMap({});
    used.current = new Set();
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast.success("Cleared. You can import new files now.");
  }

  async function exportZip() {
    if (!Object.keys(renamedMap).length) return toast.error("Nothing to export.");
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const base = renamedMap[i] || normalizeTo5to8(f.name.replace(/\.[^.]+$/, ""), [f.name]);
      const ext = f.name.split(".").pop();
      const newName = `${base}.${ext}`;
      const buf = await f.arrayBuffer();
      zip.file(newName, buf);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "renamed_files.zip"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ErrorBoundary>
      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <Toaster position="top-right" />

        <header className="flex items-center gap-3 justify-between mb-6">
          <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-indigo-600">File Name Structor Pro</div>
          <div className="flex items-center gap-3">
            <div className="hidden md:block text-xs px-3 py-1 rounded border bg-white shadow-sm">Developed By <span className="font-semibold">Anil Chandra Barman</span></div>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">{user.email}</span>
                <button onClick={handleLogout} className="px-3 py-1.5 rounded bg-red-500 text-white text-sm">Logout</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input type="email" placeholder="Enter your email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} className="border rounded px-2 py-1 text-sm w-56" />
                <button onClick={handleLogin} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Login</button>
              </div>
            )}
          </div>
        </header>

        <section className="bg-white rounded shadow p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium mr-1">AI:</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="border rounded px-2 py-1">
              <option value="OpenAI">OpenAI</option>
              <option value="Gemini">Gemini</option>
            </select>

            {/* API Key + Eye toggle + Save */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  placeholder="API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="border rounded pl-3 pr-10 py-1 w-64"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(s => !s)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                  title={showKey ? "Hide API key" : "Show API key"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showKey ? (
                    /* eye-off */
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3l18 18" />
                      <path d="M10.58 10.58A3 3 0 0012 15a3 3 0 002.42-4.42" />
                      <path d="M5.12 5.12C3.14 6.46 1.84 8.35 1 10c1.6 3.2 6 7 11 7 1.2 0 2.36-.2 3.44-.58" />
                    </svg>
                  ) : (
                    /* eye */
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              <button onClick={saveKey} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm">
                Save Key
              </button>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <label className="text-sm font-medium">Input Folder:</label>
              <input
                type="file"
                webkitdirectory="true"
                directory="true"
                multiple
                onChange={handleImport}
                className="text-sm"
                ref={fileInputRef}
              />
            </div>
          </div>
        </section>

        <section className="bg-white rounded shadow p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm"><span className="font-semibold">{renamedCount}</span> / {files.length} files renamed — {progress}%</div>
            <div className="flex items-center gap-2">
              {!running ? (
                <button onClick={start} className="px-4 py-2 rounded bg-indigo-600 text-white">Start Structor</button>
              ) : (
                <button onClick={stop} className="px-4 py-2 rounded bg-yellow-600 text-white">Stop</button>
              )}
              <button onClick={togglePause} disabled={!running} className={`px-4 py-2 rounded text-white ${paused ? "bg-green-600" : "bg-gray-700"}`}>{paused ? "Resume" : "Pause"}</button>
              <button onClick={exportZip} className="px-4 py-2 rounded bg-emerald-600 text-white">Export ZIP</button>
              <button onClick={clearAll} className="px-4 py-2 rounded bg-rose-600 text-white">Clear</button>
            </div>
          </div>
          <div className="h-3 bg-gray-200 rounded mt-3"><div className="h-3 bg-indigo-500 rounded" style={{ width: `${progress}%` }} /></div>
        </section>

        <section className="bg-white rounded shadow p-4">
          <h2 className="font-semibold mb-3">File Preview</h2>
          {files.length === 0 ? (
            <div className="text-sm text-gray-600">No files imported yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {files.map((f, idx) => (
                <div key={idx} className="border rounded p-3 flex flex-col bg-gray-50">
                  <div className="h-32 flex items-center justify-center bg-white border rounded overflow-hidden mb-2">
                    {isSVG(f)
                      ? <img src={(previews[idx] && previews[idx].url) || ""} alt={f.name} className="max-h-28" />
                      : <div className="text-xs text-gray-500 text-center p-2">
                          {f.name.toLowerCase().endsWith(".eps") ? "EPS Preview not supported"
                            : f.name.toLowerCase().endsWith(".ai") ? "AI Preview not supported"
                            : "Preview unavailable"}
                        </div>}
                  </div>

                  <div className="text-xs break-all text-gray-700 mb-1">Old: {f.name}</div>
                  <div className="text-xs font-semibold break-all text-emerald-700 mb-1">
                    New: {(renamedMap[idx] ? renamedMap[idx] : "—") + (renamedMap[idx] ? "." + f.name.split(".").pop() : "")}
                  </div>

                  {statusMap[idx]?.state === "pending" && (
                    <div className="text-[11px] text-amber-600">Renaming…</div>
                  )}
                  {statusMap[idx]?.state === "error" && (
                    <div className="text-[11px] text-red-600 break-words">
                      Error: {statusMap[idx].msg}
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-2">
                    <button onClick={() => renameOne(idx)} className="px-2 py-1 text-xs rounded bg-blue-600 text-white">Regenerate</button>
                    <span className="text-[10px] text-gray-500">{idx + 1}/{files.length}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="flex flex-col md:flex-row items-center justify-between gap-2 text-sm text-gray-600 mt-8">
          <div className="flex items-center gap-2">
            <a href="https://www.facebook.com/anil.chandra.barman.3" target="_blank" rel="noopener noreferrer" className="underline">Facebook</a>
            <span>•</span>
            <a href="https://wa.me/8801770735110" target="_blank" rel="noopener noreferrer" className="underline">WhatsApp</a>
          </div>
          <div>Developed By Anil Chandra Barman</div>
        </footer>
      </main>
    </ErrorBoundary>
  );
}
