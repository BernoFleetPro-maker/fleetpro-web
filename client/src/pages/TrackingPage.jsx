import React, { useEffect, useRef, useState, useCallback } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";
const POLL_MS = 20000; // live position refresh — roughly matches the admin map's own cadence

const STATUS_LABELS = { unassigned: "Unassigned", todo: "To Do", inprogress: "In Progress", completed: "Completed" };
const PHASE_COLORS = { to_load: "#1e88e5", at_load: "#1e88e5", to_drop: "#43a047", at_drop: "#43a047" };
const PHASE_LABELS = { to_load: "🚛 En route to loading", at_load: "🏭 At loading station", to_drop: "🚛 En route to dropoff", at_drop: "✅ Arrived at client" };

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatShortDate(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTH_ABBR[m - 1]}`;
}

// Same Excel-serial-or-ISO handling as MapView.jsx's own formatDate, since
// this is the exact same tracking-provider `dt` value passed straight
// through the backend.
function formatUpdatedAt(dtValue) {
  if (!dtValue) return "Unknown";
  const num = Number(dtValue);
  let date;
  try {
    if (!Number.isFinite(num)) date = new Date(dtValue);
    else if (num > 30000) date = new Date((num - 25569) * 86400 * 1000);
    else date = new Date();
    date = new Date(date.getTime() - 2 * 60 * 60 * 1000);
    return date.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch { return "Invalid date"; }
}

function formatDueDate(date, time) {
  if (!date) return null;
  try {
    const d = new Date(date + "T00:00:00");
    const dayStr = d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    return time ? `${dayStr} @ ${time}` : dayStr;
  } catch { return date; }
}

function arrivalClock(mins) {
  const a = new Date(Date.now() + (mins || 0) * 60000);
  return a.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Johannesburg" });
}

function escapeHtml(s) {
  return (s ?? "—").toString().replace(/</g, "&lt;");
}

// Directional arrow rotated to heading when moving, a stationary red dot
// when nearly stopped — identical thresholds/colors to MapView.jsx's
// getSymbolIcon, so a vehicle looks the same here as it does on the admin map.
function vehicleIcon(g, position) {
  const speed = Number(position?.speed || 0);
  if (speed < 5) {
    return { path: g.maps.SymbolPath.CIRCLE, scale: 6, fillColor: "#ff3b30", fillOpacity: 1, strokeColor: "#000", strokeWeight: 1 };
  }
  return {
    path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6, rotation: Number(position?.heading || 0),
    fillColor: speed > 40 ? "#007bff" : "#FFA500", fillOpacity: 1, strokeColor: "#000", strokeWeight: 1,
  };
}

// Read-only subset of MapView.jsx's admin info window — same vehicle
// telemetry and active-task detail, deliberately without the buttons that
// mutate data (manual phase override, save point, availability toggle) or
// deep-link into the authenticated app, since this page has no login and no
// session to act as. `t` is always looked up fresh at click time (see
// tasksByIdRef below), never a value closed over when the marker was made,
// so the popup can't go stale as new polls come in.
// Compact on purpose — Google's InfoWindow silently adds its own internal
// scrollbar once content exceeds the space it's willing to give a popup,
// and there's no API to raise that limit. The only lever is keeping content
// short: smaller type, tighter spacing, related facts merged onto one line
// (still every field MapView shows, just laid out denser) rather than
// dropping any of it.
function infoWindowHtml(t) {
  if (!t) return `<div style="font-family:Arial,sans-serif;font-size:11px;padding:2px;">Loading…</div>`;
  const p = t.position;
  const phaseColor = t.phase ? (PHASE_COLORS[t.phase] || "#555") : "#555";
  const phaseLabel = t.phase ? (PHASE_LABELS[t.phase] || "") : "";
  const dueDate = formatDueDate(t.date, t.pickupTime);
  const etaParts = [];
  if (t.eta) etaParts.push(`⏱ ${escapeHtml(t.eta)}`);
  if (t.etaDistance) etaParts.push(`📍 ${escapeHtml(t.etaDistance)}`);
  if (t.etaMins != null) etaParts.push(`🕐 ≈${arrivalClock(t.etaMins)}`);

  return `<div style="font-family:Arial,sans-serif;font-size:10px;line-height:1.3;width:100%;max-width:225px;box-sizing:border-box;overflow:hidden;word-break:break-word;">
    <div style="font-weight:700;color:#111;font-size:12px;">${escapeHtml(t.vehicleReg || "Vehicle")}</div>
    ${p ? `
    <div style="color:#666;">${formatUpdatedAt(p.dt)} · ${p.speed || 0} km/h</div>
    <div style="color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📍 ${escapeHtml(p.address || `${p.lat}, ${p.lon}`)}</div>` : ""}
    <hr style="margin:3px 0;border:none;border-top:1px solid #e0e0e0;"/>
    <div style="font-weight:700;color:#1e88e5;">📦 ${escapeHtml(t.orderNumber ? "#" + t.orderNumber : "Load")} <span style="color:#666;font-weight:400;">· 👤 ${escapeHtml(t.driverName)}</span></div>
    <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(t.loadLocation)} → ${escapeHtml(t.dropoffLocation)}</div>
    ${dueDate ? `<div>Due: <span style="color:#f59e0b;font-weight:600;">${dueDate}</span></div>` : ""}
    ${phaseLabel ? `<div style="background:${phaseColor};color:#fff;border-radius:4px;padding:2px 5px;font-weight:600;margin-top:2px;text-align:center;">${phaseLabel}</div>` : ""}
    ${etaParts.length ? `<div style="text-align:center;margin-top:2px;color:#333;font-weight:600;">${etaParts.join(" · ")}</div>` : ""}
  </div>`;
}

// Public page — no login, reached only via a link the WhatsApp bot sends.
// Kept deliberately small and self-contained rather than reusing MapView.jsx,
// which is ~950 lines of tightly-coupled admin logic (SSE, availability
// toggles, client-list fetching) with no business running unauthenticated.
export default function TrackingPage({ token }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const mapDivRef     = useRef(null);
  const mapObjRef      = useRef(null);
  const markersRef     = useRef(new Map());  // taskId -> google.maps.Marker
  const infoWindowRef  = useRef(null);
  const boundsFitRef    = useRef(false); // only auto-fit the viewport once, so manual pan/zoom (incl. click-to-focus) isn't fought every poll
  const tasksByIdRef   = useRef(new Map()); // always-current task data, so a click reads fresh info even if the marker itself is several polls old
  const openTaskIdRef  = useRef(null); // which task's info window is currently open, if any — self-tracked rather than read back from the Maps API

  const load = useCallback(() => {
    fetch(`${API}/track/${token}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Failed to load tracking data");
        setData(body);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const map = new Map();
    (data?.tasks || []).forEach((t) => map.set(t.id, t));
    tasksByIdRef.current = map;
  }, [data]);

  const openInfoFor = useCallback((taskId, marker) => {
    const map = mapObjRef.current;
    const latest = tasksByIdRef.current.get(taskId);
    if (!map || !marker || !latest) return;
    infoWindowRef.current.setContent(infoWindowHtml(latest));
    infoWindowRef.current.open(map, marker);
    openTaskIdRef.current = taskId;
  }, []);

  const focusTask = useCallback((t) => {
    const map = mapObjRef.current;
    const marker = markersRef.current.get(t.id);
    if (!map || !marker) return;
    map.panTo(marker.getPosition());
    map.setZoom(15);
    openInfoFor(t.id, marker);
  }, [openInfoFor]);

  // Creates the map once, then on every subsequent poll only moves/adds/
  // removes markers in place — never re-fits or re-centers after the first
  // draw, so a manual pan/zoom (or a click-to-focus) isn't undone every 20s.
  useEffect(() => {
    const withPosition = data?.tasks?.filter((t) => t.position) || [];
    if (withPosition.length === 0) return;

    let pollTimer;
    function draw() {
      const g = window.google;
      if (!g?.maps || !mapDivRef.current) { pollTimer = setTimeout(draw, 200); return; }

      if (!mapObjRef.current) {
        mapObjRef.current = new g.maps.Map(mapDivRef.current, { zoom: 10, streetViewControl: false, mapTypeControl: false });
        infoWindowRef.current = new g.maps.InfoWindow({ maxWidth: 260 });
        infoWindowRef.current.addListener("closeclick", () => { openTaskIdRef.current = null; });
      }
      const map = mapObjRef.current;

      const seenIds = new Set();
      const bounds = new g.maps.LatLngBounds();
      withPosition.forEach((t) => {
        seenIds.add(t.id);
        const pos = { lat: t.position.lat, lng: t.position.lon };
        bounds.extend(pos);
        const icon = vehicleIcon(g, t.position);

        let marker = markersRef.current.get(t.id);
        if (!marker) {
          marker = new g.maps.Marker({ position: pos, map, title: t.vehicleReg || t.orderNumber || "Load", icon });
          marker.addListener("click", () => openInfoFor(t.id, marker));
          markersRef.current.set(t.id, marker);
        } else {
          marker.setPosition(pos);
          marker.setIcon(icon);
        }
      });

      // Drop markers for tasks that no longer have (or no longer exist with) a position
      for (const [id, marker] of markersRef.current) {
        if (!seenIds.has(id)) { marker.setMap(null); markersRef.current.delete(id); }
      }

      // If an info window is currently open for one of these markers, refresh
      // its content too — otherwise it'd sit there showing an increasingly
      // stale ETA/speed until the visitor closes and reopens it.
      const openId = openTaskIdRef.current;
      if (openId && markersRef.current.has(openId)) {
        openInfoFor(openId, markersRef.current.get(openId));
      }

      if (!boundsFitRef.current) {
        map.fitBounds(bounds);
        boundsFitRef.current = true;
      }
    }
    draw();
    return () => { if (pollTimer) clearTimeout(pollTimer); };
  }, [data, openInfoFor]);

  function renderTaskCard(t) {
    const isInProgress = t.status === "inprogress";
    const badge = isInProgress && t.phaseDest ? (
      t.arrived
        ? { icon: "✅", text: "Arrived", bg: "#064e3b", fg: "#6ee7b7" }
        : { icon: "⏱", text: t.eta || "En route", bg: t.phase === "to_load" ? "#1e3a5f" : "#14532d", fg: t.phase === "to_load" ? "#93c5fd" : "#86efac" }
    ) : null;

    return (
      <div key={t.id} onClick={() => t.position && focusTask(t)}
        style={{ background: "#1e293b", borderRadius: 8, padding: 14, cursor: t.position ? "pointer" : "default" }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {t.title || "Load"}{t.orderNumber && <span style={{ color: "#64748b", fontWeight: 400 }}> #{t.orderNumber}</span>}
        </div>
        <div style={{ fontSize: 13, color: "#cbd5e1", marginTop: 4 }}>
          {t.loadLocation || "—"} → {t.dropoffLocation || "—"}
        </div>
        {(t.driverName || t.vehicleReg) && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
            {t.driverName && <span>👤 {t.driverName}</span>}
            {t.driverName && t.vehicleReg && "  "}
            {t.vehicleReg && <span>🚚 {t.vehicleReg}</span>}
          </div>
        )}
        {(t.date || t.pickupTime) && (
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
            {t.date}{t.pickupTime ? ` drop @${t.pickupTime}` : ""}
          </div>
        )}
        {badge ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.fg }}>
            <span>{badge.icon}</span>
            <span>{badge.text}</span>
            {t.phaseDest && <><span style={{ opacity: 0.6 }}>·</span><span>{t.phaseDest}</span></>}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{STATUS_LABELS[t.status] || t.status}</div>
        )}
      </div>
    );
  }

  const todayTasks    = data?.tasks?.filter((t) => t.dateGroup === "today") || [];
  const tomorrowTasks = data?.tasks?.filter((t) => t.dateGroup === "tomorrow") || [];

  return (
    <div style={{ minHeight: "100vh", background: "#0f1724", color: "#fff", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>📍 FleetPro Tracking</h1>

        {loading && <p style={{ color: "#94a3b8" }}>Loading…</p>}

        {!loading && error && (
          <div style={{ background: "#1e293b", border: "1px solid #dc2626", borderRadius: 8, padding: 16, marginTop: 16, color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {!loading && data && (
          <>
            <p style={{ color: "#94a3b8", marginTop: 0, marginBottom: 20 }}>{data.clientName}</p>

            {data.tasks.length === 0 ? (
              <div style={{ background: "#1e293b", borderRadius: 8, padding: 24, textAlign: "center", color: "#64748b" }}>
                No active loads right now.
              </div>
            ) : (
              <>
                {data.tasks.some((t) => t.position) && (
                  <div ref={mapDivRef} style={{ width: "100%", height: 320, borderRadius: 8, overflow: "hidden", marginBottom: 20, background: "#1e293b" }} />
                )}

                {todayTasks.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", margin: "0 0 8px" }}>📅 Today ({formatShortDate(data.today)})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: tomorrowTasks.length ? 20 : 0 }}>
                      {todayTasks.map(renderTaskCard)}
                    </div>
                  </>
                )}

                {tomorrowTasks.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", margin: "0 0 8px" }}>📅 Tomorrow ({formatShortDate(data.tomorrow)})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {tomorrowTasks.map(renderTaskCard)}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
