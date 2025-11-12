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

export default function App() {
  const authed = localStorage.getItem("fleetpro_auth") === "yes";

  // ✅ User NOT logged in → show login screen
  if (!authed) {
    return <LoginPage onLogin={() => window.location.reload()} />;
  }

  // ✅ User logged in → show dashboard
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 bg-slate-50 overflow-auto">
        <Routes>
          <Route path="/" element={<MapView />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/loading-points" element={<LoadingPoints />} />
          <Route path="/dropoff-points" element={<DropoffPoints />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </div>
  );
}
