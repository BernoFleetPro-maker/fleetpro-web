import React, { useEffect, useRef } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";

export default function MapView() {
  const mapRef           = useRef(null);
  const mapInstance      = useRef(null);
  const markersRef       = useRef({});
  const trailsRef        = useRef({});
  const pointOverlaysRef = useRef([]);
  const routeLinesRef    = useRef({});  // reg → google DirectionsRenderer
  const etaPanelsRef     = useRef({});  // reg → overlay
  const directionsCache  = useRef({});  // key → { renderer, expiry }

  // ── Directions Service (road routing) ───────────────────────────────────
  function getRoute(map, origin, destination, color, onResult) {
    const g         = window.google;
    const cacheKey  = `${origin.lat},${origin.lng}→${destination.lat},${destination.lng}`;
    const now       = Date.now();

    // Reuse cached renderer if fresh (< 30s)
    if (directionsCache.current[cacheKey]?.expiry > now) {
      onResult(directionsCache.current[cacheKey].duration, directionsCache.current[cacheKey].distance);
      return;
    }

    const service  = new g.maps.DirectionsService();
    const renderer = new g.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor:   color,
        strokeOpacity: 0.85,
        strokeWeight:  4,
      },
    });

    service.route({
      origin:      new g.maps.LatLng(origin.lat, origin.lng),
      destination: new g.maps.LatLng(destination.lat, destination.lng),
      travelMode:  g.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === "OK") {
        renderer.setDirections(result);
        const leg      = result.routes[0].legs[0];
        const duration = leg.duration.text;
        const distance = leg.distance.text;
        directionsCache.current[cacheKey] = { renderer, duration, distance, expiry: now + 30000 };
        onResult(duration, distance);
      } else {
        console.warn("Directions failed:", status);
        onResult(null, null);
      }
    });

    return renderer;
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

  // ── Gray label overlay (reg + speed below marker) ────────────────────────
  function createLabelOverlay(map, position, html) {
    const g = window.google;
    if (!g) return null;
    function LabelOverlay(pos, content) { this.position = pos; this.content = content; this.div = null; }
    LabelOverlay.prototype = new g.maps.OverlayView();
    LabelOverlay.prototype.onAdd = function () {
      const div = document.createElement("div");
      div.style.cssText = "position:absolute;transform:translate(-50%,0);z-index:999;pointer-events:none;";
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

  // ── ETA badge HTML ───────────────────────────────────────────────────────
  function etaBadgeHtml(topLabel, destination, duration, distance, color) {
    return `
      <div style="background:${color};border-radius:8px;padding:5px 10px;font-size:11px;color:#fff;
                  font-weight:600;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.45);
                  border:1px solid rgba(255,255,255,0.15);margin-bottom:4px;text-align:center;min-width:120px;">
        ${topLabel ? `<div style="font-size:10px;opacity:0.8;margin-bottom:1px;">${topLabel}</div>` : ""}
        <div style="font-size:12px;">${destination}</div>
        ${duration ? `<div style="font-size:13px;margin-top:2px;">⏱ ${duration}</div>` : ""}
        ${distance ? `<div style="font-size:10px;opacity:0.75;">${distance}</div>` : ""}
      </div>`;
  }

  // ── Status-only badge ────────────────────────────────────────────────────
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
      taskSection = `
        <hr style="margin:6px 0;border-color:#eee;"/>
        <div style="font-weight:600;color:#1e88e5;margin-bottom:4px;">📦 Active Task</div>
        <div><strong>Order:</strong> ${task.orderNumber || "—"}</div>
        <div><strong>Driver:</strong> ${task.driverName || "—"}</div>
        <div><strong>Load:</strong> ${task.loadLocation || "—"}</div>
        <div><strong>Dropoff:</strong> ${task.dropoffLocation || "—"}</div>`;
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

  // ── Animate marker smoothly ──────────────────────────────────────────────
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

  // ── Haversine (metres) ───────────────────────────────────────────────────
  function haversineM(lat1, lon1, lat2, lon2) {
    const R    = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // ── Update road route + ETA badge for one vehicle ───────────────────────
  function updateRouteAndEta(v) {
    const g    = window.google;
    const map  = mapInstance.current;
    const id   = v.descrip || `veh-${v.id}`;
    const task = v.activeTask;
    const pos  = new g.maps.LatLng(v.lat, v.lon);

    // Clear old route renderer
    if (routeLinesRef.current[id]) {
      routeLinesRef.current[id].setMap(null);
      delete routeLinesRef.current[id];
    }
    // Clear old ETA overlay
    if (etaPanelsRef.current[id]) {
      etaPanelsRef.current[id].setMap(null);
      delete etaPanelsRef.current[id];
    }

    if (!task || task.status !== "inprogress") return;

    const loadPt = task.loadPoint;
    const dropPt = task.dropPoint;

    const distToLoad = loadPt ? haversineM(v.lat, v.lon, loadPt.lat, loadPt.lon) : Infinity;
    const distToDrop = dropPt ? haversineM(v.lat, v.lon, dropPt.lat, dropPt.lon) : Infinity;

    const atLoad = loadPt && distToLoad <= (loadPt.radius || 1000);
    const atDrop = dropPt && distToDrop <= (dropPt.radius || 1000);

    const origin = { lat: v.lat, lng: v.lon };

    if (atDrop) {
      // Arrived at client
      const overlay = createEtaOverlay(map, pos, statusBadgeHtml("✅ Arrived at client", "#43a047"));
      etaPanelsRef.current[id] = overlay;

    } else if (atLoad) {
      // At loading station — route to dropoff (green)
      const overlay = createEtaOverlay(map, pos, statusBadgeHtml("🏭 At loading station", "#fb8c00"));
      etaPanelsRef.current[id] = overlay;

      if (dropPt) {
        const dest = { lat: dropPt.lat, lng: dropPt.lon };
        const renderer = getRoute(map, origin, dest, "#43a047", (duration, distance) => {
          if (etaPanelsRef.current[id]) {
            etaPanelsRef.current[id].updateContent(
              etaBadgeHtml("🏭 At loading — heading to dropoff", dropPt.title, duration, distance, "#43a047")
            );
          }
        });
        if (renderer) routeLinesRef.current[id] = renderer;
      }

    } else if (loadPt) {
      // Heading to load — route is blue
      const dest = { lat: loadPt.lat, lng: loadPt.lon };
      const etaOverlay = createEtaOverlay(map, pos,
        etaBadgeHtml("🚛 En route to loading", loadPt.title, "Calculating...", null, "#1e88e5")
      );
      etaPanelsRef.current[id] = etaOverlay;

      const renderer = getRoute(map, origin, dest, "#1e88e5", (duration, distance) => {
        if (etaPanelsRef.current[id]) {
          etaPanelsRef.current[id].updateContent(
            etaBadgeHtml("🚛 En route to loading", loadPt.title, duration, distance, "#1e88e5")
          );
        }
      });
      if (renderer) routeLinesRef.current[id] = renderer;

    } else if (dropPt) {
      // No load point — direct to dropoff (green)
      const dest = { lat: dropPt.lat, lng: dropPt.lon };
      const etaOverlay = createEtaOverlay(map, pos,
        etaBadgeHtml("🚛 En route to dropoff", dropPt.title, "Calculating...", null, "#43a047")
      );
      etaPanelsRef.current[id] = etaOverlay;

      const renderer = getRoute(map, origin, dest, "#43a047", (duration, distance) => {
        if (etaPanelsRef.current[id]) {
          etaPanelsRef.current[id].updateContent(
            etaBadgeHtml("🚛 En route to dropoff", dropPt.title, duration, distance, "#43a047")
          );
        }
      });
      if (renderer) routeLinesRef.current[id] = renderer;
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
        // Update ETA overlay position too
        if (etaPanelsRef.current[id]) etaPanelsRef.current[id].updatePosition(pos);
        mk.marker.addListener("click", () => { activeInfo.setContent(infoHtml(v)); activeInfo.open(map, mk.marker); });
      } else {
        marker = new g.maps.Marker({ map, position: pos, icon });
        const labelOverlay = createLabelOverlay(map, pos, labelHtml);
        marker.addListener("click", () => { activeInfo.setContent(infoHtml(v)); activeInfo.open(map, marker); });
        markersRef.current[id] = { marker, labelOverlay };
      }

      // Short trail polyline
      if (markersRef.current[id].trailPolyline) markersRef.current[id].trailPolyline.setMap(null);
      const path = trailsRef.current[id].map(p => ({ lat: p.lat, lng: p.lng }));
      if (path.length > 1) {
        const poly = new g.maps.Polyline({ path, strokeColor: icon.fillColor, strokeOpacity:0.5, strokeWeight:2, map });
        markersRef.current[id].trailPolyline = poly;
        setTimeout(() => poly.setMap(null), 12000);
      }

      // Road route + ETA
      updateRouteAndEta(v);
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
        const color  = (p.type||"").toLowerCase() === "dropoff" ? "#8ee68e" : "#7fb3ff";
        const circle = new g.maps.Circle({ map, center, radius, fillColor:color, fillOpacity:0.18, strokeColor:color, strokeOpacity:0.7, strokeWeight:2 });
        const dot    = new g.maps.Marker({
          map, position: center,
          icon: { path:g.maps.SymbolPath.CIRCLE, scale:5, fillColor:color, fillOpacity:1, strokeColor:"#111", strokeWeight:1 },
        });
        const info = new g.maps.InfoWindow({ content:`<div style="font-size:12px;color:#222;">${p.title||"Point"}<br/>Radius: ${radius} m</div>` });
        dot.addListener("click", () => info.open(map, dot));
        pointOverlaysRef.current.push({ circle, dot });
      });
    } catch (err) { console.error("Failed to load points:", err); }
  }

  // ── Main fetch loop ──────────────────────────────────────────────────────
  useEffect(() => {
    const g = window.google;
    if (!g) return;

    if (!mapInstance.current && mapRef.current) {
      mapInstance.current = new g.maps.Map(mapRef.current, {
        center: { lat:-26.1, lng:28.1 },
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
      } catch (err) { console.error("fetchAll error:", err); }
    }

    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, []);

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
