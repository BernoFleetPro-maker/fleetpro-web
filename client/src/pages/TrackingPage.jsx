import React, { useEffect, useRef, useState, useCallback } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";
const POLL_MS = 20000; // live position refresh — roughly matches the admin map's own cadence

const STATUS_LABELS = { unassigned: "Unassigned", todo: "To Do", inprogress: "In Progress", completed: "Completed" };

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatShortDate(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTH_ABBR[m - 1]}`;
}

function escapeHtml(s) {
  return (s ?? "—").toString().replace(/</g, "&lt;");
}

function infoWindowHtml(t) {
  return `
    <div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.4;max-width:220px;">
      <div style="font-weight:700;margin-bottom:3px;">${escapeHtml(t.orderNumber ? "#" + t.orderNumber : "Load")}</div>
      <div>${escapeHtml(t.loadLocation)} → ${escapeHtml(t.dropoffLocation)}</div>
      <div>${escapeHtml(t.phaseDest ? (t.arrived ? "Arrived · " + t.phaseDest : "En route · " + t.phaseDest) : (STATUS_LABELS[t.status] || t.status))}</div>
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

  const mapDivRef    = useRef(null);
  const mapObjRef     = useRef(null);
  const markersRef    = useRef(new Map());  // taskId -> google.maps.Marker
  const infoWindowRef = useRef(null);
  const boundsFitRef   = useRef(false); // only auto-fit the viewport once, so manual pan/zoom (incl. click-to-focus) isn't fought every poll

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

  const focusTask = useCallback((t) => {
    const map = mapObjRef.current;
    const marker = markersRef.current.get(t.id);
    if (!map || !marker) return;
    map.panTo(marker.getPosition());
    map.setZoom(15);
    infoWindowRef.current.setContent(infoWindowHtml(t));
    infoWindowRef.current.open(map, marker);
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
        infoWindowRef.current = new g.maps.InfoWindow();
      }
      const map = mapObjRef.current;

      const seenIds = new Set();
      const bounds = new g.maps.LatLngBounds();
      withPosition.forEach((t) => {
        seenIds.add(t.id);
        const pos = { lat: t.position.lat, lng: t.position.lon };
        bounds.extend(pos);

        let marker = markersRef.current.get(t.id);
        if (!marker) {
          marker = new g.maps.Marker({
            position: pos, map, title: t.orderNumber || t.title || "Load",
            icon: { path: g.maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#2E6CB8", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
          });
          marker.addListener("click", () => {
            infoWindowRef.current.setContent(infoWindowHtml(t));
            infoWindowRef.current.open(map, marker);
          });
          markersRef.current.set(t.id, marker);
        } else {
          marker.setPosition(pos);
        }
      });

      // Drop markers for tasks that no longer have (or no longer exist with) a position
      for (const [id, marker] of markersRef.current) {
        if (!seenIds.has(id)) { marker.setMap(null); markersRef.current.delete(id); }
      }

      if (!boundsFitRef.current) {
        map.fitBounds(bounds);
        boundsFitRef.current = true;
      }
    }
    draw();
    return () => { if (pollTimer) clearTimeout(pollTimer); };
  }, [data]);

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
