// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate, Link } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import Sidebar from "./components/Sidebar";
import SuperAdminPanel from "./pages/SuperAdminPanel";

import MapView from "./pages/MapView";
import Tasks from "./pages/Tasks";
import Drivers from "./pages/Drivers";
import Vehicles from "./pages/Vehicles";
import LoadingPoints from "./pages/LoadingPoints";
import DropoffPoints from "./pages/DropoffPoints";
import Settings from "./pages/Settings";

import Clients from "./pages/Clients";
import Staff from "./pages/Staff";
import TrackingPage from "./pages/TrackingPage";

import { playAvailableSound } from "./utils/soundPrefs";
import { canSeeStaffItem } from "./utils/staffAccess";

const API = "https://fleetpro-backend-production.up.railway.app/api";

function authFetch(url, opts = {}) {
  const token = localStorage.getItem("fleetpro_token") || "";
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...(opts.headers || {}) },
  });
}

// Live count of vehicles currently marked "available to load" — visible in
// the sidebar badge for every logged-in role. /api/positions is already
// scoped per-role (clients only see what they're allowed to), so counting
// `available === true` there gives the right number for whoever's asking.
function useAvailableVehicleCount(enabled, tenantId, role, clientId) {
  const [count, setCount] = useState(0);
  // Authoritative set of currently-available vehicle ids that also have live
  // position data — i.e. the same set the map is able to draw a marker for.
  // The periodic poll below rebuilds both refs from scratch as reconciliation.
  const availableIdsRef = useRef(new Set());
  // Every vehicleId present in the last /api/positions response, available
  // or not. Used to decide whether an SSE event can be applied to the count
  // immediately, or whether we first need a refetch (e.g. a vehicle just
  // marked available whose tracker hasn't reported a position yet — counting
  // it before it's fetched would show a badge number with no matching marker).
  const knownIdsRef = useRef(new Set());

  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await authFetch(`${API}/positions`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) {
          knownIdsRef.current = new Set(data.filter(v => v.vehicleId).map(v => v.vehicleId));
          availableIdsRef.current = new Set(
            data.filter(v => v.available === true && v.vehicleId).map(v => v.vehicleId)
          );
          setCount(availableIdsRef.current.size);
        }
      } catch {}
    };

    refresh();
    const poll = setInterval(refresh, 30000);

    // A vehicle can now be restricted to specific clients — this is the only
    // way to know for sure whether a given position is meant for *this*
    // viewer. Admin/staff always see everything.
    const isVisibleToMe = (pos) => {
      if (role !== "client") return true;
      return pos.available === true && (
        pos.availableToAll !== false ||
        (pos.availableClientIds || []).map(String).includes(String(clientId))
      );
    };

    // SSE push — updates the count and plays the notification sound (mute-
    // aware) the instant an event arrives, instead of waiting for the next
    // poll. Exponential backoff on drop, same pattern as Tasks.jsx — the 30s
    // poll above keeps the count correct even if the stream never reconnects.
    let sse;
    let sseRetries = 0;
    let sseRetryTimeout;
    const MAX_SSE_RETRIES = 5;

    const connectSSE = () => {
      try {
        sse = new EventSource(`${API}/stream/events`);
        sse.onmessage = (e) => {
          sseRetries = 0;
          try {
            const msg = JSON.parse(e.data);
            // Broadcasts aren't tenant-scoped server-side — filter here so a
            // staff/client token only reacts to its own tenant's vehicles.
            // (30s poll self-corrects if this ever misses something.)
            if (tenantId && msg.data?.tenantId && msg.data.tenantId !== tenantId) return;
            if (msg.type === "vehicle_available" && msg.data?.id) {
              const pos = msg.data.position;
              if (pos) {
                // We have the full position — this is the only way to know
                // for sure this client is allowed to see it (an admin may
                // have narrowed the client list while leaving available on).
                if (isVisibleToMe(pos)) {
                  knownIdsRef.current.add(msg.data.id);
                  availableIdsRef.current.add(msg.data.id);
                  setCount(availableIdsRef.current.size);
                  playAvailableSound();
                } else {
                  // Available, but not for this client — make sure it isn't
                  // still counted from before it got restricted.
                  availableIdsRef.current.delete(msg.data.id);
                  setCount(availableIdsRef.current.size);
                }
              } else if (knownIdsRef.current.has(msg.data.id)) {
                // No position data, but we've already confirmed visibility
                // for this vehicle via a previous fetch.
                availableIdsRef.current.add(msg.data.id);
                setCount(availableIdsRef.current.size);
                playAvailableSound();
              } else {
                // No cached position at all (vehicle has no live GPS) —
                // refetch instead of guessing, so the badge never shows a
                // number the map can't back up with a visible marker.
                refresh();
              }
            } else if (msg.type === "vehicle_unavailable" && msg.data?.id) {
              availableIdsRef.current.delete(msg.data.id);
              setCount(availableIdsRef.current.size);
            }
          } catch {}
        };
        sse.onerror = () => {
          sse.close();
          if (sseRetries < MAX_SSE_RETRIES) {
            const delay = Math.min(1000 * Math.pow(2, sseRetries), 30000);
            sseRetries++;
            sseRetryTimeout = setTimeout(connectSSE, delay);
          }
        };
      } catch {}
    };
    connectSSE();

    return () => { cancelled = true; clearInterval(poll); clearTimeout(sseRetryTimeout); if (sse) sse.close(); };
  }, [enabled, tenantId, role, clientId]);

  return count;
}

