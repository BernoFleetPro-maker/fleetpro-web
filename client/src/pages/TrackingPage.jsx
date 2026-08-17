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

// Excel-serial tracking-provider `dt` value → just "HH:MM" — the popup only
// has room for a compact freshness indicator, not a full timestamp (see
// infoWindowHtml).
function formatShortTime(dtValue) {
  const num = Number(dtValue);
  if (!Number.isFinite(num) || num <= 30000) return "";
  try {
    const date = new Date((num - 25569) * 86400 * 1000 - 2 * 60 * 60 * 1000);
    return date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Johannesburg" });
  } catch { return ""; }
}

function formatDueDateShort(date, time) {
  if (!date) return null;
  try {
    const d = new Date(date + "T00:00:00");
    const dayStr = d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
    return time ? `${dayStr} ${time}` : dayStr;
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
  const dueDate = formatDueDateShort(t.date, t.pickupTime);
  const etaParts = [];
  if (t.eta) etaParts.push(`⏱${escapeHtml(t.eta)}`);
  if (t.etaDistance) etaParts.push(`📍${escapeHtml(t.etaDistance)}`);
  if (t.etaMins != null) etaParts.push(`🕐≈${arrivalClock(t.etaMins)}`);

  return `<div style="font-family:Arial,sans-serif;font-size:10px;line-height:1.2;width:100%;max-width:210px;box-sizing:border-box;overflow:hidden;word-break:break-word;">
    <div style="font-weight:700;color:#111;font-size:12px;">${escapeHtml(t.vehicleReg || "Vehicle")}<span style="color:#888;font-weight:400;font-size:9px;">${p ? ` · ${p.speed || 0}km/h · ${formatShortTime(p.dt)}` : ""}</span></div>
    ${p?.address ? `<div style="color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📍${escapeHtml(p.address)}</div>` : ""}
    <div style="font-weight:700;color:#1e88e5;margin-top:2px;">📦${escapeHtml(t.orderNumber ? "#" + t.orderNumber : "Load")} <span style="color:#666;font-weight:400;">👤${escapeHtml(t.driverName)}</span></div>
    <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(t.loadLocation)}→${escapeHtml(t.dropoffLocation)}</div>
    ${phaseLabel ? `<div style="background:${phaseColor};color:#fff;border-radius:4px;padding:1px 4px;font-weight:600;margin-top:2px;text-align:center;">${phaseLabel}${dueDate ? ` · ${dueDate}` : ""}</div>` : dueDate ? `<div>Due <span style="color:#f59e0b;font-weight:600;">${dueDate}</span></div>` : ""}
    ${etaParts.length ? `<div style="text-align:center;margin-top:1px;color:#333;font-weight:600;">${etaParts.join(" ")}</div>` : ""}
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

  // Re-fits the viewport to every current marker — the only way back to the
  // overview once a click-to-focus (or Google's own drag/zoom) has moved away
  // from it, since polling deliberately never auto-re-fits (see the draw
  // effect below) so it doesn't fight a visitor's own pan/zoom every 20s.
  const showAllVehicles = useCallback(() => {
    const g = window.google;
    const map = mapObjRef.current;
    if (!g?.maps || !map || markersRef.current.size === 0) return;
    const bounds = new g.maps.LatLngBounds();
    markersRef.current.forEach((marker) => bounds.extend(marker.getPosition()));
    map.fitBounds(bounds);
    infoWindowRef.current?.close();
    openTaskIdRef.current = null;
  }, []);

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

        // Google's own InfoWindow content wrapper (.gm-style-iw-d) forces
        // `overflow: scroll` on BOTH axes, which reserves horizontal
        // scrollbar-gutter space even though our content never overflows
        // sideways (it's all wrapped/ellipsized to fit). That reserved strip
        // alone was enough to push otherwise-fitting content into a needless
        // vertical scrollbar — confirmed against a real popup, content used
        // ~81px against Maps' own ~108-126px height budget, well within
        // budget once the phantom horizontal reservation is removed.
        // overflow-y stays `auto` (not `hidden`) as a genuine fallback for
        // any future content that truly does exceed Maps' budget.
        if (!document.getElementById("tracking-iw-style")) {
          const style = document.createElement("style");
          style.id = "tracking-iw-style";
          style.textContent = ".gm-style-iw-d{overflow-x:hidden!important;overflow-y:auto!important}";
          document.head.appendChild(style);
        }
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
        style={{ background: "#1e293b", borderRadius: 6, padding: 9, cursor: t.position ? "pointer" : "default" }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>
          {t.title || "Load"}{t.orderNumber && <span style={{ color: "#64748b", fontWeight: 400 }}> #{t.orderNumber}</span>}
        </div>
        <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
          {t.loadLocation || "—"} → {t.dropoffLocation || "—"}
        </div>
        {(t.driverName || t.vehicleReg) && (
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
            {t.driverName && <span>👤 {t.driverName}</span>}
            {t.driverName && t.vehicleReg && "  "}
            {t.vehicleReg && <span>🚚 {t.vehicleReg}</span>}
          </div>
        )}
        {(t.date || t.pickupTime) && (
          <div style={{ fontSize: 9, color: "#64748b", marginTop: 1 }}>
            {t.date}{t.pickupTime ? ` drop @${t.pickupTime}` : ""}
          </div>
        )}
        {badge ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 4, padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 600, background: badge.bg, color: badge.fg }}>
            <span>{badge.icon}</span>
            <span>{badge.text}</span>
            {t.phaseDest && <><span style={{ opacity: 0.6 }}>·</span><span>{t.phaseDest}</span></>}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{STATUS_LABELS[t.status] || t.status}</div>
        )}
      </div>
    );
  }

  const todayTasks       = data?.tasks?.filter((t) => t.dateGroup === "today") || [];
  const tomorrowTasks    = data?.tasks?.filter((t) => t.dateGroup === "tomorrow") || [];
  const withPositionCount = data?.tasks?.filter((t) => t.position).length || 0;

  // The page itself never scrolls (height:100dvh + overflow:hidden) — the
  // map and header stay put, only the task list underneath gets its own
  // scroll region, so the map is always visible while browsing a long list.
  return (
    <div style={{ height: "100dvh", background: "#0f1724", color: "#fff", fontFamily: "Arial, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ maxWidth: 720, width: "100%", margin: "0 auto", padding: "16px 16px 0", boxSizing: "border-box", flexShrink: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>📍 FleetPro Tracking</h1>

        {loading && <p style={{ color: "#94a3b8" }}>Loading…</p>}

        {!loading && error && (
          <div style={{ background: "#1e293b", border: "1px solid #dc2626", borderRadius: 8, padding: 16, marginTop: 16, color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {!loading && data && (
          <>
            <p style={{ color: "#94a3b8", margin: "0 0 12px" }}>{data.clientName}</p>

            {data.tasks.length === 0 && (
              <div style={{ background: "#1e293b", borderRadius: 8, padding: 24, textAlign: "center", color: "#64748b" }}>
                No active loads right now.
              </div>
            )}

            {withPositionCount > 0 && (
              <div style={{ position: "relative", marginBottom: 12 }}>
                <div ref={mapDivRef} style={{ width: "100%", height: 280, borderRadius: 8, overflow: "hidden", background: "#1e293b" }} />
                {withPositionCount > 1 && (
                  <button onClick={showAllVehicles} style={{ position: "absolute", top: 8, left: 8, background: "#fff", border: "none", borderRadius: 4, padding: "4px 9px", fontSize: 11, fontWeight: 600, color: "#333", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
                    Show All
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {!loading && data && data.tasks.length > 0 && (
        <div style={{ flex: 1, overflowY: "auto", maxWidth: 720, width: "100%", margin: "0 auto", padding: "0 16px 16px", boxSizing: "border-box" }}>
          {todayTasks.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", margin: "0 0 6px" }}>📅 Today ({formatShortDate(data.today)})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: tomorrowTasks.length ? 14 : 0 }}>
                {todayTasks.map(renderTaskCard)}
              </div>
            </>
          )}

          {tomorrowTasks.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", margin: "0 0 6px" }}>📅 Tomorrow ({formatShortDate(data.tomorrow)})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {tomorrowTasks.map(renderTaskCard)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
