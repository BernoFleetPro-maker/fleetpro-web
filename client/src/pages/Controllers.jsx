import React, { useEffect, useState } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";

const EMPTY_FORM = { name: "", username: "", password: "" };

export default function Controllers() {
  const [controllers, setControllers] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editingId,   setEditingId]   = useState(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");

  const load = async () => {
    try {
      const res  = await fetch(`${API}/controllers`);
      const data = await res.json();
      setControllers(Array.isArray(data) ? data : []);
    } catch { setControllers([]); }
    finally  { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError("");
    setShowForm(true);
  };

  const openEdit = (c) => {
    setForm({ name: c.name, username: c.username, password: "" });
    setEditingId(c.id);
    setError("");
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim())     { setError("Name is required."); return; }
    if (!form.username.trim()) { setError("Username is required."); return; }
    if (!editingId && !form.password.trim()) { setError("Password is required for new controllers."); return; }

    setSaving(true);
    try {
      const url    = editingId ? `${API}/controllers/${editingId}` : `${API}/controllers`;
      const method = editingId ? "PUT" : "POST";
      const body   = { ...form };
      if (editingId && !body.password) delete body.password;

      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to save."); return; }

      setSuccess(editingId ? "Controller updated!" : "Controller created!");
      setShowForm(false);
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch { setError("Server error. Please try again."); }
    finally  { setSaving(false); }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete controller "${c.name}"? They will no longer be able to log in.`)) return;
    try {
      await fetch(`${API}/controllers/${c.id}`, { method: "DELETE" });
      setSuccess("Controller deleted.");
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch { alert("Failed to delete controller."); }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">👔 Controllers</h2>
          <p className="text-sm text-slate-500 mt-1">Manage controller logins — full access accounts for your team</p>
        </div>
        <button onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
          + Add Controller
        </button>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-2 rounded-lg mb-4 text-sm">
          ✅ {success}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading controllers...</div>
      ) : controllers.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">👔</div>
          <p className="font-medium">No controllers yet</p>
          <p className="text-sm mt-1">Add your first controller to give your team access</p>
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
              {controllers.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-800">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{c.username}</td>
                  <td className="px-4 py-3">
                    <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      Full Access
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(c.createdAt).toLocaleDateString("en-ZA")}
                  </td>
                  <td className="px-4 py-3 flex gap-2 justify-end">
                    <button onClick={() => openEdit(c)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-medium">
                      ✏ Edit
                    </button>
                    <button onClick={() => handleDelete(c)}
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
      <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-700">
        <strong>👔 Controller Access</strong>
        <ul className="mt-2 space-y-1 list-disc list-inside text-purple-600">
          <li>Controllers log in at the same URL using their username and password</li>
          <li>Passwords are not case-sensitive</li>
          <li>Controllers have full access — same as Admin</li>
          <li>Tasks show who created and last edited them for accountability</li>
          <li>Controllers can manage other controllers</li>
        </ul>
      </div>

      {/* Create/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {editingId ? "Edit Controller" : "Add New Controller"}
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

              <div className="bg-purple-50 rounded-lg p-3 text-xs text-purple-600">
                <strong className="text-purple-700">Access level:</strong> Full Access<br/>
                Can see and manage everything. All their task actions are recorded.
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-2 rounded-lg font-semibold text-sm">
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Controller"}
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
