import React, { useEffect, useRef, useState } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";

// ── Auth helper — attaches JWT token to every API request ───────────────────
function getToken() {
  try { return localStorage.getItem("fleetpro_token") || ""; } catch { return ""; }
}
function authHeaders(extra = {}) {
  return { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}`, ...extra };
}
function authFetch(url, opts = {}) {
  return fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
}

// ── Dwell-time color flagging — same thresholds as the Site Time Report table
// (set by the user 2026-08-13): green up to 1h30, orange up to 2h30, red beyond.
const DWELL_GREEN_MAX_MIN = 90;
const DWELL_ORANGE_MAX_MIN = 150;
function dwellClass(mins) {
  if (mins == null) return "text-slate-400";
  if (mins > DWELL_ORANGE_MAX_MIN) return "text-red-400 font-bold";
  if (mins > DWELL_GREEN_MAX_MIN) return "text-orange-400 font-semibold";
  return "text-green-400 font-semibold";
}
function fmtMinutes(mins) {
  if (mins == null) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
// Load Score and Drop Dwell Score are tiered against raw dwell time.
// On-Time Score is tiered against lateness vs. the task's scheduled dropoff
// time. Computed server-side — see taskController.js's dwellTieredScore/
// onTimeTieredScore/scheduledDropoffAt.
function fmtScore(score) {
  return score == null ? "—" : `${score}%`;
}
function scoreClass(score) {
  if (score == null) return "text-slate-400";
  if (score >= 75) return "text-green-400 font-semibold";
  if (score >= 50) return "text-orange-400 font-semibold";
  return "text-red-400 font-bold";
}
function fmtTiming(mins) {
  if (mins == null) return "—";
  if (mins <= 0) return `${Math.abs(mins)} min early`;
  return `${mins} min late`;
}
function timingClass(mins) {
  if (mins == null) return "text-slate-400";
  if (mins <= 30) return "text-green-400 font-semibold";
  if (mins <= 60) return "text-orange-400 font-semibold";
  return "text-red-400 font-bold";
}

// Compact label:value row used inside each phase section below.
function Row({ label, value, valueClass = "text-white" }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-slate-400">{label}</span>
      <span className={`font-medium text-right ${valueClass}`}>{value}</span>
    </div>
  );
}

function bearingDeg(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function destPoint(lat, lng, brngDeg, distM) {
  const R = 6371000, brng = brngDeg * Math.PI / 180;
  const lat1 = lat * Math.PI / 180, lng1 = lng * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distM / R) + Math.cos(lat1) * Math.sin(distM / R) * Math.cos(brng));
  const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(distM / R) * Math.cos(lat1), Math.cos(distM / R) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 * 180 / Math.PI, lng: ((lng2 * 180 / Math.PI + 540) % 360) - 180 };
}
function offsetPath(path, meters) {
  if (path.length < 2) return path;
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    return destPoint(p.lat, p.lng, bearingDeg(a.lat, a.lng, b.lat, b.lng) + 90, meters);
  });
}

// Static Maps snapshot used for the printable PDF report — a live JS map
// canvas doesn't reliably render in a browser's print output, so the PDF
// export uses a plain <img> instead.
const STATIC_MAPS_KEY = "AIzaSyCwlu54d0fcLUJ_7z7rG4wQSpDqoFlRPBw";
function buildStaticMapUrl(route) {
  if (!route?.points?.length) return null;
  const maxPoints = 100;
  const step = Math.max(1, Math.ceil(route.points.length / maxPoints));
  const sampled = route.points.filter((_, i) => i % step === 0 || i === route.points.length - 1);

  const loadLeg = [], dropLeg = [];
  sampled.forEach(p => {
    const isDrop = p.phase === "to_drop" || p.phase === "at_drop";
    if (isDrop) {
      if (dropLeg.length === 0 && loadLeg.length > 0) dropLeg.push(loadLeg[loadLeg.length - 1]);
      dropLeg.push(p);
    } else loadLeg.push(p);
  });

  const params = ["size=480x300", "maptype=roadmap"];
  if (loadLeg.length > 1) params.push("path=color:0x1e88e5ff|weight:4|" + loadLeg.map(p => `${p.lat},${p.lng}`).join("|"));
  if (dropLeg.length > 1) params.push("path=color:0x43a047ff|weight:4|" + dropLeg.map(p => `${p.lat},${p.lng}`).join("|"));

  const start = route.points[0], end = route.points[route.points.length - 1];
  params.push(`markers=color:blue|label:S|${start.lat},${start.lng}`);
  params.push(`markers=color:green|label:E|${end.lat},${end.lng}`);
  (route.stops || []).forEach((s, i) => params.push(`markers=color:red|label:${Math.min(i + 1, 9)}|${s.lat},${s.lng}`));

  params.push(`key=${STATIC_MAPS_KEY}`);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.join("&")}`;
}

