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

function isLoggedIn() {
  const token = localStorage.getItem("fleetpro_token");
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem("fleetpro_token");
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export default function App() {
  const authed = isLoggedIn();

  if (!authed) {
    return <LoginPage onLogin={() => window.location.reload()} />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 bg-slate-50 overflow-auto min-w-0">
        <Routes>
          <Route path="/"               element={<MapView />} />
          <Route path="/tasks"          element={<Tasks />} />
          <Route path="/drivers"        element={<Drivers />} />
          <Route path="/vehicles"       element={<Vehicles />} />
          <Route path="/loading-points" element={<LoadingPoints />} />
          <Route path="/dropoff-points" element={<DropoffPoints />} />
          <Route path="/settings"       element={<Settings />} />
        </Routes>
      </div>
    </div>
  );
}
