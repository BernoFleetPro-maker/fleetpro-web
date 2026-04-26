// src/pages/Tasks.jsx
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";

function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [locations, setLocations] = useState([]); // ✅ FIXED: was missing, caused crash
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [form, setForm] = useState({
    id: null,
    loadLocation: "",
    dropoffLocation: "",
    extraDropoff: "",
    orderNumber: "",
    assignedDriverId: "",
    vehicleId: "",
    date: "",
    time: "",
    title: "",
    description: "",
    status: "unassigned",
  });

  const googleServiceRef = useRef(null);
  const api = axios.create({
    baseURL: "https://fleetpro-backend-production.up.railway.app/api",
  });

  useEffect(() => {
    loadAll();

    // SSE for real-time task updates
    const ev = new EventSource(
      "https://fleetpro-backend-production.up.railway.app/api/stream/events"
    );
    ev.onmessage = (e) => {
      console.log("🔄 SSE → Tasks updated:", e.data);
      loadAll();
    };
    ev.onerror = (err) => {
      console.log("SSE error:", err);
    };
    return () => ev.close();
  }, []);

  async function loadAll() {
    try {
      const [tRes, dRes, pRes, vRes] = await Promise.all([
        api.get("/tasks"),
        api.get("/drivers"),
        api.get("/points"),
        api.get("/vehicles"),
      ]);

      setTasks(Array.isArray(tRes.data) ? tRes.data : []);
      setDrivers(Array.isArray(dRes.data) ? dRes.data : []);
      setVehicles(Array.isArray(vRes.data) ? vRes.data : []);

      const allPoints = Array.isArray(pRes.data) ? pRes.data : [];
      const sorted = [
        ...allPoints.filter((p) => (p.type || "").toLowerCase() === "loading"),
        ...allPoints.filter((p) => (p.type || "").toLowerCase() === "dropoff"),
      ];
      setLocations(sorted); // ✅ Now works — state is declared above
    } catch (err) {
      console.error("Load error", err);
    }
  }

  function openCreate() {
    setForm({
      id: null,
      loadLocation: "",
      dropoffLocation: "",
      extraDropoff: "",
      orderNumber: "",
      assignedDriverId: "",
      vehicleId: "",
      date: selectedDate,
      time: "",
      title: "",
      description: "",
      status: "unassigned",
    });
    setShowForm(true);
  }

  function openEdit(task) {
    setForm({
      id: task.id,
      loadLocation: task.loadLocation || "",
      dropoffLocation: task.dropoffLocation || "",
      extraDropoff: task.extraDropoff || task.additionalDropoff || "",
      orderNumber: task.orderNumber || "",
      assignedDriverId: task.assignedDriverId || "",
      vehicleId: task.vehicleId || "",
      date: task.date || selectedDate,
      time: formatTime(task.pickupTime || task.time || ""),
      title: task.title || "",
      description: task.description || "",
      status: task.status || "unassigned",
    });
    setShowForm(true);
  }

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function searchLocations(query) {
    if (!query) return [];
    let results = [];

    try {
      const localMatches = locations
        .filter(
          (p) =>
            p.title?.toLowerCase().includes(query.toLowerCase()) ||
            p.address?.toLowerCase().includes(query.toLowerCase())
        )
        .map((p) => ({
          label: `${p.title} — ${p.address || ""}`,
          value: p.title,
          type: p.type,
        }));
      results = localMatches;
    } catch (e) {
      console.warn("Local search failed", e);
    }

    if (results.length < 5 && window.google) {
      if (!googleServiceRef.current)
        googleServiceRef.current =
          new window.google.maps.places.AutocompleteService();

      const service = googleServiceRef.current;
      const googleResults = await new Promise((resolve) => {
        service.getPlacePredictions(
          { input: query, componentRestrictions: { country: "za" } },
          (preds, status) => {
            if (
              status === window.google.maps.places.PlacesServiceStatus.OK &&
              preds
            ) {
              resolve(
                preds.map((p) => ({
                  label: p.description,
                  value: p.description,
                  type: "google",
                }))
              );
            } else resolve([]);
          }
        );
      });
      results = [...results, ...googleResults];
    }

    return results;
  }

  async function saveTask(e) {
    e && e.preventDefault();
    try {
      const payload = { ...form, date: form.date || selectedDate };
      // Map frontend field names to backend field names
      if (payload.extraDropoff) payload.additionalDropoff = payload.extraDropoff;
      if (payload.time) payload.pickupTime = payload.time;

      let response;
      if (payload.id) {
        response = await api.put(`/tasks/${payload.id}`, payload);
      } else {
        delete payload.id;
        response = await api.post("/tasks/create", payload);
      }

      setSelectedDate(payload.date);
      await loadAll();
      setShowForm(false);
    } catch (err) {
      console.error("Save failed", err);
      alert("Failed to save task");
    }
  }

  async function deleteTask(id) {
    if (!confirm("Delete this task?")) return;
    try {
      await api.delete(`/tasks/${id}`);
      await loadAll();
    } catch (err) {
      console.error("Failed to delete task", err);
      alert("Failed to delete task");
    }
  }

  const grouped = {
    unassigned: tasks.filter(
      (t) => t.date === selectedDate && (t.status || "unassigned") === "unassigned"
    ),
    todo: tasks.filter((t) => t.date === selectedDate && t.status === "todo"),
    inprogress: tasks.filter(
      (t) => t.date === selectedDate && t.status === "inprogress"
    ),
    completed: tasks.filter(
      (t) => t.date === selectedDate && t.status === "completed"
    ),
  };

  const headerClasses = "text-sm font-bold";

  return (
    <div className="min-h-screen bg-[#0f1724] text-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold">FleetPro — Tasks</h1>
        <button
          onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-md text-sm font-semibold"
        >
          + Add Task
        </button>
      </div>

      <div className="text-xs text-slate-400">
        Date: {formatDate(selectedDate)}
      </div>

      <div className="flex justify-end mb-4">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="bg-[#1e293b] p-2 rounded-md border border-slate-600 text-sm"
        />
      </div>

      <div className="grid grid-cols-4 gap-3">
        {["unassigned", "todo", "inprogress", "completed"].map((status) => (
          <div key={status} className="bg-[#1e293b] rounded-md p-2">
            <div className="flex items-center justify-between mb-2">
              <div className={headerClasses}>
                {status === "unassigned"
                  ? "Unassigned"
                  : status === "todo"
                  ? "To Do"
                  : status === "inprogress"
                  ? "In Progress"
                  : "Completed"}
              </div>
              <div className="text-xs text-slate-300">
                {grouped[status].length}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              {grouped[status].map((task) => {
                const driver = drivers.find((d) => d.id === task.assignedDriverId);
                const driverName = driver ? driver.name : "";
                // ✅ FIXED: use registration not reg
                const vehicle = vehicles.find((v) => v.id === task.vehicleId);
                const vehicleReg = vehicle ? vehicle.registration : "";

                return (
                  <div
                    key={task.id}
                    className="bg-[#0b1220] border border-slate-700 rounded p-2 text-xs flex items-start justify-between gap-2"
                  >
                    <div className="flex-1">
                      <div className="font-semibold truncate">
                        {task.title || task.loadLocation || "No title"}
                      </div>
                      {(driverName || vehicleReg) && (
                        <div className="text-[11px] text-slate-300 mt-1">
                          {driverName || "Unassigned"}
                          {vehicleReg ? ` — ${vehicleReg}` : ""}
                        </div>
                      )}
                      <div className="text-slate-400 truncate text-[11px] mt-1">
                        {task.loadLocation || "—"} → {task.dropoffLocation || "—"}
                      </div>
                      <div className="text-slate-500 text-[10px] mt-1">
                        {formatTime(task.pickupTime || "")}
                        {task.date ? ` • ${formatDate(task.date)}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(task)}
                          className="px-2 py-1 text-[11px] bg-yellow-600 hover:bg-yellow-700 rounded"
                        >
                          ✏
                        </button>
                        <button
                          onClick={() => deleteTask(task.id)}
                          className="px-2 py-1 text-[11px] bg-red-600 hover:bg-red-700 rounded"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {grouped[status].length === 0 && (
                <div className="text-slate-400 text-xs italic">No tasks</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Task Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <form
            onSubmit={saveTask}
            className="bg-[#0f1724] p-5 rounded-md w-[560px] max-h-[90vh] overflow-auto border border-slate-700"
          >
            <h3 className="text-lg font-semibold mb-3">
              {form.id ? "Edit Task" : "Create Task"}
            </h3>

            <div className="mb-2">
              <label className="text-sm text-slate-300 block mb-1">Title</label>
              <input
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                className="w-full p-2 rounded bg-[#1b2633] text-white text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              {["loadLocation", "dropoffLocation"].map((field) => (
                <div key={field}>
                  <label className="text-sm text-slate-300 block mb-1 capitalize">
                    {field === "loadLocation" ? "Load Location" : "Dropoff Location"}
                  </label>
                  <input
                    list={field + "-list"}
                    value={form[field]}
                    onChange={(e) => updateField(field, e.target.value)}
                    onInput={async (e) => {
                      const opts = await searchLocations(e.target.value);
                      const datalist = document.getElementById(field + "-list");
                      datalist.innerHTML = "";
                      opts.forEach((opt) => {
                        const option = document.createElement("option");
                        option.value = opt.value;
                        option.textContent = opt.label;
                        datalist.appendChild(option);
                      });
                    }}
                    placeholder="Enter or select"
                    className="w-full p-2 rounded bg-[#1b2633] text-white text-sm"
                  />
                  <datalist id={field + "-list"}></datalist>
                </div>
              ))}
            </div>

            <div className="mb-2">
              <label className="text-sm text-slate-300 block mb-1">
                Additional Dropoff (optional)
              </label>
              <input
                value={form.extraDropoff}
                onChange={(e) => updateField("extraDropoff", e.target.value)}
                className="w-full p-2 rounded bg-[#1b2633] text-white text-sm"
                placeholder="Optional"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-2">
              <div>
                <label className="text-sm text-slate-300 block mb-1">Order #</label>
                <input
                  value={form.orderNumber}
                  onChange={(e) => updateField("orderNumber", e.target.value)}
                  className="w-full p-2 rounded bg-[#1b2633] text-white text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-slate-300 block mb-1">Date</label>
                <input
                  type="date"
                  value={form.date || selectedDate}
                  onChange={(e) => updateField("date", e.target.value)}
                  className="w-full p-2 rounded bg-[#1b2633] text-white text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-slate-300 block mb-1">Time</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => updateField("time", e.target.value)}
                  className="w-full p-2 rounded bg-[#1b2633] text-white text-sm"
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="text-sm text-slate-300 block mb-1">Driver</label>
              <select
                value={form.assignedDriverId || ""}
                onChange={(e) => updateField("assignedDriverId", e.target.value)}
                className="w-full p-2 rounded bg-[#1b2633] text-white text-sm"
              >
                <option value="">Unassigned</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="text-sm text-slate-300 block mb-1">Vehicle</label>
              <select
                value={form.vehicleId || ""}
                onChange={(e) => updateField("vehicleId", e.target.value)}
                className="w-full p-2 rounded bg-[#1b2633] text-white text-sm"
              >
                <option value="">Unassigned</option>
                {vehicles.map((v) => (
                  // ✅ FIXED: use v.registration not v.reg
                  <option key={v.id} value={v.id}>
                    {v.registration}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-sm"
              >
                {form.id ? "Save" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
