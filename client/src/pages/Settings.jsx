import React, { useState, useEffect } from "react";
import { isAvailableSoundEnabled, setAvailableSoundEnabled } from "../utils/soundPrefs";

const API = "https://fleetpro-backend-production.up.railway.app/api";

function getAuthPayload() {
  try {
    const token = localStorage.getItem("fleetpro_token");
    if (!token) return null;
    return JSON.parse(atob(token.split(".")[1]));
  } catch { return null; }
}

// This page's one pre-existing fetch call (change-password) doesn't send an
// Authorization header — it identifies the caller via username+password in
// the body instead, its own auth model. The WhatsApp settings below need a
// real Bearer token like every other authenticated page in this app.
function authHeaders(extra = {}) {
  const token = localStorage.getItem("fleetpro_token") || "";
  return { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...extra };
}
function authFetch(url, opts = {}) {
  return fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
}

const ROLE_INFO = [
  {
    role: "Super Admin", color: "bg-slate-800 text-white",
    summary: "Manages every company on FleetPro",
    detail: "Creates new companies, sets each one's Admin login, and turns features on or off per company. Doesn't manage day-to-day fleet operations for any one company.",
  },
  {
    role: "Admin", color: "bg-purple-100 text-purple-700",
    summary: "Full access to everything for your company",
    detail: "Map, Tasks, Drivers, Vehicles, Loading Points, Dropoff Points, Clients, and Staff — always, regardless of any permission toggle. Credentials are set in Railway environment variables.",
  },
  {
    role: "Staff", color: "bg-indigo-100 text-indigo-700",
    summary: "Access to whichever pages your Admin enables",
    detail: "Full create/edit/delete on any page they can reach — see the Staff page to control which pages that is for each person. Every task action is logged with their name.",
  },
  {
    role: "Client", color: "bg-blue-100 text-blue-700",
    summary: "Sees only their own data",
    detail: "Viewing the map, viewing tasks, and creating/editing tasks are each controlled individually by your Admin — see the Clients page. Can never delete a task.",
  },
];

const CONNECTION_LABELS = {
  open: { text: "✅ Connected", color: "text-green-700" },
  connecting: { text: "⏳ Connecting…", color: "text-amber-700" },
  disconnected: { text: "🔴 Disconnected", color: "text-red-700" },
};

