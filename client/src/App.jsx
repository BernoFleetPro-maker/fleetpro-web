// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

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
import Controllers from "./pages/Controllers";

import { playAvailableSound } from "./utils/soundPrefs";

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
    // viewer. Admin/controller always see everything.
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
            // controller/client token only reacts to its own tenant's vehicles.
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
  const payload = getAuthPayload();
  // Called unconditionally (Rules of Hooks) — internally no-ops when logged
  // out or on the super admin panel, which has no Sidebar to show a badge on.
  const availableCount = useAvailableVehicleCount(
    !!payload && payload.role !== "superadmin", payload?.tenantId, payload?.role, payload?.clientId
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
  const isController   = role === "controller";
  const hasFullAccess  = isAdmin || isController;
  const displayName    = payload.controllerName || payload.clientName || payload.username || "Admin";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} user={{ ...payload, displayName }} availableCount={availableCount} />
      <div className="flex-1 bg-slate-50 overflow-auto min-w-0">
        <Routes>
          <Route path="/"               element={<MapView role={role} clientId={payload.clientId} />} />
          <Route path="/tasks"          element={<Tasks role={role} clientId={payload.clientId} permission={payload.permission || "view"} userName={displayName} />} />
          {hasFullAccess && <Route path="/drivers"        element={<Drivers />} />}
          {hasFullAccess && <Route path="/vehicles"       element={<Vehicles />} />}
          {hasFullAccess && <Route path="/loading-points" element={<LoadingPoints />} />}
          {hasFullAccess && <Route path="/dropoff-points" element={<DropoffPoints />} />}
          {hasFullAccess && <Route path="/clients"        element={<Clients />} />}
          {hasFullAccess && <Route path="/controllers"    element={<Controllers />} />}
          {/* Settings is now open to every role — it self-filters its sections
              (client permissions, password change) based on role internally. */}
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<MapView role={role} clientId={payload.clientId} />} />
        </Routes>
      </div>
    </div>
  );
}
