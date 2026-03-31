import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { cacheKey, getCached, setCached } from "@/lib/cache";
import { getUser, incrementFreeChats } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const MAX_TEXT_CHARS = 8000;
const FREE_CHAT_LIMIT = 1;
const FREE_PAGE_LIMIT = 5;

function getIp(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

function buildPrompt(text: string, responseLang: string) {
  const language =
    responseLang === "hi"
      ? "Return content in simple Hindi."
      : responseLang === "hinglish"
        ? "Return content in simple Hinglish (Roman script)."
        : "Return content in simple English.";

  return `Analyze this legal document and return only valid JSON.
${language}
{
  "safety_score": <0-100 number>,
  "document_type": "<short type>",
  "summary": "<2 short sentences>",
  "red_flags": [{"title":"<title>","detail":"<detail>","severity":"high|medium|low","snippet":"<exact quote or empty>"}],
  "safe_points": "<short plain explanation>",
  "advice": "<specific next steps>"
}
Document:
${text.slice(0, 4000)}`;
}

async function callGemini(prompt: string, premium: boolean) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is missing.");
  const model = premium ? "gemini-1.5-pro" : "gemini-1.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
      }),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || "Gemini API error");
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Empty response from Gemini.");
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse Gemini JSON response.");
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const userEmail = token?.email || "";
    const ip = getIp(req);
    const limiterKey = userEmail || ip;

    if (!rateLimit(limiterKey)) {
      return NextResponse.json({ error: "Too many requests. 5 per minute max." }, { status: 429 });
    }

    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const responseLang = typeof body?.responseLang === "string" ? body.responseLang : "en";
    const pageCount = Number.isFinite(Number(body?.pageCount)) ? Number(body.pageCount) : 1;

    if (!text) {
      return NextResponse.json({ error: "No document text provided." }, { status: 400 });
    }
    if (text.length < 20) {
      return NextResponse.json({ error: "Document text too short (minimum 20 characters)." }, { status: 400 });
    }
    if (text.length > MAX_TEXT_CHARS) {
      return NextResponse.json({ error: `Document text too long (max ${MAX_TEXT_CHARS}).` }, { status: 400 });
    }

    const dbUser = userEmail ? await getUser(userEmail) : null;
    const isPremium = Boolean(dbUser?.is_premium);
    const used = dbUser?.free_chats_used || 0;

    if (!isPremium) {
      if (used >= FREE_CHAT_LIMIT || pageCount > FREE_PAGE_LIMIT) {
        return NextResponse.json(
          {
            code: "FREE_LIMIT_REACHED",
            error: "Free plan limit reached.",
            pricing: {
              payPerUseInr: 10,
              plans: [
                { label: "Monthly", priceInr: 99 },
                { label: "Quarterly", priceInr: 199 },
                { label: "Half-Yearly", priceInr: 299 },
              ],
            },
          },
          { status: 402 }
        );
      }
    }

    const key = cacheKey(`${text}:${responseLang}:${isPremium}`);
    const cached = getCached(key);
    if (cached) {
      return NextResponse.json({ success: true, analysis: cached, cached: true });
    }

    const analysis = await callGemini(buildPrompt(text, responseLang), isPremium);
    setCached(key, analysis);

    if (!isPremium && userEmail) {
      await incrementFreeChats(userEmail);
    }

    return NextResponse.json({ success: true, analysis, cached: false });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed." },
      { status: 500 }
    );
  }
}
