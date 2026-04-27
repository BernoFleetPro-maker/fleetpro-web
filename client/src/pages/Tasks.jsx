import React, { useEffect, useState, useRef } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";

const STATUSES = [
  { key: "unassigned", label: "Unassigned",  color: "border-gray-400",   badge: "bg-gray-100 text-gray-600" },
  { key: "todo",       label: "To Do",        color: "border-blue-400",   badge: "bg-blue-100 text-blue-700" },
  { key: "inprogress", label: "In Progress",  color: "border-yellow-400", badge: "bg-yellow-100 text-yellow-700" },
  { key: "completed",  label: "Completed",    color: "border-green-400",  badge: "bg-green-100 text-green-700" },
];

const EMPTY_FORM = {
  title: "", loadLocation: "", dropoffLocation: "", additionalDropoff: "",
  orderNumber: "", date: "", dropoffTime: "", notes: "",
  assignedDriverId: "", vehicleId: "",
};

const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function toYMD(y, m, d) {
  return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function TaskCalendar({ selectedDate, onSelect, tasksByDate }) {
  const today = new Date();
  const [view, setView] = useState(() => {
    const d = selectedDate ? new Date(selectedDate + "T00:00:00") : today;
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const firstDay     = new Date(view.year, view.month, 1).getDay();
  const daysInMonth  = new Date(view.year, view.month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => setView(v => v.month === 0 ? { year: v.year-1, month: 11 } : { ...v, month: v.month-1 });
  const nextMonth = () => setView(v => v.month === 11 ? { year: v.year+1, month: 0 } : { ...v, month: v.month+1 });
  const todayYMD  = toYMD(today.getFullYear(), today.getMonth(), today.getDate());

  const selDisplay = selectedDate
    ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-ZA", { day:"2-digit", month:"short", year:"numeric" })
    : "All dates";

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="bg-[#1e293b] border border-slate-600 text-white text-sm px-3 py-1.5 rounded flex items-center gap-2 hover:border-slate-400">
        <span>📅</span><span>{selDisplay}</span><span className="text-slate-400 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 bg-[#1e293b] border border-slate-600 rounded-xl shadow-2xl w-72 p-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-700">‹</button>
            <span className="text-sm font-semibold">{MONTHS[view.month]} {view.year}</span>
            <button onClick={nextMonth} className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-700">›</button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => <div key={d} className="text-center text-[10px] text-slate-500 font-semibold py-0.5">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} />;
              const ymd   = toYMD(view.year, view.month, day);
              const count = tasksByDate[ymd] || 0;
              const isSel = ymd === selectedDate;
              const isTod = ymd === todayYMD;
              return (
                <button key={ymd} onClick={() => { onSelect(ymd); setOpen(false); }}
                  className={`relative flex flex-col items-center justify-center rounded-lg py-1 text-xs transition-colors
                    ${isSel ? "bg-blue-600 text-white" : isTod ? "bg-slate-700 text-white" : "hover:bg-slate-700 text-slate-200"}`}>
                  <span className="leading-none">{day}</span>
                  {count > 0 && <span className={`text-[9px] font-bold leading-none mt-0.5 ${isSel ? "text-blue-200" : "text-blue-400"}`}>{count}</span>}
                  {count > 0 && !isSel && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-400 rounded-full" />}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 pt-2 border-t border-slate-700">
            <button onClick={() => { onSelect(""); setOpen(false); }} className="text-xs text-slate-400 hover:text-white">Show all</button>
            <button onClick={() => { onSelect(todayYMD); setOpen(false); }} className="text-xs text-blue-400 hover:text-blue-300">Today</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── POD Modal — shows completed task details + photos ─────────────────────────
function PodModal({ task, drivers, vehicles, onClose }) {
  if (!task) return null;
  const driver  = drivers.find(d => d.id === task.assignedDriverId);
  const vehicle = vehicles.find(v => v.id === task.vehicleId);
  const photos  = task.photoUrls?.length > 0 ? task.photoUrls : task.photoUrl ? [task.photoUrl] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1e293b] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-600">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-white">
              {task.title || task.loadLocation || "Completed Task"}
              {task.orderNumber && <span className="ml-2 text-slate-400 font-normal text-sm">#{task.orderNumber}</span>}
            </h2>
            <span className="text-xs text-green-400 font-semibold">✅ Completed
              {task.completedAt && ` — ${new Date(task.completedAt).toLocaleString("en-ZA")}`}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Route */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">📍 Load Location</div>
              <div className="text-white text-sm font-medium">{task.loadLocation || "—"}</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">🏁 Dropoff Location</div>
              <div className="text-white text-sm font-medium">{task.dropoffLocation || "—"}</div>
            </div>
          </div>

          {/* Driver & Vehicle */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">👤 Driver</div>
              <div className="text-white text-sm">{driver?.name || "—"}</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">🚛 Vehicle</div>
              <div className="text-white text-sm">{vehicle?.registration || "—"}</div>
            </div>
          </div>

          {/* Notes */}
          {task.notes && (
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">📝 Driver Notes</div>
              <div className="text-white text-sm">{task.notes}</div>
            </div>
          )}

          {/* POD Photos */}
          <div>
            <div className="text-sm font-semibold text-slate-300 mb-2">
              📷 Proof of Delivery {photos.length > 0 ? `(${photos.length} photo${photos.length !== 1 ? "s" : ""})` : ""}
            </div>
            {photos.length === 0 ? (
              <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-500 text-sm">
                No photos uploaded for this task
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt={`POD ${i + 1}`}
                      className="w-full rounded-lg object-cover aspect-video border border-slate-700 hover:border-blue-400 transition-colors cursor-pointer"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                    <div className="text-xs text-slate-500 text-center mt-1">Photo {i + 1} — tap to open</div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Tasks() {
  const [tasks,         setTasks]         = useState([]);
  const [drivers,       setDrivers]       = useState([]);
  const [vehicles,      setVehicles]      = useState([]);
  const [loadingPoints, setLoadingPoints] = useState([]);
  const [dropoffPoints, setDropoffPoints] = useState([]);
  const [selectedDate,  setSelectedDate]  = useState(new Date().toISOString().slice(0, 10));
  const [showForm,      setShowForm]      = useState(false);
  const [editingId,     setEditingId]     = useState(null);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [saving,        setSaving]        = useState(false);
  const [formError,     setFormError]     = useState("");
  const [podTask,       setPodTask]       = useState(null); // task to show in POD modal

  const loadAll = async () => {
    try {
      const [tRes, dRes, vRes, pRes] = await Promise.all([
        fetch(`${API}/tasks`), fetch(`${API}/drivers`),
        fetch(`${API}/vehicles`), fetch(`${API}/points`),
      ]);
      const [t, d, v, p] = await Promise.all([tRes.json(), dRes.json(), vRes.json(), pRes.json()]);
      setTasks(   Array.isArray(t) ? t : []);
      setDrivers( Array.isArray(d) ? d : []);
      setVehicles(Array.isArray(v) ? v : []);
      const pts = Array.isArray(p) ? p : [];
      setLoadingPoints(pts.filter(x => x.type === "loading"));
      setDropoffPoints(pts.filter(x => x.type === "dropoff"));
    } catch (err) { console.error("Load error:", err); }
  };

  useEffect(() => { loadAll(); }, []);

  const tasksByDate = tasks.reduce((acc, t) => {
    if (t.date) acc[t.date] = (acc[t.date] || 0) + 1;
    return acc;
  }, {});

  const driverName = (id) => drivers.find(d => d.id === id)?.name || "—";
  const vehicleReg = (id) => vehicles.find(v => v.id === id)?.registration || "—";

  const tasksForStatus = (status) =>
    tasks.filter(t => t.status === status && (!selectedDate || !t.date || t.date === selectedDate));

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, date: selectedDate });
    setEditingId(null); setFormError(""); setShowForm(true);
  };

  const openEdit = (task) => {
    setForm({
      title: task.title || "", loadLocation: task.loadLocation || "",
      dropoffLocation: task.dropoffLocation || "", additionalDropoff: task.additionalDropoff || "",
      orderNumber: task.orderNumber || "", date: task.date || selectedDate,
      dropoffTime: task.pickupTime || "", notes: task.notes || "",
      assignedDriverId: task.assignedDriverId || "", vehicleId: task.vehicleId || "",
    });
    setEditingId(task.id); setFormError(""); setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.loadLocation.trim()) { setFormError("Load location is required."); return; }
    setSaving(true);
    try {
      const payload = { ...form, pickupTime: form.dropoffTime };
      const url    = editingId ? `${API}/tasks/${editingId}` : `${API}/tasks`;
      const method = editingId ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (!res.ok) { setFormError(data.error || `Error ${res.status}`); return; }
      setShowForm(false);
      await loadAll();
    } catch { setFormError("Network error — please try again."); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this task?")) return;
    await fetch(`${API}/tasks/${id}`, { method: "DELETE" });
    loadAll();
  };

  const setStatus = async (id, status) => {
    await fetch(`${API}/tasks/${id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadAll();
  };

  return (
    <div className="min-h-screen bg-[#0f1724] text-white p-4">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Tasks</h1>
        <div className="flex items-center gap-3">
          <TaskCalendar selectedDate={selectedDate} onSelect={setSelectedDate} tasksByDate={tasksByDate} />
          <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-semibold">+ Add Task</button>
        </div>
      </div>

      {selectedDate && (
        <div className="text-xs text-slate-400 mb-3">
          Showing: <span className="text-white font-medium">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-ZA", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
          </span>
          <button onClick={() => setSelectedDate("")} className="ml-3 text-blue-400 hover:text-blue-300">Show all</button>
        </div>
      )}

      {/* Kanban */}
      <div className="grid grid-cols-4 gap-3">
        {STATUSES.map(({ key, label, color, badge }) => {
          const col = tasksForStatus(key);
          return (
            <div key={key} className={`bg-[#1e293b] rounded-lg border-t-4 ${color} flex flex-col`}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                <span className="text-xs font-semibold">{label}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${badge}`}>{col.length}</span>
              </div>
              <div className="flex flex-col gap-1.5 p-2 flex-1 overflow-y-auto max-h-[75vh]">
                {col.length === 0 && <p className="text-slate-500 text-[11px] italic text-center mt-3">No tasks</p>}
                {col.map((task) => (
                  <div key={task.id} className="bg-[#0b1220] border border-slate-700 rounded p-2 text-[11px] leading-snug">
                    <div className="font-semibold text-[12px] truncate">
                      {task.title || task.loadLocation || "Untitled"}
                      {task.orderNumber && <span className="ml-1 text-slate-400 font-normal">#{task.orderNumber}</span>}
                    </div>
                    <div className="text-slate-400 truncate mt-0.5">
                      📍{task.loadLocation || "—"} → 🏁{task.dropoffLocation || "—"}
                    </div>
                    <div className="text-slate-400 truncate mt-0.5">
                      👤 {task.assignedDriverId ? driverName(task.assignedDriverId) : <span className="italic text-slate-500">Unassigned</span>}
                      {"  "}🚛 {task.vehicleId ? vehicleReg(task.vehicleId) : <span className="italic text-slate-500">—</span>}
                    </div>
                    {(task.date || task.pickupTime) && (
                      <div className="text-slate-500 text-[10px] mt-0.5">
                        {task.date}{task.pickupTime ? ` drop @${task.pickupTime}` : ""}
                      </div>
                    )}

                    {/* Photo count badge for completed tasks */}
                    {task.status === "completed" && (
                      <div className="text-[10px] text-green-400 mt-0.5">
                        📷 {(task.photoUrls?.length || 0) + (task.photoUrl && !task.photoUrls?.length ? 1 : 0)} POD photo(s)
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-slate-700/60">
                      {/* View POD button for completed tasks */}
                      {task.status === "completed" && (
                        <button onClick={() => setPodTask(task)}
                          className="px-1.5 py-0.5 bg-green-800 hover:bg-green-700 rounded text-[10px] font-medium">
                          👁 View POD
                        </button>
                      )}
                      <button onClick={() => openEdit(task)}
                        className="px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-[10px]">✏ Edit</button>
                      <button onClick={() => handleDelete(task.id)}
                        className="px-1.5 py-0.5 bg-red-900 hover:bg-red-700 rounded text-[10px]">🗑 Del</button>
                      {task.status === "todo" && (
                        <button onClick={() => setStatus(task.id, "inprogress")}
                          className="px-1.5 py-0.5 bg-yellow-700 hover:bg-yellow-600 rounded text-[10px]" title="Test: simulate driver accepting">▶ Accept</button>
                      )}
                      {task.status === "inprogress" && (
                        <>
                          <button onClick={() => setStatus(task.id, "completed")}
                            className="px-1.5 py-0.5 bg-green-700 hover:bg-green-600 rounded text-[10px]">✅ Done</button>
                          <button onClick={() => setStatus(task.id, "completed")}
                            className="px-1.5 py-0.5 bg-orange-700 hover:bg-orange-600 rounded text-[10px]">❌ Fail</button>
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

      {/* POD Modal */}
      {podTask && (
        <PodModal task={podTask} drivers={drivers} vehicles={vehicles} onClose={() => setPodTask(null)} />
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleSave}
            className="bg-[#1e293b] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 border border-slate-600">
            <h2 className="text-lg font-bold mb-4">{editingId ? "Edit Task" : "Create Task"}</h2>
            {formError && <div className="bg-red-900/50 border border-red-500 text-red-300 text-sm px-3 py-2 rounded mb-3">{formError}</div>}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Title (optional)</label>
                <input className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Coal delivery" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Load Location *</label>
                <input list="load-pts" className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.loadLocation} onChange={e => setForm({...form, loadLocation: e.target.value})} placeholder="Select or type" />
                <datalist id="load-pts">{loadingPoints.map(p => <option key={p.id} value={p.title} />)}</datalist>
                {loadingPoints.length > 0 && <p className="text-[10px] text-slate-500 mt-0.5">{loadingPoints.length} saved points</p>}
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Dropoff Location</label>
                <input list="drop-pts" className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.dropoffLocation} onChange={e => setForm({...form, dropoffLocation: e.target.value})} placeholder="Select or type" />
                <datalist id="drop-pts">{dropoffPoints.map(p => <option key={p.id} value={p.title} />)}</datalist>
                {dropoffPoints.length > 0 && <p className="text-[10px] text-slate-500 mt-0.5">{dropoffPoints.length} saved points</p>}
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Additional Dropoff</label>
                <input list="drop-pts-2" className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.additionalDropoff} onChange={e => setForm({...form, additionalDropoff: e.target.value})} placeholder="Optional" />
                <datalist id="drop-pts-2">{dropoffPoints.map(p => <option key={p.id} value={p.title} />)}</datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Order Number</label>
                  <input className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                    value={form.orderNumber} onChange={e => setForm({...form, orderNumber: e.target.value})} placeholder="e.g. ORD-001" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Dropoff Date</label>
                  <input type="date" className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                    value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Dropoff Time</label>
                <input type="time" className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.dropoffTime} onChange={e => setForm({...form, dropoffTime: e.target.value})} />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Assign Driver</label>
                <select className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.assignedDriverId} onChange={e => setForm({...form, assignedDriverId: e.target.value})}>
                  <option value="">— Unassigned —</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Assign Vehicle</label>
                <select className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  value={form.vehicleId} onChange={e => setForm({...form, vehicleId: e.target.value})}>
                  <option value="">— No Vehicle —</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.registration}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Notes</label>
                <textarea className="w-full bg-[#0f1724] border border-slate-600 rounded p-2 text-sm text-white"
                  rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Additional instructions..." />
              </div>
              <div className="text-xs text-slate-500 bg-slate-800 rounded p-2">
                💡 Task will be <strong className="text-slate-300">{form.assignedDriverId && form.vehicleId ? "To Do" : "Unassigned"}</strong> after saving
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="submit" disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white py-2 rounded font-semibold text-sm">
                {saving ? "Saving..." : editingId ? "Save Changes" : "Create Task"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
