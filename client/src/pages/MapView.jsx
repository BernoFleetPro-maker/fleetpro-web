import React, { useEffect, useRef } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";

const MAPS_KEY = "AIzaSyCwlu54d0fcLUJ_7z7rG4wQSpDqoFlRPBw";

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

export default function MapView({ role = "admin", clientId = null }) {
  const isAdmin = role === "admin";
  const mapRef           = useRef(null);
  const mapInstance      = useRef(null);
  const markersRef       = useRef({});
  const pointOverlaysRef = useRef([]);
  const routeLinesRef    = useRef({});
  const vehicleRouteRef  = useRef({});
  const activeVehicleRef = useRef(null); // tracks selected vehicle for route highlight
  const lastPositionsRef = useRef([]);   // last fetched (post-filter) positions — patched instantly by SSE
  const clientsRef       = useRef(null); // null = not fetched yet; [] once fetched (admin/controller only)
  // Draft visibility choice while turning a vehicle available — nothing is
  // sent to the backend (so nothing becomes visible to anyone) until the
  // admin clicks Accept. Keyed by vehicleId. { availableToAll, clientIds }
  const pendingRef       = useRef({});

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

  // One-time global stylesheet injection for the bobbing animation — a CSS
  // @keyframes loop is used instead of JS so it stays smooth even with many
  // "available" markers animating on screen at once.
  function ensureAvailableBobStyle() {
    if (document.getElementById("fp-avail-bob-style")) return;
    const style = document.createElement("style");
    style.id = "fp-avail-bob-style";
    style.textContent = `
      @keyframes fpAvailBob {
        0%, 100% { transform: translateY(0); }
        50%      { transform: translateY(-6px); }
      }
      .fp-avail-bob { animation: fpAvailBob 1.8s ease-in-out infinite; }
    `;
    document.head.appendChild(style);
  }

  // Small amber "Available to load" tag rendered directly above the vehicle
  // marker, with a downward-pointing triangle whose tip touches the marker —
  // separate overlay from the reg/speed label so it can be added/removed
  // independently as availability changes.
  function createAvailableLabelOverlay(map, position) {
    const g = window.google; if (!g) return null;
    ensureAvailableBobStyle();
    function LO(pos) { this.position = pos; this.div = null; }
    LO.prototype = new g.maps.OverlayView();
    LO.prototype.onAdd = function () {
      const div = document.createElement("div");
      div.style.cssText = "position:absolute;transform:translate(-50%,-100%);z-index:999;pointer-events:none;";
      div.innerHTML = `
        <div class="fp-avail-bob" style="display:flex;flex-direction:column;align-items:center;">
          <div style="background:#f59e0b;padding:2px 7px;border-radius:6px;font-size:10px;text-align:center;color:#3a2500;font-weight:700;border:1px solid #b45309;white-space:nowrap;">Available to load</div>
          <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #f59e0b;"></div>
        </div>`;
      this.div = div; this.getPanes().overlayLayer.appendChild(div);
    };
    LO.prototype.draw = function () {
      const proj = this.getProjection(); if (!proj || !this.div) return;
      const pos = proj.fromLatLngToDivPixel(this.position);
      this.div.style.left = pos.x + "px"; this.div.style.top = pos.y + "px";
    };
    LO.prototype.onRemove = function () { if (this.div?.parentNode) this.div.parentNode.removeChild(this.div); this.div = null; };
    LO.prototype.updatePosition = function (pos) { this.position = pos; this.draw(); };
    const lbl = new LO(position); lbl.setMap(map); return lbl;
  }

  // "Visible to" picker — an "All Clients" toggle (same style as the
  // Available switch, for consistency) that reveals a searchable checklist
  // of the tenant's clients when switched off. When `staging` is true,
  // every change here only edits the in-memory pendingRef draft (no network
  // call) — the actual save happens only when Accept is clicked. When false
  // (editing an already-available vehicle's audience), changes save as they
  // happen, same as before.
  function buildVisibilityPicker({ vehicleId, availableToAll, availableClientIds }) {
    const allOn = availableToAll !== false; // default true
    const ids   = (availableClientIds || []).map(String);
    const clients = clientsRef.current || [];
    // Every change here — whether the vehicle was just switched on or was
    // already available — goes into the pending draft and requires Accept.
    // This is what stops a wrong click from firing a real notification: the
    // change isn't sent to the backend until Accept is clicked.
    const allToggleHandler   = `window._fleetproSetVisibilityMode('${vehicleId}', this.checked)`;
    const clientCheckHandler = `window._fleetproToggleClientVisibility('${vehicleId}')`;

    const clientRows = clients.length
      ? clients.map(c => `
          <label class="fp-client-row" data-name="${(c.name || "").toLowerCase().replace(/"/g, "")}" style="display:flex;align-items:center;gap:6px;font-size:11px;color:#333;padding:3px 2px;cursor:pointer;">
            <input type="checkbox" value="${c.id}" ${ids.includes(String(c.id)) ? "checked" : ""} onchange="${clientCheckHandler}">
            <span>${c.name}</span>
          </label>`).join("")
      : `<div style="font-size:10px;color:#999;padding:4px 2px;">No clients yet</div>`;

    return `
      <div style="margin-top:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:10px;font-weight:600;color:#333;">Visible to All Clients</span>
          <label style="position:relative;display:inline-block;width:34px;height:18px;cursor:pointer;">
            <input type="checkbox" ${allOn ? "checked" : ""} onchange="${allToggleHandler}" style="opacity:0;width:0;height:0;">
            <span style="position:absolute;inset:0;background:${allOn ? '#f59e0b' : '#ccc'};border-radius:18px;transition:.15s;"></span>
            <span style="position:absolute;height:14px;width:14px;left:${allOn ? '18px' : '2px'};top:2px;background:#fff;border-radius:50%;transition:.15s;"></span>
          </label>
        </div>
        <div id="fleetpro-client-picker-${vehicleId}" style="margin-top:5px;${allOn ? "display:none;" : ""}">
          <input type="text" placeholder="Search clients…" oninput="window._fleetproFilterClients('${vehicleId}', this.value)"
            style="width:100%;font-size:10px;padding:4px 6px;border-radius:4px;border:1px solid #ccc;margin-bottom:4px;box-sizing:border-box;">
          <div id="fleetpro-client-checklist-${vehicleId}" style="max-height:110px;overflow-y:auto;border:1px solid #eee;border-radius:4px;padding:4px 6px;">
            ${clientRows}
          </div>
        </div>
      </div>`;
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
    const phaseColors = { to_load:"#1e88e5", at_load:"#1e88e5", to_drop:"#43a047", at_drop:"#43a047" };
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

    let availabilitySection = "";
    if ((isAdmin || role === 'controller') && v.vehicleId && t?.status !== 'inprogress') {
      // A pending draft means the admin just flipped the toggle on but
      // hasn't hit Accept yet — nothing has been saved, so nothing is
      // actually visible to any client until they confirm.
      const pending  = pendingRef.current[v.vehicleId];
      const staging  = !!pending;
      const showAsOn = v.available || staging;

      availabilitySection = `
      <hr style="margin:5px 0;border:none;border-top:1px solid #e0e0e0;"/>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:10px;font-weight:600;color:#333;">Available to Load</span>
        <label style="position:relative;display:inline-block;width:34px;height:18px;cursor:pointer;">
          <input type="checkbox" ${showAsOn ? "checked" : ""} onchange="window._fleetproOnAvailableToggle('${v.vehicleId}',this.checked)" style="opacity:0;width:0;height:0;">
          <span style="position:absolute;inset:0;background:${showAsOn ? '#f59e0b' : '#ccc'};border-radius:18px;transition:.15s;"></span>
          <span style="position:absolute;height:14px;width:14px;left:${showAsOn ? '18px' : '2px'};top:2px;background:#fff;border-radius:50%;transition:.15s;"></span>
        </label>
      </div>
      ${showAsOn ? buildVisibilityPicker({
        vehicleId: v.vehicleId,
        availableToAll: staging ? pending.availableToAll : v.availableToAll,
        availableClientIds: staging ? pending.clientIds : v.availableClientIds,
      }) : ""}
      ${staging ? `
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button onclick="window._fleetproConfirmAvailability('${v.vehicleId}')" style="flex:1;background:#16a34a;color:#fff;border:none;border-radius:5px;padding:6px;font-size:11px;font-weight:700;cursor:pointer;">✓ Accept</button>
        <button onclick="window._fleetproCancelAvailability('${v.vehicleId}')" style="flex:1;background:#94a3b8;color:#fff;border:none;border-radius:5px;padding:6px;font-size:11px;font-weight:700;cursor:pointer;">✕ Cancel</button>
      </div>` : ""}`;
    }

    return `<div style="font-family:Arial,sans-serif;font-size:11px;line-height:1.35;width:100%;max-width:240px;box-sizing:border-box;overflow:hidden;word-break:break-word;">
      <div style="font-weight:700;color:#111;font-size:13px;margin-bottom:2px;">${v.descrip || "Unknown"}</div>
      <div style="color:#555;font-size:10px;"><strong>Updated:</strong> ${formatDate(v.dt)}</div>
      <div style="color:#555;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><strong>Location:</strong> ${v.address || `${v.lat}, ${v.lon}`}</div>
      <div style="color:#555;font-size:10px;"><strong>Speed:</strong> ${v.speed || 0} km/h</div>
      <hr style="margin:5px 0;border:none;border-top:1px solid #e0e0e0;"/>
      <div style="display:flex;gap:4px;justify-content:center;">
        <button id="fleetpro-loc-btn" onclick="window._fleetproShowLocMenu(${v.lat},${v.lon},'${v.descrip||'Vehicle'}')" style="background:#1e88e5;color:#fff;border:none;border-radius:5px;padding:4px 8px;font-size:10px;font-weight:600;cursor:pointer;flex:1;text-align:center;">Current Location</button>
        ${isAdmin || role === 'controller' ? `<button onclick="window._fleetproSaveLocation(${v.lat},${v.lon},'${v.address||''}')" style="background:#7c3aed;color:#fff;border:none;border-radius:5px;padding:4px 8px;font-size:10px;font-weight:600;cursor:pointer;flex:1;text-align:center;">Save Point</button>` : ""}
      </div>
      ${availabilitySection}
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

    let color = "#1e88e5"; // blue = to_load / at_load (still on loading side)
    if (phase === "to_drop" || phase === "at_drop") color = "#43a047"; // green = dropoff side only
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
    if (!map.activeInfoWindow) {
      map.activeInfoWindow = new g.maps.InfoWindow({ maxWidth: 280 });
      // X button closed → reset highlight
      map.activeInfoWindow.addListener("closeclick", () => {
        discardPendingForActivePopup();
        activeVehicleRef.current = null;
        applyRouteStyles();
      });
    }
    const activeInfo = map.activeInfoWindow;

    const seenIds = new Set();

    data.forEach(v => {
      const id   = v.descrip || `veh-${v.id}`;
      seenIds.add(id);
      const pos  = new g.maps.LatLng(v.lat, v.lon);
      const icon = getSymbolIcon(v.speed, v.heading);
      const labelHtml = `${v.descrip||"—"}<br/>${v.speed||0} km/h`;

      const onMarkerClick = () => {
        // Click same vehicle again → deselect and reset
        if (activeVehicleRef.current === id) {
          discardPendingForActivePopup();
          activeVehicleRef.current = null;
          activeInfo.close();
          applyRouteStyles();
          return;
        }
        discardPendingForActivePopup(); // switching away from whatever else was open
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
        if (v.available) {
          if (mk.availableOverlay) mk.availableOverlay.updatePosition(pos);
          else mk.availableOverlay = createAvailableLabelOverlay(map, pos);
        } else if (mk.availableOverlay) {
          mk.availableOverlay.setMap(null);
          mk.availableOverlay = null;
        }
      } else {
        const marker = new g.maps.Marker({ map, position:pos, icon, zIndex:10 });
        const labelOverlay = createLabelOverlay(map, pos, labelHtml);
        const availableOverlay = v.available ? createAvailableLabelOverlay(map, pos) : null;
        marker.addListener("click", onMarkerClick);
        markersRef.current[id] = { marker, labelOverlay, availableOverlay };
      }
      updateRouteAndEta(v);
    });

    // Remove markers for vehicles no longer in this data set — e.g. a client
    // that just lost visibility of a vehicle which became unavailable (and
    // has no active task). Without this, the marker (and its amber "Available
    // to load" tag) would sit on the map forever, since the loop above only
    // ever adds/updates markers, never prunes ones that dropped out.
    Object.keys(markersRef.current).forEach(id => {
      if (seenIds.has(id)) return;
      const mk = markersRef.current[id];
      if (mk.marker)          mk.marker.setMap(null);
      if (mk.labelOverlay)    mk.labelOverlay.setMap(null);
      if (mk.availableOverlay) mk.availableOverlay.setMap(null);
      if (routeLinesRef.current[id]) { routeLinesRef.current[id].setMap(null); delete routeLinesRef.current[id]; }
      delete vehicleRouteRef.current[id];
      delete markersRef.current[id];
    });

    // Reapply styles after all vehicles drawn
    applyRouteStyles();
  }

  // Applies an availability/visibility change to the vehicle's data and
  // marker immediately, without waiting on a fetch or the next SSE echo —
  // this is what lets the "Visible to" picker appear the instant you flip
  // "Available to Load" on, in the same popup, instead of needing to close
  // and reopen it. refreshPopup defaults to true but is turned off for
  // per-client checkbox clicks, since re-rendering the popup on every click
  // would wipe out whatever the admin just typed in the client search box.
  function applyLocalAvailabilityUpdate(vehicleDbId, fields, refreshPopup = true) {
    const list = lastPositionsRef.current;
    const idx = list.findIndex(v => v.vehicleId === vehicleDbId);
    if (idx === -1) return;
    const merged  = { ...list[idx], ...fields };
    const updated = [...list];
    updated[idx] = merged;
    lastPositionsRef.current = updated;
    drawOrUpdateVehicles(updated);
    if (refreshPopup) refreshOpenPopupFor(vehicleDbId);
  }

  // Re-renders the currently open popup's content from the latest known data
  // for this vehicle — used both after a real save and after purely local
  // draft edits (staging a pending Accept/Cancel), so the popup never goes
  // stale without a full close/reopen.
  function refreshOpenPopupFor(vehicleDbId) {
    const v = lastPositionsRef.current.find(x => x.vehicleId === vehicleDbId);
    if (!v) return;
    const id = v.descrip || `veh-${v.id}`;
    if (activeVehicleRef.current === id && mapInstance.current?.activeInfoWindow) {
      mapInstance.current.activeInfoWindow.setContent(buildInfoHtml(v));
    }
  }

  // Discards any unsaved availability draft for whichever vehicle popup is
  // currently open — called whenever that popup is about to close or be
  // replaced, so an abandoned draft (closed via the X, or by opening another
  // marker) doesn't linger and reappear later.
  function discardPendingForActivePopup() {
    const openId = activeVehicleRef.current;
    if (!openId) return;
    const v = lastPositionsRef.current.find(x => (x.descrip || `veh-${x.id}`) === openId);
    if (v && pendingRef.current[v.vehicleId]) delete pendingRef.current[v.vehicleId];
  }

  async function drawPoints(positions) {
    const g = window.google, map = mapInstance.current;
    if (!g || !map) return;
    pointOverlaysRef.current.forEach(o => { if(o.circle) o.circle.setMap(null); if(o.dot) o.dot.setMap(null); });
    pointOverlaysRef.current = [];
    try {
      const points = await authFetch(`${API}/points`).then(r => r.json());
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
          discardPendingForActivePopup();
          activeVehicleRef.current = null;
          applyRouteStyles();
          if (mapInstance.current?.activeInfoWindow) mapInstance.current.activeInfoWindow.close();
        });
      }

      window._fleetproShowLocMenu = (lat, lon, reg) => {
        // Remove any existing menu
        const existing = document.getElementById("fp-loc-menu");
        if (existing) { existing.remove(); return; }

        const mapsUrl = `https://maps.google.com/?q=${lat},${lon}`;
        const shareText = `📍 ${reg} current location:\n${mapsUrl}`;

        const menu = document.createElement("div");
        menu.id = "fp-loc-menu";
        menu.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);";
        menu.innerHTML = `
          <div style="background:#1e293b;border:1px solid #334155;border-radius:14px;padding:18px;width:260px;font-family:Arial,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
            <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;">📍 ${reg}</div>
            <div style="font-size:10px;color:#94a3b8;margin-bottom:14px;">${lat.toFixed(5)}, ${lon.toFixed(5)}</div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <button id="fp-open-maps" style="background:#34a853;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;text-align:left;">
                🗺 Open in Google Maps
              </button>
              <button id="fp-share-link" style="background:#1e88e5;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;text-align:left;">
                📤 Share / Copy Link
              </button>
            </div>
            <button id="fp-loc-cancel" style="margin-top:10px;width:100%;background:transparent;color:#64748b;border:none;font-size:12px;cursor:pointer;padding:4px;">Cancel</button>
          </div>`;

        document.body.appendChild(menu);

        document.getElementById("fp-open-maps").onclick = () => {
          window.open(mapsUrl, "_blank");
          menu.remove();
        };

        document.getElementById("fp-share-link").onclick = () => {
          if (navigator.share) {
            navigator.share({ title: `${reg} Location`, text: shareText, url: mapsUrl }).catch(() => {});
          } else {
            navigator.clipboard.writeText(shareText).then(() => {
              document.getElementById("fp-share-link").textContent = "✅ Copied!";
              setTimeout(() => menu.remove(), 1200);
            }).catch(() => { window.prompt("Copy this link:", mapsUrl); menu.remove(); });
          }
        };

        document.getElementById("fp-loc-cancel").onclick = () => menu.remove();
        menu.addEventListener("click", (e) => { if (e.target === menu) menu.remove(); });
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
            const res = await authFetch(`${API}/points`, {
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
        authFetch(`${API}/positions/phase`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vehicleReg: vehicleId, phase: newPhase, taskId }),
        }).then(() => {
          console.log(`🔧 Manual override: ${vehicleId} → ${newPhase}`);
          fetchAll();
        }).catch(() => {});
      };

      // Ensures a pending draft exists for this vehicle, seeded from its
      // current saved values — used the first time any visibility control
      // is touched, whether that's freshly switching the vehicle on or
      // editing an already-available vehicle's audience. Every edit after
      // that just mutates the same draft; nothing reaches the backend until
      // Accept is clicked, which is the whole point: a wrong click never
      // fires a real notification, because it's never saved.
      function ensureDraft(v) {
        if (!pendingRef.current[v.vehicleId]) {
          pendingRef.current[v.vehicleId] = {
            availableToAll: v.availableToAll !== false,
            clientIds: (v.availableClientIds || []).slice(),
          };
        }
        return pendingRef.current[v.vehicleId];
      }

      // Flipping "Available to Load" ON never saves by itself — it opens a
      // draft (Accept/Cancel) so the admin can choose who sees it *before*
      // anything actually goes live.
      // Flipping it OFF: if the vehicle was never actually saved as
      // available (still just an unconfirmed draft), this just discards the
      // draft — nothing was ever sent. If it *was* genuinely live, this
      // turns it off for real, immediately (there's no oversharing risk in
      // hiding something), discarding any in-progress audience edit too.
      window._fleetproOnAvailableToggle = (vehicleDbId, checked) => {
        const v = lastPositionsRef.current.find(x => x.vehicleId === vehicleDbId);
        if (!v) return;

        if (checked) {
          if (v.available) return; // already live — nothing to stage
          ensureDraft(v);
          refreshOpenPopupFor(vehicleDbId);
          return;
        }

        if (!v.available) {
          // Was never actually live — just discard the unsaved draft.
          delete pendingRef.current[vehicleDbId];
          refreshOpenPopupFor(vehicleDbId);
          return;
        }

        delete pendingRef.current[vehicleDbId];
        authFetch(`${API}/vehicles/${vehicleDbId}/available`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ available: false }),
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { alert(data.error || "Failed to update availability"); refreshOpenPopupFor(vehicleDbId); return; }
          applyLocalAvailabilityUpdate(vehicleDbId, {
            available: data.available, availableToAll: data.availableToAll, availableClientIds: data.availableClientIds,
          });
        }).catch(() => { alert("Failed to update availability — network error"); refreshOpenPopupFor(vehicleDbId); });
      };

      // Flip the "Visible to All Clients" switch — draft-only, requires
      // Accept. A full popup re-render is needed either way here (to
      // reveal/hide the checklist and the Accept/Cancel buttons), and the
      // search box is empty at this point regardless of direction, so there's
      // nothing worth preserving across the re-render.
      window._fleetproSetVisibilityMode = (vehicleDbId, allChecked) => {
        const v = lastPositionsRef.current.find(x => x.vehicleId === vehicleDbId);
        if (!v) return;
        const pending = ensureDraft(v);
        pending.availableToAll = allChecked;
        refreshOpenPopupFor(vehicleDbId);
      };

      // Re-reads every checked client checkbox in the picker into the
      // pending draft — draft-only, requires Accept. Only re-renders the
      // popup on the very first edit (to reveal Accept/Cancel); after that,
      // the checkbox's own state already reflects the click, and re-
      // rendering on every click would wipe out the search box.
      window._fleetproToggleClientVisibility = (vehicleDbId) => {
        const v = lastPositionsRef.current.find(x => x.vehicleId === vehicleDbId);
        if (!v) return;
        const isFirstEdit = !pendingRef.current[vehicleDbId];
        const pending = ensureDraft(v);
        const checklist = document.getElementById(`fleetpro-client-checklist-${vehicleDbId}`);
        if (checklist) {
          pending.clientIds = Array.from(checklist.querySelectorAll("input[type=checkbox]:checked")).map(el => el.value);
        }
        if (!isFirstEdit) return;

        // First edit reveals Accept/Cancel, which requires a re-render —
        // preserve whatever was already typed into the search box through it.
        const picker    = document.getElementById(`fleetpro-client-picker-${vehicleDbId}`);
        const searchBox = picker ? picker.querySelector("input[type=text]") : null;
        const searchVal = searchBox ? searchBox.value : "";
        refreshOpenPopupFor(vehicleDbId);
        if (searchVal) {
          const newPicker    = document.getElementById(`fleetpro-client-picker-${vehicleDbId}`);
          const newSearchBox = newPicker ? newPicker.querySelector("input[type=text]") : null;
          if (newSearchBox) {
            newSearchBox.value = searchVal;
            window._fleetproFilterClients(vehicleDbId, searchVal);
          }
        }
      };

      // Accept — this is the only moment the vehicle's availability/audience
      // actually saves. Cancel — discard the draft, nothing was ever sent.
      window._fleetproConfirmAvailability = (vehicleDbId) => {
        const pending = pendingRef.current[vehicleDbId];
        if (!pending) return;
        authFetch(`${API}/vehicles/${vehicleDbId}/available`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ available: true, availableToAll: pending.availableToAll, clientIds: pending.clientIds }),
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { alert(data.error || "Failed to save availability"); return; }
          delete pendingRef.current[vehicleDbId];
          applyLocalAvailabilityUpdate(vehicleDbId, {
            available: data.available, availableToAll: data.availableToAll, availableClientIds: data.availableClientIds,
          });
        }).catch(() => alert("Failed to save availability — network error"));
      };
      window._fleetproCancelAvailability = (vehicleDbId) => {
        delete pendingRef.current[vehicleDbId];
        refreshOpenPopupFor(vehicleDbId);
      };

      // Live-filters the client checklist as the admin types in the search box.
      window._fleetproFilterClients = (vehicleDbId, query) => {
        const checklist = document.getElementById(`fleetpro-client-checklist-${vehicleDbId}`);
        if (!checklist) return;
        const q = query.trim().toLowerCase();
        checklist.querySelectorAll(".fp-client-row").forEach(row => {
          row.style.display = (row.getAttribute("data-name") || "").includes(q) ? "flex" : "none";
        });
      };

      const keepalive = setInterval(() => fetch(`${API}/health`).catch(()=>{}), 2*60*1000);

      // Backend already scopes /positions for client-role users, but we keep
      // this as a second guard — and reuse it below so the SSE instant-patch
      // path applies the exact same rule (a vehicle with no active task that
      // just went unavailable, or was restricted away from this client,
      // must disappear for a client, not just lose its amber tag).
      const isVisibleForClient = (v) =>
        (v.available === true && (
          v.availableToAll !== false ||
          (v.availableClientIds || []).includes(clientId) ||
          (v.availableClientIds || []).map(String).includes(String(clientId))
        )) ||
        (v.activeTask && (
          v.activeTask.clientId === clientId ||
          String(v.activeTask.clientId) === String(clientId)
        ));

      // Client list for the "visible to" picker — admin/controller only,
      // fetched once since it rarely changes during a session.
      if ((isAdmin || role === "controller") && clientsRef.current === null) {
        clientsRef.current = [];
        authFetch(`${API}/clients`).then(r => r.json()).then(data => {
          if (Array.isArray(data)) clientsRef.current = data;
        }).catch(() => {});
      }

      async function fetchAll() {
        try {
          let positions = await authFetch(`${API}/positions`).then(r=>r.json());
          if (!Array.isArray(positions)) positions = [];
          if (!isAdmin && clientId) {
            console.log("[FleetPro] Client filter — clientId:", clientId, "positions:", positions.map(v => ({ reg: v.descrip, available: v.available, taskClientId: v.activeTask?.clientId })));
            positions = positions.filter(isVisibleForClient);
            console.log("[FleetPro] Visible vehicles after filter:", positions.map(v => v.descrip));
          }
          lastPositionsRef.current = positions;
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

      // SSE — reacts to vehicle_available/vehicle_unavailable the instant they
      // arrive instead of waiting for the next 30s poll. If the vehicle isn't
      // already in our last-known list (e.g. a client seeing a vehicle that
      // just became available for the first time), fall back to a full
      // fetchAll() since we don't have its lat/lon/etc. to draw a marker from.
      let sse;
      let sseRetries = 0;
      let sseRetryTimeout;
      const MAX_SSE_RETRIES = 5;

      const connectSSE = () => {
        try {
          sse = new EventSource(`${API}/stream/events`);
          sse.onmessage = (e) => {
            sseRetries = 0;
            try {
              const msg = JSON.parse(e.data);
              if (msg.type !== "vehicle_available" && msg.type !== "vehicle_unavailable") return;
              const vehicleId = msg.data?.id;
              if (!vehicleId) return;
              const list = lastPositionsRef.current;
              const idx  = list.findIndex(v => v.vehicleId === vehicleId);

              if (idx === -1) {
                if (msg.type === "vehicle_available" && msg.data.position) {
                  // Full position piggybacked on the event (lat/lon/speed/
                  // availableToAll/etc) — draw the marker immediately, no
                  // fetchAll() round-trip needed. Still respect per-client
                  // visibility before adding it for a client-role viewer.
                  if (isAdmin || !clientId || isVisibleForClient(msg.data.position)) {
                    const updated = [...list, msg.data.position];
                    lastPositionsRef.current = updated;
                    drawOrUpdateVehicles(updated);
                  }
                } else if (msg.type === "vehicle_available") {
                  // No cached position at all (vehicle has no live GPS yet)
                  // — nothing to draw from locally, fall back to a refetch.
                  fetchAll();
                }
                return;
              }

              // Already known locally — prefer the full piggybacked position
              // so availableToAll/availableClientIds stay in sync too, not
              // just the available flag (e.g. an admin narrowing which
              // clients can see an already-available vehicle).
              const patched = msg.data.position
                ? { ...list[idx], ...msg.data.position }
                : { ...list[idx], available: msg.type === "vehicle_available" };

              let updated;
              if (!isAdmin && clientId && !isVisibleForClient(patched)) {
                // No longer visible to this client at all (not just missing
                // the amber tag) — drop it so the cleanup pass in
                // drawOrUpdateVehicles removes its marker too.
                updated = list.filter((_, i) => i !== idx);
              } else {
                updated = [...list];
                updated[idx] = patched;
              }
              lastPositionsRef.current = updated;
              drawOrUpdateVehicles(updated);
            } catch {}
          };
          sse.onerror = () => {
            sse.close();
            if (sseRetries < MAX_SSE_RETRIES) {
              const delay = Math.min(1000 * Math.pow(2, sseRetries), 30000);
              sseRetries++;
              sseRetryTimeout = setTimeout(connectSSE, delay);
            }
          };
        } catch {}
      };
      connectSSE();

      return () => {
        clearInterval(interval); clearInterval(keepalive);
        clearTimeout(sseRetryTimeout); if (sse) sse.close();
        delete window._fleetproOverride; delete window._fleetproGoToTask;
        delete window._fleetproOnAvailableToggle;
        delete window._fleetproConfirmAvailability; delete window._fleetproCancelAvailability;
        delete window._fleetproSetVisibilityMode; delete window._fleetproToggleClientVisibility;
        delete window._fleetproFilterClients;
      };
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
