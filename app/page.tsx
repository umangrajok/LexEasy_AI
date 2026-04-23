"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthModal } from "@/components/AuthModal";


type Analysis = {
  safety_score?: number;
  document_type?: string;
  summary?: string;
  safe_points?: string;
  advice?: string;
  red_flags?: Array<{ title?: string; detail?: string; severity?: "high" | "medium" | "low" }>;
};

const steps = [
  "Reading your document...",
  "Analyzing clauses...",
  "Checking legal risks...",
  "Generating insights...",
];

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          size?: "invisible" | "normal" | "compact";
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
      execute: (widgetId?: string) => void;
    };
  }
}

export default function Page() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [responseLang, setResponseLang] = useState("en");
  const [website, setWebsite] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaLoaded, setCaptchaLoaded] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const captchaContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const captchaResolverRef = useRef<((token: string) => void) | null>(null);
  const canAnalyze = text.trim().length >= 20;

  const isCaptchaEnabled = Boolean(TURNSTILE_SITE_KEY);

  const score = analysis?.safety_score ?? 0;
  const scoreLabel = useMemo(() => {
    if (score >= 70) return "Looks safe";
    if (score >= 40) return "Needs caution";
    return "High risk";
  }, [score]);

  useEffect(() => {
    if (!isCaptchaEnabled || !captchaLoaded || !captchaContainerRef.current || !window.turnstile) {
      return;
    }
    if (widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(captchaContainerRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      size: "invisible",
      callback: (token: string) => setCaptchaToken(token),
      "expired-callback": () => setCaptchaToken(""),
      "error-callback": () => setCaptchaToken(""),
    });
  }, [captchaLoaded, isCaptchaEnabled]);

  useEffect(() => {
    if (captchaToken && captchaResolverRef.current) {
      captchaResolverRef.current(captchaToken);
      captchaResolverRef.current = null;
    }
  }, [captchaToken]);

  async function ensureCaptchaToken() {
    if (!isCaptchaEnabled) return "";
    if (captchaToken) return captchaToken;
    if (!window.turnstile || !widgetIdRef.current) return "";

    window.turnstile.execute(widgetIdRef.current);

    return await new Promise<string>((resolve) => {
      captchaResolverRef.current = resolve;
      setTimeout(() => {
        if (captchaResolverRef.current) {
          captchaResolverRef.current("");
          captchaResolverRef.current = null;
        }
      }, 8000);
    });
  }

  async function onAnalyze() {
    setError("");
    setAnalysis(null);
    setLoading(true);
    setLoadingStep(0);

    const resolvedCaptchaToken = await ensureCaptchaToken();
    if (isCaptchaEnabled && !resolvedCaptchaToken) {
      setError("Please complete the 'I'm not a robot' check.");
      setLoading(false);
      return;
    }

    const timer = setInterval(() => {
      setLoadingStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 1300);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, responseLang, website, captchaToken: resolvedCaptchaToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to fetch analysis.");
        return;
      }
      setAnalysis(data.analysis);
    } catch {
      setError("Failed to fetch. Check your network and retry.");
    } finally {
      clearInterval(timer);
      setLoading(false);
      if (isCaptchaEnabled && widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        setCaptchaToken("");
      }
    }
  }

  return (
    <main className="page">
      {isCaptchaEnabled ? (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onLoad={() => setCaptchaLoaded(true)}
          />
          <div
            ref={captchaContainerRef}
            aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", width: 0, height: 0, overflow: "hidden" }}
          />
        </>
      ) : null}
      <div className="mesh" />
      <nav className="navbar">
        <div className="brand">LexEasy</div>
        <div className="navRight">
          <span className="pill">FREE BETA</span>
          <div className="langSwitch">
            <button className="langBtn active">EN</button>
            <button className="langBtn">HI</button>
            <button className="langBtn">HG</button>
          </div>
          <button
            id="nav-signin"
            onClick={() => setAuthOpen(true)}
            style={{
              border: "1px solid rgba(16,185,129,0.35)",
              borderRadius: 999,
              padding: "6px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--green-deep)",
              background: "rgba(255,255,255,0.65)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Sign in
          </button>
        </div>
      </nav>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}

      <section className="hero">
        <p className="eyebrow">India&apos;s #1 Legal AI Assistant</p>
        <h1>
          Legal documents,
          <br />
          <span>understood.</span>
        </h1>
        <p className="sub">
          Upload any document. AI will tell you in 30 seconds - is it safe to sign or not. Simple, clear language.
        </p>
        <div className="trust">
          <span>File never saved</span>
          <span>Completely free</span>
          <span>30 second results</span>
        </div>
      </section>

      <section className="card">
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          autoComplete="off"
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", opacity: 0, pointerEvents: "none" }}
        />
        <textarea
          className="input"
          placeholder="Paste legal text here (minimum 20 characters)..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="toolbar">
          <select
            className="lang"
            value={responseLang}
            onChange={(e) => setResponseLang(e.target.value)}
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="hinglish">Hinglish</option>
          </select>
          <button className="cta" disabled={!canAnalyze || loading} onClick={onAnalyze}>
            {loading ? "Analyzing..." : "Analyze Instantly →"}
          </button>
        </div>
        {loading ? (
          <div className="loadingBox">
            <p>{steps[loadingStep]}</p>
            <div className="progressTrack">
              <div className="progressFill" style={{ width: `${((loadingStep + 1) / steps.length) * 100}%` }} />
            </div>
            <div className="skeleton" />
            <div className="skeleton short" />
          </div>
        ) : null}

        {error ? <div className="error">{error}</div> : null}
      </section>

      {analysis ? (
        <section className="result">
          <div className="score">
            <strong>{score}</strong>
            <span>{scoreLabel}</span>
          </div>
          <div className="block">
            <h3>Document type</h3>
            <p>{analysis.document_type || "Not provided"}</p>
          </div>
          <div className="block">
            <h3>Summary</h3>
            <p>{analysis.summary || "Not provided"}</p>
          </div>
          <div className="block">
            <h3>Red flags</h3>
            <ul>
              {(analysis.red_flags || []).map((flag, idx) => (
                <li key={idx}>
                  <strong>{flag.title || "Flag"}:</strong> {flag.detail || "No detail"} ({flag.severity || "low"})
                </li>
              ))}
            </ul>
          </div>
          <div className="block">
            <h3>Safe points</h3>
            <p>{analysis.safe_points || "Not provided"}</p>
          </div>
          <div className="block">
            <h3>Advice</h3>
            <p>{analysis.advice || "Not provided"}</p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
