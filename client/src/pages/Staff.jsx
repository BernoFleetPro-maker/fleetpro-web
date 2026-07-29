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

const PERMISSION_FIELDS = [
  { key: "map",            label: "Map" },
  { key: "tasks",          label: "Tasks" },
  { key: "drivers",        label: "Drivers" },
  { key: "vehicles",       label: "Vehicles" },
  { key: "loadingPoints",  label: "Loading Points" },
  { key: "dropoffPoints",  label: "Dropoff Points" },
  { key: "clients",        label: "Clients" },
  { key: "staff",          label: "Staff" },
  { key: "settings",       label: "Settings" },
];
const DEFAULT_PERMISSIONS = Object.fromEntries(PERMISSION_FIELDS.map(f => [f.key, true]));

const EMPTY_FORM = { name: "", username: "", password: "", permissions: DEFAULT_PERMISSIONS };

function AccessBadge({ row }) {
  if (row.role === "admin") {
    return <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">Admin</span>;
  }
  const perms = row.permissions || {};
  const total = PERMISSION_FIELDS.length;
  const onCount = PERMISSION_FIELDS.filter(f => perms[f.key] === true).length;
  if (onCount === total) {
    return <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-2 py-0.5 rounded-full">Full Access</span>;
  }
  return <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">Custom ({onCount}/{total})</span>;
}

export default function Staff() {
  const [staffList,   setStaffList]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editingId,   setEditingId]   = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");

  const load = async () => {
    try {
      const res  = await authFetch(`${API}/staff`);
      const data = await res.json();
      setStaffList(Array.isArray(data) ? data : []);
    } catch { setStaffList([]); }
    finally  { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, permissions: { ...DEFAULT_PERMISSIONS } });
    setEditingId(null);
    setEditingRole(null);
    setError("");
    setShowForm(true);
  };

  const openEdit = (s) => {
    setForm({
      name: s.name,
      username: s.username,
      password: "",
      permissions: { ...DEFAULT_PERMISSIONS, ...(s.permissions || {}) },
    });
    setEditingId(s.id);
    setEditingRole(s.role || "staff");
    setError("");
    setShowForm(true);
  };

  const togglePermission = (key) => {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim())     { setError("Name is required."); return; }
    if (!form.username.trim()) { setError("Username is required."); return; }
    if (!editingId && !form.password.trim()) { setError("Password is required for new staff members."); return; }

    setSaving(true);
    try {
      const url    = editingId ? `${API}/staff/${editingId}` : `${API}/staff`;
      const method = editingId ? "PUT" : "POST";
      const body   = { name: form.name, username: form.username, password: form.password };
      if (editingId && !body.password) delete body.password;
      // Admin's own row always has full access — permissions don't apply,
      // so nothing is sent and the DB's (unused) value is left untouched.
      if (editingRole !== "admin") body.permissions = form.permissions;

      const res  = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to save."); return; }

      setSuccess(editingId ? "Staff member updated!" : "Staff member created!");
      setShowForm(false);
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch { setError("Server error. Please try again."); }
    finally  { setSaving(false); }
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`Delete staff member "${s.name}"? They will no longer be able to log in.`)) return;
    try {
      await authFetch(`${API}/staff/${s.id}`, { method: "DELETE" });
      setSuccess("Staff member deleted.");
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch { alert("Failed to delete staff member."); }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">👔 Staff</h2>
          <p className="text-sm text-slate-500 mt-1">Manage staff logins and what each person can see</p>
        </div>
        <button onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
          + Add Staff
        </button>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-2 rounded-lg mb-4 text-sm">
          ✅ {success}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading staff...</div>
      ) : staffList.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">👔</div>
          <p className="font-medium">No staff yet</p>
          <p className="text-sm mt-1">Add your first staff member to give your team access</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-slate-600 font-semibold">Name</th>
                <th className="text-left px-4 py-3 text-slate-600 font-semibold">Username</th>
                <th className="text-left px-4 py-3 text-slate-600 font-semibold">Access</th>
                <th className="text-left px-4 py-3 text-slate-600 font-semibold">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffList.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-800">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{s.username}</td>
                  <td className="px-4 py-3"><AccessBadge row={s} /></td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(s.createdAt).toLocaleDateString("en-ZA")}
                  </td>
                  <td className="px-4 py-3 flex gap-2 justify-end">
                    <button onClick={() => openEdit(s)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-medium">
                      ✏ Edit
                    </button>
                    {s.role !== "admin" && (
                      <button onClick={() => handleDelete(s)}
                        className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded text-xs font-medium">
                        🗑 Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info box */}
      <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-700">
        <strong>👔 Staff Access</strong>
        <ul className="mt-2 space-y-1 list-disc list-inside text-purple-600">
          <li>Staff log in at the same URL using their username and password</li>
          <li>Passwords are not case-sensitive</li>
          <li>Each staff member's sidebar only shows what you've enabled for them below</li>
          <li>Tasks show who created and last edited them for accountability</li>
          <li>A staff member needs the "Staff" permission enabled to manage other staff</li>
          <li>Your tenant's Admin (shown above with the "Admin" badge) always has full access to everything</li>
        </ul>
      </div>

      {/* Create/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {editingId ? "Edit Staff Member" : "Add New Staff Member"}
            </h3>

            {error && (
              <div className="bg-red-50 border border-red-300 text-red-600 text-sm px-3 py-2 rounded mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 font-semibold block mb-1">Full Name *</label>
                <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="e.g. John Smith"
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold block mb-1">Username *</label>
                <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="e.g. johnsmith"
                  value={form.username}
                  onChange={e => setForm({...form, username: e.target.value.toLowerCase()})} />
                <p className="text-[10px] text-slate-400 mt-0.5">Lowercase only, no spaces</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold block mb-1">
                  Password {editingId ? "(leave blank to keep current)" : "*"}
                </label>
                <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder={editingId ? "Leave blank to keep unchanged" : "e.g. fleet123"}
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})} />
                <p className="text-[10px] text-slate-400 mt-0.5">Not case-sensitive</p>
              </div>

              {editingRole === "admin" ? (
                <div className="bg-indigo-50 rounded-lg p-3 text-xs text-indigo-700">
                  <strong className="text-indigo-800">Admin has full access to everything.</strong><br/>
                  Sidebar permissions don't apply to your tenant's Admin account.
                </div>
              ) : (
                <div>
                  <label className="text-xs text-slate-500 font-semibold block mb-2">Sidebar Access</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PERMISSION_FIELDS.map(f => (
                      <label key={f.key} className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.permissions[f.key] === true}
                          onChange={() => togglePermission(f.key)}
                          className="rounded border-slate-300"
                        />
                        {f.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg font-semibold text-sm">
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Staff Member"}
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
