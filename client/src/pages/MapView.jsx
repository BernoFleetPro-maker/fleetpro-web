import React, { useEffect, useRef } from "react";

/**
 * Google Maps Vehicle Tracker
 * ✅ Single info popup at a time
 * ✅ Red/orange/blue vehicle icons (based on speed)
 * ✅ Vehicle reg + speed in persistent gray box label
 * ✅ Smooth marker animation
 * ✅ Loading & dropoff points with 1km radius
 * ✅ Full-screen responsive map
 */

export default function MapView() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  const trailsRef = useRef({});
  const pointOverlaysRef = useRef([]);

  // === Format Autotrak date ===
  function formatAutotrakDate(dtValue) {
    if (!dtValue) return "Unknown";
    const num = Number(dtValue);
    let date;
    try {
      if (!Number.isFinite(num)) date = new Date(dtValue);
      else if (num > 30000) {
        const ms = (num - 25569) * 86400 * 1000;
        date = new Date(ms);
      } else date = new Date();
      date = new Date(date.getTime() - 2 * 60 * 60 * 1000); // adjust timezone
      return date.toLocaleString("en-ZA", {
        timeZone: "Africa/Johannesburg",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return "Invalid date";
    }
  }

  // === Gray box label overlay ===
  function createLabelOverlay(map, id, position, html) {
    const g = window.google;
    if (!g) return null;

    function LabelOverlay(position, content) {
      this.position = position;
      this.content = content;
      this.div = null;
    }

    LabelOverlay.prototype = new g.maps.OverlayView();

    LabelOverlay.prototype.onAdd = function () {
      const div = document.createElement("div");
      div.style.position = "absolute";
      div.style.transform = "translate(-50%, 0)";
      div.style.zIndex = "999";
      div.innerHTML = `
        <div style="
          background: rgba(60,60,60,0.95);
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 11px;
          text-align: center;
          color: #fff;
          font-weight: 600;
          border: 1px solid #111;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgba(0,0,0,0.25);
        ">
          ${this.content}
        </div>
      `;
      this.div = div;
      this.getPanes().overlayLayer.appendChild(div);
    };

    LabelOverlay.prototype.draw = function () {
      const projection = this.getProjection();
      if (!projection || !this.div) return;
      const pos = projection.fromLatLngToDivPixel(this.position);
      this.div.style.left = pos.x + "px";
      this.div.style.top = pos.y + 30 + "px"; // below marker
    };

    LabelOverlay.prototype.onRemove = function () {
      if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
      this.div = null;
    };

    LabelOverlay.prototype.updatePosition = function (pos) {
      this.position = pos;
      this.draw();
    };

    LabelOverlay.prototype.updateContent = function (html) {
      this.content = html;
      if (this.div)
        this.div.querySelector("div").innerHTML = html;
    };

    const label = new LabelOverlay(position, html);
    label.setMap(map);
    return label;
  }

  // === Symbol icons (red/orange/blue) ===
  function getSymbolIcon(speed, heading) {
    const g = window.google;
    const sp = Number(speed || 0);
    if (sp < 5) {
      return {
        path: g.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: "#ff3b30", // red
        fillOpacity: 1,
        strokeColor: "#000",
        strokeWeight: 1,
      };
    } else {
      const color = sp > 40 ? "#007bff" : "#FFA500"; // blue / orange
      return {
        path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 6,
        rotation: Number(heading || 0),
        fillColor: color,
        fillOpacity: 1,
        strokeColor: "#000",
        strokeWeight: 1,
      };
    }
  }

  // === Popup content ===
  function infoHtml(v) {
    const time = formatAutotrakDate(v.dt);
    return `
      <div style="font-family: Arial, sans-serif; font-size: 13px; line-height:1.3;">
        <div style="font-weight:700; color:#111; font-size:14px; margin-bottom:6px">
          ${v.descrip || "Unknown"}
        </div>
        <div><strong>Last Updated:</strong> ${time}</div>
        <div><strong>Location:</strong> ${v.address || `Lat:${v.lat}, Lon:${v.lon}`}</div>
        <div><strong>Speed:</strong> ${v.speed || 0} km/h</div>
      </div>
    `;
  }

  // === Animate marker ===
  function animateMarker(marker, newLatLng) {
    const g = window.google;
    if (!marker || !g) return;
    const oldPos = marker.getPosition();
    if (!oldPos) return marker.setPosition(newLatLng);

    const steps = 25;
    const deltaLat = (newLatLng.lat() - oldPos.lat()) / steps;
    const deltaLng = (newLatLng.lng() - oldPos.lng()) / steps;
    let i = 0;

    function step() {
      i++;
      const lat = oldPos.lat() + deltaLat * i;
      const lng = oldPos.lng() + deltaLng * i;
      marker.setPosition(new g.maps.LatLng(lat, lng));
      if (i < steps) requestAnimationFrame(step);
    }
    step();
  }

  // === Draw or update all vehicles ===
  function drawOrUpdateVehicles(data) {
    const g = window.google;
    if (!mapInstance.current) return;

    if (!mapInstance.current.activeInfoWindow)
      mapInstance.current.activeInfoWindow = new g.maps.InfoWindow();

    const activeInfo = mapInstance.current.activeInfoWindow;

    data.forEach((v) => {
      const id = v.descrip || `veh-${v.id}`;
      const pos = new g.maps.LatLng(v.lat, v.lon);
      const icon = getSymbolIcon(v.speed, v.heading);

      // trail data
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
        mk.marker.addListener("click", () => {
          activeInfo.setContent(infoHtml(v));
          activeInfo.open(mapInstance.current, mk.marker);
        });
      } else {
        const marker = new g.maps.Marker({ map: mapInstance.current, position: pos, icon });
        const labelOverlay = createLabelOverlay(mapInstance.current, id, pos, labelHtml);
        marker.addListener("click", () => {
          activeInfo.setContent(infoHtml(v));
          activeInfo.open(mapInstance.current, marker);
        });
        markersRef.current[id] = { marker, labelOverlay };
      }

      // short trail line
      if (markersRef.current[id].trailPolyline)
        markersRef.current[id].trailPolyline.setMap(null);

      const path = trailsRef.current[id].map((p) => ({ lat: p.lat, lng: p.lng }));
      if (path.length > 1) {
        const poly = new g.maps.Polyline({
          path,
          strokeColor: icon.fillColor,
          strokeOpacity: 0.6,
          strokeWeight: 2,
          map: mapInstance.current,
        });
        markersRef.current[id].trailPolyline = poly;
        setTimeout(() => poly.setMap(null), 12000);
      }
    });
  }

// === Draw loading/dropoff circles using each point's custom radius ===
async function drawPoints() {
  const g = window.google;
  if (!g || !mapInstance.current) return;

  // clear existing overlays
  pointOverlaysRef.current.forEach((o) => {
    if (o.circle) o.circle.setMap(null);
    if (o.dot) o.dot.setMap(null);
  });
  pointOverlaysRef.current = [];

  try {
    const res = await fetch("https://fleetpro-backend-production.up.railway.app");
    const points = await res.json();

    points.forEach((p) => {
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      const radius = Number(p.radius) || 1000; // use saved radius or fallback
      if (isNaN(lat) || isNaN(lon)) return;

      const center = new g.maps.LatLng(lat, lon);
      const color =
        (p.type || "").toLowerCase() === "dropoff" ? "#8ee68e" : "#7fb3ff"; // green / blue

      // draw main radius circle
      const circle = new g.maps.Circle({
        map: mapInstance.current,
        center,
        radius,
        fillColor: color,
        fillOpacity: 0.18,
        strokeColor: color,
        strokeOpacity: 0.7,
        strokeWeight: 2,
      });

      // draw center dot marker
      const dot = new g.maps.Marker({
        map: mapInstance.current,
        position: center,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#111",
          strokeWeight: 1,
        },
      });

      // optional: label radius value on hover
      const info = new g.maps.InfoWindow({
        content: `<div style="font-size:12px; color:#222;">${p.title || "Point"}<br/>Radius: ${radius} m</div>`,
      });
      dot.addListener("click", () => info.open(mapInstance.current, dot));

      pointOverlaysRef.current.push({ circle, dot });
    });
  } catch (err) {
    console.error("Failed to load points:", err);
  }
}

  // === Fetch data ===
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
        const res = await fetch("https://fleetpro-backend-production.up.railway.app");
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

  // === Resize listener ===
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
      <div
        ref={mapRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          borderRadius: 6,
        }}
      />
    </div>
  );
}
