import React, { useEffect, useState } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api/vehicles";

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm]         = useState({ registration: "", description: "", make: "", model: "", year: "" });
  const [editing, setEditing]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [formError, setFormError] = useState("");

  const fetchVehicles = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setVehicles(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(`Could not load vehicles (${err.message}). Is the backend running?`);
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVehicles(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.registration.trim()) {
      setFormError("Registration number is required.");
      return;
    }
    setSaving(true);
    try {
      const url    = editing ? `${API}/${editing}` : API;
      const method = editing ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration: form.registration.trim().toUpperCase(),
          description:  form.description.trim(),
          make:  form.make.trim(),
          model: form.model.trim(),
          year:  form.year.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || `Server error ${res.status}`);
        return;
      }
      setForm({ registration: "", description: "", make: "", model: "", year: "" });
      setEditing(null);
      fetchVehicles();
    } catch (err) {
      setFormError(`Network error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this vehicle?")) return;
    try {
      await fetch(`${API}/${id}`, { method: "DELETE" });
      fetchVehicles();
    } catch {
      alert("Failed to delete vehicle.");
    }
  };

  const startEdit = (v) => {
    setForm({
      registration: v.registration,
      description:  v.description || "",
      make:  v.make  || "",
      model: v.model || "",
      year:  v.year  || "",
    });
    setEditing(v.id);
    setFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setForm({ registration: "", description: "", make: "", model: "", year: "" });
    setEditing(null);
    setFormError("");
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Fleet Vehicles</h2>
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <span className="text-2xl font-bold text-blue-600">{vehicles.length}</span>
          <div className="text-xs text-blue-500 leading-tight">
            <div className="font-semibold">Vehicles</div>
            <div>in fleet</div>
          </div>
        </div>
      </div>

      {/* ── Form ── */}
      <div className="bg-white border rounded-lg p-5 mb-6 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-1">
          {editing ? "Edit Vehicle" : "Add Vehicle"}
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Only the registration number is required.
        </p>

        {formError && (
          <div className="bg-red-50 border border-red-300 text-red-600 text-sm px-3 py-2 rounded mb-3">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Registration *  (e.g. ABC123GP)"
            className="border p-2 rounded w-full text-sm font-mono uppercase"
            value={form.registration}
            onChange={(e) => setForm({ ...form, registration: e.target.value.toUpperCase() })}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            className="border p-2 rounded w-full text-sm"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Make (e.g. Mercedes)"
              className="border p-2 rounded text-sm"
              value={form.make}
              onChange={(e) => setForm({ ...form, make: e.target.value })}
            />
            <input
              type="text"
              placeholder="Model (e.g. Actros)"
              className="border p-2 rounded text-sm"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
            <input
              type="text"
              placeholder="Year (e.g. 2021)"
              className="border p-2 rounded text-sm"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit" disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2 rounded text-sm font-medium"
            >
              {saving ? "Saving..." : editing ? "Update Vehicle" : "Add Vehicle"}
            </button>
            {editing && (
              <button type="button" onClick={cancelEdit}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded text-sm">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── List ── */}
      {loading && <p className="text-gray-400 text-sm">Loading vehicles...</p>}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded text-sm mb-4">
          {error}
          <button onClick={fetchVehicles} className="ml-3 underline">Retry</button>
        </div>
      )}

      {!loading && !error && vehicles.length === 0 && (
        <p className="text-gray-400 text-sm">No vehicles added yet.</p>
      )}

      <ul className="space-y-2">
        {vehicles.map((v) => (
          <li key={v.id}
            className="flex justify-between items-center bg-white border rounded-lg px-4 py-3 shadow-sm"
          >
            <div>
              <span className="font-bold text-gray-800 font-mono">{v.registration}</span>
              {v.description && (
                <span className="text-gray-500 text-sm ml-2">— {v.description}</span>
              )}
              {(v.make || v.model || v.year) && (
                <div className="text-gray-400 text-xs mt-0.5">
                  {[v.make, v.model, v.year].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => startEdit(v)}
                className="text-blue-600 hover:underline text-sm">Edit</button>
              <button onClick={() => handleDelete(v.id)}
                className="text-red-600 hover:underline text-sm">Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
