import React, { useState } from "react";
import api from "../api";

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!username.trim()) { setError("Enter your username."); return; }
    setLoading(true);
    try {
      const res = await api.post("/forgot-password", { username: username.trim() });
      // Always the backend's own generic message — deliberately the same
      // whether or not the username exists, so this page can't be used to
      // check who has an account.
      setMessage(res.data?.message || "If an account with that username exists and has an email on file, a password reset link has been sent.");
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-[#0f1724]">
      <div className="bg-[#1e293b] p-8 rounded-xl shadow-xl w-80 border border-slate-700">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">FleetPro</h1>
          <p className="text-slate-400 text-sm mt-1">Reset your password</p>
        </div>

        {message ? (
          <div className="bg-green-500/20 border border-green-500 text-green-300 text-sm px-3 py-3 rounded mb-4 text-center">
            {message}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/20 border border-red-500 text-red-300 text-sm px-3 py-2 rounded text-center">
                {error}
              </div>
            )}
            <div>
              <label className="text-slate-300 text-sm block mb-1">Username</label>
              <input
                className="w-full p-2 rounded bg-[#0f1724] text-white border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
                placeholder="Your login username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
              <p className="text-slate-500 text-xs mt-1">If your account has an email on file, we'll send a reset link there.</p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold py-2 rounded transition-colors text-sm"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <div className="text-center mt-4">
          {/* Plain <a> — see LoginPage.jsx's "Forgot password?" link for why */}
          <a href="/login" className="text-slate-400 hover:text-slate-300 text-sm">← Back to login</a>
        </div>
      </div>
    </div>
  );
}
