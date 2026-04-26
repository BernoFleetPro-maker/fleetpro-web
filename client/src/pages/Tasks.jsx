import React, { useEffect, useState } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";

const STATUSES = [
  { key: "unassigned", label: "Unassigned",   color: "border-gray-400",  badge: "bg-gray-100 text-gray-600" },
  { key: "todo",       label: "To Do",         color: "border-blue-400",  badge: "bg-blue-100 text-blue-700" },
  { key: "inprogress", label: "In Progress",   color: "border-yellow-400",badge: "bg-yellow-100 text-yellow-700" },
  { key: "completed",  label: "Completed",     color: "border-green-400", badge: "bg-green-100 text-green-700" },
];

const EMPTY_FORM = {
  title: "", loadLocation: "", dropoffLocation: "", additionalDropoff: "",
  orderNumber: "", date: "", pickupTime: "", notes: "",
  assignedDriverId: "", vehicleId: "",
};

export default function Tasks() {
  const [tasks,    setTasks]    = useState([]);
  const [drivers,  setDrivers]  = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  const [showForm,  setShowForm]  = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState("");

  // ── Load all data ──────────────────────────────────────────────────────────
  const loadAll = async () => {
    try {
      const [tRes, dRes, vRes] = await Promise.all([
        fetch(`${API}/tasks`),
        fetch(`${API}/drivers`),
        fetch(`${API}/vehicles`),
      ]);
      const [t, d, v] = await Promise.all([tRes.json(), dRes.json(), vRes.json()]);
      setTasks(   Array.isArray(t) ? t : []);
      setDrivers( Array.isArray(d) ? d : []);
      setVehicles(Array.isArray(v) ? v : []);
    } catch (err) {
      console.error("Load error:", err);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const driverName  = (id) => drivers.find((d) => d.id === id)?.name  || "—";
  const vehicleReg  = (id) => vehicles.find((v) => v.id === id)?.registration || "—";

  const tasksForStatus = (status) =>
    tasks.filter((t) => {
      const matchStatus = t.status === status;
      const matchDate   = !t.date || t.date === selectedDate;
      return matchStatus && matchDate;
    });

  // ── Open create form ───────────────────────────────────────────────────────
  const openCreate = () => {
    setForm({ ...EMPTY_FORM, date: selectedDate });
    setEditingId(null);
    setFormError("");
    setShowForm(true);
  };

  // ── Open edit form ─────────────────────────────────────────────────────────
  const openEdit = (task) => {
    setForm({
      title:             task.title             || "",
      loadLocation:      task.loadLocation      || "",
      dropoffLocation:   task.dropoffLocation   || "",
      additionalDropoff: task.additionalDropoff || "",
      orderNumber:       task.orderNumber       || "",
      date:              task.date              || selectedDate,
      pickupTime:        task.pickupTime        || "",
      notes:             task.notes             || "",
      assignedDriverId:  task.assignedDriverId  || "",
      vehicleId:         task.vehicleId         || "",
    });
    setEditingId(task.id);
    setFormError("");
    setShowForm(true);
  };

  // ── Save (create or update) ────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.loadLocation.trim()) {
      setFormError("Load location is required.");
      return;
    }
    setSaving(true);
    try {
      const url    = editingId ? `${API}/tasks/${editingId}` : `${API}/tasks`;
      const method = editingId ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || `Error ${res.status}`); return; }
      setShowForm(false);
      await loadAll();
    } catch (err) {
      setFormError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this task?")) return;
    await fetch(`${API}/tasks/${id}`, { method: "DELETE" });
    loadAll();
  };

  // ── Quick status change (test buttons) ────────────────────────────────────
  const setStatus = async (id, status) => {
    await fetch(`${API}/tasks/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadAll();
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f1724] text-white p-4">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Tasks</h1>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-[#1e293b] border border-slate-600 text-white text-sm px-3 py-1.5 rounded"
          />
          <button
            onClick={openCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-semibold"
          >
            + Add Task
          </button>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-4 gap-3">
        {STATUSES.map(({ key, label, color, badge }) => {
          const col = tasksForStatus(key);
          return (
            <div key={key} className={`bg-[#1e293b] rounded-lg border-t-4 ${color} flex flex-col`}>
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                <span className="text-sm font-semibold">{label}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge}`}>
                  {col.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto max-h-[70vh]">
                {col.length === 0 && (
                  <p className="text-slate-500 text-xs italic text-center mt-4">No tasks</p>
                )}
                {col.map((task) => (
                  <div
                    key={task.id}
                    className="bg-[#0b1220] border border-slate-700 rounded-lg p-3 text-xs"
                  >
                    {/* Task title / order */}
                    <div className="font-semibold text-sm truncate mb-1">
                      {task.title || task.loadLocation || "Untitled"}
                      {task.orderNumber && (
                        <span className="ml-2 text-slate-400 font-normal">#{task.orderNumber}</span>
                      )}
                    </div>

                    {/* Route */}
                    <div className="text-slate-300 mb-1">
                      📍 {task.loadLocation || "—"}
                    </div>
                    <div className="text-slate-300 mb-1">
                      🏁 {task.dropoffLocation || "—"}
                    </div>

                    {/* Driver + Vehicle */}
                    <div className="text-slate-400 mt-1">
                      👤 {task.assignedDriverId ? driverName(task.assignedDriverId) : <span className="italic">Unassigned</span>}
                    </div>
                    <div className="text-slate-400">
                      🚛 {task.vehicleId ? vehicleReg(task.vehicleId) : <span className="italic">No vehicle</span>}
                    </div>

                    {/* Date + Time */}
                    {(task.date || task.pickupTime) && (
                      <div className="text-slate-500 text-[11px] mt-1">
                        {task.date} {task.pickupTime && `@ ${task.pickupTime}`}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-700">
                      <button
                        onClick={() => openEdit(task)}
                        className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px]"
                      >✏️ Edit</button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="px-2 py-1 bg-red-900 hover:bg-red-700 rounded text-[11px]"
                      >🗑 Delete</button>

                      {/* ── TEST BUTTONS (remove later) ── */}
                      {task.status === "todo" && (
                        <button
                          onClick={() => setStatus(task.id, "inprogress")}
                          className="px-2 py-1 bg-yellow-700 hover:bg-yellow-600 rounded text-[11px]"
                          title="Simulates driver accepting task"
                        >▶ Accept</button>
                      )}
                      {task.status === "inprogress" && (
                        <>
                          <button
                            onClick={() => setStatus(task.id, "completed")}
                            className="px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-[11px]"
                            title="Simulates driver completing task"
                          >✅ Complete</button>
                          <button
                            onClick={() => setStatus(task.id, "completed")}
                            className="px-2 py-1 bg-orange-700 hover:bg-orange-600 rounded text-[11px]"
                            title="Simulates driver failing task"
                          >❌ Fail</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Create / Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSave}
            className="bg-[#1e293b] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 border border-slate-600"
          >
            <h2 className="text-lg font-bold mb-4">
              {editingId ? "Edit Task" : "Create Task"}
            </h2>

            {formError && (
              <div className="bg-red-900/50 border border-red-500 text-red-300 text-sm px-3 py-2 rounded mb-3">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Title (optional)</label>
                <input className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Coal delivery" />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Load Location *</label>
                <input className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.loadLocation} onChange={(e) => setForm({ ...form, loadLocation: e.target.value })}
                  placeholder="Where to pick up" />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Dropoff Location</label>
                <input className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.dropoffLocation} onChange={(e) => setForm({ ...form, dropoffLocation: e.target.value })}
                  placeholder="Where to deliver" />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Additional Dropoff (optional)</label>
                <input className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.additionalDropoff} onChange={(e) => setForm({ ...form, additionalDropoff: e.target.value })}
                  placeholder="Second dropoff if needed" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Order Number</label>
                  <input className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                    value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value })}
                    placeholder="e.g. ORD-001" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Date</label>
                  <input type="date" className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                    value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Pickup Time</label>
                <input type="time" className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.pickupTime} onChange={(e) => setForm({ ...form, pickupTime: e.target.value })} />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Assign Driver</label>
                <select className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.assignedDriverId} onChange={(e) => setForm({ ...form, assignedDriverId: e.target.value })}>
                  <option value="">— Unassigned —</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Assign Vehicle</label>
                <select className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
                  <option value="">— No Vehicle —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.registration}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Notes</label>
                <textarea className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any additional instructions..." />
              </div>

              {/* Status hint */}
              <div className="text-xs text-slate-500 bg-slate-800 rounded p-2">
                💡 Task will be <strong className="text-slate-300">
                  {form.assignedDriverId && form.vehicleId ? "To Do" : "Unassigned"}
                </strong> after saving
                {form.assignedDriverId && form.vehicleId && " — driver will be notified"}
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button type="submit" disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white py-2 rounded font-semibold text-sm">
                {saving ? "Saving..." : editingId ? "Save Changes" : "Create Task"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
