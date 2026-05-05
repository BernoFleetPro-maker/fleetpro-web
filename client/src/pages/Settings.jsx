import React from "react";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">⚙️ Settings</h2>
      <p className="text-slate-500 text-sm mb-6">System configuration and access control</p>

      {/* Permissions overview */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-700">🔐 Permission Levels</h3>
        </div>
        <div className="p-5 space-y-4">

          {/* Admin */}
          <div className="flex gap-4 items-start">
            <div className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded-full mt-0.5 whitespace-nowrap">
              Admin
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Full Access</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Map, Tasks (create/edit/delete), Drivers, Vehicles, Loading Points, Dropoff Points, Clients, Settings.
                Credentials set via Railway environment variables.
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* Client */}
          <div className="flex gap-4 items-start">
            <div className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full mt-0.5 whitespace-nowrap">
              Client
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">View Only — Assigned Tasks</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Can see Map and Tasks page only. Tasks are filtered to show only loads assigned to their client account.
                Map shows only vehicles linked to their tasks. Cannot create, edit, or delete anything.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Client management shortcut */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-700">🏢 Client Accounts</h3>
        </div>
        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600">Manage client logins and portal access.</p>
            <p className="text-xs text-slate-400 mt-0.5">Add clients, set usernames and passwords, assign tasks to them.</p>
          </div>
          <button onClick={() => navigate("/clients")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap">
            Manage Clients →
          </button>
        </div>
      </div>

      {/* Admin credentials info */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h3 className="font-semibold text-amber-800 mb-2">🔑 Admin Credentials</h3>
        <p className="text-sm text-amber-700">
          Admin username and password are set as environment variables in Railway:
        </p>
        <ul className="mt-2 space-y-1 text-xs text-amber-600 font-mono list-disc list-inside">
          <li>ADMIN_USERNAME</li>
          <li>ADMIN_PASSWORD</li>
        </ul>
        <p className="text-xs text-amber-600 mt-2">
          To change admin credentials, update these variables in your Railway project settings and redeploy.
        </p>
      </div>
    </div>
  );
}
