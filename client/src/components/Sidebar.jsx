// src/components/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <div className="w-72 bg-[#0f1724] text-white flex flex-col">
      {/* Header */}
      <div className="p-4 text-lg font-bold border-b border-slate-700">
        FleetPro
      </div>

      <nav className="flex-1">
        {/* Map */}
        <NavLink
          to="/"
          className={({ isActive }) =>
            "flex items-center gap-3 p-4 hover:bg-slate-700 " +
            (isActive ? "bg-slate-800" : "")
          }
        >
          <span>📍</span> Map
        </NavLink>

        {/* Tasks */}
        <NavLink
          to="/tasks"
          className={({ isActive }) =>
            "flex items-center gap-3 p-4 hover:bg-slate-700 " +
            (isActive ? "bg-slate-800" : "")
          }
        >
          <span>📋</span> Tasks
        </NavLink>

        {/* Divider */}
        <div className="h-px bg-slate-700 mx-4 my-2"></div>

        {/* Management Section */}
        <div className="px-4 text-xs uppercase tracking-wider text-slate-400 mb-1">
          Management
        </div>

        {/* Drivers */}
        <NavLink
          to="/drivers"
          className={({ isActive }) =>
            "flex items-center gap-3 p-4 hover:bg-slate-700 " +
            (isActive ? "bg-slate-800" : "")
          }
        >
          <span>🧑‍✈️</span> Drivers
        </NavLink>

        {/* Vehicles */}
        <NavLink
          to="/vehicles"
          className={({ isActive }) =>
            "flex items-center gap-3 p-4 hover:bg-slate-700 " +
            (isActive ? "bg-slate-800" : "")
          }
        >
          <span>🚚</span> Vehicles
        </NavLink>

        {/* Loading Points */}
        <NavLink
          to="/loading-points"
          className={({ isActive }) =>
            "flex items-center gap-3 p-4 hover:bg-slate-700 " +
            (isActive ? "bg-slate-800" : "")
          }
        >
          <span>📦</span> Loading Points
        </NavLink>

        {/* Dropoff Points */}
        <NavLink
          to="/dropoff-points"
          className={({ isActive }) =>
            "flex items-center gap-3 p-4 hover:bg-slate-700 " +
            (isActive ? "bg-slate-800" : "")
          }
        >
          <span>🏁</span> Dropoff Points
        </NavLink>

        {/* Divider */}
        <div className="h-px bg-slate-700 mx-4 my-2"></div>

        {/* Settings */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            "flex items-center gap-3 p-4 hover:bg-slate-700 " +
            (isActive ? "bg-slate-800" : "")
          }
        >
          <span>⚙</span> Settings
        </NavLink>
      </nav>

         <button
  onClick={() => {
    localStorage.removeItem("fleetpro_auth");
    window.location.reload();
  }}
  className="mt-auto p-3 text-sm font-semibold text-red-600 hover:text-red-800"
>
  Logout
</button>
   

      {/* Footer */}
      <div className="p-4 text-sm text-slate-300 border-t border-slate-700">
        Logged in as<br />
        <strong>Berno Strubing</strong>
      </div>
    </div>
  );
}
