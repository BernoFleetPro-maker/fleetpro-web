import React, { useEffect, useState } from "react";

const API = "https://fleetpro-backend-production.up.railway.app/api";

export default function Settings() {
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(null); // clientId being saved

  const loadClients = async () => {
    try {
      const res  = await fetch(`${API}/clients`);
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
      await fetch(`${API}/clients/${client.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: client.name, username: client.username, permission: newPermission }),
      });
      setClients(prev => prev.map(c => c.id === client.id ? { ...c, permission: newPermission } : c));
    } catch { alert("Failed to update permission."); }
    finally  { setSaving(null); }
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

      {/* Client Permissions — inline list */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
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
