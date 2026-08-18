import React, { useEffect, useState } from "react";
import RouteModal from "../components/RouteModal";

const API = "https://fleetpro-backend-production.up.railway.app/api";

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


const CLIENT_PERMISSION_FIELDS = [
  { key: "canViewMap",     label: "View Map",           badge: "Map",    hint: "See vehicle positions on the map" },
  { key: "canViewTasks",   label: "View Tasks",         badge: "Tasks",  hint: "See tasks assigned to this client" },
  { key: "canCreateTasks", label: "Create & Edit Tasks", badge: "Create", hint: "Create new tasks and edit their own — never delete" },
];
const DEFAULT_CLIENT_PERMISSIONS = { canViewMap: true, canViewTasks: true, canCreateTasks: false };

const EMPTY_FORM = { name: "", username: "", password: "", permissions: DEFAULT_CLIENT_PERMISSIONS };

// ── Site Time Report helpers ─────────────────────────────────────────────────
// Thresholds set by the user directly (2026-08-13): green up to 1h30, orange
// up to 2h30, red beyond that. Anything under 10min is folded into green too
// (a real dwell is very unlikely to be that short, and there's no separate
// treatment specified for it).
const DWELL_GREEN_MAX_MIN = 90;
const DWELL_ORANGE_MAX_MIN = 150;

function fmtDT(d) {
  return d ? new Date(d).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}
