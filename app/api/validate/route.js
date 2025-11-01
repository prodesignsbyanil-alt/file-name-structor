import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function POST(req){
  try{
    const { provider="OpenAI", key } = await req.json();
    if(!key) return NextResponse.json({ ok:false, error:"Missing key" }, { status:400 });
    if(provider === "OpenAI"){
      const client = new OpenAI({ apiKey: key });
      await client.models.list();
      return NextResponse.json({ ok:true });
    } else if(provider === "Gemini"){
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const r = await model.generateContent("Return only the word OK");
      const text = r?.response?.text?.() || "";
      if(String(text).toUpperCase().includes("OK")) return NextResponse.json({ ok:true });
      return NextResponse.json({ ok:false, error:"Gemini key test failed" }, { status:401 });
    } else {
      return NextResponse.json({ ok:false, error:"Unsupported provider" }, { status:400 });
    }
  }catch(e){
    return NextResponse.json({ ok:false, error:String(e?.message||e) }, { status:401 });
  }
}