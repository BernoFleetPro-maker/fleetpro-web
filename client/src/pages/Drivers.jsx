import React, { useEffect, useState } from "react";

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [editing, setEditing] = useState(null);

  const fetchDrivers = async () => {
    const res = await fetch("https://fleetpro-backend-production.up.railway.app/api/drivers");
    const data = await res.json();
    setDrivers(data);
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) return alert("Please fill in all fields.");

    if (editing) {
      // ✅ PUT for editing
      await fetch(`https://fleetpro-backend-production.up.railway.app/api/drivers/${editing}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      // ✅ POST for new driver
      await fetch("https://fleetpro-backend-production.up.railway.app:5000/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }

    setForm({ name: "", phone: "" });
    setEditing(null);
    fetchDrivers();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this driver?")) return;
    await fetch(`https://fleetpro-backend-production.up.railway.app/api/drivers/${id}`, { method: "DELETE" });
    fetchDrivers();
  };

  const startEdit = (d) => {
    setForm({ name: d.name, phone: d.phone });
    setEditing(d.id);
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Drivers</h2>

      <form onSubmit={handleSubmit} className="mb-6 space-y-2">
        <input
          type="text"
          placeholder="Driver Name"
          className="border p-2 w-full"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          type="text"
          placeholder="Driver Phone (login password)"
          className="border p-2 w-full"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          {editing ? "Update Driver" : "Add Driver"}
        </button>
      </form>

      <ul>
        {drivers.map((d) => (
          <li
            key={d.id}
            className="flex justify-between items-center border-b py-2"
          >
            <div>
              <strong>{d.name}</strong> — {d.phone}
            </div>
            <div className="space-x-2">
              <button
                onClick={() => startEdit(d)}
                className="text-blue-600 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(d.id)}
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
