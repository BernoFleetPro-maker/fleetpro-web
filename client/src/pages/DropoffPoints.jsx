import React, { useEffect, useRef, useState } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api/points";

export default function DropoffPoints() {
  const [points, setPoints]   = useState([]);
  const [form, setForm]       = useState({ title: "", address: "", lat: "", lon: "", radius: 1000 });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const mapRef        = useRef(null);
  const mapInst       = useRef(null);
  const markerRef     = useRef(null);
  const circleRef     = useRef(null);
  const geocoderRef   = useRef(null);
  const searchRef     = useRef(null);
  const autocompleteRef = useRef(null);

  const fetchPoints = async () => {
    setLoading(true);
    try {
      const res  = await fetch(API);
      const data = await res.json();
      setPoints((data || []).filter((p) => p.type === "dropoff"));
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { fetchPoints(); }, []);

  useEffect(() => {
    const init = () => {
      if (!mapRef.current || mapInst.current) return;

      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: -26.2041, lng: 28.0473 },
        zoom: 6,
        mapTypeControl: false,
        streetViewControl: false,
      });
      mapInst.current   = map;
      geocoderRef.current = new window.google.maps.Geocoder();

      // ── Google Places search — legacy Autocomplete ──
      if (searchRef.current && !autocompleteRef.current) {
        const ac = new window.google.maps.places.Autocomplete(searchRef.current, {
          componentRestrictions: { country: "za" },
          fields: ["formatted_address", "geometry", "name"],
        });
        autocompleteRef.current = ac;
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place.geometry?.location) return;
          const lat     = place.geometry.location.lat();
          const lon     = place.geometry.location.lng();
          const address = place.formatted_address || place.name || "";
          placePin(lat, lon);
          setPinned({ lat, lon, address });
          setForm(f => ({ ...f, lat, lon, address, title: f.title || place.name || "" }));
        });
      }

      // ── Map click for manual placement ──
      map.addListener("click", (e) => {
        const lat = e.latLng.lat();
        const lon = e.latLng.lng();
        placePin(lat, lon);
        geocoderRef.current.geocode({ location: { lat, lng: lon } }, (results, status) => {
          const address = status === "OK" && results[0]
            ? results[0].formatted_address
            : `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
          setPinned({ lat, lon, address });
          setForm(f => ({ ...f, lat, lon, address }));
        });
      });
    };

    if (window.google) { init(); }
    else {
      const iv = setInterval(() => { if (window.google) { clearInterval(iv); init(); } }, 300);
      return () => clearInterval(iv);
    }
  }, []);

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
        map, position: pos, draggable: true,
        title: "Drag to fine-tune location",
      });

      // Drag end — update coords + address
      markerRef.current.addListener("dragend", (e) => {
        const newLat = e.latLng.lat();
        const newLon = e.latLng.lng();
        if (circleRef.current) circleRef.current.setCenter(e.latLng);
        geocoderRef.current.geocode({ location: { lat: newLat, lng: newLon } }, (results, status) => {
          const address = status === "OK" && results[0]
            ? results[0].formatted_address
            : `${newLat.toFixed(5)}, ${newLon.toFixed(5)}`;
          setPinned({ lat: newLat, lon: newLon, address });
          setForm(f => ({ ...f, lat: newLat, lon: newLon, address }));
        });
      });
    }

    if (circleRef.current) {
      circleRef.current.setCenter(pos);
      circleRef.current.setRadius(Number(radius || form.radius) || 1000);
    } else {
      circleRef.current = new window.google.maps.Circle({
        map, center: pos,
        radius: Number(radius || form.radius) || 1000,
        strokeColor: "#16a34a", strokeOpacity: 0.8, strokeWeight: 2,
        fillColor: "#16a34a", fillOpacity: 0.15,
      });
    }
    map.panTo(pos);
    map.setZoom(14);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return alert("Please enter a point name.");
    if (!form.lat || !form.lon) return alert("Please search or click the map to place a pin first.");
    setSaving(true);
    try {
      const payload = {
        title: form.title, address: form.address || "",
        lat: Number(form.lat), lon: Number(form.lon),
        radius: Number(form.radius) || 1000, type: "dropoff",
      };
      const url    = editing ? `${API}/${editing}` : API;
      const method = editing ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const err = await res.json(); return alert(err.error || "Failed to save"); }
      resetForm();
      fetchPoints();
    } catch { alert("Failed to save point."); }
    finally { setSaving(false); }
  };

  const resetForm = () => {
    setForm({ title: "", address: "", lat: "", lon: "", radius: 1000 });
    setEditing(null); setPinned(null);
    if (searchRef.current) searchRef.current.value = "";
    if (markerRef.current) markerRef.current.setVisible(false);
    if (circleRef.current) { circleRef.current.setMap(null); circleRef.current = null; }
  };

  const startEdit = (p) => {
    setForm({ title: p.title, address: p.address || "", lat: p.lat, lon: p.lon, radius: p.radius || 1000 });
    setEditing(p.id);
    setPinned({ lat: p.lat, lon: p.lon, address: p.address });
    if (searchRef.current) searchRef.current.value = p.address || p.title || "";
    placePin(p.lat, p.lon, p.radius);
  };

  // Show pin and circle on map without entering edit mode
  const viewPin = (p) => {
    const map = mapInst.current;
    if (!map) return;
    const lat = Number(p.lat), lon = Number(p.lon), radius = Number(p.radius) || 1000;
    const pos = new window.google.maps.LatLng(lat, lon);

    if (markerRef.current) {
      markerRef.current.setPosition(pos);
      markerRef.current.setVisible(true);
      markerRef.current.setDraggable(false);
    } else {
      markerRef.current = new window.google.maps.Marker({ map, position: pos, draggable: false });
    }

    if (circleRef.current) {
      circleRef.current.setCenter(pos);
      circleRef.current.setRadius(radius);
    } else {
      circleRef.current = new window.google.maps.Circle({
        map, center: pos, radius,
        strokeColor: "#16a34a", strokeOpacity: 0.8, strokeWeight: 2,
        fillColor: "#16a34a", fillOpacity: 0.15,
      });
    }
    map.panTo(pos);
    map.setZoom(14);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this dropoff point?")) return;
    await fetch(`${API}/${id}`, { method: "DELETE" });
    fetchPoints();
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Dropoff Points</h2>

      <form onSubmit={handleSubmit} className="mb-6 space-y-2">
        {/* Point name */}
        <input
          type="text" placeholder="Loading Point Name"
          className="border p-2 w-full rounded"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />

        {/* Google Places search */}
        <div className="relative">
          <input
            ref={searchRef}
            type="text"
            placeholder="🔍 Search for a location (e.g. Matla Power Station)..."
            className="border p-2 w-full rounded bg-white"
          />
        </div>

        {/* Pinned location display */}
        {pinned && (
          <div className="text-sm text-gray-500 bg-gray-50 border rounded px-3 py-2">
            📍 {pinned.address || `${Number(pinned.lat).toFixed(5)}, ${Number(pinned.lon).toFixed(5)}`}
            <span className="ml-2 text-blue-400 text-xs">(drag pin on map to fine-tune)</span>
          </div>
        )}

        {/* Radius */}
        <input
          type="number" placeholder="Radius (meters)"
          className="border p-2 w-full rounded"
          value={form.radius}
          onChange={(e) => setForm({ ...form, radius: e.target.value })}
        />

        {/* Map */}
        <div
          ref={mapRef}
          style={{ width: "100%", height: "320px", borderRadius: "8px", marginTop: "8px" }}
          className="border"
        />
        <p className="text-xs text-gray-400">💡 Search above to find a location, then drag the pin for precise placement. Or click directly on the map.</p>

        <div className="flex gap-2 mt-1">
          <button type="submit" disabled={saving}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded">
            {saving ? "Saving..." : editing ? "Update Point" : "Add Point"}
          </button>
          {editing && (
            <button type="button" onClick={resetForm}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded">
              Cancel
            </button>
          )}
        </div>
      </form>

      <ul>
        {loading && <li className="text-gray-400 text-sm">Loading...</li>}
        {!loading && points.length === 0 && <li className="text-gray-400 text-sm">No dropoff points yet.</li>}
        {!loading && points.length > 0 && (
          <div className="mb-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Filter saved points..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="border p-2 pl-8 w-full rounded bg-white text-sm"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              )}
            </div>
            {search && (
              <p className="text-xs text-gray-400 mt-1">
                {points.filter(p => `${p.title} ${p.address}`.toLowerCase().includes(search.toLowerCase())).length} result(s) for "{search}"
              </p>
            )}
          </div>
        )}
        {points
          .filter(p => !search || `${p.title} ${p.address}`.toLowerCase().includes(search.toLowerCase()))
          .map((p) => (
          <li key={p.id} className="flex justify-between items-center border-b py-2">
            <div>
              <button
                onClick={() => viewPin(p)}
                className="text-left hover:text-green-600 transition-colors"
                title="Click to view on map"
              >
                <strong className="hover:underline cursor-pointer">📍 {p.title}</strong>
              </button>
              {p.address && <span className="text-gray-500 text-sm"> — {p.address}</span>}
              <span className="text-sm text-gray-500"> (Radius: {p.radius || 1000} m)</span>
            </div>
            <div className="space-x-2">
              <button onClick={() => startEdit(p)} className="text-green-600 hover:underline">Edit</button>
              <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:underline">Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
