import React, { useEffect, useRef } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";

// Phase order
const PHASE_ORDER_MAP = { to_load: 0, at_load: 1, to_drop: 2, at_drop: 3 };

// ── Read phase from localStorage ───────────────────────────────────────────
function getPhase(id) {
  try { return JSON.parse(localStorage.getItem("fleetpro_phase_cache") || "{}")[id] || null; }
  catch { return null; }
}

function getAllPhases() {
  try { return JSON.parse(localStorage.getItem("fleetpro_phase_cache") || "{}"); }
  catch { return {}; }
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

// ── Build phases query string to send with every poll ─────────────────────
// Tells the backend exactly which phase each vehicle is in.
// Backend uses this directly — no guessing needed.
function buildPhasesParam() {
  const all = getAllPhases();
  const entries = Object.entries(all)
    .filter(([, v]) => v?.phase)
    .map(([reg, v]) => `${reg}:${v.phase}`);
  return entries.length > 0 ? `?phases=${entries.join(",")}` : "";
}

export default function MapView({ role = "admin", clientId = null }) {
  const isAdmin = role === "admin";
  const mapRef           = useRef(null);
  const mapInstance      = useRef(null);
  const markersRef       = useRef({});
  const pointOverlaysRef = useRef([]);
  const routeLinesRef    = useRef({});
  const vehicleRouteRef  = useRef({});
  const activeVehicleRef = useRef(null); // tracks which vehicle is currently selected

  // ── Phase logic ────────────────────────────────────────────────────────────
  //
  // IRON RULES:
  // 1. New task ID always resets to to_load — fresh start, old task is done.
  // 2. Same task ID never goes backwards automatically — ever.
  // 3. to_load → at_load: physically inside load zone.
  // 4. at_load → to_drop: 2 consecutive readings outside load zone.
  // 5. to_drop → at_drop: 2 consecutive readings inside drop zone.
  // 6. atDrop uses ONLY the task's assigned dropoff coordinates.
  //    Driving through other saved point circles never triggers phase change.
  // 7. Manual override is the ONLY way to move phase backwards.
  //
  function resolvePhase(id, taskId, atLoad, atDrop, hasLoadPt, hasDropPt, distToLoad, loadRadius) {
    const current = getPhase(id);
    const closest = Math.min(current?.closestToLoad ?? distToLoad, distToLoad);

    // New task — always reset cleanly to to_load
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

    // to_load: wait to physically enter loading zone
    if (phase === "to_load") {
      if (atLoad) {
        setPhase(id, { ...current, taskId, phase: "at_load", wasInsideLoad: true, outsideLoadCount: 0, insideDropCount: 0, prevDistToLoad: distToLoad, closestToLoad: closest });
        return "at_load";
      }
      return "to_load";
    }

    // at_load: inside loading zone, wait for driver to load and leave
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

    // to_drop: heading to assigned dropoff — 2 readings required to prevent drive-through triggers
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

    // at_drop: stay here until task completed or manual override
    return phase;
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
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

  // ── Bring selected vehicle route to front ─────────────────────────────────
  // When clicking a vehicle, its route line gets zIndex boosted so it sits
  // on top of all other overlapping routes for clear visibility
  function bringRouteToFront(selectedId) {
    Object.entries(routeLinesRef.current).forEach(([id, line]) => {
      if (!line) return;
      if (id === selectedId) {
        line.setOptions({ zIndex: 100, strokeOpacity: 1.0, strokeWeight: 6 });
      } else {
        line.setOptions({ zIndex: 1, strokeOpacity: 0.4, strokeWeight: 3 });
      }
    });
    activeVehicleRef.current = selectedId;
  }

  function resetRouteStyles() {
    Object.values(routeLinesRef.current).forEach(line => {
      if (line) line.setOptions({ zIndex: 1, strokeOpacity: 0.85, strokeWeight: 4 });
    });
    activeVehicleRef.current = null;
  }

  function buildInfoHtml(v) {
    const t         = v.activeTask;
    const id        = v.descrip || `veh-${v.id}`;
    const phase     = getPhase(id)?.phase;
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
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><strong>Load:</strong> ${t.loadLocation || "—"}</div>
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><strong>Dropoff:</strong> ${t.dropoffLocation || "—"}</div>
        ${phaseLabel ? `<hr style="margin:8px 0;border:none;border-top:1px solid #e0e0e0;"/>
        <div style="background:${phaseColor};color:#fff;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:600;margin-bottom:6px;text-align:center;">${phaseLabel}</div>` : ""}
        ${routeInfo ? `
        <div style="display:flex;gap:12px;justify-content:center;margin-top:4px;">
          <div style="text-align:center;"><div style="font-size:10px;color:#888;">ETA</div><div style="font-size:14px;font-weight:700;color:#333;">⏱ ${routeInfo.duration}</div></div>
          <div style="text-align:center;"><div style="font-size:10px;color:#888;">Distance</div><div style="font-size:14px;font-weight:700;color:#333;">📍 ${routeInfo.distance}</div></div>
        </div>
        <div style="text-align:center;margin-top:4px;">
          <span style="font-size:12px;font-weight:700;color:#1e88e5;background:#e3f2fd;padding:2px 10px;border-radius:12px;">
            🕐 Arrival ≈ ${(() => { const a = new Date(Date.now() + (routeInfo.mins||0)*60000); return a.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Africa/Johannesburg'}); })()}
          </span>
        </div>
        <div style="font-size:10px;color:#aaa;text-align:center;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">to ${routeInfo.dest}</div>` : ""}
        <hr style="margin:8px 0;border:none;border-top:1px solid #e0e0e0;"/>
        <div style="font-size:10px;color:#888;margin-bottom:4px;text-align:center;">Manual override</div>
        <div style="display:flex;gap:6px;justify-content:center;">
          <button onclick="window._fleetproOverride('${id}','to_load')" style="background:#1e88e5;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;">📦 → Loading</button>
          <button onclick="window._fleetproOverride('${id}','to_drop')" style="background:#43a047;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;">🏁 → Dropoff</button>
        </div>`;
    }
    return `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.4;width:240px;box-sizing:border-box;overflow:hidden;">
      <div style="font-weight:700;color:#111;font-size:15px;margin-bottom:4px;">${v.descrip || "Unknown"}</div>
      <div style="color:#555;font-size:12px;"><strong>Updated:</strong> ${formatDate(v.dt)}</div>
      <div style="color:#555;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><strong>Location:</strong> ${v.address || `${v.lat}, ${v.lon}`}</div>
      <div style="color:#555;font-size:12px;"><strong>Speed:</strong> ${v.speed || 0} km/h</div>
      <hr style="margin:8px 0;border:none;border-top:1px solid #e0e0e0;"/>
      <div style="font-size:10px;color:#888;margin-bottom:4px;text-align:center;">Share location</div>
      <div style="display:flex;gap:6px;justify-content:center;">
        <button id="fleetpro-share-btn" onclick="window._fleetproShareLocation(${v.lat},${v.lon},'${v.descrip||'Vehicle'}')" style="background:#1e88e5;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;width:100%;">📋 Copy Link</button>
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

  function drawPolyline(map, path, color, isActive = false) {
    const g = window.google;
    return new g.maps.Polyline({
      path,
      strokeColor:   color,
      strokeOpacity: isActive ? 1.0 : 0.85,
      strokeWeight:  isActive ? 6   : 4,
      zIndex:        isActive ? 100 : 1,
      geodesic:      false,
      icons: [{ icon:{ path:g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale:3, strokeColor:color }, offset:"50%" }],
      map,
    });
  }

  function updateRouteAndEta(v) {
    const map  = mapInstance.current;
    const id   = v.descrip || `veh-${v.id}`;
    const task = v.activeTask;

    if (routeLinesRef.current[id]) { routeLinesRef.current[id].setMap(null); delete routeLinesRef.current[id]; }
    delete vehicleRouteRef.current[id];

    if (!task || task.status !== "inprogress") return;

    // Use coordinates resolved by backend — no geocoding in browser
    const loadPt = task.loadPoint;
    const dropPt = task.dropPoint;

    const loadRadius = loadPt?.radius || 500;
    const dropRadius = dropPt?.radius || 500;
    const distToLoad = loadPt ? haversineM(v.lat, v.lon, loadPt.lat, loadPt.lon) : Infinity;
    const distToDrop = dropPt ? haversineM(v.lat, v.lon, dropPt.lat, dropPt.lon) : Infinity;
    const atLoad     = loadPt ? distToLoad <= loadRadius : false;
    const atDrop     = dropPt ? distToDrop <= dropRadius : false;

    const phase = resolvePhase(id, task.id, atLoad, atDrop, !!loadPt, !!dropPt, distToLoad, loadRadius);

    if (!phase || phase === "at_drop") return;

    // Draw route from backend pre-calculated data — no Google API call from browser
    const serverRoute = task.routeCache;
    if (serverRoute?.path?.length > 0) {
      let color = "#1e88e5"; // blue = to_load
      if (phase === "to_drop" || phase === "at_load") color = "#43a047"; // green = to_drop
      const isActive = activeVehicleRef.current === id;
      routeLinesRef.current[id] = drawPolyline(map, serverRoute.path, color, isActive);
      vehicleRouteRef.current[id] = {
        duration: serverRoute.duration,
        distance: serverRoute.distance,
        mins:     serverRoute.mins,
        dest:     serverRoute.destTitle,
      };
    }
  }

  function drawOrUpdateVehicles(data) {
    const g = window.google, map = mapInstance.current;
    if (!map) return;
    if (!map.activeInfoWindow) map.activeInfoWindow = new g.maps.InfoWindow({ maxWidth: 260 });
    const activeInfo = map.activeInfoWindow;

    data.forEach(v => {
      const id   = v.descrip || `veh-${v.id}`;
      const pos  = new g.maps.LatLng(v.lat, v.lon);
      const icon = getSymbolIcon(v.speed, v.heading);
      const labelHtml = `${v.descrip||"—"}<br/>${v.speed||0} km/h`;

      const onMarkerClick = () => {
        activeInfo.setContent(buildInfoHtml(v));
        activeInfo.open(map, markersRef.current[id]?.marker);
        // Bring this vehicle's route to front, fade others
        bringRouteToFront(id);
      };

      if (markersRef.current[id]) {
        const mk = markersRef.current[id];
        animateMarker(mk.marker, pos);
        mk.marker.setIcon(icon);
        mk.labelOverlay.updateContent(labelHtml);
        mk.labelOverlay.updatePosition(pos);
        mk.marker.addListener("click", onMarkerClick);
      } else {
        const marker = new g.maps.Marker({ map, position:pos, icon });
        const labelOverlay = createLabelOverlay(map, pos, labelHtml);
        marker.addListener("click", onMarkerClick);
        markersRef.current[id] = { marker, labelOverlay };
      }
      updateRouteAndEta(v);
    });
  }

  async function drawPoints() {
    const g = window.google, map = mapInstance.current;
    if (!g || !map) return;
    pointOverlaysRef.current.forEach(o => { if(o.circle) o.circle.setMap(null); if(o.dot) o.dot.setMap(null); });
    pointOverlaysRef.current = [];
    try {
      const points = await fetch(`${API}/points`).then(r => r.json());
      points.forEach(p => {
        const lat=Number(p.lat), lon=Number(p.lon), radius=Number(p.radius)||1000;
        if(isNaN(lat)||isNaN(lon)) return;
        const center = new g.maps.LatLng(lat,lon);
        const color  = (p.type||"").toLowerCase()==="dropoff" ? "#8ee68e" : "#7fb3ff";
        const circle = new g.maps.Circle({ map,center,radius,fillColor:color,fillOpacity:0.18,strokeColor:color,strokeOpacity:0.7,strokeWeight:2 });
        const dot    = new g.maps.Marker({ map,position:center,icon:{path:g.maps.SymbolPath.CIRCLE,scale:5,fillColor:color,fillOpacity:1,strokeColor:"#111",strokeWeight:1} });
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
        // Clicking anywhere on map resets route highlight styles
        mapInstance.current.addListener("click", () => {
          resetRouteStyles();
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

      window._fleetproOverride = (vehicleId, newPhase) => {
        const current = getPhase(vehicleId);
        if (!current) return;
        _forceSetPhase(vehicleId, {
          ...current,
          phase: newPhase,
          prevDistToLoad: Infinity,
          closestToLoad: Infinity,
          outsideLoadCount: 0,
          insideDropCount: 0,
          wasInsideLoad: newPhase === "to_drop" || newPhase === "at_drop",
        });
        console.log(`🔧 Manual override: ${vehicleId} → ${newPhase}`);
        fetchAll().then(() => {
          const mk = markersRef.current[vehicleId];
          const activeInfo = mapInstance.current?.activeInfoWindow;
          if (mk && activeInfo && activeInfo.getMap()) {
            fetch(`${API}/positions${buildPhasesParam()}`).then(r=>r.json()).then(positions => {
              const v = positions.find(p=>(p.descrip||`veh-${p.id}`)===vehicleId);
              if (v) activeInfo.setContent(buildInfoHtml(v));
            }).catch(()=>{});
          }
        });
      };

      const keepalive = setInterval(() => fetch(`${API}/health`).catch(()=>{}), 2*60*1000);

      async function fetchAll() {
        try {
          // Send all known phases with every poll — backend uses these directly
          const phases = buildPhasesParam();
          let positions = await fetch(`${API}/positions${phases}`).then(r=>r.json());
          if (!Array.isArray(positions)) positions = [];
          if (!isAdmin && clientId) {
            positions = positions.filter(v => v.activeTask && v.activeTask.clientId === clientId);
          }
          drawOrUpdateVehicles(positions);
          await drawPoints();
        } catch(err) { console.error("fetchAll error:",err); }
      }
      fetchAll();
      const interval = setInterval(fetchAll, 30000);
      return () => { clearInterval(interval); clearInterval(keepalive); delete window._fleetproOverride; };
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
    <div className="w-full h-[100vh] relative">
      <div ref={mapRef} style={{ position:"absolute",inset:0,width:"100%",height:"100%",borderRadius:6 }} />
    </div>
  );
}