// Count of driver documents expiring within 30 days — staff/admin only
// (not client-visible). A document's expiry doesn't change in real time the
// way vehicle availability does, so a periodic poll is enough — no SSE.
function useExpiringDocsCount(enabled) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await authFetch(`${API}/drivers/expiring-count`);
        const data = await res.json();
        if (!cancelled && typeof data.count === "number") setCount(data.count);
      } catch {}
    };

    refresh();
    const poll = setInterval(refresh, 60000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [enabled]);

  return count;
}

// Same pattern as useExpiringDocsCount above — combined vehicle+trailer
// count (the sidebar only has one "Vehicles" nav item covering both).
function useExpiringVehicleDocsCount(enabled) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await authFetch(`${API}/vehicles/expiring-count`);
        const data = await res.json();
        if (!cancelled && typeof data.count === "number") setCount(data.count);
      } catch {}
    };

    refresh();
    const poll = setInterval(refresh, 60000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [enabled]);

  return count;
}

// Same polling shape as the two hooks above, but there's no dedicated
// count endpoint for this one — GET /api/whatsapp/groups already returns
// the full list (staff/admin use it directly on the Clients page too), so
// counting unmapped rows client-side avoids a second near-duplicate route
// for what's a small, infrequently-changing list.
function useUnmappedWhatsappGroupsCount(enabled) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await authFetch(`${API}/whatsapp/groups`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setCount(data.filter(g => !g.clientId).length);
        }
      } catch {}
    };

    refresh();
    const poll = setInterval(refresh, 60000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [enabled]);

  return count;
}

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

function NoAccessMessage({ label }) {
  return (
    <div className="h-full flex items-center justify-center text-slate-500">
      <div className="text-center max-w-sm px-6">
        <div className="text-4xl mb-3">🧭</div>
        <p className="font-medium text-slate-700">This page isn't part of your access yet</p>
        <p className="text-sm mt-1">Your admin can turn on {label} for you from the Staff page if you need it.</p>
      </div>
    </div>
  );
}

