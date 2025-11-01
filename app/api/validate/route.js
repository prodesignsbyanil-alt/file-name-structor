import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { provider = "OpenAI", key } = await req.json();
    if (!key) return NextResponse.json({ ok: false, error: "Missing key" }, { status: 400 });

    if (provider !== "OpenAI") {
      return NextResponse.json({ ok: false, error: "Only OpenAI validation supported in this build" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: key });
    // simple ping: list models (small request)
    await client.models.list();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Invalid or unauthorized key" }, { status: 401 });
  }
}