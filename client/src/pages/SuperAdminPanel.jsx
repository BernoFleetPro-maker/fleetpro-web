import React, { useState, useEffect } from "react";
import api from "../api";

export default function SuperAdminPanel({ token, onLogout }) {
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);
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

  if (selectedTenant) {
    // Keep the detail view in sync if data changes after an edit
    const fresh = tenants.find(t => t.id === selectedTenant.id) || selectedTenant;
    return (
      <TenantDetailView
        tenant={fresh}
        authHeaders={authHeaders}
        onBack={() => { setSelectedTenant(null); loadTenants(); }}
        onLogout={onLogout}
        reload={loadTenants}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1724] text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-xl font-bold">FleetPro Super Admin</h1>
            <p className="text-slate-400 text-sm">Create companies and their head admin login. Day-to-day staff and client accounts are managed by each company's own admin.</p>
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

const fieldClass = "flex-1 p-2 rounded bg-[#0f1724] text-white border border-slate-600 focus:border-blue-500 focus:outline-none text-sm";
const cardClass  = "bg-[#1e293b] border border-slate-700 rounded-xl p-5 mb-6";
const labelClass = "text-slate-400 text-xs block mb-1";

// ── TENANTS LIST ──────────────────────────────────────────────────────────────
function TenantsTab({ tenants, authHeaders, reload, onOpenTenant, loading }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", displayName: "", subdomain: "",
    adminName: "", adminUsername: "", adminPassword: "", adminEmail: "",
  });
  const [error, setError] = useState("");

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function createTenant() {
    setError("");
    const { name, displayName, subdomain, adminName, adminUsername, adminPassword } = form;
    if (!name || !displayName || !subdomain || !adminName || !adminUsername || !adminPassword) {
      setError("Company details and head admin name, username, and password are all required");
      return;
    }
    try {
      await api.post("/superadmin/tenants", form, authHeaders);
      setForm({ name: "", displayName: "", subdomain: "", adminName: "", adminUsername: "", adminPassword: "", adminEmail: "" });
      setShowForm(false);
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
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold">Create new company</h3>
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded">
              + New company
            </button>
          )}
        </div>

        {showForm && (
          <>
            <p className="text-xs text-slate-500 mb-3">Company details</p>
            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <label className={labelClass}>Internal name</label>
                <input className={fieldClass} placeholder="e.g. Trucker" value={form.name} onChange={e => update("name", e.target.value)} />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Display name</label>
                <input className={fieldClass} placeholder="e.g. FleetPro Trucker" value={form.displayName} onChange={e => update("displayName", e.target.value)} />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Subdomain</label>
                <input className={fieldClass} placeholder="e.g. trucker" value={form.subdomain} onChange={e => update("subdomain", e.target.value)} />
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-3">Head admin login (this person manages everything else for this company)</p>
            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <label className={labelClass}>Admin full name</label>
                <input className={fieldClass} placeholder="e.g. Berno" value={form.adminName} onChange={e => update("adminName", e.target.value)} />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Admin username</label>
                <input className={fieldClass} placeholder="Username" value={form.adminUsername} onChange={e => update("adminUsername", e.target.value)} />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Admin password</label>
                <input className={fieldClass} type="password" placeholder="Password" value={form.adminPassword} onChange={e => update("adminPassword", e.target.value)} />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Admin email (optional, for password reset later)</label>
                <input className={fieldClass} placeholder="name@company.com" value={form.adminEmail} onChange={e => update("adminEmail", e.target.value)} />
              </div>
            </div>

            {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
            <div className="flex gap-2">
              <button onClick={createTenant} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded">
                Create company
              </button>
              <button onClick={() => { setShowForm(false); setError(""); }} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="text-left py-2">Company</th>
              <th className="text-left py-2">Head admin</th>
              <th className="text-left py-2">Subdomain</th>
              <th className="text-left py-2">Status</th>
              <th className="text-left py-2">Drivers</th>
              <th className="text-left py-2">Tasks</th>
              <th className="text-left py-2">Vehicles</th>
              <th className="text-left py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(t => (
              <tr key={t.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                <td className="py-2">
                  <button onClick={() => onOpenTenant(t)} className="text-blue-400 hover:text-blue-300 hover:underline font-medium">
                    {t.displayName}
                  </button>
                </td>
                <td className="py-2 text-slate-300">{t.controllers?.[0]?.name || "—"}</td>
                <td className="py-2">{t.subdomain}</td>
                <td className="py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${t.active ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                    {t.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2">{t._count.drivers}</td>
                <td className="py-2">{t._count.tasks}</td>
                <td className="py-2">{t._count.vehicles}</td>
                <td className="py-2">
                  <button onClick={() => toggleActive(t.id, !t.active)} className="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1 rounded">
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

// ── TENANT DETAIL VIEW — company info + head admin info, both editable ──────
function TenantDetailView({ tenant, authHeaders, onBack, onLogout, reload }) {
  const [editingCompany, setEditingCompany] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(false);

  const admin = tenant.controllers?.[0] || null;

  const [companyForm, setCompanyForm] = useState({
    name: tenant.name, displayName: tenant.displayName, subdomain: tenant.subdomain,
  });
  const [adminForm, setAdminForm] = useState({
    name: admin?.name || "", username: admin?.username || "", email: admin?.email || "", password: "",
  });
  const [error, setError] = useState("");

  async function saveCompany() {
    setError("");
    try {
      await api.put(`/superadmin/tenants/${tenant.id}`, companyForm, authHeaders);
      setEditingCompany(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update company");
    }
  }

  async function saveAdmin() {
    setError("");
    try {
      const payload = { ...adminForm };
      if (!payload.password) delete payload.password; // don't overwrite with blank
      await api.put(`/superadmin/tenants/${tenant.id}/admin`, payload, authHeaders);
      setEditingAdmin(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update admin login");
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1724] text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button onClick={onBack} className="text-slate-400 hover:text-white text-sm">← Back to all companies</button>
          <button onClick={onLogout} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">Log out</button>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Company details card */}
        <div className={cardClass}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold">Company details</h3>
            {!editingCompany && (
              <button onClick={() => setEditingCompany(true)} className="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1 rounded">Edit</button>
            )}
          </div>

          {editingCompany ? (
            <>
              <div className="flex gap-2 mb-3">
                <div className="flex-1"><label className={labelClass}>Internal name</label><input className={fieldClass} value={companyForm.name} onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="flex-1"><label className={labelClass}>Display name</label><input className={fieldClass} value={companyForm.displayName} onChange={e => setCompanyForm(f => ({ ...f, displayName: e.target.value }))} /></div>
                <div className="flex-1"><label className={labelClass}>Subdomain</label><input className={fieldClass} value={companyForm.subdomain} onChange={e => setCompanyForm(f => ({ ...f, subdomain: e.target.value }))} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveCompany} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded">Save</button>
                <button onClick={() => setEditingCompany(false)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">Cancel</button>
              </div>
            </>
          ) : (
            <div className="text-sm space-y-1">
              <p><span className="text-slate-400">Display name:</span> {tenant.displayName}</p>
              <p><span className="text-slate-400">Internal name:</span> {tenant.name}</p>
              <p><span className="text-slate-400">Subdomain:</span> {tenant.subdomain}</p>
            </div>
          )}
        </div>

        {/* Head admin card */}
        <div className={cardClass}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold">Head admin login</h3>
            {!editingAdmin && (
              <button onClick={() => setEditingAdmin(true)} className="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1 rounded">Edit</button>
            )}
          </div>

          {editingAdmin ? (
            <>
              <div className="flex gap-2 mb-3">
                <div className="flex-1"><label className={labelClass}>Full name</label><input className={fieldClass} value={adminForm.name} onChange={e => setAdminForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="flex-1"><label className={labelClass}>Username</label><input className={fieldClass} value={adminForm.username} onChange={e => setAdminForm(f => ({ ...f, username: e.target.value }))} /></div>
              </div>
              <div className="flex gap-2 mb-3">
                <div className="flex-1"><label className={labelClass}>Email</label><input className={fieldClass} value={adminForm.email} onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div className="flex-1"><label className={labelClass}>New password (leave blank to keep current)</label><input className={fieldClass} type="password" value={adminForm.password} onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveAdmin} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded">Save</button>
                <button onClick={() => setEditingAdmin(false)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">Cancel</button>
              </div>
            </>
          ) : admin ? (
            <div className="text-sm space-y-1">
              <p><span className="text-slate-400">Name:</span> {admin.name}</p>
              <p><span className="text-slate-400">Username:</span> {admin.username}</p>
              <p><span className="text-slate-400">Email:</span> {admin.email || "—"}</p>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No head admin found for this company.</p>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Staff (controller) and client logins for this company are managed by their own admin,
          from inside the regular FleetPro web app — not from here.
        </p>
      </div>
    </div>
  );
}
