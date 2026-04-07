"use client";

import { useMemo, useState } from "react";

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

export default function Page() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [upgrade, setUpgrade] = useState(false);
  const [responseLang, setResponseLang] = useState("en");
  const canAnalyze = text.trim().length >= 20;

  const score = analysis?.safety_score ?? 0;
  const scoreLabel = useMemo(() => {
    if (score >= 70) return "Looks safe";
    if (score >= 40) return "Needs caution";
    return "High risk";
  }, [score]);

  async function onAnalyze() {
    setError("");
    setUpgrade(false);
    setAnalysis(null);
    setLoading(true);
    setLoadingStep(0);

    const timer = setInterval(() => {
      setLoadingStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 1300);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, responseLang, pageCount: 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402 && data.code === "FREE_LIMIT_REACHED") {
          setUpgrade(true);
        }
        setError(data.error || "Failed to fetch analysis.");
        return;
      }
      setAnalysis(data.analysis);
    } catch {
      setError("Failed to fetch. Check your network and retry.");
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  return (
    <main className="page">
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
        </div>
      </nav>

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

        {upgrade ? (
          <div className="upgrade">
            <h3>Upgrade to continue</h3>
            <p>Free plan limit reached. Choose a plan to continue deep research.</p>
            <div className="priceRow">
              <span>INR 10/use</span>
              <span>INR 99/mo</span>
              <span>INR 199/3 mo</span>
              <span>INR 299/6 mo</span>
            </div>
          </div>
        ) : null}
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
