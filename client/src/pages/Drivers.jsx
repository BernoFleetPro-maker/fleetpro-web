import React, { useEffect, useState } from "react";

const ROOT_API = "https://fleetpro-backend-production.up.railway.app/api";
const API = `${ROOT_API}/drivers`;

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


export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [activeTasks, setActiveTasks] = useState([]); // inprogress tasks for map nav
  const [infoDriver, setInfoDriver] = useState(null); // driver whose Info modal is open
  const [search, setSearch] = useState("");
  const [showBin, setShowBin] = useState(false);
  const [binCount, setBinCount] = useState(0);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const fetchDrivers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(API);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setDrivers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Could not load drivers. Please check your connection and try again.");
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBinCount = async () => {
    try {
      const res = await authFetch(`${API}/deleted`);
      const data = await res.json();
      setBinCount(Array.isArray(data) ? data.length : 0);
    } catch {}
  };

  useEffect(() => {
    fetchDrivers();
    fetchBinCount();
    // Load inprogress tasks so we know which drivers can be tracked on map
    fetch("https://fleetpro-backend-production.up.railway.app/api/tasks", {
      headers: { "Authorization": `Bearer ${getToken()}` }
    })
      .then(r => r.json())
      .then(data => setActiveTasks(Array.isArray(data) ? data.filter(t => t.status === "inprogress") : []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim() || !form.phone.trim()) { setFormError("Name and phone number are required."); return; }
    setSaving(true);
    try {
      const url = editing ? `${API}/${editing}` : API;
      const method = editing ? "PUT" : "POST";
      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || "Failed to save driver");
        return;
      }
      setForm({ name: "", phone: "" });
      setEditing(null);
      fetchDrivers();
    } catch {
      setFormError("Could not save driver. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this driver? They'll move to the Bin and can be restored within 12 months.")) return;
    try {
      await authFetch(`${API}/${id}`, { method: "DELETE" });
      showToast("Driver moved to Bin.");
      fetchDrivers();
      fetchBinCount();
    } catch {
      showToast("Failed to delete driver — please try again.");
    }
  };

  const filteredDrivers = drivers.filter((d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return d.name.toLowerCase().includes(q) || d.phone.toLowerCase().includes(q);
  });

  const handleViewOnMap = (driver) => {
    const task = activeTasks.find(t => t.assignedDriverId === driver.id);
    if (!task) {
      showToast(`${driver.name} has no active task — cannot track on map.`);
      return;
    }
    // Look up the vehicle registration from vehicleId, then navigate to map
    authFetch(`https://fleetpro-backend-production.up.railway.app/api/vehicles`)
      .then(r => r.json())
      .then(vehicles => {
        const veh = Array.isArray(vehicles) ? vehicles.find(v => v.id === task.vehicleId) : null;
        if (veh?.registration) {
          window.location.href = `/?vehicle=${encodeURIComponent(veh.registration)}`;
        } else {
          showToast("Could not find vehicle for this driver.");
        }
      })
      .catch(() => showToast("Could not reach server — please try again."));
  };

  const startEdit = (d) => {
    setForm({ name: d.name, phone: d.phone });
    setEditing(d.id);
  };

  const cancelEdit = () => {
    setForm({ name: "", phone: "" });
    setEditing(null);
  };

  return (
    <div className="p-6 max-w-3xl">
      {toast && <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg">{toast}</div>}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Drivers</h2>
        <button
          onClick={() => setShowBin(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-sm font-medium"
          title="View deleted drivers"
        >
          🗑 Bin
          {binCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {binCount}
            </span>
          )}
        </button>
      </div>

      {/* Add / Edit Form */}
      <div className="bg-white border rounded-lg p-4 mb-6 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-3">{editing ? "Edit Driver" : "Add Driver"}</h3>
        <p className="text-xs text-gray-400 mb-3">
          The driver's phone number is used as their login password on the app.
        </p>
        {formError && <div className="bg-red-50 border border-red-300 text-red-600 text-sm px-3 py-2 rounded mb-3">{formError}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Driver Name *"
            className="border p-2 rounded w-full text-sm"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="text"
            placeholder="Phone Number * (used as app password)"
            className="border p-2 rounded w-full text-sm"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded text-sm font-medium"
            >
              {saving ? "Saving..." : editing ? "Update Driver" : "Add Driver"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={cancelEdit}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Driver List */}
      {loading && <p className="text-gray-500 text-sm">Loading drivers...</p>}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded text-sm mb-4">
          {error}
          <button onClick={fetchDrivers} className="ml-3 underline">Retry</button>
        </div>
      )}
      {!loading && !error && drivers.length > 0 && (
        <input
          type="text"
          placeholder="Search drivers by name or phone..."
          className="border p-2 rounded w-full text-sm mb-3"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {!loading && !error && drivers.length === 0 && (
        <p className="text-gray-400 text-sm">No drivers added yet.</p>
      )}
      {!loading && !error && drivers.length > 0 && filteredDrivers.length === 0 && (
        <p className="text-gray-400 text-sm">No drivers match "{search}".</p>
      )}
      <ul className="space-y-2">
        {filteredDrivers.map((d) => (
          <li key={d.id} className="flex justify-between items-center bg-white border rounded-lg px-4 py-3 shadow-sm">
            <div>
              <span className="font-bold text-gray-800">{d.name}</span>
              {d.expiringDocsCount > 0 && (
                <span
                  className="ml-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle"
                  title={`${d.expiringDocsCount} document${d.expiringDocsCount === 1 ? "" : "s"} need${d.expiringDocsCount === 1 ? "s" : ""} attention — open Info to view`}
                >
                  {d.expiringDocsCount}
                </span>
              )}
              <span className="text-gray-500 text-sm ml-2">— {d.phone}</span>
            </div>
            <div className="flex gap-2 items-center flex-wrap justify-end">
              <button
                onClick={() => handleViewOnMap(d)}
                className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded text-xs font-medium"
                title="View driver on map"
              >
                🗺 Map
              </button>
              <button
                onClick={() => setInfoDriver(d)}
                className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-xs font-medium"
                title="View driver info & compliance documents"
              >
                ℹ️ Info
              </button>
              <button onClick={() => startEdit(d)} className="text-blue-600 hover:underline text-sm">Edit</button>
              <button onClick={() => handleDelete(d.id)} className="text-red-600 hover:underline text-sm">Delete</button>
            </div>
          </li>
        ))}
      </ul>

      {infoDriver && (
        <DriverInfoModal driver={infoDriver} onClose={() => setInfoDriver(null)} onChange={fetchDrivers} />
      )}

      {showBin && (
        <BinModal
          onClose={() => setShowBin(false)}
          onChange={() => { fetchDrivers(); fetchBinCount(); }}
        />
      )}
    </div>
  );
}

// ─── Bin modal — deleted drivers, restorable within 12 months ───────────────
function BinModal({ onClose, onChange }) {
  const [deleted, setDeleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalError, setModalError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    setModalError("");
    authFetch(`${API}/deleted`)
      .then((r) => r.json())
      .then((data) => setDeleted(Array.isArray(data) ? data : []))
      .catch(() => setModalError("Could not load the bin. Please try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRestore = async (id) => {
    setBusyId(id);
    setModalError("");
    try {
      const res = await authFetch(`${API}/${id}/restore`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to restore driver"); return; }
      load();
      onChange?.();
    } catch {
      setModalError("Could not restore driver. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handlePermanentDelete = async (id, name) => {
    if (!window.confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    setBusyId(id);
    setModalError("");
    try {
      const res = await authFetch(`${API}/${id}/permanent`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to permanently delete driver"); return; }
      load();
      onChange?.();
    } catch {
      setModalError("Could not permanently delete driver. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-[#1e293b] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">🗑 Bin</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-3">
          {modalError && (
            <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded">{modalError}</div>
          )}
          <p className="text-xs text-slate-500">
            Deleted drivers are kept here for 12 months and can be restored. After that they're removed automatically.
          </p>

          {loading ? (
            <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-400 text-sm animate-pulse">Loading…</div>
          ) : deleted.length === 0 ? (
            <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-500 text-sm">The bin is empty.</div>
          ) : (
            <div className="space-y-2">
              {deleted.map((d) => (
                <div key={d.id} className="bg-slate-800 rounded-lg p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium">{d.name}</div>
                    <div className="text-xs text-slate-500">— {d.phone}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Deleted {new Date(d.deletedAt).toLocaleDateString("en-ZA")} — permanently deleted after {new Date(d.purgeAt).toLocaleDateString("en-ZA")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={busyId === d.id}
                      onClick={() => handleRestore(d.id)}
                      className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-2 py-1 rounded font-medium"
                    >
                      Restore
                    </button>
                    <button
                      disabled={busyId === d.id}
                      onClick={() => handlePermanentDelete(d.id, d.name)}
                      className="text-xs bg-red-950 hover:bg-red-900 text-red-300 disabled:opacity-50 px-2 py-1 rounded"
                    >
                      Delete Permanently
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Driver Info modal — details + compliance documents ─────────────────────
// Document types and the driver's uploaded documents are only fetched when
// this modal opens (not on the main Drivers list), and a document's actual
// file is only fetched when "View" is clicked — keeps the list page fast as
// documents accumulate.
function DriverInfoModal({ driver, onClose, onChange }) {
  const [types, setTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [uploadingTypeId, setUploadingTypeId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");

  const loadAll = () => {
    setLoading(true);
    setModalError("");
    Promise.all([
      authFetch(`${ROOT_API}/document-types?appliesTo=driver`).then(r => r.json()),
      authFetch(`${API}/${driver.id}/documents`).then(r => r.json()),
    ])
      .then(([typesData, docsData]) => {
        setTypes(Array.isArray(typesData) ? typesData : []);
        setDocs(Array.isArray(docsData) ? docsData : []);
        onChange?.(); // keep the list's badge counts in sync right away, not just on next poll
      })
      .catch(() => setModalError("Could not load documents. Please try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAll(); }, [driver.id]);

  const docForType = (typeId) => docs.find(d => d.documentTypeId === typeId);

  const isExpiringSoon = (dateStr) => {
    if (!dateStr) return false;
    const in30 = new Date(Date.now() + 30 * 86400000);
    return new Date(dateStr) <= in30;
  };

  const handleView = async (documentId) => {
    try {
      const res = await authFetch(`${API}/${driver.id}/documents/${documentId}`);
      const data = await res.json();
      if (data.fileUrl) window.open(data.fileUrl, "_blank", "noopener,noreferrer");
      else setModalError("Could not open document.");
    } catch {
      setModalError("Could not open document.");
    }
  };

  // Cloudinary's fl_attachment delivery flag forces a real Save-As download
  // (correct Content-Disposition) with a friendly filename, instead of just
  // opening the file the way View does.
  const handleDownload = async (documentId, typeName) => {
    try {
      const res = await authFetch(`${API}/${driver.id}/documents/${documentId}`);
      const data = await res.json();
      if (!data.fileUrl) { setModalError("Could not download document."); return; }
      const friendlyName = `${driver.name}-${typeName}`.replace(/\s+/g, "_");
      const downloadUrl = data.fileUrl.replace("/upload/", `/upload/fl_attachment:${encodeURIComponent(friendlyName)}/`);
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      setModalError("Could not download document.");
    }
  };

  const handleUpload = async (typeId, file, expiryDate) => {
    setBusy(true);
    setModalError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentTypeId", typeId);
      if (expiryDate) fd.append("expiryDate", expiryDate);
      const res = await fetch(`${API}/${driver.id}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to upload document"); return; }
      setUploadingTypeId(null);
      loadAll();
    } catch {
      setModalError("Could not upload document. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateExpiry = async (documentId, expiryDate) => {
    setBusy(true);
    setModalError("");
    try {
      const res = await authFetch(`${API}/${driver.id}/documents/${documentId}`, {
        method: "PATCH",
        body: JSON.stringify({ expiryDate: expiryDate || null }),
      });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to update expiry date"); return; }
      setUploadingTypeId(null);
      loadAll();
    } catch {
      setModalError("Could not update expiry date. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDocument = async (documentId) => {
    if (!window.confirm("Delete this document? You'll need to upload it again later if it's still needed.")) return;
    try {
      const res = await authFetch(`${API}/${driver.id}/documents/${documentId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to delete document"); return; }
      loadAll();
    } catch {
      setModalError("Could not delete document. Please try again.");
    }
  };

  const handleAddType = async () => {
    if (!newTypeName.trim()) return;
    setBusy(true);
    setModalError("");
    try {
      const res = await authFetch(`${ROOT_API}/document-types`, {
        method: "POST",
        body: JSON.stringify({ name: newTypeName.trim(), appliesTo: "driver" }),
      });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to add document type"); return; }
      setNewTypeName("");
      setAddingType(false);
      loadAll();
    } catch {
      setModalError("Could not add document type. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteType = async (typeId) => {
    if (!window.confirm("Remove this document type? Any uploaded documents under it must be removed first.")) return;
    try {
      const res = await authFetch(`${ROOT_API}/document-types/${typeId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to delete document type"); return; }
      loadAll();
    } catch {
      setModalError("Could not delete document type. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-[#1e293b] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-white">{driver.name}</h2>
            <span className="text-xs text-slate-400">{driver.phone}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {modalError && (
            <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded">{modalError}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">👤 Name</div>
              <div className="text-white text-sm font-medium">{driver.name}</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">📞 Phone</div>
              <div className="text-white text-sm font-medium">{driver.phone}</div>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-300 mb-2">📄 Compliance Documents</div>
            {loading ? (
              <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-400 text-sm animate-pulse">Loading…</div>
            ) : (
              <div className="space-y-2">
                {types.map((type) => {
                  const doc = docForType(type.id);
                  const expiring = doc && isExpiringSoon(doc.expiryDate);
                  return (
                    <div key={type.id} className="bg-slate-800 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-white text-sm font-medium flex items-center gap-2">
                            {type.name}
                            {!type.isFixed && (
                              <button
                                onClick={() => handleDeleteType(type.id)}
                                className="text-slate-500 hover:text-red-400 text-xs"
                                title="Remove custom document type"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <div className={`text-xs mt-0.5 ${expiring ? "text-red-400 font-semibold" : "text-slate-400"}`}>
                            {doc
                              ? `Expires: ${doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString("en-ZA") : "No expiry date"}${expiring ? " ⚠️ Expiring soon" : ""}`
                              : "Not uploaded"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {doc && (
                            <button
                              onClick={() => handleView(doc.id)}
                              className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded"
                            >
                              View
                            </button>
                          )}
                          {doc && (
                            <button
                              onClick={() => handleDownload(doc.id, type.name)}
                              className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded"
                              title="Download in its original format"
                            >
                              Download
                            </button>
                          )}
                          <button
                            onClick={() => setUploadingTypeId(uploadingTypeId === type.id ? null : type.id)}
                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
                          >
                            {doc ? "Replace" : "+ Upload"}
                          </button>
                          {doc && (
                            <button
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="text-xs bg-red-950 hover:bg-red-900 text-red-300 px-2 py-1 rounded"
                              title="Delete this document"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                      {uploadingTypeId === type.id && (
                        <DocumentUploadRow
                          defaultExpiry={doc?.expiryDate}
                          hasExistingDoc={!!doc}
                          busy={busy}
                          onCancel={() => setUploadingTypeId(null)}
                          onSubmit={(file, expiryDate) => handleUpload(type.id, file, expiryDate)}
                          onSaveDateOnly={(expiryDate) => doc && handleUpdateExpiry(doc.id, expiryDate)}
                        />
                      )}
                    </div>
                  );
                })}
                {types.length === 0 && (
                  <div className="bg-slate-800 rounded-lg p-4 text-center text-slate-500 text-sm">No document types yet.</div>
                )}
              </div>
            )}

            {addingType ? (
              <div className="mt-3 flex items-center gap-2">
                <input
                  autoFocus
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="e.g. Induction Certificate"
                  className="flex-1 bg-slate-900 border border-slate-600 text-white text-sm px-3 py-1.5 rounded focus:outline-none focus:border-blue-500"
                  onKeyDown={(e) => e.key === "Enter" && handleAddType()}
                />
                <button
                  onClick={handleAddType}
                  disabled={busy || !newTypeName.trim()}
                  className="text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-3 py-1.5 rounded font-medium"
                >
                  Add
                </button>
                <button
                  onClick={() => { setAddingType(false); setNewTypeName(""); }}
                  className="text-xs text-slate-400 hover:text-white px-2"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setAddingType(true)} className="mt-3 text-sm text-blue-400 hover:text-blue-300 font-medium">
                + Add document type
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Save works two ways: pick a file → full upload (with whatever date is
// set); no file but an existing document and a changed date → date-only
// PATCH, so correcting/adding an expiry date never requires re-selecting
// the same file again.
function DocumentUploadRow({ defaultExpiry, hasExistingDoc, busy, onSubmit, onSaveDateOnly, onCancel }) {
  const [file, setFile] = useState(null);
  const normalizedDefault = defaultExpiry ? defaultExpiry.slice(0, 10) : "";
  const [expiry, setExpiry] = useState(normalizedDefault);
  const dateOnlyChange = !file && hasExistingDoc && expiry !== normalizedDefault;
  const canSave = !!file || dateOnlyChange;

  const handleSave = () => {
    if (file) onSubmit(file, expiry);
    else if (dateOnlyChange) onSaveDateOnly(expiry);
  };

  return (
    <div className="mt-2 pt-2 border-t border-slate-700 flex flex-wrap items-center gap-2">
      <input
        type="file"
        accept="image/*,.pdf"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="text-xs text-slate-300 max-w-[180px]"
      />
      <input
        type="date"
        value={expiry}
        onChange={(e) => setExpiry(e.target.value)}
        title="Expiry date (leave blank if this document type doesn't expire)"
        className="bg-slate-900 border border-slate-600 text-white text-xs px-2 py-1 rounded"
      />
      <button
        disabled={!canSave || busy}
        onClick={handleSave}
        className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-2 py-1 rounded font-medium"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      <button onClick={onCancel} className="text-xs text-slate-400 hover:text-white px-2">Cancel</button>
      {hasExistingDoc && !file && (
        <span className="text-[11px] text-slate-500 basis-full">Tip: change just the date above to update it without re-uploading.</span>
      )}
    </div>
  );
}
