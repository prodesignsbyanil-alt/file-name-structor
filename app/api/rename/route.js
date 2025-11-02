import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// validate রুটের মতোই model picker
async function pickGeminiModel(key) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (!res.ok) throw new Error(`ListModels failed: ${res.status}`);
    const data = await res.json();
    const names = (data.models || []).map(m => m.name);

    const preferExact = [
      "models/gemini-1.5-flash-latest",
      "models/gemini-1.5-flash-001",
      "models/gemini-1.5-flash",
      "models/gemini-1.5-flash-8b",
      "models/gemini-2.0-flash",
      "models/gemini-2.0-flash-lite",
      "models/gemini-2.0-flash-exp",
      "models/gemini-1.5-pro",
      "models/gemini-2.0-pro",
    ];
    for (const want of preferExact) {
      if (names.includes(want)) return want.replace("models/", "");
    }

    const anyFlash = names.find(n => /gemini-(1\.5|2\.0)-flash/.test(n));
    if (anyFlash) return anyFlash.replace("models/", "");

    const anyPro = names.find(n => /gemini-(1\.5|2\.0)-pro/.test(n));
    if (anyPro) return anyPro.replace("models/", "");

    return null;
  } catch {
    return "gemini-1.5-flash-latest";
  }
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
    const nameLower = (file.name || "").toLowerCase();
    let snippet = "";
    let hint = "Vector design file.";
    if (nameLower.endsWith(".svg")) {
      snippet = buf.toString("utf8", 0, 8000);
      hint = "SVG vector graphic content (XML).";
    } else if (nameLower.endsWith(".eps")) {
      hint = "EPS vector graphic (PostScript-based).";
    } else if (nameLower.endsWith(".ai")) {
      hint = "Adobe Illustrator vector graphic.";
    }

    const prompt = `You are a professional digital asset curator.
Return a concise filename title for the file described below.
- Use ONLY English letters (A–Z, a–z). No digits. No spaces. No underscores. No hyphens. No punctuation.
- Length: 2–5 words concatenated (e.g., ElegantFloralMandala).
- Do NOT include any file extension.
- The name must be generic but content-relevant and stock-ready.

Context hint: ${hint}
${snippet ? "Snippet (may be truncated):\\n" + snippet.slice(0, 2000) : ""}`;

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
      if (!modelId) return NextResponse.json({ error:"Gemini: no compatible model available for this key/project." }, { status:404 });

      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: modelId });
      const r = await model.generateContent(prompt);
      raw = (typeof r?.response?.text === "function") ? r.response.text() : "Untitled";
    } else {
      return NextResponse.json({ error:"Unsupported provider" }, { status:400 });
    }

    let cleaned = String(raw).replace(/[^A-Za-z]/g, "");
    if (!cleaned) cleaned = "Untitled";
    return NextResponse.json({ newName: cleaned });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
