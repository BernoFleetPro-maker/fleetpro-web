import React, { useState } from "react";
import api from "../api";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/login", { username, password });
      if (res.data.success && res.data.token) {
        // Store the JWT token — this is how we stay logged in securely
        localStorage.setItem("fleetpro_token", res.data.token);
        onLogin();
      } else {
        setError("Login failed. Please try again.");
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setError("Incorrect username or password.");
      } else {
        setError("Cannot connect to server. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-[#0f1724]">
      <div className="bg-[#1e293b] p-8 rounded-xl shadow-xl w-80 border border-slate-700">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">FleetPro</h1>
          <p className="text-slate-400 text-sm mt-1">Controller Login</p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-300 text-sm px-3 py-2 rounded mb-4 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-slate-300 text-sm block mb-1">Username</label>
            <input
              className="w-full p-2 rounded bg-[#0f1724] text-white border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-slate-300 text-sm block mb-1">Password</label>
            <input
              className="w-full p-2 rounded bg-[#0f1724] text-white border border-slate-600 focus:border-blue-500 focus:outline-none text-sm"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold py-2 rounded transition-colors text-sm"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
