import React, { useState } from "react";
import api from "../api";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
  e.preventDefault();
  try {
    const res = await api.post("/login", { username, password });
    if (res.data.success) {
      localStorage.setItem("fleetpro_auth", "yes");
      onLogin();
    } else {
      setError("Incorrect username");
    }
  } catch {
    setError("Incorrect password");
  }
}

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleSubmit} className="p-6 bg-white shadow rounded space-y-4 w-80">
        <h2 className="text-lg font-bold text-center">FleetPro Login</h2>
        {error && <div className="text-red-600 text-center">{error}</div>}
        <input className="input" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} />
        <input className="input" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="btn w-full bg-blue-600 text-white rounded py-2">Login</button>
      </form>
    </div>
  );
}