// Admin-only, matching the backend's own gate on /status and /qr (stricter
// than the usual staff-or-admin pattern — whoever can scan the QR can pair
// their own WhatsApp session in place of the bot's). The keyword/template
// editor lives in this same box for simplicity rather than splitting it out
// under a looser staff-or-admin gate.
function WhatsappBotSettings() {
  const [status,  setStatus]  = useState(null);
  const [qrUrl,   setQrUrl]   = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [keywordsInput, setKeywordsInput] = useState("");
  const [templateInput, setTemplateInput] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const loadStatus = async () => {
    try {
      const res = await authFetch(`${API}/whatsapp/status`);
      if (res.ok) setStatus(await res.json());
    } catch {}
  };

  // The only way a tenant that's never paired before gets its first QR —
  // nothing starts a connection on its own anymore (see whatsapp.service.js's
  // ensureConnectionStarted), so this explicit click is required.
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await authFetch(`${API}/whatsapp/connect`, { method: "POST" });
      if (res.ok) setStatus(await res.json());
    } catch {}
    finally { setConnecting(false); }
  };

  // Backs out of a connection attempt that hasn't finished pairing yet —
  // closes the socket server-side and resets back to "Connect WhatsApp Bot".
  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await authFetch(`${API}/whatsapp/cancel`, { method: "POST" });
      if (res.ok) setStatus(await res.json());
    } catch {}
    finally { setCancelling(false); }
  };

  const loadConfig = async () => {
    try {
      const res = await authFetch(`${API}/whatsapp/config`);
      if (!res.ok) return;
      const data = await res.json();
      setKeywordsInput((data.triggerKeywords || []).join(", "));
      setTemplateInput(data.replyTemplate || "");
    } catch {}
  };

  useEffect(() => {
    loadStatus();
    loadConfig();
    const poll = setInterval(loadStatus, 8000);
    return () => clearInterval(poll);
  }, []);

  // Fetch (and periodically refresh) the QR image only while one's actually
  // pending — Baileys rotates it if it isn't scanned, so a stale image left
  // on screen would eventually stop working silently.
  useEffect(() => {
    if (!status?.hasPendingQr) { setQrUrl(null); return; }
    let cancelled = false;
    let objectUrl = null;

    const fetchQr = async () => {
      try {
        const res = await authFetch(`${API}/whatsapp/qr`);
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(blob);
        setQrUrl(objectUrl);
      } catch {}
    };

    fetchQr();
    const poll = setInterval(fetchQr, 15000);
    return () => { cancelled = true; clearInterval(poll); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [status?.hasPendingQr]);

  const saveConfig = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const triggerKeywords = keywordsInput.split(",").map(k => k.trim()).filter(Boolean);
      const res = await authFetch(`${API}/whatsapp/config`, {
        method: "PATCH",
        body: JSON.stringify({ triggerKeywords, replyTemplate: templateInput }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveMsg(data.error || "Failed to save."); return; }
      setKeywordsInput((data.triggerKeywords || []).join(", "));
      setTemplateInput(data.replyTemplate || "");
      setSaveMsg("✅ Saved");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch { setSaveMsg("Server error. Please try again."); }
    finally { setSaving(false); }
  };

  const conn = CONNECTION_LABELS[status?.status] || CONNECTION_LABELS.disconnected;
  const neverStarted = status && !status.started;
  const pairingInProgress = status?.started && status?.status !== "open";

  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-5">
      <h3 className="font-semibold text-green-800 mb-2">📱 WhatsApp Bot</h3>

      {neverStarted ? (
        <>
          <p className="text-sm font-semibold text-slate-600">⚪ Not connected</p>
          <p className="text-xs text-slate-500 mt-1">No WhatsApp number is paired yet — nothing runs in the background until you connect one.</p>
          <button onClick={handleConnect} disabled={connecting}
            className="mt-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            {connecting ? "Starting…" : "Connect WhatsApp Bot"}
          </button>
        </>
      ) : (
        <>
          <p className={`text-sm font-semibold ${conn.color}`}>{conn.text}</p>
          {status?.status === "open" && status?.connectedNumber && (
            <p className="text-xs text-slate-500 mt-1">Paired number: <span className="font-mono">+{status.connectedNumber}</span></p>
          )}
          {status?.hasPendingQr && (
            <div className="mt-3 bg-white border border-green-200 rounded-lg p-4 text-center">
              <p className="text-xs text-slate-500 mb-2">Scan with the WhatsApp account you want the bot to use:</p>
              {qrUrl ? <img src={qrUrl} alt="WhatsApp QR code" className="mx-auto" width={220} height={220} /> : <p className="text-xs text-slate-400">Loading QR…</p>}
            </div>
          )}
          {pairingInProgress && (
            <button onClick={handleCancel} disabled={cancelling}
              className="mt-3 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold">
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          )}
        </>
      )}

      <div className="mt-4 pt-4 border-t border-green-200">
        <label className="text-xs text-green-800 font-semibold block mb-1">Trigger words (comma-separated)</label>
        <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-green-500"
          value={keywordsInput} onChange={e => setKeywordsInput(e.target.value)}
          placeholder="update, status, eta, track, tracking" />

        <label className="text-xs text-green-800 font-semibold block mb-1">Reply message (leave blank for the default)</label>
        <textarea className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-green-500"
          rows={4} value={templateInput} onChange={e => setTemplateInput(e.target.value)}
          placeholder="Hi {senderName}&#10;{taskList}&#10;&#10;📍 View live: {trackingLink}" />
        <p className="text-[10px] text-slate-400 mt-1">Placeholders: {"{senderName}"}, {"{clientName}"}, {"{taskList}"}, {"{trackingLink}"}</p>

        <div className="flex items-center gap-3 mt-3">
          <button onClick={saveConfig} disabled={saving}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            {saving ? "Saving…" : "Save"}
          </button>
          {saveMsg && <span className="text-xs text-slate-600">{saveMsg}</span>}
        </div>
      </div>
    </div>
  );
}

// Admin-only. Where THIS company's uploaded files (delivery photos, driver /
// vehicle / trailer documents, fuel photos, Pay slips) are kept. Every company
// connects its own storage when it is set up — until it has, photos and
// documents can't be saved. The keys are tested, saved encrypted, and never
// shown again (the server only ever says which account is connected).
function FileStorageSettings() {
  const [info, setInfo] = useState(null);   // { connected, provider, cloudName, lastTestedAt, lastError }
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ cloudName: "", apiKey: "", apiSecret: "" });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const load = async () => {
    try {
      const res = await authFetch(`${API}/storage`);
      if (!res.ok) throw new Error();
      setInfo(await res.json());
      setLoadError("");
    } catch {
      setLoadError("Could not load your file storage settings.");
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async (confirmChange) => {
    const res = await authFetch(`${API}/storage/cloudinary`, { method: "PUT", body: JSON.stringify({ ...form, confirmChange }) });
    return { res, data: await res.json().catch(() => ({})) };
  };

  const connect = async (e) => {
    e.preventDefault();
    setMsg({ type: "", text: "" });
    setSaving(true);
    try {
      let { res, data } = await submit(false);
      if (res.status === 409 && data.needsConfirm) {
        if (!window.confirm(data.error)) return;
        ({ res, data } = await submit(true));
      }
      if (!res.ok) { setMsg({ type: "error", text: data.error || "Could not connect that account." }); return; }
      setInfo(data);
      setEditing(false);
      setForm({ cloudName: "", apiKey: "", apiSecret: "" });
      setMsg({ type: "ok", text: "Connected. From now on, photos and documents are saved to your own Cloudinary account." });
    } catch {
      setMsg({ type: "error", text: "Could not reach FleetPro. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  };

  const retest = async () => {
    setMsg({ type: "", text: "" });
    setTesting(true);
    try {
      const res = await authFetch(`${API}/storage/test`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ type: "error", text: data.error || "The test failed." }); await load(); return; }
      setInfo(data);
      setMsg({ type: "ok", text: "Test passed — your storage is working." });
    } catch {
      setMsg({ type: "error", text: "Could not reach FleetPro. Check your connection and try again." });
    } finally {
      setTesting(false);
    }
  };

  const inputClass = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500";
  const notSetUp = info && !info.connected;
  const own = info?.connected && info.provider === "cloudinary";
  const shared = info?.connected && info.provider === "platform";

  return (
    <div className={`border rounded-xl p-5 ${notSetUp ? "bg-amber-50 border-amber-300" : "bg-blue-50 border-blue-200"}`}>
      <h3 className="font-semibold text-slate-800 mb-2">🗂️ File storage</h3>
      <p className="text-xs text-slate-500 mb-3">
        Where your company's delivery photos, driver, vehicle and trailer documents, fuel photos and Pay slips are kept.
        They go to storage that belongs to you, not to anyone else's account.
      </p>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {!info && !loadError && <p className="text-sm text-slate-400 animate-pulse">Loading…</p>}

      {notSetUp && (
        <p className="text-sm font-semibold text-amber-800 mb-2">
          ⚠️ Not set up yet — photos and documents can't be saved until you connect your storage.
        </p>
      )}
      {own && (
        <div className="mb-2">
          <p className="text-sm font-semibold text-green-700">✅ Connected to your Cloudinary account</p>
          <p className="text-xs text-slate-500 mt-1">Cloud name: <span className="font-mono">{info.cloudName}</span>
            {info.lastTestedAt && <> · last checked {new Date(info.lastTestedAt).toLocaleString("en-ZA")}</>}
          </p>
          {info.lastError && <p className="text-xs text-red-600 mt-1">Last check failed: {info.lastError}</p>}
        </div>
      )}
      {shared && (
        <p className="text-sm text-slate-700 mb-2">
          Using FleetPro's shared storage (set up by FleetPro for testing). Connect your own account below to keep your files separate.
        </p>
      )}

      {msg.text && <p className={`text-sm mb-2 ${msg.type === "ok" ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}

      {info && !editing && (
        <div className="flex flex-wrap gap-2 mt-2">
          <button onClick={() => { setEditing(true); setMsg({ type: "", text: "" }); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            {notSetUp ? "Connect Cloudinary" : own ? "Change account" : "Connect your own Cloudinary"}
          </button>
          {own && (
            <button onClick={retest} disabled={testing}
              className="bg-slate-200 hover:bg-slate-300 disabled:opacity-60 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold">
              {testing ? "Testing…" : "Test again"}
            </button>
          )}
        </div>
      )}

      {editing && (
        <form onSubmit={connect} className="mt-3 space-y-3">
          <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-700">Where to find these three things</p>
            <p>1. Log in at <span className="font-mono">cloudinary.com</span> (a free account is fine — sign up if you don't have one).</p>
            <p>2. Open the <b>Dashboard</b> → <b>Product Environment Credentials</b>.</p>
            <p>3. Copy the <b>Cloud name</b>, the <b>API Key</b> and the <b>API Secret</b> (click the eye icon to show it).</p>
          </div>
          <div>
            <label className="text-xs text-slate-600 font-semibold block mb-1">Cloud name</label>
            <input className={inputClass} value={form.cloudName} onChange={e => setForm({ ...form, cloudName: e.target.value })} placeholder="e.g. my-company" autoComplete="off" />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-semibold block mb-1">API Key</label>
            <input className={inputClass} value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} placeholder="e.g. 123456789012345" autoComplete="off" />
          </div>
          <div>
            <label className="text-xs text-slate-600 font-semibold block mb-1">API Secret</label>
            <input className={inputClass} type="password" value={form.apiSecret} onChange={e => setForm({ ...form, apiSecret: e.target.value })} placeholder="Paste your API secret" autoComplete="new-password" />
          </div>
          <p className="text-[11px] text-slate-500">
            We'll check them with a small test upload before saving. They're stored encrypted and never shown again — not to your staff,
            your clients, or on FleetPro's Super Admin screen.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              {saving ? "Testing…" : "Test and connect"}
            </button>
            <button type="button" onClick={() => { setEditing(false); setMsg({ type: "", text: "" }); }}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function Settings({ canUseFeature = () => true }) {
  // Change password state
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew,     setPwNew]     = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving,  setPwSaving]  = useState(false);
  const [pwError,   setPwError]   = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const payload = getAuthPayload();
  const role    = payload?.role || "admin";
  // "admin" is ambiguous: a tenant's own admin is a real Staff row (JWT
  // carries staffId) with a real passwordHash, while the global env-based
  // admin login has no database row at all — its "password" is a Railway
  // env var and can't be changed here regardless of role string.
  const isTenantAdmin = role === "admin" && !!payload?.staffId;
  const canChangePassword = role === "staff" || role === "client" || isTenantAdmin;

  const isAdminOrStaff = role === "staff" || (role === "admin" && !isTenantAdmin);

  const [soundEnabled, setSoundEnabled] = useState(() => isAvailableSoundEnabled());
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setAvailableSoundEnabled(next);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError(""); setPwSuccess("");
    if (!pwCurrent || !pwNew || !pwConfirm) { setPwError("All fields are required."); return; }
    if (pwNew.length < 6) { setPwError("New password must be at least 6 characters."); return; }
    if (pwNew !== pwConfirm) { setPwError("New passwords do not match."); return; }
    setPwSaving(true);
    try {
      const res = await fetch(`${API}/change-password`, {
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

      {/* Notifications — every role, stored per-device in localStorage only */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-700">🔊 Notifications</h3>
        </div>
        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Play sound when a vehicle becomes available</p>
            <p className="text-xs text-slate-500 mt-0.5">Applies only to this device/browser.</p>
          </div>
          <button
            onClick={toggleSound}
            role="switch"
            aria-checked={soundEnabled}
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${soundEnabled ? "bg-amber-500" : "bg-slate-300"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${soundEnabled ? "translate-x-5" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Roles — informational, shown to everyone. Config for Staff/Clients
          lives on their own pages now, not here. */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-700">🔐 Roles</h3>
        </div>
        <div className="p-5 space-y-4">
          {ROLE_INFO.map((r, i) => (
            <React.Fragment key={r.role}>
              {i > 0 && <div className="border-t border-slate-100" />}
              <div className="flex gap-4 items-start">
                <span className={`text-xs font-bold px-2 py-1 rounded-full mt-0.5 whitespace-nowrap ${r.color}`}>{r.role}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{r.summary}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{r.detail}</p>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Change Password — for staff and clients */}
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

      {/* Admin credentials — admin/staff only */}
      {isAdminOrStaff && (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h3 className="font-semibold text-amber-800 mb-2">🔑 Admin Credentials</h3>
        <p className="text-sm text-amber-700">Admin username and password are set as environment variables in Railway:</p>
        <ul className="mt-2 space-y-1 text-xs text-amber-600 font-mono list-disc list-inside">
          <li>ADMIN_USERNAME</li>
          <li>ADMIN_PASSWORD</li>
        </ul>
        <p className="text-xs text-amber-600 mt-2">To change, update these in Railway project settings and redeploy.</p>
      </div>
      )}

      {/* File storage — the company admin only (the keys are the company's own) */}
      {role === "admin" && payload?.tenantId && (
        <div className="mt-6">
          <FileStorageSettings />
        </div>
      )}

      {/* WhatsApp bot — admin only, matches the backend's own gate on status/qr */}
      {role === "admin" && canUseFeature("whatsappBot") && (
        <div className="mt-6">
          <WhatsappBotSettings />
        </div>
      )}
    </div>
  );
}
