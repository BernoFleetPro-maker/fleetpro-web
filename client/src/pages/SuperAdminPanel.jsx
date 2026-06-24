import React, { useState, useEffect } from "react";
import api from "../api";

export default function SuperAdminPanel({ token, onLogout }) {
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null); // null = show tenant list
  const [loading, setLoading] = useState(true);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  async function loadTenants() {
    setLoading(true);
    try {
      const res = await api.get("/superadmin/tenants", authHeaders);
      setTenants(res.data);
    } catch (err) {
      console.error("Failed to load tenants:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTenants(); }, []);

  // If a tenant is selected, show its dedicated detail view instead of the list
  if (selectedTenant) {
    return (
      <TenantDetailView
        tenant={selectedTenant}
        authHeaders={authHeaders}
        onBack={() => { setSelectedTenant(null); loadTenants(); }}
        onLogout={onLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1724] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-xl font-bold">FleetPro Super Admin</h1>
            <p className="text-slate-400 text-sm">Click a company to manage its controllers and clients</p>
          </div>
          <button onClick={onLogout} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">
            Log out
          </button>
        </div>

        <TenantsTab tenants={tenants} authHeaders={authHeaders} reload={loadTenants} onOpenTenant={setSelectedTenant} loading={loading} />
      </div>
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────
const fieldClass = "flex-1 p-2 rounded bg-[#0f1724] text-white border border-slate-600 focus:border-blue-500 focus:outline-none text-sm";
const cardClass  = "bg-[#1e293b] border border-slate-700 rounded-xl p-5 mb-6";

// ── TENANTS LIST (top level) ─────────────────────────────────────────────────
function TenantsTab({ tenants, authHeaders, reload, onOpenTenant, loading }) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [error, setError] = useState("");

  async function createTenant() {
    setError("");
    if (!name || !displayName || !subdomain) {
      setError("All fields are required");
      return;
    }
    try {
      await api.post("/superadmin/tenants", { name, displayName, subdomain }, authHeaders);
      setName(""); setDisplayName(""); setSubdomain("");
      reload();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create tenant");
    }
  }

  async function toggleActive(id, active) {
    await api.put(`/superadmin/tenants/${id}`, { active }, authHeaders);
    reload();
  }

  return (
    <div>
      <div className={cardClass}>
        <h3 className="text-sm font-semibold mb-3">Create new tenant</h3>
        <div className="flex gap-2 mb-3">
          <input className={fieldClass} placeholder="Internal name (e.g. Trucker)" value={name} onChange={e => setName(e.target.value)} />
          <input className={fieldClass} placeholder="Display name (e.g. FleetPro Trucker)" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          <input className={fieldClass} placeholder="Subdomain (e.g. trucker)" value={subdomain} onChange={e => setSubdomain(e.target.value)} />
        </div>
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <button onClick={createTenant} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded">
          Create tenant
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="text-left py-2">Company</th>
              <th className="text-left py-2">Subdomain</th>
              <th className="text-left py-2">Status</th>
              <th className="text-left py-2">Drivers</th>
              <th className="text-left py-2">Tasks</th>
              <th className="text-left py-2">Vehicles</th>
              <th className="text-left py-2">Controllers</th>
              <th className="text-left py-2">Clients</th>
              <th className="text-left py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(t => (
              <tr key={t.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                <td className="py-2">
                  <button
                    onClick={() => onOpenTenant(t)}
                    className="text-blue-400 hover:text-blue-300 hover:underline font-medium"
                  >
                    {t.displayName}
                  </button>
                </td>
                <td className="py-2">{t.subdomain}</td>
                <td className="py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${t.active ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                    {t.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2">{t._count.drivers}</td>
                <td className="py-2">{t._count.tasks}</td>
                <td className="py-2">{t._count.vehicles}</td>
                <td className="py-2">{t._count.controllers}</td>
                <td className="py-2">{t._count.clients}</td>
                <td className="py-2">
                  <button
                    onClick={() => toggleActive(t.id, !t.active)}
                    className="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1 rounded"
                  >
                    {t.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── TENANT DETAIL VIEW (after clicking a company) ────────────────────────────
function TenantDetailView({ tenant, authHeaders, onBack, onLogout }) {
  const [activeTab, setActiveTab] = useState("controllers");
  const [controllers, setControllers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const [c, cl] = await Promise.all([
        api.get("/superadmin/controllers", authHeaders),
        api.get("/superadmin/clients", authHeaders),
      ]);
      // Filter to only this tenant's controllers/clients
      setControllers(c.data.filter(x => x.tenantId === tenant.id));
      setClients(cl.data.filter(x => x.tenantId === tenant.id));
    } catch (err) {
      console.error("Failed to load tenant data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [tenant.id]);

  return (
    <div className="min-h-screen bg-[#0f1724] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-2">
          <button onClick={onBack} className="text-slate-400 hover:text-white text-sm flex items-center gap-1">
            ← Back to all tenants
          </button>
          <button onClick={onLogout} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">
            Log out
          </button>
        </div>

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-xl font-bold">{tenant.displayName}</h1>
            <p className="text-slate-400 text-sm">Subdomain: {tenant.subdomain} · Manage this company's controllers and clients</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6 border-b border-slate-700">
          {["controllers", "clients"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm capitalize border-b-2 ${
                activeTab === tab ? "border-blue-500 text-white" : "border-transparent text-slate-400"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-slate-400">Loading...</p>
        ) : activeTab === "controllers" ? (
          <ControllersTab controllers={controllers} tenant={tenant} authHeaders={authHeaders} reload={loadData} />
        ) : (
          <ClientsTab clients={clients} tenant={tenant} authHeaders={authHeaders} reload={loadData} />
        )}
      </div>
    </div>
  );
}

// ── CONTROLLERS TAB — scoped to one tenant, no dropdown needed anymore ───────
function ControllersTab({ controllers, tenant, authHeaders, reload }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function createController() {
    setError("");
    if (!name || !username || !password) {
      setError("All fields are required");
      return;
    }
    try {
      await api.post("/superadmin/controllers", { name, username, password, tenantId: tenant.id }, authHeaders);
      setName(""); setUsername(""); setPassword("");
      reload();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create controller");
    }
  }

  async function deleteController(id) {
    if (!window.confirm("Delete this controller login? This cannot be undone.")) return;
    await api.delete(`/superadmin/controllers/${id}`, authHeaders);
    reload();
  }

  return (
    <div>
      <div className={cardClass}>
        <h3 className="text-sm font-semibold mb-3">Add controller to {tenant.displayName}</h3>
        <div className="flex gap-2 mb-3">
          <input className={fieldClass} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
          <input className={fieldClass} placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
          <input className={fieldClass} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <button onClick={createController} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded">
          Create controller
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-700">
            <th className="text-left py-2">Name</th>
            <th className="text-left py-2">Username</th>
            <th className="text-left py-2"></th>
          </tr>
        </thead>
        <tbody>
          {controllers.length === 0 ? (
            <tr><td colSpan="3" className="py-4 text-slate-500">No controllers yet for this company</td></tr>
          ) : controllers.map(c => (
            <tr key={c.id} className="border-b border-slate-800">
              <td className="py-2">{c.name}</td>
              <td className="py-2">{c.username}</td>
              <td className="py-2">
                <button
                  onClick={() => deleteController(c.id)}
                  className="bg-red-900 hover:bg-red-800 text-red-200 text-xs px-3 py-1 rounded"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── CLIENTS TAB — scoped to one tenant, no dropdown needed anymore ───────────
function ClientsTab({ clients, tenant, authHeaders, reload }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [permission, setPermission] = useState("view");
  const [error, setError] = useState("");

  async function createClient() {
    setError("");
    if (!name || !username || !password) {
      setError("All fields are required");
      return;
    }
    try {
      await api.post("/superadmin/clients", { name, username, password, tenantId: tenant.id, permission }, authHeaders);
      setName(""); setUsername(""); setPassword(""); setPermission("view");
      reload();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create client");
    }
  }

  async function deleteClient(id) {
    if (!window.confirm("Delete this client login? This cannot be undone.")) return;
    await api.delete(`/superadmin/clients/${id}`, authHeaders);
    reload();
  }

  return (
    <div>
      <div className={cardClass}>
        <h3 className="text-sm font-semibold mb-3">Add client to {tenant.displayName}</h3>
        <div className="flex gap-2 mb-3">
          <input className={fieldClass} placeholder="Full name / company contact" value={name} onChange={e => setName(e.target.value)} />
          <input className={fieldClass} placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
          <input className={fieldClass} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="flex gap-2 mb-3">
          <select className={fieldClass} value={permission} onChange={e => setPermission(e.target.value)}>
            <option value="view">View only</option>
            <option value="full">Full access</option>
          </select>
        </div>
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <button onClick={createClient} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded">
          Create client
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-slate-700">
            <th className="text-left py-2">Name</th>
            <th className="text-left py-2">Username</th>
            <th className="text-left py-2">Permission</th>
            <th className="text-left py-2"></th>
          </tr>
        </thead>
        <tbody>
          {clients.length === 0 ? (
            <tr><td colSpan="4" className="py-4 text-slate-500">No clients yet for this company</td></tr>
          ) : clients.map(c => (
            <tr key={c.id} className="border-b border-slate-800">
              <td className="py-2">{c.name}</td>
              <td className="py-2">{c.username}</td>
              <td className="py-2">{c.permission}</td>
              <td className="py-2">
                <button
                  onClick={() => deleteClient(c.id)}
                  className="bg-red-900 hover:bg-red-800 text-red-200 text-xs px-3 py-1 rounded"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
