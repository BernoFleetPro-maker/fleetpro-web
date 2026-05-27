import React, { useEffect, useRef } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";

const MAPS_KEY = "AIzaSyCwlu54d0fcLUJ_7z7rG4wQSpDqoFlRPBw";

// Phase order
const PHASE_ORDER_MAP = { to_load: 0, at_load: 1, to_drop: 2, at_drop: 3 };

// ── Read phase from localStorage ───────────────────────────────────────────
function getPhase(id) {
  try { return JSON.parse(localStorage.getItem("fleetpro_phase_cache") || "{}")[id] || null; }
  catch { return null; }
}

// ── Write phase — scoped per task ID, never downgrades same task ───────────
function setPhase(id, data) {
  try {
    const all     = JSON.parse(localStorage.getItem("fleetpro_phase_cache") || "{}");
    const current = all[id];
    if (current && current.taskId === data.taskId && data.phase) {
      const curOrder = PHASE_ORDER_MAP[current.phase] ?? -1;
      const newOrder = PHASE_ORDER_MAP[data.phase]    ?? -1;
      if (newOrder < curOrder) data = { ...data, phase: current.phase };
    }
    all[id] = data;
    localStorage.setItem("fleetpro_phase_cache", JSON.stringify(all));
  } catch {}
}

// ── Force write — ONLY used by manual controller override ──────────────────
function _forceSetPhase(id, data) {
  try {
    const all = JSON.parse(localStorage.getItem("fleetpro_phase_cache") || "{}");
    all[id] = data;
    localStorage.setItem("fleetpro_phase_cache", JSON.stringify(all));
  } catch {}
}

