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

const FEATURE_FIELDS = [
  { key: "clientPortal",        label: "Client Portal",         hint: "Clients can log in and use the portal" },
  { key: "podPhotos",           label: "POD Photos",            hint: "Proof-of-delivery photos on completed tasks" },
  { key: "pushNotifications",   label: "Push Notifications",    hint: "Driver app push notifications for new tasks" },
  { key: "routeHistory",        label: "Route History",         hint: "Route breadcrumb history and distance tracking" },
  { key: "complianceDocuments", label: "Compliance Documents",  hint: "Driver/vehicle/trailer document tracking" },
  { key: "availableToLoad",     label: "Available to Load",     hint: "Vehicle availability toggle and client visibility" },
  { key: "siteTimeReports",     label: "Site Time Reports",     hint: "Loading/dropoff dwell-time reports under Clients" },
  { key: "whatsappBot",         label: "WhatsApp Bot",          hint: "Client update bot in WhatsApp groups + tracking links" },
  // Off unless switched on — unlike the rest. Only turn it on once the
  // company's bank login (FleetProPay card below) is saved.
  { key: "fleetProPay",         label: "FleetProPay",           hint: "Driver spend cards (tolls, truck stops, oil, parts) with daily limits", defaultOn: false },
];
const DEFAULT_FEATURES = Object.fromEntries(FEATURE_FIELDS.map(f => [f.key, f.defaultOn !== false]));
const featureOn = (features, f) => features?.[f.key] ?? (f.defaultOn !== false);

const PAY_PROVIDERS = [{ value: "investec", label: "Investec Programmable Banking" }];
const PAY_FORM_EMPTY = { provider: "investec", sandbox: true, clientId: "", clientSecret: "", apiKey: "", accountId: "" };

