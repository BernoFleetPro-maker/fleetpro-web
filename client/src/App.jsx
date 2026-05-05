// src/App.jsx
import React from "react";
import { Routes, Route } from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import Sidebar from "./components/Sidebar";

import MapView from "./pages/MapView";
import Tasks from "./pages/Tasks";
import Drivers from "./pages/Drivers";
import Vehicles from "./pages/Vehicles";
import LoadingPoints from "./pages/LoadingPoints";
import DropoffPoints from "./pages/DropoffPoints";
import Settings from "./pages/Settings";

import Clients from "./pages/Clients";

function getAuthPayload() {
  const token = localStorage.getItem("fleetpro_token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem("fleetpro_token");
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export default function App() {
  const payload = getAuthPayload();

  if (!payload) {
    return <LoginPage onLogin={() => window.location.reload()} />;
  }

  const role = payload.role || "admin";
  const isAdmin = role === "admin";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} user={payload} />
      <div className="flex-1 bg-slate-50 overflow-auto min-w-0">
        <Routes>
          <Route path="/"               element={<MapView role={role} clientId={payload.clientId} />} />
          <Route path="/tasks"          element={<Tasks role={role} clientId={payload.clientId} permission={payload.permission || "view"} />} />
          {isAdmin && <Route path="/drivers"        element={<Drivers />} />}
          {isAdmin && <Route path="/vehicles"       element={<Vehicles />} />}
          {isAdmin && <Route path="/loading-points" element={<LoadingPoints />} />}
          {isAdmin && <Route path="/dropoff-points" element={<DropoffPoints />} />}
          {isAdmin && <Route path="/clients"        element={<Clients />} />}
          {isAdmin && <Route path="/settings"       element={<Settings />} />}
          <Route path="*" element={<MapView role={role} clientId={payload.clientId} />} />
        </Routes>
      </div>
    </div>
  );
}
