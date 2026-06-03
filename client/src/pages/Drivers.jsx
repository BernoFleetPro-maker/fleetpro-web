import React, { useEffect, useState } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api/drivers";

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


export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [activeTasks, setActiveTasks] = useState([]); // inprogress tasks for map nav

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const fetchDrivers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(API);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setDrivers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Could not load drivers. Please check your connection and try again.");
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
    // Load inprogress tasks so we know which drivers can be tracked on map
    fetch("https://fleetpro-backend-production.up.railway.app/api/tasks", {
      headers: { "Authorization": `Bearer ${getToken()}` }
    })
      .then(r => r.json())
      .then(data => setActiveTasks(Array.isArray(data) ? data.filter(t => t.status === "inprogress") : []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim() || !form.phone.trim()) { setFormError("Name and phone number are required."); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/${editing}` : API;
      const method = editing ? "PUT" : "POST";
      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || "Failed to save driver");
        return;
      }
      setForm({ name: "", phone: "" });
      setEditing(null);
      fetchDrivers();
    } catch {
      setFormError("Could not save driver. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this driver? This will also remove them from any assigned tasks.")) return;
    try {
      await authFetch(`${API}/${id}`, { method: "DELETE" });
      showToast("Driver deleted.");
      fetchDrivers();
    } catch {
      showToast("Failed to delete driver — please try again.");
    }
  };

  const handleViewOnMap = (driver) => {
    const task = activeTasks.find(t => t.assignedDriverId === driver.id);
    if (!task) {
      showToast(`${driver.name} has no active task — cannot track on map.`);
      return;
    }
    // Look up the vehicle registration from vehicleId, then navigate to map
    authFetch(`https://fleetpro-backend-production.up.railway.app/api/vehicles`)
      .then(r => r.json())
      .then(vehicles => {
        const veh = Array.isArray(vehicles) ? vehicles.find(v => v.id === task.vehicleId) : null;
        if (veh?.registration) {
          window.location.href = `/?vehicle=${encodeURIComponent(veh.registration)}`;
        } else {
          showToast("Could not find vehicle for this driver.");
        }
      })
      .catch(() => showToast("Could not reach server — please try again."));
  };

  const startEdit = (d) => {
    setForm({ name: d.name, phone: d.phone });
    setEditing(d.id);
  };

  const cancelEdit = () => {
    setForm({ name: "", phone: "" });
    setEditing(null);
  };

  return (
    <div className="p-6 max-w-3xl">
      {toast && <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg">{toast}</div>}
      <h2 className="text-xl font-bold mb-4 text-gray-800">Drivers</h2>

      {/* Add / Edit Form */}
      <div className="bg-white border rounded-lg p-4 mb-6 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-3">{editing ? "Edit Driver" : "Add Driver"}</h3>
        <p className="text-xs text-gray-400 mb-3">
          The driver's phone number is used as their login password on the app.
        </p>
        {formError && <div className="bg-red-50 border border-red-300 text-red-600 text-sm px-3 py-2 rounded mb-3">{formError}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Driver Name *"
            className="border p-2 rounded w-full text-sm"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="text"
            placeholder="Phone Number * (used as app password)"
            className="border p-2 rounded w-full text-sm"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded text-sm font-medium"
            >
              {saving ? "Saving..." : editing ? "Update Driver" : "Add Driver"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={cancelEdit}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Driver List */}
      {loading && <p className="text-gray-500 text-sm">Loading drivers...</p>}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded text-sm mb-4">
          {error}
          <button onClick={fetchDrivers} className="ml-3 underline">Retry</button>
        </div>
      )}
      {!loading && !error && drivers.length === 0 && (
        <p className="text-gray-400 text-sm">No drivers added yet.</p>
      )}
      <ul className="space-y-2">
        {drivers.map((d) => (
          <li key={d.id} className="flex justify-between items-center bg-white border rounded-lg px-4 py-3 shadow-sm">
            <div>
              <span className="font-bold text-gray-800">{d.name}</span>
              <span className="text-gray-500 text-sm ml-2">— {d.phone}</span>
            </div>
            <div className="flex gap-2 items-center flex-wrap justify-end">
              <button
                onClick={() => handleViewOnMap(d)}
                className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded text-xs font-medium"
                title="View driver on map"
              >
                🗺 Map
              </button>
              <button onClick={() => startEdit(d)} className="text-blue-600 hover:underline text-sm">Edit</button>
              <button onClick={() => handleDelete(d.id)} className="text-red-600 hover:underline text-sm">Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
