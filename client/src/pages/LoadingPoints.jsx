import React, { useEffect, useRef, useState } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api/points";

export default function LoadingPoints() {
  const [points, setPoints]   = useState([]);
  const [form, setForm]       = useState({ title: "", address: "", lat: "", lon: "", radius: 1000 });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [pinned, setPinned]   = useState(null); // { lat, lon, address }

  const mapRef     = useRef(null);
  const mapInst    = useRef(null);
  const markerRef  = useRef(null);
  const circleRef  = useRef(null);
  const geocoderRef = useRef(null);

  // ── Fetch points ────────────────────────────────────────────────────────────
  const fetchPoints = async () => {
    setLoading(true);
    try {
      const res  = await fetch(API);
      const data = await res.json();
      setPoints((data || []).filter((p) => p.type === "loading"));
    } catch { /* silent */ }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchPoints(); }, []);

  // ── Build map once Google is ready ──────────────────────────────────────────
  useEffect(() => {
    const init = () => {
      if (!mapRef.current || mapInst.current) return;
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: -26.2041, lng: 28.0473 },
        zoom: 9,
        mapTypeControl: false,
        streetViewControl: false,
      });
      mapInst.current  = map;
      geocoderRef.current = new window.google.maps.Geocoder();

      // Drop marker on click
      map.addListener("click", (e) => {
        const lat = e.latLng.lat();
        const lon = e.latLng.lng();
        placePin(lat, lon);

        // Reverse geocode to get address
        geocoderRef.current.geocode({ location: { lat, lng: lon } }, (results, status) => {
          const address = status === "OK" && results[0]
            ? results[0].formatted_address
            : `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
          setPinned({ lat, lon, address });
          setForm((f) => ({ ...f, lat, lon, address }));
        });
      });
    };

    if (window.google) { init(); }
    else {
      const interval = setInterval(() => {
        if (window.google) { clearInterval(interval); init(); }
      }, 300);
      return () => clearInterval(interval);
    }
  }, []);

  // ── Update circle when radius changes ───────────────────────────────────────
  useEffect(() => {
    if (circleRef.current) circleRef.current.setRadius(Number(form.radius) || 1000);
  }, [form.radius]);

  function placePin(lat, lon, radius) {
    const map = mapInst.current;
    if (!map) return;
    const pos = new window.google.maps.LatLng(lat, lon);

    if (markerRef.current) {
      markerRef.current.setPosition(pos);
      markerRef.current.setVisible(true);
    } else {
      markerRef.current = new window.google.maps.Marker({
        map, position: pos,
        icon: { url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png" },
      });
    }

    if (circleRef.current) {
      circleRef.current.setCenter(pos);
      circleRef.current.setRadius(Number(radius || form.radius) || 1000);
    } else {
      circleRef.current = new window.google.maps.Circle({
        map, center: pos,
        radius: Number(radius || form.radius) || 1000,
        strokeColor: "#3b82f6", strokeOpacity: 0.8, strokeWeight: 2,
        fillColor: "#3b82f6", fillOpacity: 0.15,
      });
    }
    map.panTo(pos);
    map.setZoom(14);
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return alert("Please enter a point name.");
    if (!form.lat || !form.lon) return alert("Please click on the map to place a pin first.");

    setSaving(true);
    try {
      const payload = {
        title: form.title,
        address: form.address || "",
        lat: Number(form.lat),
        lon: Number(form.lon),
        radius: Number(form.radius) || 1000,
        type: "loading",
      };
      const url    = editing ? `${API}/${editing}` : API;
      const method = editing ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); return alert(e.error || "Failed to save"); }
      resetForm();
      fetchPoints();
    } catch { alert("Failed to save point."); }
    finally { setSaving(false); }
  };

  const resetForm = () => {
    setForm({ title: "", address: "", lat: "", lon: "", radius: 1000 });
    setEditing(null);
    setPinned(null);
    if (markerRef.current) markerRef.current.setVisible(false);
    if (circleRef.current) circleRef.current.setMap(null);
    circleRef.current = null;
  };

  const startEdit = (p) => {
    setForm({ title: p.title, address: p.address || "", lat: p.lat, lon: p.lon, radius: p.radius || 1000 });
    setEditing(p.id);
    setPinned({ lat: p.lat, lon: p.lon, address: p.address });
    placePin(p.lat, p.lon, p.radius);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this loading point?")) return;
    await fetch(`${API}/${id}`, { method: "DELETE" });
    fetchPoints();
  };

  return (
    <div className="flex h-full" style={{ minHeight: "calc(100vh - 0px)" }}>
      {/* ── Left panel ── */}
      <div className="w-80 flex-shrink-0 bg-white border-r flex flex-col overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Loading Points</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click on the map to drop a pin</p>
        </div>

        {/* Form */}
        <div className="p-4 border-b bg-gray-50">
          <form onSubmit={handleSubmit} className="space-y-2">
            <input
              type="text" placeholder="Point Name *"
              className="border p-2 rounded w-full text-sm"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />

            {/* Pin status */}
            <div className={`text-xs px-2 py-1.5 rounded ${pinned ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-100 text-gray-400"}`}>
              {pinned
                ? `📍 ${pinned.address || `${Number(pinned.lat).toFixed(5)}, ${Number(pinned.lon).toFixed(5)}`}`
                : "No pin placed — click the map"}
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Geofence radius (metres)</label>
              <input
                type="number" min="100" step="100"
                className="border p-2 rounded w-full text-sm"
                value={form.radius}
                onChange={(e) => setForm({ ...form, radius: e.target.value })}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded text-sm font-medium">
                {saving ? "Saving..." : editing ? "Update" : "Add Point"}
              </button>
              {editing && (
                <button type="button" onClick={resetForm}
                  className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-sm">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Points list */}
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-gray-400 text-sm p-4">Loading...</p>}
          {!loading && points.length === 0 && (
            <p className="text-gray-400 text-sm p-4">No loading points yet. Click the map to add one.</p>
          )}
          {points.map((p) => (
            <div key={p.id}
              className="px-4 py-3 border-b hover:bg-blue-50 cursor-pointer"
              onClick={() => startEdit(p)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 text-sm truncate">{p.title}</div>
                  {p.address && <div className="text-xs text-gray-400 truncate mt-0.5">{p.address}</div>}
                  <div className="text-xs text-gray-400 mt-0.5">Radius: {p.radius}m</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                  className="text-red-500 hover:text-red-700 text-xs ml-2 flex-shrink-0"
                >Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Map ── */}
      <div ref={mapRef} className="flex-1" style={{ minHeight: "400px" }} />
    </div>
  );
}