// Shown at "/" (and as the catch-all fallback) instead of a flat "no access"
// message when a staff/client account can't see the map — this is the very
// first thing a restricted account sees on login, so it's framed as a
// welcome and a launchpad to what they *can* reach, not a dead end.
function HomeWelcome({ displayName, tenantDisplayName, quickLinks }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="h-full flex items-center justify-center text-slate-600 p-6">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">👋</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-1">{greeting}, {displayName}!</h1>
        <p className="text-slate-500 mb-6">
          Welcome to FleetPro{tenantDisplayName ? ` — ${tenantDisplayName}` : ""}. Everything set up for you is in the sidebar.
        </p>
        {quickLinks.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {quickLinks.map(l => (
              <Link key={l.to} to={l.to}
                className="flex items-center gap-2 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors">
                <span>{l.icon}</span> {l.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LoggedOutRoutes() {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route
        path="/"
        element={
          <LandingPage
            onLogin={() => navigate("/login")}
            onSignup={() => navigate("/login")}
          />
        }
      />
      <Route path="/login" element={<LoginPage onLogin={() => window.location.reload()} />} />
      {/* Any other path while logged out goes to the landing page, not straight to login */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  // Public WhatsApp-bot tracking link — bypasses the entire authenticated/
  // logged-out route tree entirely. Checked before any hook in this
  // component runs: an early return before every hook call is safe under
  // the Rules of Hooks, but conditionally skipping just the hooks below
  // would not be. Mirrors the role === "superadmin" early-return just below,
  // which does the same thing for its own separate tree.
  const trackMatch = window.location.pathname.match(/^\/track\/([^/]+)$/);
  if (trackMatch) {
    return <TrackingPage token={trackMatch[1]} />;
  }

  const payload = getAuthPayload();
  // Fail-open on a missing/undefined key, same convention as staff/client
  // permission checks. Admin bypasses tenant feature flags entirely — matches
  // the backend's requireFeature, which does the same (see tenantFeatures.js).
  const canUseFeature = (key) => payload?.role === "admin" || payload?.tenantFeatures?.[key] !== false;
  // Called unconditionally (Rules of Hooks) — internally no-ops when logged
  // out or on the super admin panel, which has no Sidebar to show a badge on.
  const availableCount = useAvailableVehicleCount(
    !!payload && payload.role !== "superadmin" && canUseFeature("availableToLoad"),
    payload?.tenantId, payload?.role, payload?.clientId
  );
  const expiringDocsCount = useExpiringDocsCount(
    !!payload && (payload.role === "admin" || payload.role === "staff") && canUseFeature("complianceDocuments")
  );
  const expiringVehicleDocsCount = useExpiringVehicleDocsCount(
    !!payload && (payload.role === "admin" || payload.role === "staff") && canUseFeature("complianceDocuments")
  );
  const unmappedWhatsappGroupsCount = useUnmappedWhatsappGroupsCount(
    !!payload && (payload.role === "admin" || payload.role === "staff") && canUseFeature("whatsappBot")
  );

  if (!payload) {
    return <LoggedOutRoutes />;
  }

  const role = payload.role || "admin";

  // Super admin gets a completely separate, simple panel — no Sidebar,
  // no MapView, no tenant-scoped routes. It manages every tenant, so it
  // shouldn't be nested inside a layout built for a single tenant's view.
  if (role === "superadmin") {
    const token = localStorage.getItem("fleetpro_token");
    return (
      <SuperAdminPanel
        token={token}
        onLogout={() => {
          localStorage.removeItem("fleetpro_token");
          window.location.reload();
        }}
      />
    );
  }

  const isAdmin        = role === "admin";
  const isStaff        = role === "staff";
  const hasFullAccess  = isAdmin || isStaff;
  const displayName    = payload.staffName || payload.clientName || payload.username || "Admin";

  // Map/Tasks/Settings stay always-mounted (see canSeeMap etc. below) rather
  // than being conditionally mounted like the 6 management routes — the
  // catch-all route already falls through to MapView for any unmatched
  // path, so an unmounted "/" would be silently defeated by it anyway.
  // Self-gating the *element* instead closes that gap for "/" and keeps
  // "/tasks"/"/settings" consistent with it.
  const canSeeMap = isAdmin
    || (isStaff && canSeeStaffItem(role, payload.permissions, "map"))
    || (role === "client" && payload.permissions?.canViewMap !== false);
  const canSeeTasksPage = isAdmin
    || (isStaff && canSeeStaffItem(role, payload.permissions, "tasks"))
    || (role === "client" && payload.permissions?.canViewTasks !== false);
  const canSeeSettingsPage = isAdmin
    || (isStaff && canSeeStaffItem(role, payload.permissions, "settings"))
    || role === "client";

  // Same visibility rules as the routes/sidebar below, mirrored here just to
  // pick which quick links to offer on the welcome screen — not a new
  // source of truth. Settings is deliberately left out: this row is about
  // work destinations, not account admin.
  const quickLinks = [
    canSeeTasksPage && { to: "/tasks", icon: "📋", label: "Tasks" },
    hasFullAccess && canSeeStaffItem(role, payload.permissions, "drivers")       && { to: "/drivers", icon: "🧑‍✈️", label: "Drivers" },
    hasFullAccess && canSeeStaffItem(role, payload.permissions, "vehicles")      && { to: "/vehicles", icon: "🚚", label: "Vehicles" },
    hasFullAccess && canSeeStaffItem(role, payload.permissions, "loadingPoints") && { to: "/loading-points", icon: "📦", label: "Loading Points" },
    hasFullAccess && canSeeStaffItem(role, payload.permissions, "dropoffPoints") && { to: "/dropoff-points", icon: "🏁", label: "Dropoff Points" },
    hasFullAccess && canSeeStaffItem(role, payload.permissions, "clients") && canUseFeature("clientPortal") && { to: "/clients", icon: "🏢", label: "Clients" },
    hasFullAccess && canSeeStaffItem(role, payload.permissions, "staff")         && { to: "/staff", icon: "👔", label: "Staff" },
  ].filter(Boolean);

  const mapElement = canSeeMap
    ? <MapView role={role} clientId={payload.clientId} permissions={payload.permissions} canUseFeature={canUseFeature} />
    : <HomeWelcome displayName={displayName} tenantDisplayName={payload.tenantDisplayName} quickLinks={quickLinks} />;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} user={{ ...payload, displayName }} availableCount={availableCount} expiringDocsCount={expiringDocsCount} expiringVehicleDocsCount={expiringVehicleDocsCount} unmappedWhatsappGroupsCount={unmappedWhatsappGroupsCount} canUseFeature={canUseFeature} />
      <div className="flex-1 bg-slate-50 overflow-auto min-w-0">
        <Routes>
          <Route path="/"      element={mapElement} />
          <Route path="/tasks" element={
            canSeeTasksPage
              ? <Tasks role={role} clientId={payload.clientId} permissions={payload.permissions} userName={displayName} canUseFeature={canUseFeature} />
              : <NoAccessMessage label="tasks" />
          } />
          {hasFullAccess && canSeeStaffItem(role, payload.permissions, "drivers")        && <Route path="/drivers"        element={<Drivers />} />}
          {hasFullAccess && canSeeStaffItem(role, payload.permissions, "vehicles")       && <Route path="/vehicles"       element={<Vehicles />} />}
          {hasFullAccess && canSeeStaffItem(role, payload.permissions, "loadingPoints")  && <Route path="/loading-points" element={<LoadingPoints />} />}
          {hasFullAccess && canSeeStaffItem(role, payload.permissions, "dropoffPoints")  && <Route path="/dropoff-points" element={<DropoffPoints />} />}
          {hasFullAccess && canSeeStaffItem(role, payload.permissions, "clients") && canUseFeature("clientPortal") && <Route path="/clients" element={<Clients canUseFeature={canUseFeature} />} />}
          {hasFullAccess && canSeeStaffItem(role, payload.permissions, "staff")          && <Route path="/staff"          element={<Staff />} />}
          {/* Settings is open to every role — it self-filters its sections
              (client permissions, password change) based on role internally. */}
          <Route path="/settings" element={canSeeSettingsPage ? <Settings canUseFeature={canUseFeature} /> : <NoAccessMessage label="settings" />} />
          <Route path="*" element={mapElement} />
        </Routes>
      </div>
    </div>
  );
}