// A company's own bank API login for FleetProPay. Secrets are write-only:
// the server only ever says whether one is set, and a blank field on save
// keeps the stored one.
function PayProviderCard({ tenantId, authHeaders }) {
  const [config, setConfig] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(PAY_FORM_EMPTY);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState("");
  const [testing, setTesting] = useState(false);

  async function testConnection() {
    setError(""); setTestResult(""); setTesting(true);
    try {
      const r = (await api.post(`/superadmin/tenants/${tenantId}/pay-provider/test`, {}, authHeaders)).data;
      const parts = ["Login works"];
      if (r.cards != null) parts.push(`${r.cards} card${r.cards === 1 ? "" : "s"} found`);
      if (r.cardsError) parts.push(r.cardsError);
      if (r.accounts != null) parts.push(`${r.accounts} account${r.accounts === 1 ? "" : "s"} readable`);
      setTestResult(parts.join(" · "));
    } catch (err) {
      setError(err.response?.data?.error || "Connection test failed");
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    api.get(`/superadmin/tenants/${tenantId}/pay-provider`, authHeaders)
      .then(r => setConfig(r.data.config))
      .catch(err => setError(err.response?.data?.error || "Failed to load bank login"))
      .finally(() => setLoaded(true));
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit() {
    setForm({
      ...PAY_FORM_EMPTY,
      ...(config && { provider: config.provider, sandbox: config.sandbox, clientId: config.clientId || "", accountId: config.accountId || "" }),
    });
    setError("");
    setEditing(true);
  }

  async function save() {
    setError("");
    try {
      const payload = { ...form };
      if (!payload.clientSecret) delete payload.clientSecret;
      if (!payload.apiKey) delete payload.apiKey;
      const r = await api.put(`/superadmin/tenants/${tenantId}/pay-provider`, payload, authHeaders);
      setConfig(r.data.config);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save bank login");
    }
  }

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));
  return (
    <div className={cardClass}>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold">FleetProPay bank login</h3>
        {loaded && !editing && (
          <button onClick={startEdit} className="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1 rounded">{config ? "Edit" : "Set up"}</button>
        )}
      </div>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {editing ? (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Bank</label>
            <select className={`${fieldClass} w-full`} value={form.provider} onChange={set("provider")}>
              {PAY_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.sandbox} onChange={e => setForm(f => ({ ...f, sandbox: e.target.checked }))} className="rounded border-slate-500" />
            <span>Sandbox (test) keys — untick only for the company's real account</span>
          </label>
          <div><label className={labelClass}>Client ID</label><input className={`${fieldClass} w-full`} value={form.clientId} onChange={set("clientId")} /></div>
          <div><label className={labelClass}>Client secret</label><input type="password" autoComplete="new-password" className={`${fieldClass} w-full`} placeholder={config?.hasClientSecret ? "•••••• set — leave blank to keep" : ""} value={form.clientSecret} onChange={set("clientSecret")} /></div>
          <div><label className={labelClass}>API key</label><input type="password" autoComplete="new-password" className={`${fieldClass} w-full`} placeholder={config?.hasApiKey ? "•••••• set — leave blank to keep" : ""} value={form.apiKey} onChange={set("apiKey")} /></div>
          <div><label className={labelClass}>Account ID</label><input className={`${fieldClass} w-full`} value={form.accountId} onChange={set("accountId")} /></div>
          <div className="flex gap-2">
            <button onClick={save} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded">Save</button>
            <button onClick={() => setEditing(false)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">Cancel</button>
          </div>
        </div>
      ) : !loaded ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : config ? (
        <div className="text-sm space-y-1">
          <p><span className="text-slate-400">Bank:</span> {PAY_PROVIDERS.find(p => p.value === config.provider)?.label || config.provider} {config.sandbox && <span className="text-amber-400">(sandbox)</span>}</p>
          <p><span className="text-slate-400">Client ID:</span> {config.clientId || "— not set"}</p>
          <p><span className="text-slate-400">Client secret:</span> {config.hasClientSecret ? "•••••• set" : "Not set"}</p>
          <p><span className="text-slate-400">API key:</span> {config.hasApiKey ? "•••••• set" : "Not set"}</p>
          <p><span className="text-slate-400">Account ID:</span> {config.accountId || "— not set"}</p>
          <div className="pt-2 flex items-center gap-3">
            <button onClick={testConnection} disabled={testing} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-xs px-3 py-1 rounded">
              {testing ? "Testing…" : "Test connection"}
            </button>
            {testResult && <span className="text-xs text-green-400">{testResult}</span>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400">Not set up. Cards for this company stay "not connected" and can't pay.</p>
      )}
    </div>
  );
}

const AUTH_SCHEMES = [
  { value: "basic_with_product_id", label: "Basic auth + Product ID (Autotrak)" },
  { value: "basic",                 label: "Basic auth (username + password)" },
  { value: "api_key_header",        label: "API key in a request header" },
  { value: "api_key_query",         label: "API key in the URL (query parameter)" },
];
const TIMESTAMP_FORMATS = [
  { value: "excel_serial", label: "Excel serial number (Autotrak's own format)" },
  { value: "unix_seconds", label: "Unix timestamp — seconds" },
  { value: "unix_millis",  label: "Unix timestamp — milliseconds" },
  { value: "iso_string",   label: "ISO date string (e.g. 2026-09-14T10:00:00Z)" },
];
const TRACKING_DEFAULTS = {
  trackingApiUsername: "", trackingApiPassword: "", trackingApiBaseUrl: "",
  trackingAuthScheme: "basic_with_product_id", trackingProductId: "", trackingApiKeyName: "",
  trackingEndpointTemplate: "/vehicleposition/GetVehiclePositionsByRegistration/{registrations}",
  trackingFieldRegistration: "descrip", trackingFieldLat: "lat", trackingFieldLon: "lon",
  trackingFieldSpeed: "speed", trackingFieldHeading: "heading", trackingFieldTimestamp: "dt",
  trackingTimestampFormat: "excel_serial", trackingResponseArrayPath: "",
};

// ── TENANTS LIST ──────────────────────────────────────────────────────────────
function TenantsTab({ tenants, authHeaders, reload, onOpenTenant, loading }) {
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
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

  async function archiveTenant(id) {
    if (!window.confirm("Archive this company? It will be hidden from the main list but all its data stays safe and it can be restored anytime.")) return;
    await api.put(`/superadmin/tenants/${id}`, { active: false }, authHeaders);
    reload();
  }

  async function restoreTenant(id) {
    await api.put(`/superadmin/tenants/${id}`, { active: true }, authHeaders);
    reload();
  }

  const visibleTenants = tenants.filter(t => showArchived ? !t.active : t.active);

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

      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-slate-300">
          {showArchived ? "Archived companies" : "Active companies"}
        </h3>
        <button
          onClick={() => setShowArchived(s => !s)}
          className="text-xs text-slate-400 hover:text-white underline"
        >
          {showArchived ? "← Back to active companies" : "View archived companies"}
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : visibleTenants.length === 0 ? (
        <p className="text-slate-500 text-sm">{showArchived ? "No archived companies." : "No active companies yet."}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="text-left py-2">Company</th>
              <th className="text-left py-2">Head admin</th>
              <th className="text-left py-2">Subdomain</th>
              <th className="text-left py-2">Drivers</th>
              <th className="text-left py-2">Tasks</th>
              <th className="text-left py-2">Vehicles</th>
              <th className="text-left py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visibleTenants.map(t => (
              <tr key={t.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                <td className="py-2">
                  <button onClick={() => onOpenTenant(t)} className="text-blue-400 hover:text-blue-300 hover:underline font-medium">
                    {t.displayName}
                  </button>
                </td>
                <td className="py-2 text-slate-300">{t.staff?.[0]?.name || "—"}</td>
                <td className="py-2">{t.subdomain}</td>
                <td className="py-2">{t._count.drivers}</td>
                <td className="py-2">{t._count.tasks}</td>
                <td className="py-2">{t._count.vehicles}</td>
                <td className="py-2">
                  {showArchived ? (
                    <button onClick={() => restoreTenant(t.id)} className="bg-green-900 hover:bg-green-800 text-green-200 text-xs px-3 py-1 rounded">
                      Restore
                    </button>
                  ) : (
                    <button onClick={() => archiveTenant(t.id)} className="bg-red-900 hover:bg-red-800 text-red-200 text-xs px-3 py-1 rounded">
                      Archive
                    </button>
                  )}
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
  const [editingTracking, setEditingTracking] = useState(false);
  const [editingFeatures, setEditingFeatures] = useState(false);

  const admin = tenant.staff?.[0] || null;

  const [companyForm, setCompanyForm] = useState({
    name: tenant.name, displayName: tenant.displayName, subdomain: tenant.subdomain,
  });
  const [adminForm, setAdminForm] = useState({
    name: admin?.name || "", username: admin?.username || "", email: admin?.email || "", password: "",
  });
  const [trackingForm, setTrackingForm] = useState({
    ...TRACKING_DEFAULTS,
    ...Object.fromEntries(Object.keys(TRACKING_DEFAULTS).map(k => [k, tenant[k] ?? TRACKING_DEFAULTS[k]])),
    trackingApiPassword: "", // never seeded from the server — see saveTracking
  });
  const [featuresForm, setFeaturesForm] = useState({ ...DEFAULT_FEATURES, ...(tenant.features || {}) });
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

  async function saveTracking() {
    setError("");
    try {
      const payload = { ...trackingForm };
      if (!payload.trackingApiPassword) delete payload.trackingApiPassword; // don't overwrite with blank
      await api.put(`/superadmin/tenants/${tenant.id}/tracking`, payload, authHeaders);
      setTrackingForm(f => ({ ...f, trackingApiPassword: "" }));
      setEditingTracking(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update tracking API credentials");
    }
  }

  function toggleFeature(key) {
    setFeaturesForm(f => ({ ...f, [key]: !f[key] }));
  }

  async function saveFeatures() {
    setError("");
    try {
      await api.put(`/superadmin/tenants/${tenant.id}`, { features: featuresForm }, authHeaders);
      setEditingFeatures(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update features");
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

        {/* Tracking API card */}
        <div className={cardClass}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold">Tracking API</h3>
            {!editingTracking && (
              <button onClick={() => setEditingTracking(true)} className="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1 rounded">Edit</button>
            )}
          </div>

          {editingTracking ? (() => {
            const set = (key) => (e) => setTrackingForm(f => ({ ...f, [key]: e.target.value }));
            const isApiKey = trackingForm.trackingAuthScheme === "api_key_header" || trackingForm.trackingAuthScheme === "api_key_query";
            return (
              <>
                <p className="text-xs text-slate-500 mb-3">
                  This company's own GPS tracking provider — whatever they already use, not necessarily Autotrak. Not a FleetPro login.
                </p>

                <div className="mb-3">
                  <label className={labelClass}>Auth style</label>
                  <select className={fieldClass} style={{ width: "100%" }} value={trackingForm.trackingAuthScheme} onChange={set("trackingAuthScheme")}>
                    {AUTH_SCHEMES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                <div className="flex gap-2 mb-3">
                  {!isApiKey && (
                    <div className="flex-1"><label className={labelClass}>Username</label><input className={fieldClass} value={trackingForm.trackingApiUsername} onChange={set("trackingApiUsername")} /></div>
                  )}
                  <div className="flex-1">
                    <label className={labelClass}>{isApiKey ? "New API key (leave blank to keep current)" : "New password (leave blank to keep current)"}</label>
                    <input className={fieldClass} type="password" value={trackingForm.trackingApiPassword} onChange={set("trackingApiPassword")} />
                  </div>
                  {trackingForm.trackingAuthScheme === "basic_with_product_id" && (
                    <div className="flex-1"><label className={labelClass}>Product ID</label><input className={fieldClass} value={trackingForm.trackingProductId} onChange={set("trackingProductId")} /></div>
                  )}
                  {isApiKey && (
                    <div className="flex-1">
                      <label className={labelClass}>{trackingForm.trackingAuthScheme === "api_key_header" ? "Header name" : "URL parameter name"}</label>
                      <input className={fieldClass} placeholder="e.g. X-API-Key" value={trackingForm.trackingApiKeyName} onChange={set("trackingApiKeyName")} />
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <label className={labelClass}>Base URL (optional — leave blank to use Autotrak's default)</label>
                    <input className={fieldClass} style={{ width: "100%" }} placeholder="https://api.autotraklive.com" value={trackingForm.trackingApiBaseUrl} onChange={set("trackingApiBaseUrl")} />
                  </div>
                </div>
                <div className="mb-3">
                  <label className={labelClass}>Endpoint path — {"{registrations}"} is replaced with a comma-separated list of registrations</label>
                  <input className={fieldClass} style={{ width: "100%" }} value={trackingForm.trackingEndpointTemplate} onChange={set("trackingEndpointTemplate")} />
                </div>

                <p className="text-xs text-slate-500 mb-1 mt-4">
                  Response field mapping — which key in each vehicle's JSON record holds each value. Pre-filled with Autotrak's own field names as a starting point; only change what's actually different for this provider.
                </p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div><label className={labelClass}>Registration</label><input className={fieldClass} style={{width:"100%"}} value={trackingForm.trackingFieldRegistration} onChange={set("trackingFieldRegistration")} /></div>
                  <div><label className={labelClass}>Latitude</label><input className={fieldClass} style={{width:"100%"}} value={trackingForm.trackingFieldLat} onChange={set("trackingFieldLat")} /></div>
                  <div><label className={labelClass}>Longitude</label><input className={fieldClass} style={{width:"100%"}} value={trackingForm.trackingFieldLon} onChange={set("trackingFieldLon")} /></div>
                  <div><label className={labelClass}>Speed</label><input className={fieldClass} style={{width:"100%"}} value={trackingForm.trackingFieldSpeed} onChange={set("trackingFieldSpeed")} /></div>
                  <div><label className={labelClass}>Heading</label><input className={fieldClass} style={{width:"100%"}} value={trackingForm.trackingFieldHeading} onChange={set("trackingFieldHeading")} /></div>
                  <div><label className={labelClass}>Timestamp</label><input className={fieldClass} style={{width:"100%"}} value={trackingForm.trackingFieldTimestamp} onChange={set("trackingFieldTimestamp")} /></div>
                </div>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <label className={labelClass}>Timestamp format</label>
                    <select className={fieldClass} style={{ width: "100%" }} value={trackingForm.trackingTimestampFormat} onChange={set("trackingTimestampFormat")}>
                      {TIMESTAMP_FORMATS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className={labelClass}>Array path (optional — only if the vehicle list isn't the raw response, e.g. "data")</label>
                    <input className={fieldClass} value={trackingForm.trackingResponseArrayPath} onChange={set("trackingResponseArrayPath")} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={saveTracking} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded">Save</button>
                  <button onClick={() => { setEditingTracking(false); setTrackingForm(f => ({ ...f, trackingApiPassword: "" })); }} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">Cancel</button>
                </div>
              </>
            );
          })() : (
            <div className="text-sm space-y-1">
              <p><span className="text-slate-400">Auth style:</span> {AUTH_SCHEMES.find(s => s.value === tenant.trackingAuthScheme)?.label || tenant.trackingAuthScheme || "Basic auth + Product ID (Autotrak)"}</p>
              {tenant.trackingAuthScheme !== "api_key_header" && tenant.trackingAuthScheme !== "api_key_query" && (
                <p><span className="text-slate-400">Username:</span> {tenant.trackingApiUsername || "— (using default)"}</p>
              )}
              <p><span className="text-slate-400">Password / API key:</span> {tenant.hasTrackingApiPassword ? "•••••• set" : "Not set"}</p>
              {tenant.trackingAuthScheme === "basic_with_product_id" && (
                <p><span className="text-slate-400">Product ID:</span> {tenant.trackingProductId || "— (using default)"}</p>
              )}
              {(tenant.trackingAuthScheme === "api_key_header" || tenant.trackingAuthScheme === "api_key_query") && (
                <p><span className="text-slate-400">{tenant.trackingAuthScheme === "api_key_header" ? "Header name:" : "URL parameter name:"}</span> {tenant.trackingApiKeyName || "— (not set)"}</p>
              )}
              <p><span className="text-slate-400">Base URL:</span> {tenant.trackingApiBaseUrl || "— (using default)"}</p>
              <p><span className="text-slate-400">Endpoint path:</span> {tenant.trackingEndpointTemplate || TRACKING_DEFAULTS.trackingEndpointTemplate}</p>
              <p className="text-slate-400 pt-1">Field mapping:</p>
              <p className="text-slate-300 text-xs font-mono">
                registration={tenant.trackingFieldRegistration || "descrip"} · lat={tenant.trackingFieldLat || "lat"} · lon={tenant.trackingFieldLon || "lon"} · speed={tenant.trackingFieldSpeed || "speed"} · heading={tenant.trackingFieldHeading || "heading"} · timestamp={tenant.trackingFieldTimestamp || "dt"} ({TIMESTAMP_FORMATS.find(t => t.value === tenant.trackingTimestampFormat)?.label || "Excel serial number (Autotrak's own format)"})
                {tenant.trackingResponseArrayPath ? ` · array path: ${tenant.trackingResponseArrayPath}` : ""}
              </p>
            </div>
          )}
        </div>

        {/* Features card */}
        <div className={cardClass}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold">Features</h3>
            {!editingFeatures && (
              <button onClick={() => setEditingFeatures(true)} className="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1 rounded">Edit</button>
            )}
          </div>

          {editingFeatures ? (
            <>
              <div className="space-y-2 mb-3">
                {FEATURE_FIELDS.map(f => (
                  <label key={f.key} className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featuresForm[f.key] === true}
                      onChange={() => toggleFeature(f.key)}
                      className="mt-0.5 rounded border-slate-500"
                    />
                    <span>
                      <span className="block font-medium text-slate-200">{f.label}</span>
                      <span className="block text-xs text-slate-500">{f.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={saveFeatures} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded">Save</button>
                <button onClick={() => setEditingFeatures(false)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded">Cancel</button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {FEATURE_FIELDS.map(f => (
                <span key={f.key} className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  featureOn(tenant.features, f) ? "bg-green-900 text-green-300" : "bg-slate-700 text-slate-400"
                }`}>
                  {f.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <PayProviderCard tenantId={tenant.id} authHeaders={authHeaders} />

        <p className="text-xs text-slate-500">
          Staff and client logins for this company are managed by their own admin,
          from inside the regular FleetPro web app — not from here.
        </p>
      </div>
    </div>
  );
}
