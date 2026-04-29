import React, { useEffect, useRef } from "react";

const API      = "https://fleetpro-backend-production.up.railway.app/api";
const MAPS_KEY = "AIzaSyCwlu54d0fcLUJ_7z7rG4wQSpDqoFlRPBw";

export default function MapView() {
  const mapRef           = useRef(null);
  const mapInstance      = useRef(null);
  const markersRef       = useRef({});
  const trailsRef        = useRef({});
  const pointOverlaysRef = useRef([]);
  const routeLinesRef    = useRef({});
  const routeCacheRef    = useRef({});
  const vehiclePhaseRef  = useRef({});
  const vehicleRouteRef  = useRef({}); // reg → { duration, distance, dest } for popup

  // ── Phase logic ──────────────────────────────────────────────────────────
  function resolvePhase(id, taskId, atLoad, atDrop, hasLoadPt, hasDropPt) {
    const current = vehiclePhaseRef.current[id];
    if (!current || current.taskId !== taskId) {
      const phase = hasLoadPt ? "to_load" : hasDropPt ? "to_drop" : null;
      vehiclePhaseRef.current[id] = { phase, taskId };
      return phase;
    }
    const phase = current.phase;
    if (phase === "to_load" && atLoad)  { vehiclePhaseRef.current[id].phase = "at_load";  return "at_load";  }
    if (phase === "at_load" && !atLoad) { vehiclePhaseRef.current[id].phase = hasDropPt ? "to_drop" : null; return vehiclePhaseRef.current[id].phase; }
    if (phase === "to_drop" && atDrop)  { vehiclePhaseRef.current[id].phase = "at_drop";  return "at_drop";  }
    return phase;
  }

  // ── Routes API ───────────────────────────────────────────────────────────
  async function fetchRoadRoute(originLat, originLng, destLat, destLng) {
    const cacheKey = `${originLat.toFixed(3)},${originLng.toFixed(3)}→${destLat.toFixed(3)},${destLng.toFixed(3)}`;
    const cached   = routeCacheRef.current[cacheKey];
    if (cached && cached.expiry > Date.now()) return cached.data;
    try {
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type":     "application/json",
          "X-Goog-Api-Key":   MAPS_KEY,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify({
          origin:            { location: { latLng: { latitude: originLat, longitude: originLng } } },
          destination:       { location: { latLng: { latitude: destLat,   longitude: destLng   } } },
          travelMode:        "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        }),
      });
      const data = await res.json();
      if (!data.routes?.[0]) return null;
      const route  = data.routes[0];
      const mins   = Math.round(parseInt(route.duration) / 60);
      const distM  = route.distanceMeters;
      const result = {
        path:     decodePolyline(route.polyline.encodedPolyline),
        duration: mins < 60 ? `~${mins} min` : `~${Math.floor(mins/60)}h ${mins%60>0?mins%60+"min":""}`,
        distance: distM < 1000 ? `${distM} m` : `${(distM/1000).toFixed(1)} km`,
      };
      routeCacheRef.current[cacheKey] = { data: result, expiry: Date.now() + 30000 };
      return result;
    } catch (err) { console.warn("Routes API error:", err.message); return null; }
  }

  // ── Decode polyline ──────────────────────────────────────────────────────
  function decodePolyline(encoded) {
    const points = []; let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : result >> 1; shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : result >> 1;
      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return points;
  }

  // ── Format date ──────────────────────────────────────────────────────────
  function formatDate(dtValue) {
    if (!dtValue) return "Unknown";
    const num = Number(dtValue); let date;
    try {
      if (!Number.isFinite(num)) date = new Date(dtValue);
      else if (num > 30000) date = new Date((num - 25569) * 86400 * 1000);
      else date = new Date();
      date = new Date(date.getTime() - 2 * 60 * 60 * 1000);
      return date.toLocaleString("en-ZA", { timeZone:"Africa/Johannesburg", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false });
    } catch { return "Invalid date"; }
  }

  // ── Label overlay (reg + speed below marker) ─────────────────────────────
  function createLabelOverlay(map, position, html) {
    const g = window.google; if (!g) return null;
    function LO(pos, content) { this.position = pos; this.content = content; this.div = null; }
    LO.prototype = new g.maps.OverlayView();
    LO.prototype.onAdd = function () {
      const div = document.createElement("div");
      div.style.cssText = "position:absolute;transform:translate(-50%,0);z-index:999;pointer-events:none;";
      div.innerHTML = `<div style="background:rgba(60,60,60,0.95);padding:3px 8px;border-radius:6px;font-size:11px;text-align:center;color:#fff;font-weight:600;border:1px solid #111;white-space:nowrap;">${this.content}</div>`;
      this.div = div; this.getPanes().overlayLayer.appendChild(div);
    };
    LO.prototype.draw = function () {
      const proj = this.getProjection(); if (!proj || !this.div) return;
      const pos = proj.fromLatLngToDivPixel(this.position);
      this.div.style.left = pos.x + "px"; this.div.style.top = (pos.y + 30) + "px";
    };
    LO.prototype.onRemove = function () { if (this.div?.parentNode) this.div.parentNode.removeChild(this.div); this.div = null; };
    LO.prototype.updatePosition = function (pos) { this.position = pos; this.draw(); };
    LO.prototype.updateContent  = function (html) { this.content = html; if (this.div) this.div.querySelector("div").innerHTML = html; };
    const lbl = new LO(position, html); lbl.setMap(map); return lbl;
  }

  // ── Info popup — full detail shown on click ──────────────────────────────
  function buildInfoHtml(v) {
    const t     = v.activeTask;
    const id    = v.descrip || `veh-${v.id}`;
    const phase = vehiclePhaseRef.current[id]?.phase;
    const routeInfo = vehicleRouteRef.current[id];

    const phaseColors = { to_load:"#1e88e5", at_load:"#fb8c00", to_drop:"#43a047", at_drop:"#43a047" };
    const phaseLabels = { to_load:"🚛 En route to loading", at_load:"🏭 At loading station", to_drop:"🚛 En route to dropoff", at_drop:"✅ Arrived at client" };
    const phaseColor = phaseColors[phase] || "#555";
    const phaseLabel = phaseLabels[phase] || "";

    let taskSection = "";
    if (t) {
      taskSection = `
        <hr style="margin:8px 0;border:none;border-top:1px solid #e0e0e0;"/>
        <div style="font-weight:700;color:#1e88e5;font-size:12px;margin-bottom:6px;">📦 ACTIVE TASK</div>
        ${t.orderNumber ? `<div><strong>Order:</strong> ${t.orderNumber}</div>` : ""}
        <div><strong>Driver:</strong> ${t.driverName || "—"}</div>
        <div><strong>Load:</strong> ${t.loadLocation || "—"}</div>
        <div><strong>Dropoff:</strong> ${t.dropoffLocation || "—"}</div>
        ${phaseLabel ? `
        <hr style="margin:8px 0;border:none;border-top:1px solid #e0e0e0;"/>
        <div style="background:${phaseColor};color:#fff;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:600;margin-bottom:6px;text-align:center;">${phaseLabel}</div>
        ` : ""}
        ${routeInfo ? `
        <div style="display:flex;gap:12px;justify-content:center;margin-top:4px;">
          <div style="text-align:center;">
            <div style="font-size:10px;color:#888;">ETA</div>
            <div style="font-size:14px;font-weight:700;color:#333;">⏱ ${routeInfo.duration}</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:10px;color:#888;">Distance</div>
            <div style="font-size:14px;font-weight:700;color:#333;">📍 ${routeInfo.distance}</div>
          </div>
        </div>
        <div style="font-size:10px;color:#aaa;text-align:center;margin-top:3px;">to ${routeInfo.dest}</div>
        ` : ""}`;
    }

    return `
      <div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.5;min-width:200px;max-width:240px;">
        <div style="font-weight:700;color:#111;font-size:15px;margin-bottom:4px;">${v.descrip || "Unknown"}</div>
        <div style="color:#555;font-size:12px;"><strong>Updated:</strong> ${formatDate(v.dt)}</div>
        <div style="color:#555;font-size:12px;"><strong>Location:</strong> ${v.address || `${v.lat}, ${v.lon}`}</div>
        <div style="color:#555;font-size:12px;"><strong>Speed:</strong> ${v.speed || 0} km/h</div>
        ${taskSection}
      </div>`;
  }

  // ── Vehicle icon ─────────────────────────────────────────────────────────
  function getSymbolIcon(speed, heading) {
    const g = window.google, sp = Number(speed || 0);
    if (sp < 5) return { path:g.maps.SymbolPath.CIRCLE, scale:6, fillColor:"#ff3b30", fillOpacity:1, strokeColor:"#000", strokeWeight:1 };
    return { path:g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale:6, rotation:Number(heading||0), fillColor:sp > 40 ? "#007bff" : "#FFA500", fillOpacity:1, strokeColor:"#000", strokeWeight:1 };
  }

  // ── Animate marker ───────────────────────────────────────────────────────
  function animateMarker(marker, newLatLng) {
    const g = window.google; if (!marker || !g) return;
    const old = marker.getPosition(); if (!old) return marker.setPosition(newLatLng);
    const steps = 25, dLat = (newLatLng.lat()-old.lat())/steps, dLng = (newLatLng.lng()-old.lng())/steps;
    let i = 0;
    function step() { i++; marker.setPosition(new g.maps.LatLng(old.lat()+dLat*i, old.lng()+dLng*i)); if (i < steps) requestAnimationFrame(step); }
    step();
  }

  // ── Haversine ────────────────────────────────────────────────────────────
  function haversineM(lat1, lon1, lat2, lon2) {
    const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  // ── Draw polyline ────────────────────────────────────────────────────────
  function drawPolyline(map, path, color) {
    const g = window.google;
    return new g.maps.Polyline({
      path, strokeColor:color, strokeOpacity:0.85, strokeWeight:4, geodesic:false,
      icons:[{ icon:{ path:g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale:3, strokeColor:color }, offset:"50%" }],
      map,
    });
  }

  // ── Update route (no floating badge — info in popup only) ────────────────
  async function updateRouteAndEta(v) {
    const map  = mapInstance.current;
    const id   = v.descrip || `veh-${v.id}`;
    const task = v.activeTask;

    if (routeLinesRef.current[id]) { routeLinesRef.current[id].setMap(null); delete routeLinesRef.current[id]; }
    delete vehicleRouteRef.current[id];

    if (!task || task.status !== "inprogress") return;

    const loadPt = task.loadPoint;
    const dropPt = task.dropPoint;
    const atLoad = loadPt ? haversineM(v.lat, v.lon, loadPt.lat, loadPt.lon) <= (loadPt.radius || 1000) : false;
    const atDrop = dropPt ? haversineM(v.lat, v.lon, dropPt.lat, dropPt.lon) <= (dropPt.radius || 1000) : false;
    const phase  = resolvePhase(id, task.id, atLoad, atDrop, !!loadPt, !!dropPt);

    if (!phase || phase === "at_drop") return;

    let destPt = null, color = "#1e88e5";
    if (phase === "to_load")              { destPt = loadPt; color = "#1e88e5"; }
    if (phase === "at_load" && dropPt)    { destPt = dropPt; color = "#43a047"; }
    if (phase === "to_drop")              { destPt = dropPt; color = "#43a047"; }

    if (!destPt) return;

    const route = await fetchRoadRoute(v.lat, v.lon, destPt.lat, destPt.lon);
    if (route) {
      routeLinesRef.current[id] = drawPolyline(map, route.path, color);
      // Store for popup
      vehicleRouteRef.current[id] = { duration: route.duration, distance: route.distance, dest: destPt.title };
    }
  }

  // ── Draw/update all vehicles ─────────────────────────────────────────────
  function drawOrUpdateVehicles(data) {
    const g = window.google, map = mapInstance.current;
    if (!map) return;
    if (!map.activeInfoWindow) map.activeInfoWindow = new g.maps.InfoWindow();
    const activeInfo = map.activeInfoWindow;

    data.forEach(v => {
      const id   = v.descrip || `veh-${v.id}`;
      const pos  = new g.maps.LatLng(v.lat, v.lon);
      const icon = getSymbolIcon(v.speed, v.heading);

      trailsRef.current[id] = trailsRef.current[id] || [];
      trailsRef.current[id].push({ lat:v.lat, lng:v.lon });
      if (trailsRef.current[id].length > 6) trailsRef.current[id].shift();

      const labelHtml = `${v.descrip||"—"}<br/>${v.speed||0} km/h`;

      if (markersRef.current[id]) {
        const mk = markersRef.current[id];
        animateMarker(mk.marker, pos);
        mk.marker.setIcon(icon);
        mk.labelOverlay.updateContent(labelHtml);
        mk.labelOverlay.updatePosition(pos);
        mk.marker.addListener("click", () => { activeInfo.setContent(buildInfoHtml(v)); activeInfo.open(map, mk.marker); });
      } else {
        const marker = new g.maps.Marker({ map, position:pos, icon });
        const labelOverlay = createLabelOverlay(map, pos, labelHtml);
        marker.addListener("click", () => { activeInfo.setContent(buildInfoHtml(v)); activeInfo.open(map, marker); });
        markersRef.current[id] = { marker, labelOverlay };
      }

      if (markersRef.current[id].trailPolyline) markersRef.current[id].trailPolyline.setMap(null);
      const path = trailsRef.current[id].map(p => ({ lat:p.lat, lng:p.lng }));
      if (path.length > 1) {
        const poly = new g.maps.Polyline({ path, strokeColor:icon.fillColor, strokeOpacity:0.5, strokeWeight:2, map });
        markersRef.current[id].trailPolyline = poly;
        setTimeout(() => poly.setMap(null), 12000);
      }

      updateRouteAndEta(v);
    });
  }

  // ── Draw points ──────────────────────────────────────────────────────────
  async function drawPoints() {
    const g = window.google, map = mapInstance.current;
    if (!g || !map) return;
    pointOverlaysRef.current.forEach(o => { if (o.circle) o.circle.setMap(null); if (o.dot) o.dot.setMap(null); });
    pointOverlaysRef.current = [];
    try {
      const points = await fetch(`${API}/points`).then(r => r.json());
      points.forEach(p => {
        const lat = Number(p.lat), lon = Number(p.lon), radius = Number(p.radius) || 1000;
        if (isNaN(lat) || isNaN(lon)) return;
        const center = new g.maps.LatLng(lat, lon);
        const color  = (p.type||"").toLowerCase() === "dropoff" ? "#8ee68e" : "#7fb3ff";
        const circle = new g.maps.Circle({ map, center, radius, fillColor:color, fillOpacity:0.18, strokeColor:color, strokeOpacity:0.7, strokeWeight:2 });
        const dot    = new g.maps.Marker({ map, position:center, icon:{ path:g.maps.SymbolPath.CIRCLE, scale:5, fillColor:color, fillOpacity:1, strokeColor:"#111", strokeWeight:1 } });
        const info   = new g.maps.InfoWindow({ content:`<div style="font-size:12px;color:#222;">${p.title||"Point"}<br/>Radius: ${radius} m</div>` });
        dot.addListener("click", () => info.open(map, dot));
        pointOverlaysRef.current.push({ circle, dot });
      });
    } catch (err) { console.error("Failed to load points:", err); }
  }

  // ── Main loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    const g = window.google; if (!g) return;
    if (!mapInstance.current && mapRef.current) {
      mapInstance.current = new g.maps.Map(mapRef.current, { center:{lat:-26.1,lng:28.1}, zoom:8, streetViewControl:false, mapTypeControl:true });
    }
    async function fetchAll() {
      try {
        const positions = await fetch(`${API}/positions`).then(r => r.json());
        if (Array.isArray(positions)) drawOrUpdateVehicles(positions);
        await drawPoints();
      } catch (err) { console.error("fetchAll error:", err); }
    }
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onResize = () => { if (mapInstance.current && window.google) window.google.maps.event.trigger(mapInstance.current, "resize"); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="w-full h-[100vh] relative">
      <div ref={mapRef} style={{ position:"absolute", inset:0, width:"100%", height:"100%", borderRadius:6 }} />
    </div>
  );
}
