"use client";
import { useState } from "react";
import "../auth.css";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error || "Registration failed."); setBusy(false); return; }
      window.location.href = "/";
    } catch {
      setErr("Network error. Please try again."); setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand">🌳</div>
        <h1>Create your tree</h1>
        <p className="sub">Pick a username and password</p>
        <label htmlFor="u">Username</label>
        <input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label htmlFor="p">Password</label>
        <input id="p" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="err">{err}</div>}
        <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <div className="switch">Already have an account? <a href="/login">Sign in</a></div>
      </form>
    </div>
  );
}
