"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import ErrorBoundary from "@/components/ErrorBoundary";
import { subscribeAuth, loginWithEmail, logout, isValidEmail } from "@/lib/auth-local";

const isSVG = (f) => f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg");
const isVector = (f) => [".svg", ".eps", ".ai"].some(ext => f.name.toLowerCase().endsWith(ext));
const lettersOnly = (s) => (s||"").replace(/[^A-Za-z]/g,"") || "Untitled";
function uniq(base, used){ let n=base; if(!used.has(n)){ used.add(n); return n; } const abc="abcdefghijklmnopqrstuvwxyz"; let i=0; while(true){ let k=i,s=""; do { s=abc[k%26]+s; k=Math.floor(k/26)-1; } while(k>=0); const c=base+s; if(!used.has(c)){ used.add(c); return c; } i++; } }

export default function Home(){
  const [user, setUser] = useState(null);
  const [emailInput, setEmailInput] = useState("");
  const [provider, setProvider] = useState("OpenAI");
  const [apiKey, setApiKey] = useState("");
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [renamedMap, setRenamedMap] = useState({});
  const [progress, setProgress] = useState(0);
  const [renamedCount, setRenamedCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const used = useRef(new Set());

  useEffect(()=>{
    const unsub = subscribeAuth(setUser);
    const savedKey = localStorage.getItem(`fns:key:${provider}`) || "";
    setApiKey(savedKey);
    return () => { if(typeof unsub==='function') unsub(); };
  }, [provider]);

  useEffect(()=> () => { previews.forEach(p=>URL.revokeObjectURL(p.url)); }, [previews]);

  // global error -> toast
  useEffect(()=>{
    function onErr(e){ const m=(e?.error && e.error.message) || e?.message || "Client error"; try{ console.error(e); }catch{}; toast.error(m); }
    window.addEventListener("error", onErr);
    return () => window.removeEventListener("error", onErr);
  }, []);

  async function handleLogin(){
    if(!isValidEmail(emailInput)) return toast.error("Enter a valid, non-disposable email.");
    const u = await loginWithEmail(emailInput);
    if(u) toast.success("Logged in!");
  }
  async function handleLogout(){ await logout(); setUser(null); }

  async function saveKey(){
    if(!apiKey) return toast.error("API key required");
    // minimal validation against OpenAI
    const res = await fetch("/api/validate", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ provider, key: apiKey }) });
    const data = await res.json();
    if(data.ok){ localStorage.setItem(`fns:key:${provider}`, apiKey); toast.success("API key saved!"); }
    else toast.error(data.error || "Invalid key");
  }

  function handleImport(e){
    const sel = Array.from(e.target.files||[]).filter(isVector);
    if(!sel.length) return toast.error("No SVG/EPS/AI files found.");
    setFiles(sel);
    setPreviews(sel.map(f=>({ name:f.name, url: URL.createObjectURL(f) })));
    setRenamedMap({}); setRenamedCount(0); setProgress(0); used.current=new Set();
    toast.success(`${sel.length} files imported.`);
  }

  async function renameOne(i){
    const file = files[i]; if(!file) return null;
    try{
      const fd = new FormData();
      fd.append("file", file);
      fd.append("key", apiKey);
      fd.append("provider", provider);
      const res = await fetch("/api/rename", { method: "POST", body: fd });
      const data = await res.json();
      let s = lettersOnly(data?.newName || "Untitled"); s = uniq(s, used.current);
      setRenamedMap(m=>({ ...m, [i]: s })); setRenamedCount(c=>c+1);
      return s;
    }catch(e){ console.error(e); toast.error(`Rename failed for ${file.name}`); return null; }
  }

  async function start(){
    if(!user) return toast.error("Login required.");
    if(!files.length) return toast.error("Import files first.");
    if(!apiKey) return toast.error("Save a valid API key.");
    setRunning(true); setPaused(false); setProgress(0); setRenamedCount(0); setRenamedMap({}); used.current=new Set();
    for(let i=0;i<files.length;i++){
      if(!running) break;
      while(paused){ await new Promise(r=>setTimeout(r,200)); if(!running) break; }
      await renameOne(i);
      setProgress(Math.round(((i+1)/files.length)*100));
      await new Promise(r=>setTimeout(r,30));
    }
    setRunning(false); setPaused(false); toast.success("Processing finished.");
  }
  function stop(){ setRunning(false); setPaused(false); }
  function togglePause(){ if(!running) return; setPaused(p=>!p); }

  async function exportZip(){
    if(!Object.keys(renamedMap).length) return toast.error("Nothing to export.");
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for(let i=0;i<files.length;i++){
      const f = files[i]; const base = renamedMap[i] || lettersOnly(f.name.replace(/\.[^.]+$/, "")); const ext = f.name.split(".").pop();
      const newName = `${base}.${ext}`; const buf = await f.arrayBuffer(); zip.file(newName, buf);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="renamed_files.zip"; a.click(); URL.revokeObjectURL(url);
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
                <input type="email" placeholder="Enter your email" value={emailInput} onChange={(e)=>setEmailInput(e.target.value)} className="border rounded px-2 py-1 text-sm w-56" />
                <button onClick={handleLogin} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Login</button>
              </div>
            )}
          </div>
        </header>

        <section className="bg-white rounded shadow p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium mr-1">AI:</label>
            <select value={provider} onChange={(e)=>setProvider(e.target.value)} className="border rounded px-2 py-1">
              <option value="OpenAI">OpenAI</option>
              <option value="Gemini">Gemini (coming soon)</option>
              <option value="Claude">Claude (coming soon)</option>
            </select>

            <input type="password" placeholder="API Key" value={apiKey} onChange={(e)=>setApiKey(e.target.value)} className="border rounded px-3 py-1 w-64" />
            <button onClick={saveKey} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm">Save Key</button>

            <div className="ml-auto flex items-center gap-3">
              <label className="text-sm font-medium">Input Folder:</label>
              <input type="file" webkitdirectory="true" directory="true" multiple onChange={handleImport} className="text-sm" />
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
            </div>
          </div>
          <div className="h-3 bg-gray-200 rounded mt-3"><div className="h-3 bg-indigo-500 rounded" style={{ width: `${progress}%` }} /></div>
        </section>

        <section className="bg-white rounded shadow p-4">
          <h2 className="font-semibold mb-3">File Preview</h2>
          {files.length===0 ? (
            <div className="text-sm text-gray-600">No files imported yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {files.map((f, idx)=>(
                <div key={idx} className="border rounded p-3 flex flex-col bg-gray-50">
                  <div className="h-32 flex items-center justify-center bg-white border rounded overflow-hidden mb-2">
                    {isSVG(f) ? (
                      <img src={(previews[idx] && previews[idx].url) || ""} alt={f.name} className="max-h-28" />
                    ) : (
                      <div className="text-xs text-gray-500 text-center p-2">
                        {f.name.toLowerCase().endsWith(".eps") ? "EPS Preview not supported" :
                         f.name.toLowerCase().endsWith(".ai") ? "AI Preview not supported" : "Preview unavailable"}
                      </div>
                    )}
                  </div>
                  <div className="text-xs break-all text-gray-700 mb-1">Old: {f.name}</div>
                  <div className="text-xs font-semibold break-all text-emerald-700 mb-2">
                    New: {(renamedMap[idx] ? renamedMap[idx] : "—") + (renamedMap[idx] ? "." + f.name.split(".").pop() : "")}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <button onClick={()=>renameOne(idx)} className="px-2 py-1 text-xs rounded bg-blue-600 text-white">Regenerate</button>
                    <span className="text-[10px] text-gray-500">{idx+1}/{files.length}</span>
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