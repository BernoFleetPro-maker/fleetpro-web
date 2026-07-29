import React, { useEffect, useState } from "react";

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

export default function Clients() {
  const [clients,   setClients]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");

  const load = async () => {
    try {
      const res = await authFetch(`${API}/clients`);
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch { setClients([]); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

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
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">🏢 Clients</h2>
          <p className="text-sm text-slate-500 mt-1">Manage client accounts and their portal access</p>
        </div>
        <button onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
          + Add Client
        </button>
      </div>

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
