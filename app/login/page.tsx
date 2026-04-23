"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      router.push("/");
    }
  }

  async function handleMagicLink() {
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setMagicSent(true);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="mesh" />

      {/* Navbar — identical to homepage */}
      <nav className="navbar">
        <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          LexEasy
        </Link>
        <div className="navRight">
          <span className="pill">FREE BETA</span>
        </div>
      </nav>

      {/* Auth card */}
      <section className="hero" style={{ marginBottom: 0 }}>
        <p className="eyebrow">Welcome back</p>
        <h1 style={{ fontSize: "clamp(30px, 5vw, 52px)", marginBottom: 8 }}>
          Sign in to <span>LexEasy</span>
        </h1>
        <p className="sub">Your AI legal assistant is one click away.</p>
      </section>

      <div className="card" style={{ maxWidth: 440, marginTop: 32 }}>
        {magicSent ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Magic link sent!</h2>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Check your inbox at <strong>{email}</strong> and click the link to log in.
            </p>
          </div>
        ) : (
          <>
            {/* Google OAuth */}
            <button
              id="login-google"
              className="authSocialBtn"
              onClick={handleGoogle}
              disabled={loading}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="authDivider">
              <span>or</span>
            </div>

            {/* Email + password form */}
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="authLabel" htmlFor="login-email">Email</label>
                <input
                  id="login-email"
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
                <label className="authLabel" htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  className="authInput"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && <div className="error">{error}</div>}

              <button
                id="login-submit"
                type="submit"
                className="cta"
                disabled={loading}
                style={{ width: "100%", marginTop: 4 }}
              >
                {loading ? "Signing in…" : "Sign in →"}
              </button>
            </form>

            {/* Magic link */}
            <button
              id="login-magic"
              onClick={handleMagicLink}
              disabled={loading}
              style={{
                marginTop: 12,
                width: "100%",
                background: "transparent",
                border: "1px solid rgba(16,185,129,0.3)",
                borderRadius: 12,
                padding: "11px 18px",
                color: "var(--green-deep)",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✉️ Send magic link instead
            </button>

            <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--muted)" }}>
              No account yet?{" "}
              <Link href="/signup" style={{ color: "var(--green-deep)", fontWeight: 600 }}>
                Create one free
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
