// src/components/Sidebar.jsx
import React, { useState } from "react";
import { NavLink } from "react-router-dom";

const ADMIN_LINKS = [
  { to: "/",               icon: "📍", label: "Map" },
  { to: "/tasks",          icon: "📋", label: "Tasks" },
  { divider: true },
  { section: "Management" },
  { to: "/drivers",        icon: "🧑‍✈️", label: "Drivers" },
  { to: "/vehicles",       icon: "🚚", label: "Vehicles" },
  { to: "/loading-points", icon: "📦", label: "Loading Points" },
  { to: "/dropoff-points", icon: "🏁", label: "Dropoff Points" },
  { to: "/clients",        icon: "🏢", label: "Clients" },
  { to: "/controllers",    icon: "👔", label: "Controllers", svgIcon: true },
  { divider: true },
  { to: "/settings",       icon: "⚙",  label: "Settings" },
];

const CLIENT_LINKS = [
  { to: "/",     icon: "📍", label: "Map" },
  { to: "/tasks", icon: "📋", label: "Tasks" },
];

// Controllers get same links as admin
const CONTROLLER_LINKS = ADMIN_LINKS;

export default function Sidebar({ role = "admin", user = {} }) {
  const LINKS = role === "admin" ? ADMIN_LINKS
              : role === "controller" ? CONTROLLER_LINKS
              : CLIENT_LINKS;
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
              {item.svgIcon ? (
                <span className="leading-none flex items-center" dangerouslySetInnerHTML={{__html: `<svg width="22" height="22" viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg"><ellipse cx="50" cy="38" rx="22" ry="26" fill="#d4a574"/><ellipse cx="50" cy="18" rx="22" ry="12" fill="#2c1a0e"/><rect x="28" y="12" width="44" height="14" rx="4" fill="#2c1a0e"/><ellipse cx="28" cy="40" rx="4" ry="6" fill="#c8956a"/><ellipse cx="72" cy="40" rx="4" ry="6" fill="#c8956a"/><ellipse cx="40" cy="36" rx="4" ry="4.5" fill="white"/><ellipse cx="60" cy="36" rx="4" ry="4.5" fill="white"/><circle cx="41" cy="37" r="2.5" fill="#1a0a00"/><circle cx="61" cy="37" r="2.5" fill="#1a0a00"/><path d="M36 30 Q40 27 44 30" fill="none" stroke="#2c1a0e" stroke-width="2" stroke-linecap="round"/><path d="M56 30 Q60 27 64 30" fill="none" stroke="#2c1a0e" stroke-width="2" stroke-linecap="round"/><path d="M43 54 Q50 58 57 54" fill="none" stroke="#8b4513" stroke-width="1.8" stroke-linecap="round"/><rect x="43" y="62" width="14" height="14" rx="2" fill="#d4a574"/><polygon points="50,74 38,82 38,130 62,130 62,82" fill="#111111"/><polygon points="50,74 38,82 34,94 46,86" fill="#1a1a1a"/><polygon points="50,74 62,82 66,94 54,86" fill="#1a1a1a"/><polygon points="46,76 54,76 56,108 50,115 44,108" fill="#cc1111"/><polygon points="44,108 50,115 56,108 52,102 48,102" fill="#991100"/><polygon points="46,74 54,74 56,82 50,86 44,82" fill="#dd2222"/><rect x="6" y="82" width="14" height="46" rx="5" fill="#111111"/><rect x="80" y="82" width="14" height="46" rx="5" fill="#111111"/></svg>`}} />
              ) : (
                <span className="text-lg leading-none">{item.icon}</span>
              )}
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
          <strong className="text-slate-300">{user.displayName || user.clientName || user.username || "Admin"}</strong>
          {role === "client" && <span className="ml-1 text-blue-400">(Client)</span>}
          {role === "controller" && <span className="ml-1 text-purple-400">(Controller)</span>}
        </div>
      )}
    </div>
  );
}
