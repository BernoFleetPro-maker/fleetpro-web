import React, { useEffect, useRef } from "react";

const API     = "https://fleetpro-backend-production.up.railway.app/api";
const MAPS_KEY = "AIzaSyCwlu54d0fcLUJ_7z7rG4wQSpDqoFlRPBw";

export default function MapView() {
  const mapRef           = useRef(null);
  const mapInstance      = useRef(null);
  const markersRef       = useRef({});
  const trailsRef        = useRef({});
  const pointOverlaysRef = useRef([]);
  const routeLinesRef    = useRef({});
  const etaPanelsRef     = useRef({});
  const routeCacheRef    = useRef({});

  // ── Fetch road route via Routes API (REST) ───────────────────────────────
  async function fetchRoadRoute(originLat, originLng, destLat, destLng) {
    const cacheKey = `${originLat.toFixed(3)},${originLng.toFixed(3)}→${destLat.toFixed(3)},${destLng.toFixed(3)}`;
    const cached   = routeCacheRef.current[cacheKey];
    if (cached && cached.expiry > Date.now()) return cached.data;

    try {
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type":            "application/json",
          "X-Goog-Api-Key":          MAPS_KEY,
          "X-Goog-FieldMask":        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify({
          origin:      { location: { latLng: { latitude: originLat, longitude: originLng } } },
          destination: { location: { latLng: { latitude: destLat,   longitude: destLng   } } },
          travelMode:  "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        }),
      });

      const data = await res.json();
      if (!data.routes?.[0]) return null;

      const route       = data.routes[0];
      const durationSec = parseInt(route.duration);
      const distanceM   = route.distanceMeters;
      const encoded     = route.polyline.encodedPolyline;

      // Decode polyline
      const path = decodePolyline(encoded);

      const mins = Math.round(durationSec / 60);
      const duration = mins < 60
        ? `~${mins} min`
        : `~${Math.floor(mins/60)}h ${mins%60 > 0 ? mins%60+"min" : ""}`;
      const distance = distanceM < 1000
        ? `${distanceM} m`
        : `${(distanceM/1000).toFixed(1)} km`;

      const result = { path, duration, distance };
      routeCacheRef.current[cacheKey] = { data: result, expiry: Date.now() + 30000 };
      return result;
    } catch (err) {
      console.warn("Routes API error:", err.message);
      return null;
    }
  }

  // ── Decode Google encoded polyline ───────────────────────────────────────
  function decodePolyline(encoded) {
    const points = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return points;
  }

  // ── Format date ──────────────────────────────────────────────────────────
  function formatDate(dtValue) {
    if (!dtValue) return "Unknown";
    const num = Number(dtValue);
    let date;
    try {
      if (!Number.isFinite(num)) date = new Date(dtValue);
      else if (num > 30000) date = new Date((num - 25569) * 86400 * 1000);
      else date = new Date();
      date = new Date(date.getTime() - 2 * 60 * 60 * 1000);
      return date.toLocaleString("en-ZA", {
        timeZone:"Africa/Johannesburg", year:"numeric", month:"2-digit",
        day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false,
      });
    } catch { return "Invalid date"; }
  }

  // ── Label overlay (below marker) ─────────────────────────────────────────
  function createLabelOverlay(map, position, html) {
    const g = window.google;
    if (!g) return null;
    function LabelOverlay(pos, content) { this.position = pos; this.content = content; this.div = null; }
    LabelOverlay.prototype = new g.maps.OverlayView();
    LabelOverlay.prototype.onAdd = function () {
      const div = document.createElement("div");
      div.style.cssText = "position:absolute;transform:translate(-50%,0);z-index:999;pointer-events:none;";
      div.innerHTML = `<div style="background:rgba(60,60,60,0.95);padding:3px 8px;border-radius:6px;font-size:11px;text-align:center;color:#fff;font-weight:600;border:1px solid #111;white-space:nowrap;">${this.content}</div>`;
      this.div = div;
      this.getPanes().overlayLayer.appendChild(div);
    };
    LabelOverlay.prototype.draw = function () {
      const proj = this.getProjection();
      if (!proj || !this.div) return;
      const pos = proj.fromLatLngToDivPixel(this.position);
      this.div.style.left = pos.x + "px";
      this.div.style.top  = (pos.y + 30) + "px";
    };
    LabelOverlay.prototype.onRemove = function () {
      if (this.div?.parentNode) this.div.parentNode.removeChild(this.div);
      this.div = null;
    };
    LabelOverlay.prototype.updatePosition = function (pos) { this.position = pos; this.draw(); };
    LabelOverlay.prototype.updateContent  = function (html) {
      this.content = html;
      if (this.div) this.div.querySelector("div").innerHTML = html;
    };
    const lbl = new LabelOverlay(position, html);
    lbl.setMap(map);
    return lbl;
  }

  // ── ETA badge overlay (above marker) ────────────────────────────────────
  function createEtaOverlay(map, position, html) {
    const g = window.google;
    if (!g) return null;
    function EtaOverlay(pos, content) { this.position = pos; this.content = content; this.div = null; }
    EtaOverlay.prototype = new g.maps.OverlayView();
    EtaOverlay.prototype.onAdd = function () {
      const div = document.createElement("div");
      div.style.cssText = "position:absolute;transform:translate(-50%,-100%);z-index:1000;pointer-events:none;";
      div.innerHTML = this.content;
      this.div = div;
      this.getPanes().floatPane.appendChild(div);
    };
    EtaOverlay.prototype.draw = function () {
      const proj = this.getProjection();
      if (!proj || !this.div) return;
      const pos = proj.fromLatLngToDivPixel(this.position);
      this.div.style.left = pos.x + "px";
      this.div.style.top  = (pos.y - 16) + "px";
    };
    EtaOverlay.prototype.onRemove = function () {
      if (this.div?.parentNode) this.div.parentNode.removeChild(this.div);
      this.div = null;
    };
    EtaOverlay.prototype.updatePosition = function (pos) { this.position = pos; this.draw(); };
    EtaOverlay.prototype.updateContent  = function (html) {
      this.content = html;
      if (this.div) this.div.innerHTML = html;
    };
    const overlay = new EtaOverlay(position, html);
    overlay.setMap(map);
    return overlay;
  }

  // ── Badge HTML ───────────────────────────────────────────────────────────
  function etaBadgeHtml(topLabel, destination, duration, distance, color) {
    return `<div style="background:${color};border-radius:8px;padding:5px 10px;font-size:11px;color:#fff;
                        font-weight:600;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.45);
                        border:1px solid rgba(255,255,255,0.15);margin-bottom:4px;text-align:center;min-width:120px;">
              ${topLabel ? `<div style="font-size:10px;opacity:0.8;margin-bottom:1px;">${topLabel}</div>` : ""}
              <div style="font-size:12px;">${destination}</div>
              ${duration ? `<div style="font-size:13px;margin-top:2px;">⏱ ${duration}</div>` : ""}
              ${distance ? `<div style="font-size:10px;opacity:0.75;">${distance}</div>` : ""}
            </div>`;
  }

  function statusBadgeHtml(text, color) {
    return `<div style="background:${color};border-radius:8px;padding:5px 12px;font-size:12px;
                        color:#fff;font-weight:600;white-space:nowrap;
                        box-shadow:0 2px 6px rgba(0,0,0,0.45);margin-bottom:4px;text-align:center;">
              ${text}
            </div>`;
  }

  // ── Vehicle icon ─────────────────────────────────────────────────────────
  function getSymbolIcon(speed, heading) {
    const g  = window.google;
    const sp = Number(speed || 0);
    if (sp < 5) return { path:g.maps.SymbolPath.CIRCLE, scale:6, fillColor:"#ff3b30", fillOpacity:1, strokeColor:"#000", strokeWeight:1 };
    const color = sp > 40 ? "#007bff" : "#FFA500";
    return { path:g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale:6, rotation:Number(heading||0), fillColor:color, fillOpacity:1, strokeColor:"#000", strokeWeight:1 };
  }

  // ── Info popup ───────────────────────────────────────────────────────────
  function infoHtml(v) {
    const task = v.activeTask;
    let taskSection = "";
    if (task) {
      taskSection = `<hr style="margin:6px 0;border-color:#eee;"/>
        <div style="font-weight:600;color:#1e88e5;margin-bottom:4px;">📦 Active Task</div>
        <div><strong>Order:</strong> ${task.orderNumber || "—"}</div>
        <div><strong>Driver:</strong> ${task.driverName || "—"}</div>
        <div><strong>Load:</strong> ${task.loadLocation || "—"}</div>
        <div><strong>Dropoff:</strong> ${task.dropoffLocation || "—"}</div>`;
    }
    return `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.4;min-width:180px;">
        <div style="font-weight:700;color:#111;font-size:14px;margin-bottom:6px;">${v.descrip || "Unknown"}</div>
        <div><strong>Updated:</strong> ${formatDate(v.dt)}</div>
        <div><strong>Location:</strong> ${v.address || `${v.lat}, ${v.lon}`}</div>
        <div><strong>Speed:</strong> ${v.speed || 0} km/h</div>
        ${taskSection}
      </div>`;
  }

  // ── Animate marker ───────────────────────────────────────────────────────
  function animateMarker(marker, newLatLng) {
    const g = window.google;
    if (!marker || !g) return;
    const oldPos = marker.getPosition();
    if (!oldPos) return marker.setPosition(newLatLng);
    const steps = 25, dLat = (newLatLng.lat() - oldPos.lat()) / steps, dLng = (newLatLng.lng() - oldPos.lng()) / steps;
    let i = 0;
    function step() { i++; marker.setPosition(new g.maps.LatLng(oldPos.lat()+dLat*i, oldPos.lng()+dLng*i)); if (i < steps) requestAnimationFrame(step); }
    step();
  }

  // ── Haversine metres ─────────────────────────────────────────────────────
  function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // ── Draw road route polyline ─────────────────────────────────────────────
  function drawPolyline(map, path, color) {
    const g = window.google;
    return new g.maps.Polyline({
      path,
      strokeColor:   color,
      strokeOpacity: 0.85,
      strokeWeight:  4,
      geodesic:      false,
      icons: [{ icon: { path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale:3, strokeColor:color }, offset:"50%" }],
      map,
    });
  }

  // ── Update route + ETA for one vehicle ──────────────────────────────────
  async function updateRouteAndEta(v) {
    const g   = window.google;
    const map = mapInstance.current;
    const id  = v.descrip || `veh-${v.id}`;
    const task = v.activeTask;
    const pos  = new g.maps.LatLng(v.lat, v.lon);

    // Clear old
    if (routeLinesRef.current[id]) { routeLinesRef.current[id].setMap(null); delete routeLinesRef.current[id]; }
    if (etaPanelsRef.current[id])  { etaPanelsRef.current[id].setMap(null);  delete etaPanelsRef.current[id];  }

    if (!task || task.status !== "inprogress") return;

    const loadPt = task.loadPoint;
    const dropPt = task.dropPoint;
    const distToLoad = loadPt ? haversineM(v.lat, v.lon, loadPt.lat, loadPt.lon) : Infinity;
    const distToDrop = dropPt ? haversineM(v.lat, v.lon, dropPt.lat, dropPt.lon) : Infinity;
    const atLoad = loadPt && distToLoad <= (loadPt.radius || 1000);
    const atDrop = dropPt && distToDrop <= (dropPt.radius || 1000);

    if (atDrop) {
      etaPanelsRef.current[id] = createEtaOverlay(map, pos, statusBadgeHtml("✅ Arrived at client", "#43a047"));
      return;
    }

    if (atLoad) {
      etaPanelsRef.current[id] = createEtaOverlay(map, pos, statusBadgeHtml("🏭 At loading station", "#fb8c00"));
      if (dropPt) {
        const route = await fetchRoadRoute(v.lat, v.lon, dropPt.lat, dropPt.lon);
        if (route) {
          routeLinesRef.current[id] = drawPolyline(map, route.path, "#43a047");
          if (etaPanelsRef.current[id]) etaPanelsRef.current[id].updateContent(
            etaBadgeHtml("🏭 At loading — to dropoff", dropPt.title, route.duration, route.distance, "#43a047")
          );
        }
      }
      return;
    }

    if (loadPt) {
      // Blue route to loading
      etaPanelsRef.current[id] = createEtaOverlay(map, pos,
        etaBadgeHtml("🚛 En route to loading", loadPt.title, "Calculating...", null, "#1e88e5")
      );
      const route = await fetchRoadRoute(v.lat, v.lon, loadPt.lat, loadPt.lon);
      if (route) {
        routeLinesRef.current[id] = drawPolyline(map, route.path, "#1e88e5");
        if (etaPanelsRef.current[id]) etaPanelsRef.current[id].updateContent(
          etaBadgeHtml("🚛 En route to loading", loadPt.title, route.duration, route.distance, "#1e88e5")
        );
      }
      return;
    }

    if (dropPt) {
      // Green route direct to dropoff
      etaPanelsRef.current[id] = createEtaOverlay(map, pos,
        etaBadgeHtml("🚛 En route to dropoff", dropPt.title, "Calculating...", null, "#43a047")
      );
      const route = await fetchRoadRoute(v.lat, v.lon, dropPt.lat, dropPt.lon);
      if (route) {
        routeLinesRef.current[id] = drawPolyline(map, route.path, "#43a047");
        if (etaPanelsRef.current[id]) etaPanelsRef.current[id].updateContent(
          etaBadgeHtml("🚛 En route to dropoff", dropPt.title, route.duration, route.distance, "#43a047")
        );
      }
    }
  }

  // ── Draw/update all vehicles ─────────────────────────────────────────────
  function drawOrUpdateVehicles(data) {
    const g   = window.google;
    const map = mapInstance.current;
    if (!map) return;
    if (!map.activeInfoWindow) map.activeInfoWindow = new g.maps.InfoWindow();
    const activeInfo = map.activeInfoWindow;

    data.forEach(v => {
      const id   = v.descrip || `veh-${v.id}`;
      const pos  = new g.maps.LatLng(v.lat, v.lon);
      const icon = getSymbolIcon(v.speed, v.heading);

      trailsRef.current[id] = trailsRef.current[id] || [];
      trailsRef.current[id].push({ lat: v.lat, lng: v.lon });
      if (trailsRef.current[id].length > 6) trailsRef.current[id].shift();

      const labelHtml = `${v.descrip || "—"}<br/>${v.speed || 0} km/h`;

      if (markersRef.current[id]) {
        const mk = markersRef.current[id];
        animateMarker(mk.marker, pos);
        mk.marker.setIcon(icon);
        mk.labelOverlay.updateContent(labelHtml);
        mk.labelOverlay.updatePosition(pos);
        if (etaPanelsRef.current[id]) etaPanelsRef.current[id].updatePosition(pos);
        mk.marker.addListener("click", () => { activeInfo.setContent(infoHtml(v)); activeInfo.open(map, mk.marker); });
      } else {
        const marker = new g.maps.Marker({ map, position: pos, icon });
        const labelOverlay = createLabelOverlay(map, pos, labelHtml);
        marker.addListener("click", () => { activeInfo.setContent(infoHtml(v)); activeInfo.open(map, marker); });
        markersRef.current[id] = { marker, labelOverlay };
      }

      if (markersRef.current[id].trailPolyline) markersRef.current[id].trailPolyline.setMap(null);
      const path = trailsRef.current[id].map(p => ({ lat: p.lat, lng: p.lng }));
      if (path.length > 1) {
        const poly = new g.maps.Polyline({ path, strokeColor: icon.fillColor, strokeOpacity:0.5, strokeWeight:2, map });
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
    const g = window.google;
    if (!g) return;
    if (!mapInstance.current && mapRef.current) {
      mapInstance.current = new g.maps.Map(mapRef.current, {
        center: { lat:-26.1, lng:28.1 }, zoom:8, streetViewControl:false, mapTypeControl:true,
      });
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
