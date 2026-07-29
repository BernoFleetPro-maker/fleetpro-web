import React, { useState } from "react";
import { isAvailableSoundEnabled, setAvailableSoundEnabled } from "../utils/soundPrefs";

const API = "https://fleetpro-backend-production.up.railway.app/api";

function getAuthPayload() {
  try {
    const token = localStorage.getItem("fleetpro_token");
    if (!token) return null;
    return JSON.parse(atob(token.split(".")[1]));
  } catch { return null; }
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

export default function Settings() {
  // Change password state
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew,     setPwNew]     = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving,  setPwSaving]  = useState(false);
  const [pwError,   setPwError]   = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const payload = getAuthPayload();
  const role    = payload?.role || "admin";
  // Clients only get the Notifications section — password changes for them
  // are out of scope here now, same as everything else on this page.
  const canChangePassword = role === "staff";

  const isAdminOrStaff = role === "admin" || role === "staff";

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
    </div>
  );
}
