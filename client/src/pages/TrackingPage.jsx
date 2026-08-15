import React, { useEffect, useRef, useState } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";

const STATUS_LABELS = { unassigned: "Unassigned", todo: "To Do", inprogress: "In Progress", completed: "Completed" };
const PHASE_LABELS = {
  to_load: "En route to loading site",
  at_load: "Arrived at loading site",
  to_drop: "En route to dropoff",
  at_drop: "Arrived at dropoff",
};

// Public page — no login, reached only via a link the WhatsApp bot sends.
// Kept deliberately small and self-contained rather than reusing MapView.jsx,
// which is ~950 lines of tightly-coupled admin logic (SSE, availability
// toggles, client-list fetching) with no business running unauthenticated.
export default function TrackingPage({ token }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const mapRef = useRef(null);

  useEffect(() => {
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
    const withPosition = data?.tasks?.filter((t) => t.position) || [];
    if (withPosition.length === 0) return;

    let pollTimer;
    function initMap() {
      const g = window.google;
      if (!g?.maps || !mapRef.current) { pollTimer = setTimeout(initMap, 200); return; }

      const map = new g.maps.Map(mapRef.current, { zoom: 10, streetViewControl: false, mapTypeControl: false });
      const bounds = new g.maps.LatLngBounds();
      const infoWindow = new g.maps.InfoWindow();

      withPosition.forEach((t) => {
        const pos = { lat: t.position.lat, lng: t.position.lon };
        bounds.extend(pos);
        const marker = new g.maps.Marker({
          position: pos, map, title: t.orderNumber || t.title || "Load",
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#2E6CB8", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
        });
        marker.addListener("click", () => {
          infoWindow.setContent(`
            <div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.4;max-width:220px;">
              <div style="font-weight:700;margin-bottom:3px;">${(t.orderNumber ? "#" + t.orderNumber : "Load").toString().replace(/</g, "")}</div>
              <div>${(t.loadLocation || "—").toString().replace(/</g, "")} → ${(t.dropoffLocation || "—").toString().replace(/</g, "")}</div>
              <div>${PHASE_LABELS[t.phase] || STATUS_LABELS[t.status] || t.status}</div>
            </div>`);
          infoWindow.open(map, marker);
        });
      });

      map.fitBounds(bounds);
    }
    initMap();
    return () => { if (pollTimer) clearTimeout(pollTimer); };
  }, [data]);

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
                  <div ref={mapRef} style={{ width: "100%", height: 320, borderRadius: 8, overflow: "hidden", marginBottom: 20, background: "#1e293b" }} />
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.tasks.map((t) => (
                    <div key={t.id} style={{ background: "#1e293b", borderRadius: 8, padding: 14 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {t.title || "Load"}{t.orderNumber && <span style={{ color: "#64748b", fontWeight: 400 }}> #{t.orderNumber}</span>}
                      </div>
                      <div style={{ fontSize: 13, color: "#cbd5e1", marginTop: 4 }}>
                        {t.loadLocation || "—"} → {t.dropoffLocation || "—"}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                        {PHASE_LABELS[t.phase] || STATUS_LABELS[t.status] || t.status}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