export default function MapView({ role = "admin", clientId = null }) {
  const isAdmin = role === "admin";
  const mapRef           = useRef(null);
  const mapInstance      = useRef(null);
  const markersRef       = useRef({});
  const pointOverlaysRef = useRef([]);
  const routeLinesRef    = useRef({});
  const vehicleRouteRef  = useRef({});
  const activeVehicleRef = useRef(null); // tracks selected vehicle for route highlight

  // ── Route highlight styles ─────────────────────────────────────────────────
  // No selection:  all routes weight 3, opacity 0.75
  // One selected:  selected = weight 6, opacity 1.0 — others = weight 3, opacity 0.4
  function applyRouteStyles() {
    const activeId = activeVehicleRef.current;
    Object.entries(routeLinesRef.current).forEach(([id, line]) => {
      if (!line) return;
      if (!activeId) {
        line.setOptions({ zIndex: 1, strokeOpacity: 0.75, strokeWeight: 3 });
      } else if (id === activeId) {
        line.setOptions({ zIndex: 100, strokeOpacity: 1.0, strokeWeight: 6 });
      } else {
        line.setOptions({ zIndex: 1, strokeOpacity: 0.4, strokeWeight: 3 });
      }
    });
  }

  // ── Phase logic ────────────────────────────────────────────────────────────
  function resolvePhase(id, taskId, atLoad, atDrop, hasLoadPt, hasDropPt, distToLoad, loadRadius) {
    const current = getPhase(id);
    const closest = Math.min(current?.closestToLoad ?? distToLoad, distToLoad);

    if (!current || current.taskId !== taskId) {
      const phase = hasLoadPt ? "to_load" : hasDropPt ? "to_drop" : null;
      setPhase(id, { phase, taskId, prevDistToLoad: distToLoad, closestToLoad: distToLoad, outsideLoadCount: 0, insideDropCount: 0, wasInsideLoad: false });
      return phase;
    }

    const phase        = current.phase;
    const currentOrder = PHASE_ORDER_MAP[phase] ?? 0;
    setPhase(id, { ...current, taskId, prevDistToLoad: distToLoad, closestToLoad: closest });

    const advanceTo = (newPhase, extraData = {}) => {
      if ((PHASE_ORDER_MAP[newPhase] ?? 0) > currentOrder) {
        setPhase(id, { ...current, taskId, phase: newPhase, prevDistToLoad: distToLoad, closestToLoad: closest, ...extraData });
        return newPhase;
      }
      return phase;
    };

    if (phase === "to_load") {
      if (atLoad) {
        setPhase(id, { ...current, taskId, phase: "at_load", wasInsideLoad: true, outsideLoadCount: 0, insideDropCount: 0, prevDistToLoad: distToLoad, closestToLoad: closest });
        return "at_load";
      }
      return "to_load";
    }

    if (phase === "at_load") {
      if (!atLoad) {
        const count = (current.outsideLoadCount || 0) + 1;
        setPhase(id, { ...current, taskId, outsideLoadCount: count, prevDistToLoad: distToLoad, closestToLoad: closest });
        if (count >= 2) return advanceTo(hasDropPt ? "to_drop" : phase, { insideDropCount: 0 });
        return "at_load";
      } else {
        setPhase(id, { ...current, taskId, outsideLoadCount: 0, wasInsideLoad: true, prevDistToLoad: distToLoad, closestToLoad: closest });
      }
    }

    if (phase === "to_drop") {
      if (atDrop) {
        const insideCount = (current.insideDropCount || 0) + 1;
        setPhase(id, { ...current, taskId, insideDropCount: insideCount, prevDistToLoad: distToLoad, closestToLoad: closest });
        if (insideCount >= 2) return advanceTo("at_drop");
        return "to_drop";
      } else {
        if ((current.insideDropCount || 0) > 0) {
          setPhase(id, { ...current, taskId, insideDropCount: 0, prevDistToLoad: distToLoad, closestToLoad: closest });
        }
      }
    }

    return phase;
  }

  // ── Tell backend about phase change so route cache serves correct destination ──
  function reportPhaseToBackend(vehicleReg, phase) {
    fetch(`${API}/positions/phase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleReg, phase }),
    }).catch(() => {});
  }

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

  function formatDropoffDate(date, time) {
    if (!date) return null;
    try {
      const d = new Date(date + "T00:00:00");
      const dayStr = d.toLocaleDateString("en-ZA", { weekday:"short", day:"numeric", month:"short", year:"numeric" });
      return time ? `${dayStr} @ ${time}` : dayStr;
    } catch { return date; }
  }

  function buildInfoHtml(v) {
    const t         = v.activeTask;
    const id        = v.descrip || `veh-${v.id}`;
    const phase     = t?.phase;
    const routeInfo = vehicleRouteRef.current[id];
    const phaseColors = { to_load:"#1e88e5", at_load:"#fb8c00", to_drop:"#43a047", at_drop:"#43a047" };
    const phaseLabels = { to_load:"🚛 En route to loading", at_load:"🏭 At loading station", to_drop:"🚛 En route to dropoff", at_drop:"✅ Arrived at client" };
    const phaseColor  = phase ? (phaseColors[phase] || "#555") : "#555";
    const phaseLabel  = phase ? (phaseLabels[phase] || "") : "";
    const dropoffDate = t ? formatDropoffDate(t.date, t.pickupTime) : null;
    let taskSection = "";
    if (t) {
      taskSection = `
        <hr style="margin:5px 0;border:none;border-top:1px solid #e0e0e0;"/>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <div style="font-weight:700;color:#1e88e5;font-size:10px;">📦 ACTIVE TASK</div>
          <button onclick="window._fleetproGoToTask('${t.id}','${phase||''}')"
            style="background:#fff;color:#1e88e5;border:1px solid #1e88e5;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:600;cursor:pointer;white-space:nowrap;">
            Open in Tasks →
          </button>
        </div>
        ${t.orderNumber ? `<div style="font-size:10px;"><strong>Order:</strong> ${t.orderNumber}</div>` : ""}
        <div style="font-size:10px;"><strong>Driver:</strong> ${t.driverName || "—"}</div>
        <div style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><strong>Load:</strong> ${t.loadLocation || "—"}</div>
        <div style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><strong>Dropoff:</strong> ${t.dropoffLocation || "—"}</div>
        ${dropoffDate ? `<div style="font-size:10px;margin-top:2px;"><strong>Due:</strong> <span style="color:#f59e0b;font-weight:600;">${dropoffDate}</span></div>` : ""}
        ${phaseLabel ? `<hr style="margin:5px 0;border:none;border-top:1px solid #e0e0e0;"/>
        <div style="background:${phaseColor};color:#fff;border-radius:5px;padding:3px 6px;font-size:10px;font-weight:600;margin-bottom:4px;text-align:center;">${phaseLabel}</div>` : ""}
        ${routeInfo ? `
        <div style="display:flex;gap:8px;justify-content:center;margin-top:3px;">
          <div style="text-align:center;"><div style="font-size:9px;color:#888;">ETA</div><div style="font-size:12px;font-weight:700;color:#333;">⏱ ${routeInfo.duration}</div></div>
          <div style="text-align:center;"><div style="font-size:9px;color:#888;">Distance</div><div style="font-size:12px;font-weight:700;color:#333;">📍 ${routeInfo.distance}</div></div>
        </div>
        <div style="text-align:center;margin-top:3px;">
          <span style="font-size:10px;font-weight:700;color:#1e88e5;background:#e3f2fd;padding:2px 8px;border-radius:10px;">
            🕐 Arrival ≈ ${(() => { const a = new Date(Date.now() + (routeInfo.mins||0)*60000); return a.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Africa/Johannesburg'}); })()}
          </span>
        </div>
        <div style="font-size:9px;color:#aaa;text-align:center;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">to ${routeInfo.dest}</div>` : ""}
        <hr style="margin:5px 0;border:none;border-top:1px solid #e0e0e0;"/>
        <div style="font-size:9px;color:#888;margin-bottom:3px;text-align:center;">Manual override</div>
        <div style="display:flex;gap:4px;justify-content:center;">
          <button onclick="window._fleetproOverride('${id}','to_load','${t.id}')" style="background:#1e88e5;color:#fff;border:none;border-radius:5px;padding:4px 8px;font-size:10px;font-weight:600;cursor:pointer;">📦 → Loading</button>
          <button onclick="window._fleetproOverride('${id}','to_drop','${t.id}')" style="background:#43a047;color:#fff;border:none;border-radius:5px;padding:4px 8px;font-size:10px;font-weight:600;cursor:pointer;">🏁 → Dropoff</button>
        </div>`;
    }
    return `<div style="font-family:Arial,sans-serif;font-size:11px;line-height:1.35;width:100%;max-width:240px;box-sizing:border-box;overflow:hidden;word-break:break-word;">
      <div style="font-weight:700;color:#111;font-size:13px;margin-bottom:2px;">${v.descrip || "Unknown"}</div>
      <div style="color:#555;font-size:10px;"><strong>Updated:</strong> ${formatDate(v.dt)}</div>
      <div style="color:#555;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><strong>Location:</strong> ${v.address || `${v.lat}, ${v.lon}`}</div>
      <div style="color:#555;font-size:10px;"><strong>Speed:</strong> ${v.speed || 0} km/h</div>
      <hr style="margin:5px 0;border:none;border-top:1px solid #e0e0e0;"/>
      <div style="display:flex;gap:4px;justify-content:center;">
        <button id="fleetpro-share-btn" onclick="window._fleetproShareLocation(${v.lat},${v.lon},'${v.descrip||'Vehicle'}')" style="background:#1e88e5;color:#fff;border:none;border-radius:5px;padding:4px 8px;font-size:10px;font-weight:600;cursor:pointer;flex:1;">📋 Copy Link</button>
        ${isAdmin || role === 'controller' ? `<button onclick="window._fleetproSaveLocation(${v.lat},${v.lon},'${v.address||''}')" style="background:#7c3aed;color:#fff;border:none;border-radius:5px;padding:4px 8px;font-size:10px;font-weight:600;cursor:pointer;flex:1;">📍 Save Point</button>` : ""}
      </div>
      ${taskSection}
    </div>`;
  }

  function getSymbolIcon(speed, heading) {
    const g = window.google, sp = Number(speed || 0);
    if (sp < 5) return { path:g.maps.SymbolPath.CIRCLE, scale:6, fillColor:"#ff3b30", fillOpacity:1, strokeColor:"#000", strokeWeight:1 };
    return { path:g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale:6, rotation:Number(heading||0), fillColor:sp>40?"#007bff":"#FFA500", fillOpacity:1, strokeColor:"#000", strokeWeight:1 };
  }

  function animateMarker(marker, newLatLng) {
    const g = window.google; if (!marker || !g) return;
    const old = marker.getPosition(); if (!old) return marker.setPosition(newLatLng);
    const steps=25, dLat=(newLatLng.lat()-old.lat())/steps, dLng=(newLatLng.lng()-old.lng())/steps;
    let i=0;
    function step() { i++; marker.setPosition(new g.maps.LatLng(old.lat()+dLat*i,old.lng()+dLng*i)); if(i<steps) requestAnimationFrame(step); }
    step();
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  function drawPolyline(map, path, color) {
    const g = window.google;
    return new g.maps.Polyline({
      path, strokeColor:color, strokeOpacity:0.75, strokeWeight:3,
      zIndex:1, geodesic:false,
      icons:[{ icon:{path:g.maps.SymbolPath.FORWARD_CLOSED_ARROW,scale:2,strokeColor:color}, offset:"50%" }],
      map,
    });
  }

  function updateRouteAndEta(v) {
    const map  = mapInstance.current;
    const id   = v.descrip || `veh-${v.id}`;
    const task = v.activeTask;

    if (routeLinesRef.current[id]) { routeLinesRef.current[id].setMap(null); delete routeLinesRef.current[id]; }
    delete vehicleRouteRef.current[id];

    if (!task || task.status !== "inprogress" || !task.routeCache) return;

    // Phase comes from backend — single source of truth for all browsers
    const phase = task.phase;
    if (!phase || phase === "at_drop") return;

    let color = "#1e88e5"; // blue = to_load
    if (phase === "to_drop" || phase === "at_load") color = "#43a047"; // green = to_drop
    routeLinesRef.current[id] = drawPolyline(map, task.routeCache.path, color);
    vehicleRouteRef.current[id] = {
      duration: task.routeCache.duration,
      distance: task.routeCache.distance,
      mins:     task.routeCache.mins,
      dest:     task.routeCache.destTitle,
    };
    applyRouteStyles();
  }

  function drawOrUpdateVehicles(data) {
    const g = window.google, map = mapInstance.current;
    if (!map) return;
    if (!map.activeInfoWindow) map.activeInfoWindow = new g.maps.InfoWindow({ maxWidth: 280 });
    const activeInfo = map.activeInfoWindow;

    data.forEach(v => {
      const id   = v.descrip || `veh-${v.id}`;
      const pos  = new g.maps.LatLng(v.lat, v.lon);
      const icon = getSymbolIcon(v.speed, v.heading);
      const labelHtml = `${v.descrip||"—"}<br/>${v.speed||0} km/h`;

      const onMarkerClick = () => {
        activeVehicleRef.current = id;
        activeInfo.setContent(buildInfoHtml(v));
        activeInfo.open(map, markersRef.current[id]?.marker);
        applyRouteStyles();
      };

      if (markersRef.current[id]) {
        const mk = markersRef.current[id];
        animateMarker(mk.marker, pos);
        mk.marker.setIcon(icon);
        mk.labelOverlay.updateContent(labelHtml);
        mk.labelOverlay.updatePosition(pos);
        g.maps.event.clearListeners(mk.marker, "click");
        mk.marker.addListener("click", onMarkerClick);
      } else {
        const marker = new g.maps.Marker({ map, position:pos, icon, zIndex:10 });
        const labelOverlay = createLabelOverlay(map, pos, labelHtml);
        marker.addListener("click", onMarkerClick);
        markersRef.current[id] = { marker, labelOverlay };
      }
      updateRouteAndEta(v);
    });
    // Reapply styles after all vehicles drawn
    applyRouteStyles();
  }

  async function drawPoints(positions) {
    const g = window.google, map = mapInstance.current;
    if (!g || !map) return;
    pointOverlaysRef.current.forEach(o => { if(o.circle) o.circle.setMap(null); if(o.dot) o.dot.setMap(null); });
    pointOverlaysRef.current = [];
    try {
      const points = await fetch(`${API}/points`).then(r => r.json());
      // Clients only see points for their own active tasks
      let visiblePoints = points;
      if (!isAdmin && clientId && Array.isArray(positions)) {
        const allowedTitles = new Set();
        positions.forEach(v => {
          if (!v.activeTask) return;
          if (v.activeTask.loadLocation) allowedTitles.add(v.activeTask.loadLocation.toLowerCase().trim());
          if (v.activeTask.dropoffLocation) allowedTitles.add(v.activeTask.dropoffLocation.toLowerCase().trim());
        });
        visiblePoints = points.filter(p => allowedTitles.has((p.title||"").toLowerCase().trim()));
      }
      visiblePoints.forEach(p => {
        const lat=Number(p.lat), lon=Number(p.lon), radius=Number(p.radius)||1000;
        if(isNaN(lat)||isNaN(lon)) return;
        const center = new g.maps.LatLng(lat,lon);
        const color  = (p.type||"").toLowerCase()==="dropoff" ? "#8ee68e" : "#7fb3ff";
        const circle = new g.maps.Circle({ map,center,radius,fillColor:color,fillOpacity:0.18,strokeColor:color,strokeOpacity:0.7,strokeWeight:2 });
        const dot    = new g.maps.Marker({ map,position:center,icon:{path:g.maps.SymbolPath.CIRCLE,scale:2,fillColor:color,fillOpacity:1,strokeColor:"#111",strokeWeight:1} });
        const info   = new g.maps.InfoWindow({ content:`<div style="font-size:12px;color:#222;">${p.title||"Point"}<br/>Radius: ${radius} m</div>`, maxWidth:200 });
        dot.addListener("click", () => info.open(map,dot));
        pointOverlaysRef.current.push({ circle, dot });
      });
    } catch(err) { console.error("Failed to load points:",err); }
  }

  useEffect(() => {
    let pollTimer = null;
    function initWhenReady() {
      const g = window.google;
      if (!g || !g.maps) { pollTimer = setTimeout(initWhenReady, 200); return; }
      if (!mapInstance.current && mapRef.current) {
        mapInstance.current = new g.maps.Map(mapRef.current, { center:{lat:-26.1,lng:28.1},zoom:8,streetViewControl:false,mapTypeControl:true });
        // Click empty map → reset route highlight and close popup
        mapInstance.current.addListener("click", () => {
          activeVehicleRef.current = null;
          applyRouteStyles();
          if (mapInstance.current?.activeInfoWindow) mapInstance.current.activeInfoWindow.close();
        });
      }

      window._fleetproShareLocation = (lat, lon, reg) => {
        const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
        const text    = `📍 ${reg} current location:\n${mapsUrl}`;
        if (navigator.share) {
          navigator.share({ title: `${reg} Location`, text, url: mapsUrl }).catch(() => {});
        } else {
          navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById("fleetpro-share-btn");
            if (btn) { btn.textContent = "✅ Copied!"; setTimeout(() => { btn.textContent = "📋 Copy Link"; }, 2000); }
          }).catch(() => { window.prompt("Copy this link:", mapsUrl); });
        }
      };

      window._fleetproSaveLocation = (lat, lon, address) => {
        const existing = document.getElementById("fleetpro-save-modal");
        if (existing) existing.remove();
        const modal = document.createElement("div");
        modal.id = "fleetpro-save-modal";
        modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;";
        modal.innerHTML = `
          <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;width:300px;font-family:Arial,sans-serif;">
            <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px;">📍 Save as Point</div>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:14px;">${address || `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`}</div>
            <div style="margin-bottom:10px;">
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">Point Name *</label>
              <input id="fp-save-title" placeholder="e.g. Sephaku Lichtenburg" style="width:100%;background:#0f1724;border:1px solid #334155;border-radius:6px;padding:8px;font-size:13px;color:#fff;box-sizing:border-box;" />
            </div>
            <div style="margin-bottom:10px;">
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">Type *</label>
              <select id="fp-save-type" style="width:100%;background:#0f1724;border:1px solid #334155;border-radius:6px;padding:8px;font-size:13px;color:#fff;box-sizing:border-box;">
                <option value="loading">Loading Point</option>
                <option value="dropoff">Dropoff Point</option>
              </select>
            </div>
            <div style="margin-bottom:14px;">
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">Radius (metres)</label>
              <input id="fp-save-radius" type="number" value="1000" style="width:100%;background:#0f1724;border:1px solid #334155;border-radius:6px;padding:8px;font-size:13px;color:#fff;box-sizing:border-box;" />
            </div>
            <div id="fp-save-error" style="color:#f87171;font-size:11px;margin-bottom:8px;display:none;"></div>
            <div style="display:flex;gap:8px;">
              <button id="fp-save-confirm" style="flex:1;background:#7c3aed;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;">Save Point</button>
              <button onclick="document.getElementById('fleetpro-save-modal').remove()" style="flex:1;background:#334155;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
        modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
        document.getElementById("fp-save-confirm").addEventListener("click", async () => {
          const title  = document.getElementById("fp-save-title").value.trim();
          const type   = document.getElementById("fp-save-type").value;
          const radius = parseInt(document.getElementById("fp-save-radius").value) || 1000;
          const errEl  = document.getElementById("fp-save-error");
          if (!title) { errEl.textContent = "Point name is required."; errEl.style.display = "block"; return; }
          const btn = document.getElementById("fp-save-confirm");
          btn.textContent = "Saving..."; btn.disabled = true;
          try {
            const res = await fetch(`${API}/points`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, type, lat, lon, radius, address: address || null }),
            });
            if (!res.ok) throw new Error("Save failed");
            modal.remove();
            const toast = document.createElement("div");
            toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;padding:10px 20px;border-radius:8px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.3);";
            toast.textContent = `✅ "${title}" saved as ${type === "loading" ? "Loading" : "Dropoff"} Point`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
          } catch {
            errEl.textContent = "Failed to save — please try again.";
            errEl.style.display = "block";
            btn.textContent = "Save Point"; btn.disabled = false;
          }
        });
      };

      window._fleetproGoToTask = (taskId, phase) => {
        if (mapInstance.current?.activeInfoWindow) mapInstance.current.activeInfoWindow.close();
        const phaseParam = phase ? `&phase=${phase}` : "";
        window.location.href = `/tasks?highlight=${taskId}${phaseParam}`;
      };

      window._fleetproOverride = (vehicleId, newPhase, taskId) => {
        fetch(`${API}/positions/phase`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vehicleReg: vehicleId, phase: newPhase, taskId }),
        }).then(() => {
          console.log(`🔧 Manual override: ${vehicleId} → ${newPhase}`);
          fetchAll();
        }).catch(() => {});
      };

      const keepalive = setInterval(() => fetch(`${API}/health`).catch(()=>{}), 2*60*1000);

      async function fetchAll() {
        try {
          let positions = await fetch(`${API}/positions`).then(r=>r.json());
          if (!Array.isArray(positions)) positions = [];
          if (!isAdmin && clientId) {
            positions = positions.filter(v => v.activeTask && v.activeTask.clientId === clientId);
          }
          drawOrUpdateVehicles(positions);
          await drawPoints(positions);

          // Auto-open vehicle popup if navigated from Tasks page
          const urlVehicle = new URLSearchParams(window.location.search).get("vehicle");
          if (urlVehicle) {
            const match = positions.find(v => (v.descrip || "").trim().toUpperCase() === urlVehicle.trim().toUpperCase());
            if (match) {
              const id = match.descrip || `veh-${match.id}`;
              const mk = markersRef.current[id];
              if (mk && mapInstance.current) {
                mapInstance.current.panTo({ lat: match.lat, lng: match.lon });
                mapInstance.current.setZoom(12);
                const activeInfo = mapInstance.current.activeInfoWindow;
                if (activeInfo) {
                  activeVehicleRef.current = id;
                  activeInfo.setContent(buildInfoHtml(match));
                  activeInfo.open(mapInstance.current, mk.marker);
                  applyRouteStyles();
                }
                window.history.replaceState({}, "", "/");
              }
            }
          }
        } catch(err) { console.error("fetchAll error:",err); }
      }
      fetchAll();
      const interval = setInterval(fetchAll, 30000);
      return () => { clearInterval(interval); clearInterval(keepalive); delete window._fleetproOverride; delete window._fleetproGoToTask; };
    }
    initWhenReady();
    return () => { if (pollTimer) clearTimeout(pollTimer); };
  }, []);

  useEffect(() => {
    const onResize = () => { if(mapInstance.current&&window.google) window.google.maps.event.trigger(mapInstance.current,"resize"); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="w-full h-[100vh] relative overflow-hidden">
      <div ref={mapRef} style={{ position:"absolute",inset:0,width:"100%",height:"100%",borderRadius:6 }} />
    </div>
  );
}
