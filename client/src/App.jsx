// src/App.jsx
import React from "react";
import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import MapView from "./pages/MapView";
import Tasks from "./pages/Tasks";
import Settings from "./pages/Settings";
import Drivers from "./pages/Drivers";
import Vehicles from "./pages/Vehicles";
import LoadingPoints from "./pages/LoadingPoints";
import DropoffPoints from "./pages/DropoffPoints";

export default function App() {
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
