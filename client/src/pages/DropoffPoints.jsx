import React, { useEffect, useState, useRef } from "react";

export default function DropoffPoints() {
  const [points, setPoints] = useState([]);
  const [form, setForm] = useState({
    title: "",
    address: "",
    lat: "",
    lon: "",
    radius: 1000,
  });
  const [editing, setEditing] = useState(null);
  const autocompleteRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [map, setMap] = useState(null);
  const geocoderRef = useRef(null);

  // === Fetch Dropoff Points ===
  const fetchPoints = async () => {
    try {
      const res = await fetch("https://fleetpro-backend-production.up.railway.app/api/points");
      const data = await res.json();
      setPoints(
        (data || []).filter((p) => (p.type || "").toLowerCase() === "dropoff")
      );
    } catch (err) {
      console.error("fetchPoints error", err);
    }
  };

  useEffect(() => {
    fetchPoints();
  }, []);

  // === Google Maps Autocomplete ===
  useEffect(() => {
    if (window.google && autocompleteRef.current) {
      const autocomplete = new window.google.maps.places.Autocomplete(
        autocompleteRef.current,
        { fields: ["formatted_address", "geometry", "name"] }
      );

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place && place.geometry) {
          const lat = place.geometry.location.lat();
          const lon = place.geometry.location.lng();
          const address =
            place.formatted_address ||
            place.name ||
            autocompleteRef.current.value ||
            "";

          setForm((f) => ({ ...f, address, lat, lon }));
          updateMap(lat, lon, true);
        }
      });
    }
  }, []);

  // === Initialize Map ===
  useEffect(() => {
    if (window.google && mapRef.current && !map) {
      const gmap = new window.google.maps.Map(mapRef.current, {
        center: { lat: -28.4793, lng: 24.6727 },
        zoom: 6,
      });

      const marker = new window.google.maps.Marker({
        map: gmap,
        draggable: true,
        visible: false,
      });

      marker.addListener("dragend", async () => {
        const pos = marker.getPosition();
        const lat = pos.lat();
        const lon = pos.lng();
        setForm((f) => ({ ...f, lat, lon }));

        if (geocoderRef.current) {
          try {
            const results = await geocodeByLatLng(lat, lon);
            if (results && results[0]) {
              setForm((f) => ({
                ...f,
                address: results[0].formatted_address,
              }));
            }
          } catch (e) {
            console.warn("Reverse geocode failed:", e);
          }
        }
      });

      geocoderRef.current = new window.google.maps.Geocoder();
      markerRef.current = marker;
      setMap(gmap);
    }
  }, []);

  const geocodeByLatLng = (lat, lng) =>
    new Promise((resolve, reject) => {
      const geocoder = geocoderRef.current;
      if (!geocoder) return reject("No geocoder");
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK") resolve(results);
        else reject(status);
      });
    });

  const updateMap = (lat, lon, showMarker = false) => {
    if (map && markerRef.current && lat && lon) {
      const pos = new window.google.maps.LatLng(Number(lat), Number(lon));
      map.setCenter(pos);
      map.setZoom(15);
      markerRef.current.setPosition(pos);
      if (showMarker) markerRef.current.setVisible(true);
    }
  };

  // === Submit ===
  const handleSubmit = async (e) => {
    e.preventDefault();
    const { title, address, lat, lon, radius } = form;

    if (!title || !address)
      return alert("Please enter a title and Google Maps location.");

    const payload = {
      title,
      address,
      lat: Number(lat),
      lon: Number(lon),
      radius: Number(radius) || 1000,
      type: "dropoff",
    };

    try {
      if (editing) {
        await fetch(`https://fleetpro-backend-production.up.railway.app/api/points/${editing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("https://fleetpro-backend-production.up.railway.app/api/points", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setForm({ title: "", address: "", lat: "", lon: "", radius: 1000 });
      setEditing(null);
      if (markerRef.current) markerRef.current.setVisible(false);
      fetchPoints();
    } catch (err) {
      console.error("Save failed", err);
      alert("Failed to save point");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this dropoff point?")) return;
    try {
      await fetch(`https://fleetpro-backend-production.up.railway.app/api/points/${id}`, { method: "DELETE" });
      fetchPoints();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const startEdit = (p) => {
    setForm({
      title: p.title,
      address: p.address || "",
      lat: p.lat || "",
      lon: p.lon || "",
      radius: p.radius || 1000,
    });
    setEditing(p.id);
    if (p.lat && p.lon) updateMap(p.lat, p.lon, true);
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Dropoff Points</h2>

      <form onSubmit={handleSubmit} className="mb-6 space-y-2">
        <input
          type="text"
          placeholder="Dropoff Point Name"
          className="border p-2 w-full"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />

        <input
          type="text"
          placeholder="Google Maps Location"
          className="border p-2 w-full"
          ref={autocompleteRef}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />

        <input
          type="number"
          placeholder="Radius (meters)"
          className="border p-2 w-full"
          value={form.radius}
          onChange={(e) => setForm({ ...form, radius: e.target.value })}
        />

        <div
          ref={mapRef}
          style={{
            width: "50%",
            height: "300px",
            borderRadius: "6px",
            marginTop: "8px",
          }}
          className="border mb-2"
        />

        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          {editing ? "Update Point" : "Add Point"}
        </button>
      </form>

      <ul>
        {points.map((p) => (
          <li
            key={p.id}
            className="flex justify-between items-center border-b py-2"
          >
            <div>
              <strong>{p.title}</strong> — {p.address}{" "}
              <span className="text-sm text-gray-500">
                (Radius: {p.radius || 1000} m)
              </span>
            </div>
            <div className="space-x-2">
              <button
                onClick={() => startEdit(p)}
                className="text-green-600 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(p.id)}
                className="text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
