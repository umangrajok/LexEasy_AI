import { NextRequest, NextResponse } from "next/server";
import { cacheKey, getCached, setCached } from "@/lib/cache";
import { checkBotProtection, getClientIp, isHoneypotTriggered } from "@/lib/bot-protect";
import { verifyTurnstileToken } from "@/lib/turnstile";

const MAX_TEXT_CHARS = 8000;

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

async function callGemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is missing.");

  // Use reliable 1.5 flash model
  const model = "gemini-1.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: 0.2, 
          maxOutputTokens: 1000,
          responseMimeType: "application/json"
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      }),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Gemini API Error Response:", errorText);
    
    // Parse error JSON if possible
    try {
      const errObj = JSON.parse(errorText);
      if (errObj.error && errObj.error.message) {
        throw new Error(`Gemini API error: ${errObj.error.message}`);
      }
    } catch (e) {
      // Ignored if not JSON
    }
    
    throw new Error(`Gemini API error: ${res.statusText}`);
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!raw) {
    console.error("Empty response from Gemini. Full data:", JSON.stringify(data));
    throw new Error("Empty response from Gemini.");
  }
  
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse Gemini response as JSON:", raw);
    // Fallback to regex if response_mime_type somehow failed
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse Gemini JSON response.");
    return JSON.parse(match[0]);
  }
}

export async function POST(req: NextRequest) {
  try {
    // --- Bot Protection ---
    const botCheck = checkBotProtection(req);
    if (!botCheck.ok) {
      return NextResponse.json(
        { error: botCheck.error },
        {
          status: botCheck.status,
          headers: botCheck.retryAfterSec
            ? {
                "Retry-After": String(botCheck.retryAfterSec),
                "X-RateLimit-Policy": "ip-and-burst-limit",
              }
            : undefined,
        }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json({ error: "Invalid content type." }, { status: 415 });
    }

    const body = await req.json();

    // --- Honeypot check (anti-bot form field)
    if (isHoneypotTriggered(body)) {
      // Silently reject but pretend it worked (confuse bots)
      return NextResponse.json({ success: true, analysis: null });
    }

    if (process.env.TURNSTILE_SECRET_KEY) {
      const captchaToken = typeof body?.captchaToken === "string" ? body.captchaToken : "";
      if (!captchaToken) {
        return NextResponse.json({ error: "Captcha verification required." }, { status: 400 });
      }

      const verifyResult = await verifyTurnstileToken(captchaToken, getClientIp(req));
      if (!verifyResult.ok) {
        return NextResponse.json({ error: verifyResult.reason || "Captcha failed." }, { status: 400 });
      }
    }

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const responseLang = typeof body?.responseLang === "string" ? body.responseLang : "en";

    if (!text) {
      return NextResponse.json({ error: "No document text provided." }, { status: 400 });
    }
    if (text.length < 20) {
      return NextResponse.json({ error: "Document text too short (minimum 20 characters)." }, { status: 400 });
    }
    if (text.length > MAX_TEXT_CHARS) {
      return NextResponse.json({ error: `Document text too long (max ${MAX_TEXT_CHARS} characters).` }, { status: 400 });
    }

    // --- Cache check (skip re-analyzing same text)
    const key = cacheKey(`${text}:${responseLang}`);
    const cached = getCached(key);
    if (cached) {
      return NextResponse.json({ success: true, analysis: cached, cached: true });
    }

    // --- Call Gemini ---
    const analysis = await callGemini(buildPrompt(text, responseLang));
    setCached(key, analysis);

    return NextResponse.json({ success: true, analysis, cached: false });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed." },
      { status: 500 }
    );
  }
}
