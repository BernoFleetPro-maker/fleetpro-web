import React, { useEffect, useRef } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";

export default function MapView({ role = "admin", clientId = null }) {
  const isAdmin = role === "admin";
  const mapRef           = useRef(null);
  const mapInstance      = useRef(null);
  const markersRef       = useRef({});
  const pointOverlaysRef = useRef([]);
  const routeLinesRef    = useRef({});
  const vehicleRouteRef  = useRef({});
  const activeVehicleRef = useRef(null);
  const lastDataRef      = useRef({}); // latest vehicle data per id

  // ── Apply highlight styles ─────────────────────────────────────────────────
  function applyRouteStyles() {
    const activeId = activeVehicleRef.current;
    Object.entries(routeLinesRef.current).forEach(([id, line]) => {
      if (!line) return;
      if (!activeId) {
        line.setOptions({ zIndex: 1, strokeOpacity: 0.55, strokeWeight: 2 });
      } else if (id === activeId) {
        line.setOptions({ zIndex: 100, strokeOpacity: 1.0, strokeWeight: 6 });
      } else {
        line.setOptions({ zIndex: 1, strokeOpacity: 0.2, strokeWeight: 2 });
      }
    });
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

  function buildInfoHtml(v) {
    const t         = v.activeTask;
    const id        = v.descrip || `veh-${v.id}`;
    const phase     = t?.phase;
    const routeInfo = vehicleRouteRef.current[id];
    const phaseColors = { to_load:"#1e88e5", at_load:"#fb8c00", to_drop:"#43a047", at_drop:"#43a047" };
    const phaseLabels = { to_load:"🚛 En route to loading", at_load:"🏭 At loading station", to_drop:"🚛 En route to dropoff", at_drop:"✅ Arrived at client" };
    const phaseColor = phase ? (phaseColors[phase] || "#555") : "#555";
    const phaseLabel = phase ? (phaseLabels[phase] || "") : "";
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
          <button onclick="window._fleetproOverride('${id}','to_load','${t.id}')" style="background:#1e88e5;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;">📦 → Loading</button>
          <button onclick="window._fleetproOverride('${id}','to_drop','${t.id}')" style="background:#43a047;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;">🏁 → Dropoff</button>
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

  function drawPolyline(map, path, color) {
    const g = window.google;
    return new g.maps.Polyline({
      path, strokeColor:color, strokeOpacity:0.55, strokeWeight:2,
      zIndex:1, geodesic:false,
      icons:[{ icon:{path:g.maps.SymbolPath.FORWARD_CLOSED_ARROW,scale:2,strokeColor:color}, offset:"50%" }],
      map,
    });
  }

  function updateRouteAndEta(v) {
    const map  = mapInstance.current;
    const id   = v.descrip || `veh-${v.id}`;
    const task = v.activeTask;

    lastDataRef.current[id] = v;

    if (routeLinesRef.current[id]) { routeLinesRef.current[id].setMap(null); delete routeLinesRef.current[id]; }
    delete vehicleRouteRef.current[id];

    if (!task || task.status !== "inprogress" || !task.routeCache) return;

    const phase = task.phase;
    if (!phase || phase === "at_drop") return;

    let color = "#1e88e5"; // blue = loading
    if (phase === "to_drop" || phase === "at_load") color = "#43a047"; // green = dropoff

    routeLinesRef.current[id] = drawPolyline(map, task.routeCache.path, color);
    vehicleRouteRef.current[id] = {
      duration: task.routeCache.duration,
      distance: task.routeCache.distance,
      mins:     task.routeCache.mins,
      dest:     task.routeCache.destTitle,
    };

    // Reapply styles so selected vehicle stays highlighted after redraw
    applyRouteStyles();
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

      // Manual override — calls backend directly so all browsers update immediately
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
