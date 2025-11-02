import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ===== helpers =====
function toTitle(w){ return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }
function pickWords(raw){
  // কেবল অক্ষর—[A-Za-z]—ক্যাপচার করি
  const m = String(raw||"").match(/[A-Za-z]+/g) || [];
  // অর্ডার রক্ষা করে ইউনিক (একই শব্দ বারবার না)
  const out = [];
  const seen = new Set();
  for(const w of m){
    const lw = w.toLowerCase();
    if(!seen.has(lw)){ seen.add(lw); out.push(lw); }
  }
  return out;
}
function buildName(raw, fallbackHints=[]){
  let words = pickWords(raw);

  // fallback পুল
  const fallback = Array.from(new Set([
    ...fallbackHints.map(s => s.toLowerCase()),
    "vector","design","graphic","illustration","element","silhouette","icon",
    "decorative","ornamental","art","bundle","collection","stock","print",
    "template","pattern","abstract","floral","nature","animal"
  ])).filter(Boolean);

  // 12–15 words এ নরমালাইজ
  let i = 0;
  while(words.length < 12){ words.push(fallback[i % fallback.length] || "design"); i++; }
  if(words.length > 15) words = words.slice(0,15);

  // Title Case + single space
  const title = words.map(toTitle).join(" ").trim();
  return title || "Untitled";
}

// ===== gemini model helper (আগে যেমন ছিল) =====
async function pickGeminiModel(key) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (!res.ok) throw new Error(`ListModels failed: ${res.status}`);
    const data = await res.json();
    const names = (data.models || []).map(m => m.name);

    const preferExact = [
      "models/gemini-1.5-flash-latest","models/gemini-1.5-flash-001",
      "models/gemini-1.5-flash","models/gemini-1.5-flash-8b",
      "models/gemini-2.0-flash","models/gemini-2.0-flash-lite",
      "models/gemini-2.0-flash-exp","models/gemini-1.5-pro","models/gemini-2.0-pro",
    ];
    for (const want of preferExact) if (names.includes(want)) return want.replace("models/","");
    const anyFlash = names.find(n => /gemini-(1\.5|2\.0)-flash/.test(n));
    if (anyFlash) return anyFlash.replace("models/","");
    const anyPro = names.find(n => /gemini-(1\.5|2\.0)-pro/.test(n));
    if (anyPro) return anyPro.replace("models/","");
    return null;
  } catch { return "gemini-1.5-flash-latest"; }
}

export async function POST(req){
  try{
    const form = await req.formData();
    const file = form.get("file");
    const key  = form.get("key");
    const provider = form.get("provider") || "OpenAI";
    if(!file) return NextResponse.json({ error:"No file provided" }, { status:400 });
    if(!key)  return NextResponse.json({ error:"Missing API key" }, { status:400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const nameLower = (file.name||"").toLowerCase();

    // content hint
    let snippet = "", hint = "Vector design file.";
    if (nameLower.endsWith(".svg")){ snippet = buf.toString("utf8",0,8000); hint = "SVG vector graphic content (XML)."; }
    else if (nameLower.endsWith(".eps")){ hint = "EPS vector graphic (PostScript-based)."; }
    else if (nameLower.endsWith(".ai")) { hint = "Adobe Illustrator vector graphic."; }

    // ছোট হিন্ট-ওয়ার্ড (snippet থেকে অনুমানসাপেক্ষে)
    const hintWords = pickWords(snippet).slice(0,20);

    const prompt = `Return a descriptive filename TITLE for this file.
- 12 to 15 words.
- ONLY letters A–Z (no digits, no punctuation).
- Words separated by SINGLE SPACE.
- Generic, stock-ready, content-relevant.
Context hint: ${hint}
${snippet ? "Snippet (truncated):\\n" + snippet.slice(0, 1200) : ""}`;

    let raw = "Untitled";
    if (provider === "OpenAI") {
      const openai = new OpenAI({ apiKey: key });
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      });
      raw = resp?.choices?.[0]?.message?.content || "Untitled";
    } else if (provider === "Gemini") {
      const modelId = await pickGeminiModel(key);
      if(!modelId) return NextResponse.json({ error:"Gemini: no compatible model available for this key/project." }, { status:404 });
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: modelId });
      const r = await model.generateContent(prompt);
      raw = (typeof r?.response?.text === "function") ? r.response.text() : "Untitled";
    } else {
      return NextResponse.json({ error:"Unsupported provider" }, { status:400 });
    }

    // 🔒 কঠোর পোস্ট-প্রসেসিং
    const cleaned = buildName(raw, hintWords);          // Title Case, 12–15 words, letters-only, single spaces

    return NextResponse.json({ newName: cleaned });
  }catch(e){
    console.error(e);
    return NextResponse.json({ error:String(e?.message||e) }, { status:500 });
  }
}
