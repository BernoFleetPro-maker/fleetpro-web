import React, { useEffect, useRef } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";

/**
 * FleetPro MapView — Enhanced with live route tracking + ETA
 *
 * Flow:
 *  1. Driver accepts task (status = inprogress)
 *     → route: vehicle → loading point + ETA
 *  2. Vehicle enters loading point radius
 *     → status label: "At loading station"
 *  3. Vehicle leaves loading point radius
 *     → route: vehicle → dropoff point + ETA
 *  4. Vehicle enters dropoff radius
 *     → status label: "Arrived at client"
 */

export default function MapView() {
  const mapRef          = useRef(null);
  const mapInstance     = useRef(null);
  const markersRef      = useRef({});
  const trailsRef       = useRef({});
  const pointOverlaysRef= useRef([]);
  const routeLinesRef   = useRef({});   // reg → { polyline, panel }
  const etaPanelsRef    = useRef({});   // reg → overlay div

  // ── Haversine distance (km) ──────────────────────────────────────────────
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2
      + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // ── ETA string from distance + speed ────────────────────────────────────
  function calcETA(distKm, speedKmh) {
    const spd = Math.max(speedKmh || 0, 10); // assume 10 km/h minimum
    const mins = Math.round((distKm / spd) * 60);
    if (mins < 1)  return "< 1 min";
    if (mins < 60) return `~${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
  }

  // ── Format Autotrak date ─────────────────────────────────────────────────
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
        timeZone: "Africa/Johannesburg", year:"numeric", month:"2-digit",
        day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false,
      });
    } catch { return "Invalid date"; }
  }

  // ── Gray label overlay ───────────────────────────────────────────────────
  function createLabelOverlay(map, position, html) {
    const g = window.google;
    if (!g) return null;
    function LabelOverlay(pos, content) { this.position = pos; this.content = content; this.div = null; }
    LabelOverlay.prototype = new g.maps.OverlayView();
    LabelOverlay.prototype.onAdd = function () {
      const div = document.createElement("div");
      div.style.cssText = "position:absolute;transform:translate(-50%,0);z-index:999;";
      div.innerHTML = `<div style="background:rgba(60,60,60,0.95);padding:3px 8px;border-radius:6px;font-size:11px;text-align:center;color:#fff;font-weight:600;border:1px solid #111;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.25);">${this.content}</div>`;
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

  // ── ETA panel overlay (appears above vehicle marker) ────────────────────
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

  // ── Build ETA panel HTML ─────────────────────────────────────────────────
  function etaHtml(label, destination, eta, color) {
    return `
      <div style="background:${color};border-radius:8px;padding:5px 10px;font-size:11px;color:#fff;
                  font-weight:600;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4);
                  border:1px solid rgba(255,255,255,0.15);margin-bottom:4px;text-align:center;">
        <div style="font-size:10px;opacity:0.85;">${label}</div>
        <div>${destination}</div>
        <div style="font-size:13px;margin-top:2px;">⏱ ${eta}</div>
      </div>`;
  }

  // ── Symbol icons ─────────────────────────────────────────────────────────
  function getSymbolIcon(speed, heading) {
    const g  = window.google;
    const sp = Number(speed || 0);
    if (sp < 5) return { path: g.maps.SymbolPath.CIRCLE, scale:6, fillColor:"#ff3b30", fillOpacity:1, strokeColor:"#000", strokeWeight:1 };
    const color = sp > 40 ? "#007bff" : "#FFA500";
    return { path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale:6, rotation:Number(heading||0), fillColor:color, fillOpacity:1, strokeColor:"#000", strokeWeight:1 };
  }

  // ── Info popup HTML ──────────────────────────────────────────────────────
  function infoHtml(v) {
    const task = v.activeTask;
    let taskSection = "";
    if (task) {
      taskSection = `
        <hr style="margin:6px 0;border-color:#eee;"/>
        <div style="font-weight:600;color:#1e88e5;margin-bottom:4px;">📦 Active Task</div>
        <div><strong>Order:</strong> ${task.orderNumber || "—"}</div>
        <div><strong>Driver:</strong> ${task.driverName || "—"}</div>
        <div><strong>Load:</strong> ${task.loadLocation || "—"}</div>
        <div><strong>Dropoff:</strong> ${task.dropoffLocation || "—"}</div>
        <div><strong>Status:</strong> ${task.status}</div>`;
    }
    return `
      <div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.4;min-width:180px;">
        <div style="font-weight:700;color:#111;font-size:14px;margin-bottom:6px;">${v.descrip || "Unknown"}</div>
        <div><strong>Updated:</strong> ${formatDate(v.dt)}</div>
        <div><strong>Location:</strong> ${v.address || `${v.lat}, ${v.lon}`}</div>
        <div><strong>Speed:</strong> ${v.speed || 0} km/h</div>
        ${taskSection}
      </div>`;
  }

  // ── Smooth marker animation ──────────────────────────────────────────────
  function animateMarker(marker, newLatLng) {
    const g = window.google;
    if (!marker || !g) return;
    const oldPos = marker.getPosition();
    if (!oldPos) return marker.setPosition(newLatLng);
    const steps = 25;
    const dLat  = (newLatLng.lat() - oldPos.lat()) / steps;
    const dLng  = (newLatLng.lng() - oldPos.lng()) / steps;
    let i = 0;
    function step() {
      i++;
      marker.setPosition(new g.maps.LatLng(oldPos.lat() + dLat*i, oldPos.lng() + dLng*i));
      if (i < steps) requestAnimationFrame(step);
    }
    step();
  }

  // ── Draw/update route line for a vehicle with active task ────────────────
  function updateRouteAndEta(v, marker) {
    const g    = window.google;
    const map  = mapInstance.current;
    const id   = v.descrip || `veh-${v.id}`;
    const task = v.activeTask;
    const pos  = new g.maps.LatLng(v.lat, v.lon);

    // Remove existing route + eta for this vehicle
    if (routeLinesRef.current[id]) {
      routeLinesRef.current[id].setMap(null);
      delete routeLinesRef.current[id];
    }
    if (etaPanelsRef.current[id]) {
      etaPanelsRef.current[id].setMap(null);
      delete etaPanelsRef.current[id];
    }

    if (!task || task.status !== "inprogress") return;

    const loadPt = task.loadPoint;
    const dropPt = task.dropPoint;
    const speed  = Number(v.speed || 0);

    // Determine where vehicle is relative to geofences
    const distToLoad = loadPt
      ? haversineKm(v.lat, v.lon, loadPt.lat, loadPt.lon) * 1000  // metres
      : Infinity;
    const distToDrop = dropPt
      ? haversineKm(v.lat, v.lon, dropPt.lat, dropPt.lon) * 1000
      : Infinity;

    const atLoad = loadPt && distToLoad <= (loadPt.radius || 1000);
    const atDrop = dropPt && distToDrop <= (dropPt.radius || 1000);

    let destination = null;
    let label       = "";
    let color       = "#1e88e5";
    let statusText  = "";

    if (atDrop) {
      // Priority: arrived at dropoff
      statusText = "Arrived at client";
      color      = "#43a047";
      // No route line needed — just show status
    } else if (atLoad) {
      // At loading station
      statusText = "At loading station";
      color      = "#fb8c00";
      // Route to dropoff
      if (dropPt) { destination = dropPt; label = `→ ${dropPt.title}`; }
    } else if (loadPt) {
      // Heading to load first
      destination = loadPt;
      label       = `→ ${loadPt.title}`;
      color       = "#1e88e5";
    } else if (dropPt) {
      // No load point saved — route direct to dropoff
      destination = dropPt;
      label       = `→ ${dropPt.title}`;
      color       = "#8e24aa";
    }

    // Draw straight-line route to destination
    if (destination) {
      const destLatLng = new g.maps.LatLng(destination.lat, destination.lon);
      const polyline   = new g.maps.Polyline({
        path:          [pos, destLatLng],
        strokeColor:   color,
        strokeOpacity: 0.85,
        strokeWeight:  3,
        geodesic:      true,
        icons: [{
          icon:   { path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: color },
          offset: "50%",
        }],
        map,
      });
      routeLinesRef.current[id] = polyline;

      const distKm = haversineKm(v.lat, v.lon, destination.lat, destination.lon);
      const eta    = calcETA(distKm, speed);

      const etaPanel = createEtaOverlay(
        map, pos,
        etaHtml(statusText || label, destination.title, eta, color)
      );
      etaPanelsRef.current[id] = etaPanel;
    } else if (statusText) {
      // At a geofence — show status badge only
      const etaPanel = createEtaOverlay(
        map, pos,
        `<div style="background:${color};border-radius:8px;padding:5px 10px;font-size:11px;
                     color:#fff;font-weight:600;white-space:nowrap;
                     box-shadow:0 2px 6px rgba(0,0,0,0.4);text-align:center;margin-bottom:4px;">
           ${statusText}
         </div>`
      );
      etaPanelsRef.current[id] = etaPanel;
    }
  }

  // ── Draw or update all vehicles ──────────────────────────────────────────
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

      // Trail
      trailsRef.current[id] = trailsRef.current[id] || [];
      trailsRef.current[id].push({ lat: v.lat, lng: v.lon });
      if (trailsRef.current[id].length > 6) trailsRef.current[id].shift();

      const labelHtml = `${v.descrip || "—"}<br/>${v.speed || 0} km/h`;

      let marker;
      if (markersRef.current[id]) {
        const mk = markersRef.current[id];
        animateMarker(mk.marker, pos);
        mk.marker.setIcon(icon);
        mk.labelOverlay.updateContent(labelHtml);
        mk.labelOverlay.updatePosition(pos);
        marker = mk.marker;
        mk.marker.addListener("click", () => { activeInfo.setContent(infoHtml(v)); activeInfo.open(map, mk.marker); });
      } else {
        marker = new g.maps.Marker({ map, position: pos, icon });
        const labelOverlay = createLabelOverlay(map, pos, labelHtml);
        marker.addListener("click", () => { activeInfo.setContent(infoHtml(v)); activeInfo.open(map, marker); });
        markersRef.current[id] = { marker, labelOverlay };
      }

      // Trail polyline
      if (markersRef.current[id].trailPolyline)
        markersRef.current[id].trailPolyline.setMap(null);
      const path = trailsRef.current[id].map(p => ({ lat: p.lat, lng: p.lng }));
      if (path.length > 1) {
        const poly = new g.maps.Polyline({ path, strokeColor: icon.fillColor, strokeOpacity:0.6, strokeWeight:2, map });
        markersRef.current[id].trailPolyline = poly;
        setTimeout(() => poly.setMap(null), 12000);
      }

      // Route + ETA
      updateRouteAndEta(v, marker);
    });
  }

  // ── Draw loading/dropoff circles ─────────────────────────────────────────
  async function drawPoints() {
    const g   = window.google;
    const map = mapInstance.current;
    if (!g || !map) return;

    pointOverlaysRef.current.forEach(o => {
      if (o.circle) o.circle.setMap(null);
      if (o.dot)    o.dot.setMap(null);
    });
    pointOverlaysRef.current = [];

    try {
      const res    = await fetch(`${API}/points`);
      const points = await res.json();

      points.forEach(p => {
        const lat    = Number(p.lat);
        const lon    = Number(p.lon);
        const radius = Number(p.radius) || 1000;
        if (isNaN(lat) || isNaN(lon)) return;

        const center = new g.maps.LatLng(lat, lon);
        const color  = (p.type || "").toLowerCase() === "dropoff" ? "#8ee68e" : "#7fb3ff";

        const circle = new g.maps.Circle({ map, center, radius, fillColor:color, fillOpacity:0.18, strokeColor:color, strokeOpacity:0.7, strokeWeight:2 });
        const dot    = new g.maps.Marker({
          map, position: center,
          icon: { path: g.maps.SymbolPath.CIRCLE, scale:5, fillColor:color, fillOpacity:1, strokeColor:"#111", strokeWeight:1 },
        });
        const info = new g.maps.InfoWindow({
          content: `<div style="font-size:12px;color:#222;">${p.title || "Point"}<br/>Radius: ${radius} m</div>`,
        });
        dot.addListener("click", () => info.open(map, dot));
        pointOverlaysRef.current.push({ circle, dot });
      });
    } catch (err) {
      console.error("Failed to load points:", err);
    }
  }

  // ── Main fetch loop ──────────────────────────────────────────────────────
  useEffect(() => {
    const g = window.google;
    if (!g) return;

    if (!mapInstance.current && mapRef.current) {
      mapInstance.current = new g.maps.Map(mapRef.current, {
        center: { lat: -26.1, lng: 28.1 },
        zoom: 8,
        streetViewControl: false,
        mapTypeControl: true,
      });
    }

    async function fetchAll() {
      try {
        const res       = await fetch(`${API}/positions`);
        const positions = await res.json();
        if (Array.isArray(positions)) drawOrUpdateVehicles(positions);
        await drawPoints();
      } catch (err) {
        console.error("fetchAll error:", err);
      }
    }

    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, []);

  // ── Resize listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      if (mapInstance.current && window.google)
        window.google.maps.event.trigger(mapInstance.current, "resize");
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="w-full h-[100vh] relative">
      <div ref={mapRef} style={{ position:"absolute", inset:0, width:"100%", height:"100%", borderRadius:6 }} />
    </div>
  );
}
