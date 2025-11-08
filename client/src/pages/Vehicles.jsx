import React, { useEffect, useState } from "react";

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState({ reg: "", description: "" });
  const [editing, setEditing] = useState(null);

  const fetchVehicles = async () => {
    const res = await fetch("https://fleetpro-backend-production.up.railway.app/api/vehicles");
    const data = await res.json();
    setVehicles(data);
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.reg) return alert("Vehicle registration required");

    if (editing) {
      await fetch(`https://fleetpro-backend-production.up.railway.app/api/vehicles/${editing}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("https://fleetpro-backend-production.up.railway.app/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }

    setForm({ reg: "", description: "" });
    setEditing(null);
    fetchVehicles();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this vehicle?")) return;
    await fetch(`https://fleetpro-backend-production.up.railway.app/api/vehicles/${id}`, { method: "DELETE" });
    fetchVehicles();
  };

  const startEdit = (v) => {
    setForm({ reg: v.reg, description: v.description });
    setEditing(v.id);
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Vehicles</h2>

      <form onSubmit={handleSubmit} className="mb-6 space-y-2">
        <input
          type="text"
          placeholder="Vehicle Registration"
          className="border p-2 w-full"
          value={form.reg}
          onChange={(e) => setForm({ ...form, reg: e.target.value })}
        />
        <input
          type="text"
          placeholder="Description"
          className="border p-2 w-full"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          {editing ? "Update Vehicle" : "Add Vehicle"}
        </button>
      </form>

      <ul>
        {vehicles.map((v) => (
          <li
            key={v.id}
            className="flex justify-between items-center border-b py-2"
          >
            <div>
              <strong>{v.reg}</strong> — {v.description}
            </div>
            <div className="space-x-2">
              <button
                onClick={() => startEdit(v)}
                className="text-blue-600 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(v.id)}
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
