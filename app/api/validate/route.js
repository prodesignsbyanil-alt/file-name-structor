import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// AI Studio key দিয়ে কোন কোন মডেল আছে—সেটা থেকে একটি বৈধ flash মডেল বেছে নিই
async function pickGeminiModel(key) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (!res.ok) throw new Error(`ListModels failed: ${res.status}`);
    const data = await res.json();
    const names = (data.models || []).map(m => m.name); // e.g. "models/gemini-1.5-flash-latest"

    const prefer = [
      "models/gemini-1.5-flash-latest",
      "models/gemini-1.5-flash-001",
      "models/gemini-1.5-flash",
      "models/gemini-1.5-flash-8b",
    ];
    for (const want of prefer) {
      if (names.includes(want)) return want.replace("models/", "");
    }
    const anyFlash = names.find(n => n.includes("gemini-1.5-flash"));
    if (anyFlash) return anyFlash.replace("models/", "");
    return null;
  } catch {
    // লিস্ট করতে না পারলে common আইডিটা ট্রাই করি
    return "gemini-1.5-flash-latest";
  }
}

export async function POST(req){
  try {
    const { provider = "OpenAI", key } = await req.json();
    if(!key) return NextResponse.json({ ok:false, error:"Missing key" }, { status:400 });

    if (provider === "OpenAI") {
      const client = new OpenAI({ apiKey: key });
      await client.models.list();
      return NextResponse.json({ ok:true });
    }

    if (provider === "Gemini") {
      const modelId = await pickGeminiModel(key);
      if (!modelId) {
        return NextResponse.json(
          { ok:false, error:"Gemini: no compatible model found for this key/project (use Google AI Studio key)." },
          { status:404 }
        );
      }
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: modelId });
      const r = await model.generateContent("Return only the word OK");
      const text = (typeof r?.response?.text === "function") ? r.response.text() : "";
      if (String(text).toUpperCase().includes("OK")) {
        return NextResponse.json({ ok:true, model: modelId });
      }
      return NextResponse.json({ ok:false, error:`Gemini key test failed for model ${modelId}` }, { status:401 });
    }

    return NextResponse.json({ ok:false, error:"Unsupported provider" }, { status:400 });
  } catch (e) {
    return NextResponse.json({ ok:false, error:String(e?.message || e) }, { status:401 });
  }
}