function fmtMinutes(mins) {
  if (mins == null) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function dwellClass(mins) {
  if (mins == null) return "text-slate-400";
  if (mins > DWELL_ORANGE_MAX_MIN) return "text-red-600 font-bold";
  if (mins > DWELL_GREEN_MAX_MIN) return "text-orange-600 font-semibold";
  return "text-green-600 font-semibold";
}
// Load score and Drop Dwell score are both tiered against raw dwell time —
// how long the vehicle sat at that site, no scheduled time to compare
// against. On-Time score is tiered against lateness vs. the task's
// scheduled dropoff time (Task.date + Task.pickupTime — the only scheduled
// time this app captures per task). All three land on the same 100/75/50/
// 25/0 scale, so the same color/format helpers work for all of them.
function fmtScore(score) {
  return score == null ? "—" : `${score}%`;
}
function scoreClass(score) {
  if (score == null) return "text-slate-400";
  if (score >= 75) return "text-green-600 font-semibold";
  if (score >= 50) return "text-orange-600 font-semibold";
  return "text-red-600 font-bold";
}
// Raw minutes-late/early — the concrete number a client actually cares
// about ("47 min late" means something; "50%" on its own doesn't). Colored
// via the same tiers as onTimeScore so a red number and a red score always
// agree with each other.
function fmtTiming(mins) {
  if (mins == null) return "—";
  if (mins <= 0) return `${Math.abs(mins)} min early`;
  return `${mins} min late`;
}
function timingClass(mins) {
  if (mins == null) return "text-slate-400";
  if (mins <= 0) return "text-green-600 font-semibold";
  if (mins <= 30) return "text-green-600 font-semibold";
  if (mins <= 60) return "text-orange-600 font-semibold";
  return "text-red-600 font-bold";
}
function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function firstOfMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function SiteTimeReportTab({ clients }) {
  const [mode,      setMode]      = useState("client"); // "client" | "dropoffPoint"
  const [clientId,  setClientId]  = useState("");
  const [pointId,   setPointId]   = useState("");
  const [dropoffPoints, setDropoffPoints] = useState([]);
  const [from,      setFrom]      = useState(firstOfMonthISO());
  const [to,        setTo]        = useState(isoDate());
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [routeTask, setRouteTask] = useState(null); // task row currently drilled into, or null

  useEffect(() => {
    authFetch(`${API}/points`)
      .then(res => res.json())
      .then(pts => setDropoffPoints((Array.isArray(pts) ? pts : []).filter(p => p.type === "dropoff")))
      .catch(() => setDropoffPoints([]));
  }, []);

  const generate = async () => {
    setError("");
    if (mode === "client" && !clientId) { setError("Select a client."); return; }
    if (mode === "dropoffPoint" && !pointId) { setError("Select a dropoff point."); return; }
    if (!from || !to) { setError("Select a date range."); return; }
    if (from > to)    { setError("'Date from' must be before 'Date to'."); return; }
    setLoading(true);
    setData(null);
    try {
      const scopeParam = mode === "client" ? `clientId=${encodeURIComponent(clientId)}` : `dropoffPointId=${encodeURIComponent(pointId)}`;
      const res  = await authFetch(`${API}/tasks/site-time-report?${scopeParam}&from=${from}&to=${to}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Failed to generate report."); return; }
      setData(json);
    } catch { setError("Server error. Please try again."); }
    finally { setLoading(false); }
  };

  const scopeName = mode === "client"
    ? (clients.find(c => c.id === clientId)?.name || "")
    : (data?.scope?.title || dropoffPoints.find(p => p.id === pointId)?.title || "");

  function handleDownloadReportPdf() {
    if (!data) return;
    const win = window.open("", "_blank");
    if (!win) { alert("Please allow popups for this site to download the PDF."); return; }

    const dwellFlagClass = (mins) => mins == null ? "" : mins > DWELL_ORANGE_MAX_MIN ? "dwell-red" : mins > DWELL_GREEN_MAX_MIN ? "dwell-orange" : "dwell-green";
    const scoreFlagClass = (score) => score == null ? "" : score >= 75 ? "dwell-green" : score >= 50 ? "dwell-orange" : "dwell-red";
    const timingFlagClass = (mins) => mins == null ? "" : mins <= 30 ? "dwell-green" : mins <= 60 ? "dwell-orange" : "dwell-red";
    const rows = data.tasks.map(t => `
      <tr>
        <td>${(t.title || "—").toString().replace(/</g, "")}${t.orderNumber ? ` <span class="muted">#${t.orderNumber}</span>` : ""}${!t.hasCompleteTracking ? ` <span class="warn">⚠</span>` : ""}</td>
        ${mode === "dropoffPoint" ? `<td>${(t.clientName || "—").toString().replace(/</g, "")}</td>` : ""}
        <td>${t.driverName || "—"}</td>
        <td>${t.vehicleRegistration || "—"}</td>
        <td>${fmtDT(t.arrivedLoadAt)}</td>
        <td>${fmtDT(t.departedLoadAt)}</td>
        <td class="${dwellFlagClass(t.loadDwellMinutes)}">${fmtMinutes(t.loadDwellMinutes)}</td>
        <td>${fmtDT(t.arrivedDropAt)}</td>
        <td>${fmtDT(t.departedDropAt)}</td>
        <td class="${dwellFlagClass(t.dropDwellMinutes)}">${fmtMinutes(t.dropDwellMinutes)}</td>
        <td class="${timingFlagClass(t.dropoffTimingMinutes)}">${fmtTiming(t.dropoffTimingMinutes)}</td>
        <td>${fmtDT(t.completedAt)}</td>
      </tr>
    `).join("");

    win.document.write(`
      <html>
      <head>
        <title>Site Time Report — ${(scopeName || "Report").toString().replace(/</g, "")}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color:#111; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          .sub { color:#555; font-size:12px; margin-bottom:20px; }
          .grid { display:grid; grid-template-columns: repeat(5, 1fr); gap:10px; margin-bottom:20px; }
          .card { border:1px solid #ddd; border-radius:6px; padding:10px; }
          .card .label { font-size:11px; color:#666; }
          .card .value { font-size:14px; font-weight:600; }
          table { width:100%; border-collapse:collapse; font-size:11px; margin-top:8px; }
          th, td { border:1px solid #ddd; padding:5px 7px; text-align:left; white-space:nowrap; }
          th { background:#f3f4f6; }
          .muted { color:#888; font-size:10px; }
          .warn { color:#b45309; font-weight:700; }
          .dwell-green { color:#16a34a; font-weight:700; }
          .dwell-orange { color:#c2410c; font-weight:700; }
          .dwell-red { color:#b91c1c; font-weight:700; }
          @media print { table { font-size:10px; } }
        </style>
      </head>
      <body>
        <h1>Site Time Report — ${(scopeName || "Report").toString().replace(/</g, "")}${mode === "dropoffPoint" ? " (dropoff site, all clients)" : ""}</h1>
        <div class="sub">${from} to ${to} · ${data.summary.taskCount} completed task${data.summary.taskCount !== 1 ? "s" : ""}</div>
        <div class="grid">
          <div class="card"><div class="label">Completed Tasks</div><div class="value">${data.summary.taskCount}</div></div>
          <div class="card"><div class="label">Avg Load Dwell</div><div class="value ${dwellFlagClass(data.summary.loadDwell.avg)}">${fmtMinutes(data.summary.loadDwell.avg)}</div></div>
          <div class="card"><div class="label">Load Score</div><div class="value ${scoreFlagClass(data.summary.loadScore)}">${fmtScore(data.summary.loadScore)}</div></div>
          <div class="card"><div class="label">Avg Drop Dwell</div><div class="value ${dwellFlagClass(data.summary.dropDwell.avg)}">${fmtMinutes(data.summary.dropDwell.avg)}</div></div>
          <div class="card"><div class="label">Drop Dwell Score</div><div class="value ${scoreFlagClass(data.summary.dropDwellScore)}">${fmtScore(data.summary.dropDwellScore)}</div></div>
          <div class="card"><div class="label">Avg Dropoff Timing</div><div class="value ${timingFlagClass(data.summary.dropoffTiming.avg)}">${fmtTiming(data.summary.dropoffTiming.avg)}</div></div>
          <div class="card"><div class="label">On-Time Score</div><div class="value ${scoreFlagClass(data.summary.onTimeScore)}">${fmtScore(data.summary.onTimeScore)}</div></div>
          <div class="card"><div class="label">Avg Transit</div><div class="value">${fmtMinutes(data.summary.transit.avg)}</div></div>
          <div class="card"><div class="label">Incomplete Tracking</div><div class="value">${data.summary.incompleteTrackingCount}</div></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Task</th>${mode === "dropoffPoint" ? "<th>Client</th>" : ""}<th>Driver</th><th>Vehicle</th>
              <th>Arrived Load</th><th>Departed Load</th><th>Load Dwell</th>
              <th>Arrived Drop</th><th>Departed Drop</th><th>Drop Dwell</th><th>Dropoff Timing</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-xl shadow border border-slate-200 p-4 mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs text-slate-500 font-semibold block mb-1">Report by</label>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            <button type="button" onClick={() => { setMode("client"); setData(null); setError(""); }}
              className={`px-3 py-2 text-sm font-medium ${mode === "client" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              Client
            </button>
            <button type="button" onClick={() => { setMode("dropoffPoint"); setData(null); setError(""); }}
              className={`px-3 py-2 text-sm font-medium border-l border-slate-300 ${mode === "dropoffPoint" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              Dropoff Point
            </button>
          </div>
        </div>
        {mode === "client" ? (
          <div>
            <label className="text-xs text-slate-500 font-semibold block mb-1">Client</label>
            <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[200px] focus:outline-none focus:border-blue-500"
              value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">Select a client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="text-xs text-slate-500 font-semibold block mb-1">Dropoff Point</label>
            <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[200px] focus:outline-none focus:border-blue-500"
              value={pointId} onChange={e => setPointId(e.target.value)}>
              <option value="">Select a dropoff point…</option>
              {dropoffPoints.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            {dropoffPoints.length === 0 && (
              <p className="text-[11px] text-slate-400 mt-1">No saved dropoff points yet — add one on the Dropoff Points page.</p>
            )}
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500 font-semibold block mb-1">Date From</label>
          <input type="date" className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-semibold block mb-1">Date To</label>
          <input type="date" className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button onClick={generate} disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg text-sm font-semibold">
          {loading ? "Generating…" : "Generate Report"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-600 text-sm px-4 py-2 rounded-lg mb-4">{error}</div>
      )}

      {data && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-slate-500">
              {scopeName}{mode === "dropoffPoint" && <span className="text-slate-400"> · all clients</span>} · {from} to {to}
            </div>
            <button onClick={handleDownloadReportPdf}
              className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg">
              ⬇ Download PDF
            </button>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3 mb-6">
            <div className="bg-white rounded-xl shadow border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Completed Tasks</div>
              <div className="text-xl font-bold text-slate-800">{data.summary.taskCount}</div>
            </div>
            <div className="bg-white rounded-xl shadow border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Avg Load Dwell</div>
              <div className={`text-xl font-bold ${dwellClass(data.summary.loadDwell.avg)}`}>{fmtMinutes(data.summary.loadDwell.avg)}</div>
            </div>
            <div className="bg-white rounded-xl shadow border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Load Score</div>
              <div className={`text-xl font-bold ${scoreClass(data.summary.loadScore)}`}>{fmtScore(data.summary.loadScore)}</div>
            </div>
            <div className="bg-white rounded-xl shadow border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Avg Drop Dwell</div>
              <div className={`text-xl font-bold ${dwellClass(data.summary.dropDwell.avg)}`}>{fmtMinutes(data.summary.dropDwell.avg)}</div>
            </div>
            <div className="bg-white rounded-xl shadow border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Drop Dwell Score</div>
              <div className={`text-xl font-bold ${scoreClass(data.summary.dropDwellScore)}`}>{fmtScore(data.summary.dropDwellScore)}</div>
            </div>
            <div className="bg-white rounded-xl shadow border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Avg Dropoff Timing</div>
              <div className={`text-xl font-bold ${timingClass(data.summary.dropoffTiming.avg)}`}>{fmtTiming(data.summary.dropoffTiming.avg)}</div>
            </div>
            <div className="bg-white rounded-xl shadow border border-slate-200 p-3">
              <div className="text-xs text-slate-500">On-Time Score</div>
              <div className={`text-xl font-bold ${scoreClass(data.summary.onTimeScore)}`}>{fmtScore(data.summary.onTimeScore)}</div>
            </div>
            <div className="bg-white rounded-xl shadow border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Avg Transit</div>
              <div className="text-xl font-bold text-slate-800">{fmtMinutes(data.summary.transit.avg)}</div>
            </div>
            <div className="bg-white rounded-xl shadow border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Incomplete Tracking</div>
              <div className={`text-xl font-bold ${data.summary.incompleteTrackingCount > 0 ? "text-amber-600" : "text-slate-800"}`}>
                {data.summary.incompleteTrackingCount}
              </div>
            </div>
          </div>

          {/* Per-task table */}
          {data.tasks.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <div className="text-4xl mb-3">📭</div>
              <p className="font-medium">No completed tasks for {scopeName || "this selection"} in this date range</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-3 text-slate-600 font-semibold">Task</th>
                    {mode === "dropoffPoint" && <th className="text-left px-3 py-3 text-slate-600 font-semibold">Client</th>}
                    <th className="text-left px-3 py-3 text-slate-600 font-semibold">Driver</th>
                    <th className="text-left px-3 py-3 text-slate-600 font-semibold">Vehicle</th>
                    <th className="text-left px-3 py-3 text-slate-600 font-semibold">Arrived Load</th>
                    <th className="text-left px-3 py-3 text-slate-600 font-semibold">Departed Load</th>
                    <th className="text-left px-3 py-3 text-slate-600 font-semibold">Load Dwell</th>
                    <th className="text-left px-3 py-3 text-slate-600 font-semibold">Arrived Drop</th>
                    <th className="text-left px-3 py-3 text-slate-600 font-semibold">Departed Drop</th>
                    <th className="text-left px-3 py-3 text-slate-600 font-semibold">Drop Dwell</th>
                    <th className="text-left px-3 py-3 text-slate-600 font-semibold">Dropoff Timing</th>
                    <th className="text-left px-3 py-3 text-slate-600 font-semibold">Completed</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.tasks.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-800">{t.title || "—"}</div>
                        {t.orderNumber && <div className="text-[11px] text-slate-400">#{t.orderNumber}</div>}
                        {!t.hasCompleteTracking && <div className="text-[10px] text-amber-600 font-medium mt-0.5">⚠ Incomplete tracking</div>}
                      </td>
                      {mode === "dropoffPoint" && <td className="px-3 py-3 text-slate-600">{t.clientName || "—"}</td>}
                      <td className="px-3 py-3 text-slate-600">{t.driverName || "—"}</td>
                      <td className="px-3 py-3 text-slate-600 font-mono text-xs">{t.vehicleRegistration || "—"}</td>
                      <td className="px-3 py-3 text-slate-600 text-xs">{fmtDT(t.arrivedLoadAt)}</td>
                      <td className="px-3 py-3 text-slate-600 text-xs">{fmtDT(t.departedLoadAt)}</td>
                      <td className={`px-3 py-3 ${dwellClass(t.loadDwellMinutes)}`}>{fmtMinutes(t.loadDwellMinutes)}</td>
                      <td className="px-3 py-3 text-slate-600 text-xs">{fmtDT(t.arrivedDropAt)}</td>
                      <td className="px-3 py-3 text-slate-600 text-xs">{fmtDT(t.departedDropAt)}</td>
                      <td className={`px-3 py-3 ${dwellClass(t.dropDwellMinutes)}`}>{fmtMinutes(t.dropDwellMinutes)}</td>
                      <td className={`px-3 py-3 ${timingClass(t.dropoffTimingMinutes)}`}>{fmtTiming(t.dropoffTimingMinutes)}</td>
                      <td className="px-3 py-3 text-slate-500 text-xs">{fmtDT(t.completedAt)}</td>
                      <td className="px-3 py-3">
                        <button onClick={() => setRouteTask(t)}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          🗺 View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {routeTask && (
        <RouteModal
          task={routeTask}
          driverName={routeTask.driverName}
          vehicleRegistration={routeTask.vehicleRegistration}
          onClose={() => setRouteTask(null)}
        />
      )}
    </div>
  );
}

function AccessBadges({ permissions }) {
  const p = permissions || {};
  const active = CLIENT_PERMISSION_FIELDS.filter(f => p[f.key] === true);
  if (active.length === 0) {
    return <span className="bg-slate-100 text-slate-500 text-xs font-semibold px-2 py-0.5 rounded-full">No Access</span>;
  }
  return (
    <div className="flex gap-1 flex-wrap">
      {active.map(f => (
        <span key={f.key} className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
          {f.badge}
        </span>
      ))}
    </div>
  );
}

export default function Clients({ canUseFeature = () => true }) {
  const [clients,   setClients]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");
  const [tab,       setTab]       = useState("clients"); // "clients" | "report"
  const [whatsappGroups, setWhatsappGroups] = useState([]);

  const load = async () => {
    try {
      const res = await authFetch(`${API}/clients`);
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch { setClients([]); } finally { setLoading(false); }
  };

  const loadWhatsappGroups = async () => {
    try {
      const res = await authFetch(`${API}/whatsapp/groups`);
      const data = await res.json();
      setWhatsappGroups(Array.isArray(data) ? data : []);
    } catch { setWhatsappGroups([]); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (canUseFeature("whatsappBot")) loadWhatsappGroups(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const assignGroup = async (groupId, clientId) => {
    try {
      const res = await authFetch(`${API}/whatsapp/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientId || null }),
      });
      if (res.ok) loadWhatsappGroups();
    } catch {}
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, permissions: { ...DEFAULT_CLIENT_PERMISSIONS } });
    setEditingId(null);
    setError("");
    setShowForm(true);
  };

  const openEdit = (client) => {
    setForm({
      name: client.name,
      username: client.username,
      password: "",
      permissions: { ...DEFAULT_CLIENT_PERMISSIONS, ...(client.permissions || {}) },
    });
    setEditingId(client.id);
    setError("");
    setShowForm(true);
  };

  const togglePermission = (key) => {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim())     { setError("Client name is required."); return; }
    if (!form.username.trim()) { setError("Username is required."); return; }
    if (!editingId && !form.password.trim()) { setError("Password is required for new clients."); return; }

    setSaving(true);
    try {
      const url    = editingId ? `${API}/clients/${editingId}` : `${API}/clients`;
      const method = editingId ? "PUT" : "POST";
      const body   = { ...form };
      if (editingId && !body.password) delete body.password; // don't overwrite if blank

      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to save client."); return; }

      setSuccess(editingId ? "Client updated!" : "Client created!");
      setShowForm(false);
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch { setError("Server error. Please try again."); }
    finally  { setSaving(false); }
  };

  const handleDelete = async (client) => {
    if (!window.confirm(`Delete client "${client.name}"? This cannot be undone.`)) return;
    try {
      await authFetch(`${API}/clients/${client.id}`, { method: "DELETE" });
      setSuccess("Client deleted.");
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch { alert("Failed to delete client."); }
  };

  return (
    <div className={`p-6 ${tab === "report" ? "w-full" : "max-w-3xl mx-auto"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">🏢 Clients</h2>
          <p className="text-sm text-slate-500 mt-1">Manage client accounts and their portal access</p>
        </div>
        {tab === "clients" && (
          <button onClick={openCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            + Add Client
          </button>
        )}
      </div>

      {tab === "clients" && canUseFeature("whatsappBot") && whatsappGroups.some(g => !g.clientId) && (
        <div className="mb-6 bg-amber-50 border border-amber-300 rounded-lg p-4">
          <div className="text-sm font-semibold text-amber-800 mb-2">
            📱 Unassigned WhatsApp group{whatsappGroups.filter(g => !g.clientId).length === 1 ? "" : "s"} — assign to a client so the bot can respond
          </div>
          <div className="space-y-2">
            {whatsappGroups.filter(g => !g.clientId).map(g => (
              <div key={g.id} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 text-sm">
                <span className="font-medium text-slate-700 truncate">{g.groupName || g.groupJid}</span>
                <select
                  className="border border-slate-300 rounded-lg px-2 py-1 text-xs min-w-[160px]"
                  value=""
                  onChange={e => e.target.value && assignGroup(g.id, e.target.value)}
                >
                  <option value="">Assign to client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {canUseFeature("siteTimeReports") && (
        <div className="flex gap-1 mb-6 border-b border-slate-200">
          <button onClick={() => setTab("clients")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === "clients" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            Clients
          </button>
          <button onClick={() => setTab("report")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === "report" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            📊 Site Time Reports
          </button>
        </div>
      )}

      {tab === "report" ? (
        <SiteTimeReportTab clients={clients} />
      ) : (
      <>
      {success && (
        <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-2 rounded-lg mb-4 text-sm">
          ✅ {success}
        </div>
      )}

      {/* Clients table */}
      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading clients...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">🏢</div>
          <p className="font-medium">No clients yet</p>
          <p className="text-sm mt-1">Add your first client to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-slate-600 font-semibold">Client Name</th>
                <th className="text-left px-4 py-3 text-slate-600 font-semibold">Username</th>
                <th className="text-left px-4 py-3 text-slate-600 font-semibold">Access</th>
                <th className="text-left px-4 py-3 text-slate-600 font-semibold">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map(client => (
                <tr key={client.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-800">{client.name}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{client.username}</td>
                  <td className="px-4 py-3">
                    <AccessBadges permissions={client.permissions} />
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(client.createdAt).toLocaleDateString("en-ZA")}
                  </td>
                  <td className="px-4 py-3 flex gap-2 justify-end">
                    <button onClick={() => openEdit(client)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-medium">
                      ✏ Edit
                    </button>
                    <button onClick={() => handleDelete(client)}
                      className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded text-xs font-medium">
                      🗑 Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        <strong>💡 Client Portal Access</strong>
        <ul className="mt-2 space-y-1 list-disc list-inside text-blue-600">
          <li>Clients log in at the same URL as admin using their username and password</li>
          <li>Passwords are not case-sensitive</li>
          <li>Each client only ever sees their own data — the toggles below just control which pages they can reach</li>
          <li>Clients can never delete a task, regardless of these toggles</li>
        </ul>
      </div>
      </>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {editingId ? "Edit Client" : "Add New Client"}
            </h3>

            {error && (
              <div className="bg-red-50 border border-red-300 text-red-600 text-sm px-3 py-2 rounded mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 font-semibold block mb-1">Client Name *</label>
                <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="e.g. Sephaku Cement"
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold block mb-1">Username *</label>
                <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="e.g. sephaku"
                  value={form.username}
                  onChange={e => setForm({...form, username: e.target.value.toLowerCase()})} />
                <p className="text-[10px] text-slate-400 mt-0.5">Lowercase only, no spaces</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold block mb-1">
                  Password {editingId ? "(leave blank to keep current)" : "*"}
                </label>
                <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder={editingId ? "Leave blank to keep unchanged" : "e.g. 1234"}
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})} />
                <p className="text-[10px] text-slate-400 mt-0.5">Not case-sensitive — client can use uppercase or lowercase</p>
              </div>

              <div>
                <label className="text-xs text-slate-500 font-semibold block mb-2">Portal Access</label>
                <div className="space-y-2">
                  {CLIENT_PERMISSION_FIELDS.map(f => (
                    <label key={f.key} className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.permissions[f.key] === true}
                        onChange={() => togglePermission(f.key)}
                        className="rounded border-slate-300 mt-0.5"
                      />
                      <span>
                        <span className="block font-medium">{f.label}</span>
                        <span className="block text-[11px] text-slate-400">{f.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Always limited to this client's own data, regardless of these toggles.</p>
              </div>

              {editingId && canUseFeature("whatsappBot") && (
                <div>
                  <label className="text-xs text-slate-500 font-semibold block mb-2">WhatsApp Group(s)</label>
                  <div className="space-y-2">
                    {whatsappGroups.filter(g => g.clientId === editingId).map(g => (
                      <div key={g.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2 text-sm">
                        <span className="text-slate-700 truncate">{g.groupName || g.groupJid}</span>
                        <button type="button" onClick={() => assignGroup(g.id, null)}
                          className="text-xs text-red-600 hover:text-red-700 font-medium shrink-0">
                          Unassign
                        </button>
                      </div>
                    ))}
                    {whatsappGroups.filter(g => !g.clientId).length > 0 && (
                      <select
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        value=""
                        onChange={e => e.target.value && assignGroup(e.target.value, editingId)}
                      >
                        <option value="">+ Assign an unmapped group…</option>
                        {whatsappGroups.filter(g => !g.clientId).map(g => (
                          <option key={g.id} value={g.id}>{g.groupName || g.groupJid}</option>
                        ))}
                      </select>
                    )}
                    {whatsappGroups.filter(g => g.clientId === editingId).length === 0 && whatsappGroups.filter(g => !g.clientId).length === 0 && (
                      <p className="text-xs text-slate-400">No WhatsApp groups yet — they appear here once the bot receives a message from one.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg font-semibold text-sm">
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Client"}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
