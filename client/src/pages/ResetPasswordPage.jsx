import React, { useState } from "react";
import api from "../api";

export default function ResetPasswordPage({ token }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (newPassword !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await api.post("/reset-password", { token, newPassword });
      setDone(true);
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
          <p className="text-slate-400 text-sm mt-1">Choose a new password</p>
        </div>

        {done ? (
          <div className="bg-green-500/20 border border-green-500 text-green-300 text-sm px-3 py-3 rounded mb-4 text-center">
            ✅ Password reset! You can now log in with your new password.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/20 border border-red-500 text-red-300 text-sm px-3 py-2 rounded text-center">
                {error}
              </div>
            )}
            <div>
              <label className="text-slate-300 text-sm block mb-1">New Password</label>
              <input
                className="w-full p-2 rounded bg-[#0f1724] text-white border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
                type="password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
              <p className="text-slate-500 text-xs mt-1">Not case-sensitive</p>
            </div>
            <div>
              <label className="text-slate-300 text-sm block mb-1">Confirm New Password</label>
              <input
                className="w-full p-2 rounded bg-[#0f1724] text-white border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
                type="password"
                placeholder="Repeat new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold py-2 rounded transition-colors text-sm"
            >
              {loading ? "Resetting..." : "Reset password"}
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
