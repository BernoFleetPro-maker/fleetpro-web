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


function getAuthPayload() {
  try {
    const token = localStorage.getItem("fleetpro_token");
    if (!token) return null;
    return JSON.parse(atob(token.split(".")[1]));
  } catch { return null; }
}

export default function Settings() {
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(null);

  // Change password state
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew,     setPwNew]     = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving,  setPwSaving]  = useState(false);
  const [pwError,   setPwError]   = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const payload = getAuthPayload();
  const role    = payload?.role || "admin";
  const canChangePassword = role === "controller" || role === "client";

  const isAdminOrController = role === "admin" || role === "controller";

  const loadClients = async () => {
    if (!isAdminOrController) { setLoading(false); return; } // clients can't see other clients
    try {
      const res  = await authFetch(`${API}/clients`);
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch { setClients([]); }
    finally  { setLoading(false); }
  };

  useEffect(() => { loadClients(); }, []);

  const togglePermission = async (client) => {
    const newPermission = client.permission === "full" ? "view" : "full";
    setSaving(client.id);
    try {
      await authFetch(`${API}/clients/${client.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: client.name, username: client.username, permission: newPermission }),
      });
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, permission: newPermission } : c));
    } catch { alert("Failed to update permission."); }
    finally  { setSaving(null); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError(""); setPwSuccess("");
    if (!pwCurrent || !pwNew || !pwConfirm) { setPwError("All fields are required."); return; }
    if (pwNew.length < 6) { setPwError("New password must be at least 6 characters."); return; }
    if (pwNew !== pwConfirm) { setPwError("New passwords do not match."); return; }
    setPwSaving(true);
    try {
      const res = await fetch(`${API}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: payload?.username,
          currentPassword: pwCurrent,
          newPassword: pwNew,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error || "Failed to change password."); return; }
      setPwSuccess("✅ Password changed successfully!");
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
    } catch { setPwError("Network error — please try again."); }
    finally { setPwSaving(false); }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">⚙️ Settings</h2>
      <p className="text-slate-500 text-sm mb-6">System configuration and access control</p>

      {/* Permission Levels explanation */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-700">🔐 Permission Levels</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-4 items-start">
            <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded-full mt-0.5 whitespace-nowrap">Admin</span>
            <div>
              <p className="text-sm font-semibold text-slate-700">Full Access</p>
              <p className="text-xs text-slate-500 mt-0.5">
                All pages: Map, Tasks (create/edit/delete), Drivers, Vehicles, Loading Points, Dropoff Points, Clients, Settings.
                Credentials managed via Railway environment variables.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100" />
          <div className="flex gap-4 items-start">
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full mt-0.5 whitespace-nowrap">View Only</span>
            <div>
              <p className="text-sm font-semibold text-slate-700">Client — View Only (default)</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Map and Tasks only. Sees tasks assigned to their client account. Cannot create, edit, or delete anything.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100" />
          <div className="flex gap-4 items-start">
            <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full mt-0.5 whitespace-nowrap">Full Access</span>
            <div>
              <p className="text-sm font-semibold text-slate-700">Client — Full Access</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Same as Admin but filtered to their assigned tasks only. Can create and edit tasks linked to their client.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Client Permissions — admin/controller only */}
      {isAdminOrController && <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">🏢 Client Permissions</h3>
          <span className="text-xs text-slate-400">Toggle to change access level</span>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">Loading clients...</div>
        ) : clients.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">
            No clients yet. Add clients from the <strong>Clients</strong> menu.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {clients.map(client => {
              const isFull   = client.permission === "full";
              const isSaving = saving === client.id;
              return (
                <div key={client.id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{client.name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{client.username}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                      isFull ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {isFull ? "Full Access" : "View Only"}
                    </span>
                    <button
                      onClick={() => togglePermission(client)}
                      disabled={isSaving}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                        isFull
                          ? "border-blue-300 text-blue-600 hover:bg-blue-50"
                          : "border-green-300 text-green-600 hover:bg-green-50"
                      } disabled:opacity-40`}
                    >
                      {isSaving ? "Saving..." : isFull ? "→ Set View Only" : "→ Set Full Access"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      }{/* end client permissions */}

      {/* Change Password — for controllers and clients */}
      {canChangePassword && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
            <h3 className="font-semibold text-slate-700">🔒 Change Password</h3>
          </div>
          <form onSubmit={handleChangePassword} className="p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Current Password</label>
              <input
                type="password"
                value={pwCurrent}
                onChange={e => setPwCurrent(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Enter current password"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">New Password</label>
              <input
                type="password"
                value={pwNew}
                onChange={e => setPwNew(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Confirm New Password</label>
              <input
                type="password"
                value={pwConfirm}
                onChange={e => setPwConfirm(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Repeat new password"
              />
            </div>
            {pwError   && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwError}</p>}
            {pwSuccess && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{pwSuccess}</p>}
            <button
              type="submit"
              disabled={pwSaving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
            >
              {pwSaving ? "Changing..." : "Change Password"}
            </button>
          </form>
        </div>
      )}

      {/* Admin credentials */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h3 className="font-semibold text-amber-800 mb-2">🔑 Admin Credentials</h3>
        <p className="text-sm text-amber-700">Admin username and password are set as environment variables in Railway:</p>
        <ul className="mt-2 space-y-1 text-xs text-amber-600 font-mono list-disc list-inside">
          <li>ADMIN_USERNAME</li>
          <li>ADMIN_PASSWORD</li>
        </ul>
        <p className="text-xs text-amber-600 mt-2">To change, update these in Railway project settings and redeploy.</p>
      </div>
    </div>
  );
}
