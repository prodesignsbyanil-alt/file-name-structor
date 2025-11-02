import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Gemini model picker — তোমার key/project-এ যেটা আছে সেটাই বেছে নেয়
async function pickGeminiModel(key) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (!res.ok) throw new Error(`ListModels failed: ${res.status}`);
    const data = await res.json();
    const names = (data.models || []).map(m => m.name); // e.g. "models/gemini-2.0-flash"

    // পছন্দের অর্ডার (যেটা আগে পাবে সেটিই নেবে)
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

    // যে কোনো flash
    const anyFlash = names.find(n => /gemini-(1\.5|2\.0)-flash/.test(n));
    if (anyFlash) return anyFlash.replace("models/", "");

    // না পেলে pro
    const anyPro = names.find(n => /gemini-(1\.5|2\.0)-pro/.test(n));
    if (anyPro) return anyPro.replace("models/", "");

    return null;
  } catch {
    // লিস্ট না হলে একটা সাধারণ fallback ট্রাই করবো
    return "gemini-1.5-flash-latest";
  }
}

export async function POST(req){
  try{
    const { provider = "OpenAI", key } = await req.json();
    if(!key) return NextResponse.json({ ok:false, error:"Missing key" }, { status:400 });

    if(provider === "OpenAI"){
      const client = new OpenAI({ apiKey: key });
      await client.models.list();
      return NextResponse.json({ ok:true });
    }

    if(provider === "Gemini"){
      const modelId = await pickGeminiModel(key);
      if(!modelId){
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
  }catch(e){
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:401 });
  }
}
