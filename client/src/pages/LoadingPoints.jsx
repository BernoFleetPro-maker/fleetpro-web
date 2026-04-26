import React, { useEffect, useRef, useState } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api/points";

export default function LoadingPoints() {
  const [points, setPoints]   = useState([]);
  const [form, setForm]       = useState({ title: "", address: "", lat: "", lon: "", radius: 1000 });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [pinned, setPinned]   = useState(null);

  const mapRef      = useRef(null);
  const mapInst     = useRef(null);
  const markerRef   = useRef(null);
  const circleRef   = useRef(null);
  const geocoderRef = useRef(null);

  const fetchPoints = async () => {
    setLoading(true);
    try {
      const res  = await fetch(API);
      const data = await res.json();
      setPoints((data || []).filter((p) => p.type === "loading"));
    } catch { }
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

      map.addListener("click", (e) => {
        const lat = e.latLng.lat();
        const lon = e.latLng.lng();
        placePin(lat, lon);
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
      markerRef.current = new window.google.maps.Marker({ map, position: pos });
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return alert("Please enter a point name.");
    if (!form.lat || !form.lon) return alert("Please click on the map to place a pin first.");
    setSaving(true);
    try {
      const payload = {
        title: form.title, address: form.address || "",
        lat: Number(form.lat), lon: Number(form.lon),
        radius: Number(form.radius) || 1000, type: "loading",
      };
      const url    = editing ? `${API}/${editing}` : API;
      const method = editing ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json(); return alert(e.error || "Failed to save"); }
      resetForm();
      fetchPoints();
    } catch { alert("Failed to save point."); }
    finally { setSaving(false); }
  };

  const resetForm = () => {
    setForm({ title: "", address: "", lat: "", lon: "", radius: 1000 });
    setEditing(null); setPinned(null);
    if (markerRef.current) markerRef.current.setVisible(false);
    if (circleRef.current) { circleRef.current.setMap(null); circleRef.current = null; }
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
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Loading Points</h2>

      <form onSubmit={handleSubmit} className="mb-6 space-y-2">
        <input
          type="text" placeholder="Loading Point Name"
          className="border p-2 w-full"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />

        <input
          type="text" placeholder="Click the map below to set location"
          className="border p-2 w-full bg-gray-50 text-gray-500 cursor-default"
          value={pinned ? (pinned.address || `${Number(pinned.lat).toFixed(5)}, ${Number(pinned.lon).toFixed(5)}`) : ""}
          readOnly
        />

        <input
          type="number" placeholder="Radius (meters)"
          className="border p-2 w-full"
          value={form.radius}
          onChange={(e) => setForm({ ...form, radius: e.target.value })}
        />

        {/* Map — same size as original */}
        <div
          ref={mapRef}
          style={{ width: "50%", height: "300px", borderRadius: "6px", marginTop: "8px" }}
          className="border mb-2"
        />

        <button type="submit" disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded">
          {saving ? "Saving..." : editing ? "Update Point" : "Add Point"}
        </button>
        {editing && (
          <button type="button" onClick={resetForm}
            className="ml-2 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded">
            Cancel
          </button>
        )}
      </form>

      <ul>
        {loading && <li className="text-gray-400 text-sm">Loading...</li>}
        {!loading && points.length === 0 && <li className="text-gray-400 text-sm">No loading points yet.</li>}
        {points.map((p) => (
          <li key={p.id} className="flex justify-between items-center border-b py-2">
            <div>
              <strong>{p.title}</strong>
              {p.address && <span className="text-gray-500 text-sm"> — {p.address}</span>}
              <span className="text-sm text-gray-500"> (Radius: {p.radius || 1000} m)</span>
            </div>
            <div className="space-x-2">
              <button onClick={() => startEdit(p)} className="text-blue-600 hover:underline">Edit</button>
              <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:underline">Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
