"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Tab = "login" | "signup";

interface AuthModalProps {
  onClose: () => void;
}

export function AuthModal({ onClose }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function switchTab(t: Tab) {
    setTab(t);
    setError("");
    setSuccessMsg("");
    setEmail("");
    setPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    if (tab === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) { setError(error.message); return; }
      onClose();
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) { setError(error.message); return; }
      setSuccessMsg("🎉 Check your inbox for a confirmation link!");
    }
  }

  async function handleMagicLink() {
    if (!email) { setError("Enter your email first."); return; }
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSuccessMsg("📧 Magic link sent! Check your inbox.");
  }

  async function handleGoogle() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) { setError(error.message); setLoading(false); }
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15,23,42,0.45)",
        backdropFilter: "blur(6px)",
        padding: "20px",
        animation: "fadeIn 0.18s ease",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.8)",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 32px 64px rgba(15,23,42,0.18), 0 8px 24px rgba(16,185,129,0.1)",
          padding: "28px 28px 24px",
          position: "relative",
          animation: "slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            background: "transparent",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            color: "#94a3b8",
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em" }}>LexEasy</div>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            {tab === "login" ? "Sign in to your account" : "Create a free account"}
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: "flex",
          background: "rgba(15,23,42,0.06)",
          borderRadius: 12,
          padding: 3,
          marginBottom: 20,
          gap: 3,
        }}>
          {(["login", "signup"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              style={{
                flex: 1,
                border: "none",
                borderRadius: 9,
                padding: "8px 0",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.18s ease",
                background: tab === t ? "#ffffff" : "transparent",
                color: tab === t ? "#0f172a" : "#64748b",
                boxShadow: tab === t ? "0 1px 4px rgba(15,23,42,0.12)" : "none",
              }}
            >
              {t === "login" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        {successMsg ? (
          <div style={{
            borderRadius: 12,
            border: "1px solid rgba(16,185,129,0.3)",
            background: "rgba(16,185,129,0.08)",
            padding: "14px 16px",
            color: "#065f46",
            fontSize: 14,
            textAlign: "center",
            lineHeight: 1.6,
          }}>
            {successMsg}
          </div>
        ) : (
          <>
            {/* Google */}
            <button
              id="auth-google"
              className="authSocialBtn"
              onClick={handleGoogle}
              disabled={loading}
              style={{ marginBottom: 0 }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="authDivider"><span>or</span></div>

            {/* Email / Password form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="authLabel" htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  className="authInput"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="authLabel" htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  className="authInput"
                  type="password"
                  placeholder={tab === "signup" ? "Min 6 characters" : "••••••••"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={tab === "signup" ? 6 : undefined}
                  autoComplete={tab === "signup" ? "new-password" : "current-password"}
                />
              </div>

              {error && <div className="error">{error}</div>}

              <button
                id="auth-submit"
                type="submit"
                className="cta"
                disabled={loading}
                style={{ width: "100%", marginTop: 2 }}
              >
                {loading
                  ? (tab === "login" ? "Signing in…" : "Creating account…")
                  : (tab === "login" ? "Sign in →" : "Create free account →")}
              </button>
            </form>

            {/* Magic link — only on login tab */}
            {tab === "login" && (
              <button
                id="auth-magic"
                onClick={handleMagicLink}
                disabled={loading}
                style={{
                  marginTop: 10,
                  width: "100%",
                  background: "transparent",
                  border: "1px solid rgba(16,185,129,0.3)",
                  borderRadius: 12,
                  padding: "10px 18px",
                  color: "var(--green-deep)",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                ✉️ Send magic link instead
              </button>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)     scale(1);    }
        }
      `}</style>
    </div>
  );
}
