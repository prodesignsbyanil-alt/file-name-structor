"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import JSZip from "jszip";
import ErrorBoundary from "@/components/ErrorBoundary";
import { login, logout, subscribeAuth } from "@/lib/firebase";

// helpers
const isSVG = (f) => f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg");
const isVector = (f) => [".svg", ".eps", ".ai"].some(ext => f.name.toLowerCase().endsWith(ext));

function sanitizeLettersOnly(str) {
  // keep letters only, remove everything else; make sure non-empty
  const letters = (str || "").replace(/[^A-Za-z]/g, "");
  return letters || "Untitled";
}

function uniqify(base, used) {
  let name = base;
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  // append letters a, b, c... then aa, ab...
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let idx = 0;
  while (true) {
    const suffix = (() => {
      let n = idx, s = "";
      do { s = alphabet[n % 26] + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
      return s;
    })();
    const candidate = base + suffix;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    idx++;
  }
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [provider, setProvider] = useState("OpenAI");
  const [apiKey, setApiKey] = useState("");
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [renamedMap, setRenamedMap] = useState({}); // index -> newName
  const [progress, setProgress] = useState(0);
  const [renamedCount, setRenamedCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);

  const usedNamesRef = useRef(new Set());

  // auth state
  useEffect(() => {
    const unsub = subscribeAuth((u) => setUser(u));
    return () => { if (typeof unsub === "function") unsub(); };
  }, []);

  // load saved key per provider
  useEffect(() => {
    const saved = localStorage.getItem(`fns:key:${provider}`) || "";
    setApiKey(saved);
  }, [provider]);

  // revoke object URLs on cleanup
  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const handleLogin = async () => {
    const u = await login();
    if (u) toast.success("Logged in!");
  };
  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  const handleSaveKey = async () => {
    if (!apiKey) return toast.error("API key required.");
    // validate via API
    const res = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key: apiKey }),
    });
    const data = await res.json();
    if (data.ok) {
      localStorage.setItem(`fns:key:${provider}`, apiKey);
      toast.success("API key saved!");
    } else {
      toast.error(data.error || "Invalid key.");
    }
  };

  const handleImport = (e) => {
    const selected = Array.from(e.target.files).filter(isVector);
    if (!selected.length) {
      toast.error("No SVG/EPS/AI files found.");
      return;
    }
    setFiles(selected);
    // previews
    const pv = selected.map((f) => ({
      name: f.name,
      type: f.type || "",
      url: URL.createObjectURL(f),
    }));
    setPreviews(pv);
    setProgress(0);
    setRenamedCount(0);
    setRenamedMap({});
    usedNamesRef.current = new Set();
    toast.success(`${selected.length} files imported.`);
  };

  async function renameOne(index) {
    const file = files[index];
    if (!file) return null;
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("key", apiKey);
      fd.append("provider", provider);

      const res = await fetch("/api/rename", { method: "POST", body: fd });
      const data = await res.json();

      let raw = data?.newName || "Untitled";
      let sanitized = sanitizeLettersOnly(raw);
      sanitized = uniqify(sanitized, usedNamesRef.current);

      setRenamedMap((m) => ({ ...m, [index]: sanitized }));
      setRenamedCount((c) => c + 1);
      return sanitized;
    } catch (e) {
      console.error(e);
      toast.error(`Rename failed for ${file.name}`);
      return null;
    }
  }

  async function startStructor() {
    if (!user) return toast.error("Login required.");
    if (!files.length) return toast.error("Import files first.");
    if (!apiKey) return toast.error("Save a valid API key.");

    setRunning(true);
    setPaused(false);
    setProgress(0);
    setRenamedCount(0);
    setRenamedMap({});
    usedNamesRef.current = new Set();

    for (let i = 0; i < files.length; i++) {
      if (!running) break;
      // pause gate
      while (paused) {
        await new Promise((r) => setTimeout(r, 200));
        if (!running) break;
      }
      await renameOne(i);
      setProgress(Math.round(((i + 1) / files.length) * 100));
      // brief yield for UI
      await new Promise((r) => setTimeout(r, 50));
    }
    setRunning(false);
    setPaused(false);
    toast.success("Processing finished.");
  }

  function stopStructor() {
    setRunning(false);
    setPaused(false);
  }
  function togglePause() {
    if (!running) return;
    setPaused((p) => !p);
  }

  async function exportZip() {
    if (!Object.keys(renamedMap).length) {
      return toast.error("Nothing to export. Run structor first.");
    }
    const zip = new JSZip();
    // put all files with new names
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const newBase = renamedMap[i] || sanitizeLettersOnly(f.name.replace(/\.[^.]+$/, ""));
      const ext = f.name.split('.').pop();
      const newName = `${newBase}.${ext}`;
      const buf = await f.arrayBuffer();
      zip.file(newName, buf);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "renamed_files.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ErrorBoundary>
      <main className="max-w-7xl mx-auto p-4 md:p-6">
      <Toaster position="top-right" />
      {/* Header */}
      <header className="flex items-center gap-3 justify-between mb-6">
        <div className="text-2xl md:text-3xl font-extrabold tracking-tight text-indigo-600">
          File Name Structor Pro
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:block text-xs px-3 py-1 rounded border bg-white shadow-sm">
            Developed By <span className="font-semibold">Anil Chandra Barman</span>
          </div>

          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">{user.email}</span>
              <button onClick={handleLogout} className="px-3 py-1.5 rounded bg-red-500 text-white text-sm">
                Logout
              </button>
            </div>
          ) : (
            <button onClick={handleLogin} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">
              Login with Google
            </button>
          )}
        </div>
      </header>

      {/* Controls row */}
      <section className="bg-white rounded shadow p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium mr-1">AI:</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="OpenAI">OpenAI</option>
            <option value="Gemini">Gemini (coming soon)</option>
            <option value="Claude">Claude (coming soon)</option>
          </select>

          <input
            type="password"
            placeholder="API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="border rounded px-3 py-1 w-64"
          />
          <button onClick={handleSaveKey} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm">
            Save Key
          </button>

          <div className="ml-auto flex items-center gap-3">
            <label className="text-sm font-medium">Input Folder:</label>
            <input
              type="file"
              webkitdirectory="true"
              directory="true"
              multiple
              onChange={handleImport}
              className="text-sm"
            />
          </div>
        </div>
      </section>

      {/* Progress */}
      <section className="bg-white rounded shadow p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="font-semibold">{renamedCount}</span> / {files.length} files renamed — {progress}%
          </div>
          <div className="flex items-center gap-2">
            {!running ? (
              <button onClick={startStructor} className="px-4 py-2 rounded bg-indigo-600 text-white">
                Start Structor
              </button>
            ) : (
              <button onClick={stopStructor} className="px-4 py-2 rounded bg-yellow-600 text-white">
                Stop
              </button>
            )}
            <button
              onClick={togglePause}
              disabled={!running}
              className={`px-4 py-2 rounded text-white ${paused ? "bg-green-600" : "bg-gray-700"}`}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button onClick={exportZip} className="px-4 py-2 rounded bg-emerald-600 text-white">
              Export ZIP
            </button>
          </div>
        </div>
        <div className="h-3 bg-gray-200 rounded mt-3">
          <div className="h-3 bg-indigo-500 rounded" style={{ width: `${progress}%` }}></div>
        </div>
      </section>

      {/* Preview Grid */}
      <section className="bg-white rounded shadow p-4">
        <h2 className="font-semibold mb-3">File Preview</h2>
        {files.length === 0 ? (
          <div className="text-sm text-gray-600">No files imported yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {files.map((f, idx) => (
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
                  <button
                    onClick={() => renameOne(idx)}
                    className="px-2 py-1 text-xs rounded bg-blue-600 text-white"
                  >
                    Regenerate
                  </button>
                  <span className="text-[10px] text-gray-500">{idx + 1}/{files.length}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="flex flex-col md:flex-row items-center justify-between gap-2 text-sm text-gray-600 mt-8">
        <div className="flex items-center gap-2">
          <a href="https://www.facebook.com/anil.chandrabarman.3" target="_blank" rel="noopener noreferrer" className="underline">Facebook</a>
          <span>•</span>
          <a href="https://wa.me/8801770735110" target="_blank" rel="noopener noreferrer" className="underline">WhatsApp</a>
        </div>
        <div>Developed By Anil Chandra Barman</div>
      </footer>
    </main>
    </ErrorBoundary>
  );
}