// Shared by Tasks.jsx's own "View Route" button and the Clients.jsx Site Time
// Report drill-down. Tasks.jsx passes `drivers`/`vehicles` lists and looks up
// the name/registration via task.assignedDriverId/vehicleId (unchanged from
// before this was extracted). The report tab already has the name/registration
// pre-resolved server-side, so it passes `driverName`/`vehicleRegistration`
// directly instead — either path works, whichever is supplied wins.
export default function RouteModal({ task, drivers, vehicles, driverName: driverNameProp, vehicleRegistration: vehicleRegProp, onClose }) {
  const [route,   setRoute]   = useState(null); // { acceptedAt, arrivedLoadAt, departedLoadAt, arrivedDropAt, departedDropAt, completedAt, points, distanceToLoadKm, distanceToDropKm, stops, ...dwell metrics }
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!task?.id) return;
    setLoading(true);
    authFetch(`${API}/tasks/${task.id}/route`)
      .then(r => r.json())
      .then(data => setRoute(data))
      .catch(() => setRoute({ acceptedAt: null, arrivedLoadAt: null, departedLoadAt: null, arrivedDropAt: null, departedDropAt: null, completedAt: null, points: [], distanceToLoadKm: 0, distanceToDropKm: 0, stops: [] }))
      .finally(() => setLoading(false));
  }, [task?.id]);

  const fmt = (d) => d ? new Date(d).toLocaleString("en-ZA") : "—";
  const driverName = driverNameProp || drivers?.find(d => d.id === task?.assignedDriverId)?.name || "—";
  const vehicleReg  = vehicleRegProp || vehicles?.find(v => v.id === task?.vehicleId)?.registration || "—";

  useEffect(() => {
    if (!route?.points?.length) return;
    let pollTimer;
    function initMap() {
      const g = window.google;
      if (!g?.maps || !mapRef.current) { pollTimer = setTimeout(initMap, 200); return; }

      const path = route.points.map(p => ({ lat: p.lat, lng: p.lng }));
      const map = new g.maps.Map(mapRef.current, {
        zoom: 10, center: path[0], streetViewControl: false, mapTypeControl: false,
      });
      const bounds = new g.maps.LatLngBounds();
      path.forEach(p => bounds.extend(p));
      map.fitBounds(bounds);
      const infoWindow = new g.maps.InfoWindow();

      // Split into a blue "to loading point" leg and a green "to dropoff
      // point" leg — same colors used everywhere else in the app for these
      // two phases. The last point of the blue leg is repeated as the first
      // point of the green leg so the two lines visually connect with no gap.
      const loadLeg = [], dropLeg = [];
      route.points.forEach(p => {
        const isDropPhase = p.phase === "to_drop" || p.phase === "at_drop";
        if (isDropPhase) {
          if (dropLeg.length === 0 && loadLeg.length > 0) dropLeg.push(loadLeg[loadLeg.length - 1]);
          dropLeg.push(p);
        } else {
          loadLeg.push(p);
        }
      });
      // Nudge each leg a few meters apart so a re-traced road shows as two
      // parallel lines instead of one hiding the other, and thin them out a
      // touch since they may now sit right next to each other.
      if (loadLeg.length > 1) {
        new g.maps.Polyline({
          path: offsetPath(loadLeg.map(p => ({ lat: p.lat, lng: p.lng })), -9),
          strokeColor: "#1e88e5", strokeOpacity: 0.9, strokeWeight: 3, map,
        });
      }
      if (dropLeg.length > 1) {
        new g.maps.Polyline({
          path: offsetPath(dropLeg.map(p => ({ lat: p.lat, lng: p.lng })), 9),
          strokeColor: "#43a047", strokeOpacity: 0.9, strokeWeight: 3, map,
        });
      }

      // Start (accept) marker — blue. Click shows accept info, no ETA.
      const startMarker = new g.maps.Marker({
        position: path[0], map, title: "Accepted here", zIndex: 20,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#1e88e5", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
      });
      startMarker.addListener("click", () => {
        infoWindow.setContent(`
          <div style="font-family:Arial,sans-serif;font-size:11px;line-height:1.4;max-width:220px;">
            <div style="font-weight:700;font-size:12px;color:#111;margin-bottom:3px;">▶ Task Accepted</div>
            <div><strong>Accepted:</strong> ${fmt(route.acceptedAt)}</div>
            <div><strong>Driver:</strong> ${driverName}</div>
            <div><strong>Vehicle:</strong> ${vehicleReg}</div>
            <div><strong>Load:</strong> ${task.loadLocation || "—"}</div>
            <div><strong>Dropoff:</strong> ${task.dropoffLocation || "—"}</div>
          </div>`);
        infoWindow.open(map, startMarker);
      });

      // End (complete) marker — green. Click shows completion info, no ETA.
      const endMarker = new g.maps.Marker({
        position: path[path.length - 1], map, title: "Completed here", zIndex: 20,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#43a047", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
      });
      endMarker.addListener("click", () => {
        infoWindow.setContent(`
          <div style="font-family:Arial,sans-serif;font-size:11px;line-height:1.4;max-width:220px;">
            <div style="font-weight:700;font-size:12px;color:#111;margin-bottom:3px;">✅ Task Completed</div>
            <div><strong>Completed:</strong> ${fmt(route.completedAt)}</div>
            <div><strong>Result:</strong> ${task.result === "failed" ? "❌ Failed" : "✅ Success"}</div>
            <div><strong>Driver:</strong> ${driverName}</div>
            <div><strong>Vehicle:</strong> ${vehicleReg}</div>
            <div><strong>Load:</strong> ${task.loadLocation || "—"}</div>
            <div><strong>Dropoff:</strong> ${task.dropoffLocation || "—"}</div>
          </div>`);
        infoWindow.open(map, endMarker);
      });

      // Stop markers — red, shown for any spot the vehicle stayed roughly in
      // place for 5+ minutes. Click shows exactly when the stop started/ended.
      (route.stops || []).forEach(stop => {
        const stopMarker = new g.maps.Marker({
          position: { lat: stop.lat, lng: stop.lng }, map, title: `Stopped ${stop.durationMin} min`, zIndex: 15,
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#dc2626", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
        });
        stopMarker.addListener("click", () => {
          infoWindow.setContent(`
            <div style="font-family:Arial,sans-serif;font-size:11px;line-height:1.4;max-width:220px;">
              <div style="font-weight:700;font-size:12px;color:#dc2626;margin-bottom:3px;">⏸ Stop — ${stop.durationMin} min</div>
              <div><strong>Started:</strong> ${fmt(stop.startTime)}</div>
              <div><strong>Ended:</strong> ${fmt(stop.endTime)}</div>
            </div>`);
          infoWindow.open(map, stopMarker);
        });
      });
    }
    initMap();
    return () => { if (pollTimer) clearTimeout(pollTimer); };
  }, [route]);

  function handleDownloadPdf() {
    if (!route) return;
    const mapUrl = buildStaticMapUrl(route);
    const win = window.open("", "_blank");
    if (!win) { alert("Please allow popups for this site to download the PDF."); return; }

    const dwellFlagClass = (mins) => mins == null ? "" : mins > DWELL_ORANGE_MAX_MIN ? "dwell-red" : mins > DWELL_GREEN_MAX_MIN ? "dwell-orange" : "dwell-green";
    const scoreFlagClass = (score) => score == null ? "" : score >= 75 ? "dwell-green" : score >= 50 ? "dwell-orange" : "dwell-red";
    const timingFlagClass = (mins) => mins == null ? "" : mins <= 30 ? "dwell-green" : mins <= 60 ? "dwell-orange" : "dwell-red";
    const stopsRows = (route.stops || []).map((s, i) => `
      <tr><td>${i + 1}</td><td>${fmt(s.startTime)}</td><td>${fmt(s.endTime)}</td><td>${s.durationMin} min</td></tr>
    `).join("");

    win.document.write(`
      <html>
      <head>
        <title>Route Report — ${(task.orderNumber || task.title || "Task").toString().replace(/</g, "")}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color:#111; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          .sub { color:#555; font-size:12px; margin-bottom:20px; }
          .grid { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:20px; }
          .card { border:1px solid #ddd; border-radius:6px; padding:10px; }
          .card .label { font-size:11px; color:#666; }
          .card .value { font-size:14px; font-weight:600; }
          .card .value.dwell-green { color:#15803d; }
          .card .value.dwell-orange { color:#c2410c; }
          .card .value.dwell-red { color:#b91c1c; }
          img { width:60%; display:block; margin:0 auto 20px; border-radius:8px; border:1px solid #ddd; }
          table { width:100%; border-collapse:collapse; font-size:12px; margin-top:8px; }
          th, td { border:1px solid #ddd; padding:6px 8px; text-align:left; }
          th { background:#f3f4f6; }
        </style>
      </head>
      <body>
        <h1>Route Report — ${(task.title || task.loadLocation || "Task").toString()}</h1>
        <div class="sub">${task.orderNumber ? `Order #${task.orderNumber} · ` : ""}Driver: ${driverName} · Vehicle: ${vehicleReg}</div>
        <div class="sub">${(task.loadLocation || "—").toString()} &rarr; ${(task.dropoffLocation || "—").toString()}</div>
        <div class="grid">
          <div class="card"><div class="label">Accepted At</div><div class="value">${fmt(route.acceptedAt)}</div></div>
          <div class="card"><div class="label">Travel to Loading</div><div class="value">${fmtMinutes(route.travelToLoadMinutes)}</div></div>
          <div class="card"><div class="label">Arrived at Loading</div><div class="value">${fmt(route.arrivedLoadAt)}</div></div>
          <div class="card"><div class="label">Departed Loading</div><div class="value">${fmt(route.departedLoadAt)}</div></div>
          <div class="card"><div class="label">Time at Loading Site</div><div class="value ${dwellFlagClass(route.loadDwellMinutes)}">${fmtMinutes(route.loadDwellMinutes)}</div></div>
          <div class="card"><div class="label">Load Score</div><div class="value ${scoreFlagClass(route.loadScore)}">${fmtScore(route.loadScore)}</div></div>
          <div class="card"><div class="label">Transit to Dropoff</div><div class="value">${fmtMinutes(route.transitMinutes)}</div></div>
          <div class="card"><div class="label">Scheduled Dropoff</div><div class="value">${fmt(route.scheduledDropoffAt)}</div></div>
          <div class="card"><div class="label">Arrived at Dropoff</div><div class="value">${fmt(route.arrivedDropAt)}</div></div>
          <div class="card"><div class="label">Dropoff Timing</div><div class="value ${timingFlagClass(route.dropoffTimingMinutes)}">${fmtTiming(route.dropoffTimingMinutes)}</div></div>
          <div class="card"><div class="label">Departed Dropoff</div><div class="value">${fmt(route.departedDropAt)}</div></div>
          <div class="card"><div class="label">Time at Dropoff Site</div><div class="value ${dwellFlagClass(route.dropDwellMinutes)}">${fmtMinutes(route.dropDwellMinutes)}</div></div>
          <div class="card"><div class="label">Drop Dwell Score</div><div class="value ${scoreFlagClass(route.dropDwellScore)}">${fmtScore(route.dropDwellScore)}</div></div>
          <div class="card"><div class="label">On-Time Score</div><div class="value ${scoreFlagClass(route.onTimeScore)}">${fmtScore(route.onTimeScore)}</div></div>
          <div class="card"><div class="label">Completed At</div><div class="value">${fmt(route.completedAt)}</div></div>
          <div class="card"><div class="label">Distance to Loading</div><div class="value">${route.distanceToLoadKm ?? 0} km</div></div>
          <div class="card"><div class="label">Distance to Dropoff</div><div class="value">${route.distanceToDropKm ?? 0} km</div></div>
        </div>
        ${mapUrl ? `<img src="${mapUrl}" />` : `<p>No route data available for this task.</p>`}
        ${route.stops?.length ? `
          <h3>Stops over 5 minutes</h3>
          <table>
            <thead><tr><th>#</th><th>Start</th><th>End</th><th>Duration</th></tr></thead>
            <tbody>${stopsRows}</tbody>
          </table>` : ""}
      </body>
      </html>
    `);
    win.document.close();

    let printed = false;
    const triggerPrint = () => { if (printed) return; printed = true; win.focus(); win.print(); };
    const imgEl = win.document.querySelector("img");
    if (imgEl) {
      imgEl.onload = triggerPrint;
      // Static Maps request failed (e.g. that API isn't enabled for the key,
      // or the URL got too long) — swap in a text fallback instead of
      // printing a broken-image icon, then continue with the rest of the report.
      imgEl.onerror = () => {
        const fallback = win.document.createElement("p");
        fallback.textContent = "Map image unavailable — the route map could not be loaded.";
        fallback.style.cssText = "color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;text-align:center;margin-bottom:20px;";
        imgEl.replaceWith(fallback);
        triggerPrint();
      };
    }
    setTimeout(triggerPrint, imgEl ? 3000 : 300); // safety net either way
  }

  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1e293b] rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-slate-600">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div>
            <h2 className="text-base font-bold text-white leading-tight">
              🗺 {task.title || "Route"}
              {task.orderNumber && <span className="ml-2 text-slate-400 font-normal text-xs">#{task.orderNumber}</span>}
            </h2>
            <div className="text-xs text-slate-400 mt-0.5">
              {task.loadLocation || "—"} <span className="text-slate-600">→</span> {task.dropoffLocation || "—"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadPdf} disabled={loading} className="text-xs font-semibold bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg">⬇ PDF</button>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
          </div>
        </div>
        <div className="p-4 space-y-2.5">
          <div className="text-xs text-slate-400">Driver: <span className="text-slate-200 font-medium">{driverName}</span> · Vehicle: <span className="text-slate-200 font-medium">{vehicleReg}</span></div>

          {/* Chronological, phase-grouped — loading, then transit, then dropoff */}
          <div className="bg-slate-800 rounded-lg px-3 py-2">
            <div className="text-[11px] font-bold text-blue-400 mb-1 tracking-wide">📦 LOADING</div>
            <div className="grid grid-cols-2 gap-x-4 text-xs">
              <Row label="Accepted" value={loading ? "—" : fmt(route?.acceptedAt)} />
              <Row label="Travel to site" value={loading ? "—" : fmtMinutes(route?.travelToLoadMinutes)} />
              <Row label="Arrived" value={loading ? "—" : fmt(route?.arrivedLoadAt)} />
              <Row label="Departed" value={loading ? "—" : fmt(route?.departedLoadAt)} />
              <Row label="Time on site" value={loading ? "—" : fmtMinutes(route?.loadDwellMinutes)} valueClass={loading ? "text-white" : dwellClass(route?.loadDwellMinutes)} />
              <Row label="Load Score" value={loading ? "—" : fmtScore(route?.loadScore)} valueClass={loading ? "text-white" : scoreClass(route?.loadScore)} />
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg px-3 py-1.5 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-400 tracking-wide">🛣 TRANSIT TO DROPOFF</span>
            <span className="font-medium text-white">{loading ? "—" : fmtMinutes(route?.transitMinutes)}</span>
          </div>

          <div className="bg-slate-800 rounded-lg px-3 py-2">
            <div className="text-[11px] font-bold text-green-400 mb-1 tracking-wide">🏁 DROPOFF</div>
            <div className="grid grid-cols-2 gap-x-4 text-xs">
              <Row label="Scheduled" value={loading ? "—" : fmt(route?.scheduledDropoffAt)} />
              <Row label="Arrived" value={loading ? "—" : fmt(route?.arrivedDropAt)} />
              <Row label="Timing" value={loading ? "—" : fmtTiming(route?.dropoffTimingMinutes)} valueClass={loading ? "text-white" : timingClass(route?.dropoffTimingMinutes)} />
              <Row label="Departed" value={loading ? "—" : fmt(route?.departedDropAt)} />
              <Row label="Time on site" value={loading ? "—" : fmtMinutes(route?.dropDwellMinutes)} valueClass={loading ? "text-white" : dwellClass(route?.dropDwellMinutes)} />
              <Row label="Dwell Score" value={loading ? "—" : fmtScore(route?.dropDwellScore)} valueClass={loading ? "text-white" : scoreClass(route?.dropDwellScore)} />
              <Row label="On-Time Score" value={loading ? "—" : fmtScore(route?.onTimeScore)} valueClass={loading ? "text-white" : scoreClass(route?.onTimeScore)} />
              <Row label="Completed" value={loading ? "—" : fmt(route?.completedAt)} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-300 mb-1.5">Route</div>
            {loading ? (
              <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-400 text-sm animate-pulse">Loading route…</div>
            ) : !route?.points?.length ? (
              <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-500 text-sm">No route data available for this task</div>
            ) : (
              <div style={{ position: "relative" }}>
                <div ref={mapRef} style={{ width: "100%", height: "220px", borderRadius: "8px", overflow: "hidden" }} />
                <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 6, pointerEvents: "none" }}>
                  <span style={{ background: "rgba(30,136,229,0.92)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>
                    📦 To Load: {route.distanceToLoadKm} km
                  </span>
                  <span style={{ background: "rgba(67,160,71,0.92)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>
                    🏁 To Dropoff: {route.distanceToDropKm} km
                  </span>
                </div>
                {route.stops?.length > 0 && (
                  <div style={{ position: "absolute", top: 8, right: 8, pointerEvents: "none" }}>
                    <span style={{ background: "rgba(220,38,38,0.92)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>
                      ⏸ {route.stops.length} stop{route.stops.length !== 1 ? "s" : ""} over 5 min
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
