import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req){
  try {
    const { provider = "OpenAI", key } = await req.json();
    if(!key) return NextResponse.json({ ok:false, error:"Missing key" }, { status:400 });
    if(provider !== "OpenAI") return NextResponse.json({ ok:false, error:"Only OpenAI supported" }, { status:400 });
    const client = new OpenAI({ apiKey: key });
    await client.models.list();
    return NextResponse.json({ ok:true });
  } catch(e){
    return NextResponse.json({ ok:false, error:"Invalid or unauthorized key" }, { status:401 });
  }
}