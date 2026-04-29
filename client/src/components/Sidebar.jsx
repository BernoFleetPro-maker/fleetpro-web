// src/components/Sidebar.jsx
import React, { useState } from "react";
import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/",               icon: "📍", label: "Map" },
  { to: "/tasks",          icon: "📋", label: "Tasks" },
  { divider: true },
  { section: "Management" },
  { to: "/drivers",        icon: "🧑‍✈️", label: "Drivers" },
  { to: "/vehicles",       icon: "🚚", label: "Vehicles" },
  { to: "/loading-points", icon: "📦", label: "Loading Points" },
  { to: "/dropoff-points", icon: "🏁", label: "Dropoff Points" },
  { divider: true },
  { to: "/settings",       icon: "⚙",  label: "Settings" },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar_collapsed") === "true"
  );

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  };

  return (
    <div
      className="bg-[#0f1724] text-white flex flex-col transition-all duration-200 shrink-0"
      style={{ width: collapsed ? "56px" : "230px" }}
    >
      {/* Header + toggle button */}
      <div className="flex items-center justify-between border-b border-slate-700 h-14 px-3">
        {!collapsed && (
          <span className="text-base font-bold tracking-wide">FleetPro</span>
        )}
        <button
          onClick={toggle}
          className="ml-auto text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700 transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "▶" : "◀"}
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-hidden py-1">
        {LINKS.map((item, i) => {
          if (item.divider) return (
            <div key={`d-${i}`} className="h-px bg-slate-700 mx-3 my-1" />
          );
          if (item.section) return collapsed ? null : (
            <div key={`s-${i}`} className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-500">
              {item.section}
            </div>
          );
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 hover:bg-slate-700 transition-colors ${
                  isActive ? "bg-slate-800" : ""
                } ${collapsed ? "justify-center" : ""}`
              }
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {!collapsed && (
                <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Logout */}
      <button
        onClick={() => {
          localStorage.removeItem("fleetpro_auth");
          localStorage.removeItem("fleetpro_token");
          window.location.reload();
        }}
        className={`p-3 text-sm font-semibold text-red-500 hover:text-red-400 hover:bg-slate-800 transition-colors ${
          collapsed ? "text-center" : "text-left"
        }`}
        title={collapsed ? "Logout" : undefined}
      >
        {collapsed ? "⏻" : "Logout"}
      </button>

      {/* Footer — only when expanded */}
      {!collapsed && (
        <div className="px-4 py-3 text-xs text-slate-400 border-t border-slate-700">
          Logged in as<br />
          <strong className="text-slate-300">Berno Strubing</strong>
        </div>
      )}
    </div>
  );
}
