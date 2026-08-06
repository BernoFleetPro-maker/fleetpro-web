import React, { useEffect, useState } from "react";

const ROOT_API    = "https://fleetpro-backend-production.up.railway.app/api";
const VEHICLE_API = `${ROOT_API}/vehicles`;
const TRAILER_API = `${ROOT_API}/trailers`;

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

// Fail-open, admin bypasses — same convention as staffAccess.js, duplicated
// here since this page reads its own token rather than receiving props.
function canUseFeature(key) {
  try {
    const token = getToken();
    if (!token) return true;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role === "admin" || payload.tenantFeatures?.[key] !== false;
  } catch { return true; }
}

// Inline "at a glance" document summary for a list row — red/amber/neutral
// exactly matches the color logic already used inside the Info modal's own
// document list, just condensed into small chips so the expiry dates are
// visible without opening Info at all.
function DocumentChips({ documents, onSelect }) {
  if (!documents || documents.length === 0) return null;
  const now = Date.now();
  const in30Days = now + 30 * 24 * 60 * 60 * 1000;
  const clickable = "cursor-pointer hover:brightness-95";
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {documents.map((d, i) => {
        if (!d.uploaded) {
          return (
            <span key={i} onClick={() => onSelect?.(d)} title="Click to upload"
              className={`text-[10px] px-1.5 py-0.5 rounded border border-dashed bg-blue-50 text-blue-500 border-blue-200 ${clickable}`}>
              {d.typeName}: still to upload
            </span>
          );
        }
        const exp = d.expiryDate ? new Date(d.expiryDate) : null;
        const isExpired = exp && exp.getTime() < now;
        const isExpiringSoon = exp && !isExpired && exp.getTime() <= in30Days;
        const colorClass = isExpired
          ? "bg-red-100 text-red-700 border-red-200"
          : isExpiringSoon
          ? "bg-amber-100 text-amber-700 border-amber-200"
          : "bg-slate-100 text-slate-600 border-slate-200";
        const dateLabel = exp ? exp.toLocaleDateString("en-ZA") : "no expiry date";
        return (
          <span key={i} onClick={() => onSelect?.(d)} title="Click to view, replace, or delete"
            className={`text-[10px] px-1.5 py-0.5 rounded border ${colorClass} ${clickable}`}>
            {d.typeName}: {dateLabel}
          </span>
        );
      })}
    </div>
  );
}

const EMPTY_FORM = { registration: "", description: "", make: "", model: "", year: "", dealerStocked: false };

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");
  const [showBin, setShowBin]   = useState(false);
  const [binCount, setBinCount] = useState(0);
  const [infoAsset, setInfoAsset] = useState(null); // { kind: "vehicle"|"trailer", asset }
  const [quickDoc, setQuickDoc] = useState(null); // { apiBase, entityId, entityLabel, doc } — the small popup opened by clicking a document chip
  const [showDealerDropdown, setShowDealerDropdown] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null); // briefly "frames" a row after jumping to it

  const [vehicleForm, setVehicleForm]   = useState(EMPTY_FORM);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [vehicleFormError, setVehicleFormError] = useState("");
  const [savingVehicle, setSavingVehicle] = useState(false);

  const [trailerForm, setTrailerForm]   = useState(EMPTY_FORM);
  const [editingTrailer, setEditingTrailer] = useState(null);
  const [trailerFormError, setTrailerFormError] = useState("");
  const [savingTrailer, setSavingTrailer] = useState(false);

  const fetchVehicles = async () => {
    try {
      const res = await authFetch(VEHICLE_API);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setVehicles(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(`Could not load vehicles (${err.message}). Is the backend running?`);
      setVehicles([]);
    }
  };

  const fetchTrailers = async () => {
    try {
      const res = await authFetch(TRAILER_API);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setTrailers(Array.isArray(data) ? data : []);
    } catch (err) {
      setTrailers([]);
    }
  };

  const fetchBinCount = async () => {
    try {
      const [vRes, tRes] = await Promise.all([
        authFetch(`${VEHICLE_API}/deleted`),
        authFetch(`${TRAILER_API}/deleted`),
      ]);
      const [vData, tData] = await Promise.all([vRes.json(), tRes.json()]);
      const vCount = Array.isArray(vData) ? vData.length : 0;
      const tCount = Array.isArray(tData) ? tData.length : 0;
      setBinCount(vCount + tCount);
    } catch {}
  };

  const loadAll = async () => {
    setLoading(true);
    setError("");
    await Promise.all([fetchVehicles(), fetchTrailers(), fetchBinCount()]);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // ── Vehicle form handlers ───────────────────────────────────────────────
  const handleVehicleSubmit = async (e) => {
    e.preventDefault();
    setVehicleFormError("");
    if (!vehicleForm.registration.trim()) { setVehicleFormError("Registration number is required."); return; }
    setSavingVehicle(true);
    try {
      const url    = editingVehicle ? `${VEHICLE_API}/${editingVehicle}` : VEHICLE_API;
      const method = editingVehicle ? "PUT" : "POST";
      const res = await authFetch(url, {
        method,
        body: JSON.stringify({
          registration: vehicleForm.registration.trim().toUpperCase(),
          description:  vehicleForm.description.trim(),
          make:  vehicleForm.make.trim(),
          model: vehicleForm.model.trim(),
          year:  vehicleForm.year.trim(),
          dealerStocked: vehicleForm.dealerStocked,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setVehicleFormError(data.error || `Server error ${res.status}`); return; }
      setVehicleForm(EMPTY_FORM);
      setEditingVehicle(null);
      fetchVehicles();
    } catch (err) {
      setVehicleFormError(`Network error: ${err.message}`);
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleDeleteVehicle = async (id) => {
    if (!window.confirm("Delete this vehicle? It'll move to the Bin and can be restored within 12 months.")) return;
    try {
      await authFetch(`${VEHICLE_API}/${id}`, { method: "DELETE" });
      fetchVehicles();
      fetchBinCount();
    } catch {
      alert("Failed to delete vehicle.");
    }
  };

  const startEditVehicle = (v) => {
    setVehicleForm({ registration: v.registration, description: v.description || "", make: v.make || "", model: v.model || "", year: v.year || "", dealerStocked: !!v.dealerStocked });
    setEditingVehicle(v.id);
    setVehicleFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEditVehicle = () => { setVehicleForm(EMPTY_FORM); setEditingVehicle(null); setVehicleFormError(""); };

  const handleViewOnMap = (v) => { window.location.href = `/?vehicle=${encodeURIComponent(v.registration)}`; };

  // ── Trailer form handlers (mirrors vehicle handlers) ────────────────────
  const handleTrailerSubmit = async (e) => {
    e.preventDefault();
    setTrailerFormError("");
    if (!trailerForm.registration.trim()) { setTrailerFormError("Registration number is required."); return; }
    setSavingTrailer(true);
    try {
      const url    = editingTrailer ? `${TRAILER_API}/${editingTrailer}` : TRAILER_API;
      const method = editingTrailer ? "PUT" : "POST";
      const res = await authFetch(url, {
        method,
        body: JSON.stringify({
          registration: trailerForm.registration.trim().toUpperCase(),
          description:  trailerForm.description.trim(),
          make:  trailerForm.make.trim(),
          model: trailerForm.model.trim(),
          year:  trailerForm.year.trim(),
          dealerStocked: trailerForm.dealerStocked,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setTrailerFormError(data.error || `Server error ${res.status}`); return; }
      setTrailerForm(EMPTY_FORM);
      setEditingTrailer(null);
      fetchTrailers();
    } catch (err) {
      setTrailerFormError(`Network error: ${err.message}`);
    } finally {
      setSavingTrailer(false);
    }
  };

  const handleDeleteTrailer = async (id) => {
    if (!window.confirm("Delete this trailer? It'll move to the Bin and can be restored within 12 months.")) return;
    try {
      await authFetch(`${TRAILER_API}/${id}`, { method: "DELETE" });
      fetchTrailers();
      fetchBinCount();
    } catch {
      alert("Failed to delete trailer.");
    }
  };

  const startEditTrailer = (t) => {
    setTrailerForm({ registration: t.registration, description: t.description || "", make: t.make || "", model: t.model || "", year: t.year || "", dealerStocked: !!t.dealerStocked });
    setEditingTrailer(t.id);
    setTrailerFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEditTrailer = () => { setTrailerForm(EMPTY_FORM); setEditingTrailer(null); setTrailerFormError(""); };

  const matchesSearch = (item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.registration.toLowerCase().includes(q) || (item.description || "").toLowerCase().includes(q);
  };
  const filteredVehicles = vehicles.filter(matchesSearch);
  const filteredTrailers = trailers.filter(matchesSearch);

  const dealerStockedVehicles = vehicles.filter(v => v.dealerStocked);
  const dealerStockedTrailers = trailers.filter(t => t.dealerStocked);
  const dealerStockedCount = dealerStockedVehicles.length + dealerStockedTrailers.length;

  // Closes the dropdown, scrolls the picked row into view, and briefly
  // frames it with a highlight ring so it's easy to spot in a long list.
  const jumpToAsset = (id) => {
    setShowDealerDropdown(false);
    setSearch(""); // a search filter could otherwise hide the row we're jumping to
    setHighlightedId(id);
    setTimeout(() => {
      document.getElementById(`asset-row-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    setTimeout(() => setHighlightedId(null), 2500);
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800">Fleet Vehicles &amp; Trailers</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
            <span className="text-lg font-bold text-blue-600">{vehicles.length}</span>
            <div className="text-xs text-blue-500 leading-tight"><div className="font-semibold">Vehicles</div></div>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <span className="text-lg font-bold text-amber-600">{trailers.length}</span>
            <div className="text-xs text-amber-600 leading-tight"><div className="font-semibold">Trailers</div></div>
          </div>
          {dealerStockedCount > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowDealerDropdown(v => !v)}
                className="flex items-center gap-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg px-3 py-1.5"
                title="View dealer stocked vehicles & trailers"
              >
                <span className="text-lg font-bold text-purple-600">{dealerStockedCount}</span>
                <div className="text-xs text-purple-600 leading-tight"><div className="font-semibold">🏪 Dealer Stocked</div></div>
              </button>
              {showDealerDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowDealerDropdown(false)} />
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto">
                    {dealerStockedVehicles.length > 0 && (
                      <div className="px-3 pt-2 pb-1">
                        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1">Vehicles</div>
                        {dealerStockedVehicles.map(v => (
                          <button
                            key={v.id}
                            onClick={() => jumpToAsset(v.id)}
                            className="w-full text-left px-2 py-1.5 rounded hover:bg-purple-50 text-sm text-gray-700 flex items-center gap-2"
                          >
                            🚚 {v.registration}
                          </button>
                        ))}
                      </div>
                    )}
                    {dealerStockedTrailers.length > 0 && (
                      <div className="px-3 pt-1 pb-2">
                        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1">Trailers</div>
                        {dealerStockedTrailers.map(t => (
                          <button
                            key={t.id}
                            onClick={() => jumpToAsset(t.id)}
                            className="w-full text-left px-2 py-1.5 rounded hover:bg-purple-50 text-sm text-gray-700 flex items-center gap-2"
                          >
                            🚛 {t.registration}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => setShowBin(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-sm font-medium"
            title="View deleted vehicles & trailers"
          >
            🗑 Bin
            {binCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{binCount}</span>
            )}
          </button>
        </div>
      </div>

      {!loading && (vehicles.length > 0 || trailers.length > 0) && (
        <input
          type="text"
          placeholder="Search vehicles or trailers by registration or description..."
          className="border p-2 rounded w-full text-sm mb-4"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded text-sm mb-4">
          {error}
          <button onClick={loadAll} className="ml-3 underline">Retry</button>
        </div>
      )}

      {/* ── Add forms ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-1">{editingVehicle ? "Edit Vehicle" : "Add Vehicle"}</h3>
          <p className="text-xs text-gray-400 mb-3">Only the registration number is required.</p>
          {vehicleFormError && <div className="bg-red-50 border border-red-300 text-red-600 text-sm px-3 py-2 rounded mb-3">{vehicleFormError}</div>}
          <form onSubmit={handleVehicleSubmit} className="space-y-3">
            <input type="text" placeholder="Registration *  (e.g. ABC123GP)" className="border p-2 rounded w-full text-sm font-mono uppercase"
              value={vehicleForm.registration} onChange={(e) => setVehicleForm({ ...vehicleForm, registration: e.target.value.toUpperCase() })} />
            <input type="text" placeholder="Description (optional)" className="border p-2 rounded w-full text-sm"
              value={vehicleForm.description} onChange={(e) => setVehicleForm({ ...vehicleForm, description: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <input type="text" placeholder="Make" className="border p-2 rounded text-sm" value={vehicleForm.make} onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })} />
              <input type="text" placeholder="Model" className="border p-2 rounded text-sm" value={vehicleForm.model} onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })} />
              <input type="text" placeholder="Year" className="border p-2 rounded text-sm" value={vehicleForm.year} onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" className="rounded" checked={vehicleForm.dealerStocked} onChange={(e) => setVehicleForm({ ...vehicleForm, dealerStocked: e.target.checked })} />
              🏪 Dealer Stocked <span className="text-xs text-gray-400">(not yet in service — no documents needed yet)</span>
            </label>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={savingVehicle} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2 rounded text-sm font-medium">
                {savingVehicle ? "Saving..." : editingVehicle ? "Update Vehicle" : "Add Vehicle"}
              </button>
              {editingVehicle && <button type="button" onClick={cancelEditVehicle} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded text-sm">Cancel</button>}
            </div>
          </form>
        </div>

        <div className="bg-white border rounded-lg p-5 shadow-sm">
          <h3 className="font-semibold text-gray-700 mb-1">{editingTrailer ? "Edit Trailer" : "Add Trailer"}</h3>
          <p className="text-xs text-gray-400 mb-3">Only the registration number is required.</p>
          {trailerFormError && <div className="bg-red-50 border border-red-300 text-red-600 text-sm px-3 py-2 rounded mb-3">{trailerFormError}</div>}
          <form onSubmit={handleTrailerSubmit} className="space-y-3">
            <input type="text" placeholder="Registration *  (e.g. ABC123GP)" className="border p-2 rounded w-full text-sm font-mono uppercase"
              value={trailerForm.registration} onChange={(e) => setTrailerForm({ ...trailerForm, registration: e.target.value.toUpperCase() })} />
            <input type="text" placeholder="Description (optional)" className="border p-2 rounded w-full text-sm"
              value={trailerForm.description} onChange={(e) => setTrailerForm({ ...trailerForm, description: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <input type="text" placeholder="Make" className="border p-2 rounded text-sm" value={trailerForm.make} onChange={(e) => setTrailerForm({ ...trailerForm, make: e.target.value })} />
              <input type="text" placeholder="Model" className="border p-2 rounded text-sm" value={trailerForm.model} onChange={(e) => setTrailerForm({ ...trailerForm, model: e.target.value })} />
              <input type="text" placeholder="Year" className="border p-2 rounded text-sm" value={trailerForm.year} onChange={(e) => setTrailerForm({ ...trailerForm, year: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" className="rounded" checked={trailerForm.dealerStocked} onChange={(e) => setTrailerForm({ ...trailerForm, dealerStocked: e.target.checked })} />
              🏪 Dealer Stocked <span className="text-xs text-gray-400">(not yet in service — no documents needed yet)</span>
            </label>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={savingTrailer} className="bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white px-5 py-2 rounded text-sm font-medium">
                {savingTrailer ? "Saving..." : editingTrailer ? "Update Trailer" : "Add Trailer"}
              </button>
              {editingTrailer && <button type="button" onClick={cancelEditTrailer} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded text-sm">Cancel</button>}
            </div>
          </form>
        </div>
      </div>

      {loading && <p className="text-gray-400 text-sm">Loading...</p>}

      {/* ── Vehicles list ── */}
      {!loading && (
        <>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Vehicles</h3>
          {vehicles.length === 0 && <p className="text-gray-400 text-sm mb-4">No vehicles added yet.</p>}
          {vehicles.length > 0 && filteredVehicles.length === 0 && <p className="text-gray-400 text-sm mb-4">No vehicles match "{search}".</p>}
          <ul className="space-y-2 mb-6">
            {filteredVehicles.map((v) => (
              <li key={v.id} id={`asset-row-${v.id}`} className={`flex justify-between items-center bg-white border rounded-lg px-4 py-3 shadow-sm transition-shadow ${highlightedId === v.id ? "ring-2 ring-purple-500 border-purple-400" : ""}`}>
                <div>
                  <span className="font-bold text-gray-800 font-mono">{v.registration}</span>
                  {canUseFeature("complianceDocuments") && v.expiringDocsCount > 0 && (
                    <span className="ml-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle"
                      title={`${v.expiringDocsCount} document(s) need attention — open Info to view`}>
                      {v.expiringDocsCount}
                    </span>
                  )}
                  {v.dealerStocked && (
                    <span className="ml-2 bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle">
                      🏪 Dealer Stocked
                    </span>
                  )}
                  {v.description && <span className="text-gray-500 text-sm ml-2">— {v.description}</span>}
                  {(v.make || v.model || v.year) && <div className="text-gray-400 text-xs mt-0.5">{[v.make, v.model, v.year].filter(Boolean).join(" · ")}</div>}
                  {canUseFeature("complianceDocuments") && (
                    <DocumentChips documents={v.documents} onSelect={(doc) => setQuickDoc({ apiBase: VEHICLE_API, entityId: v.id, entityLabel: `Vehicle — ${v.registration}`, doc })} />
                  )}
                </div>
                <div className="flex gap-2 items-center flex-wrap justify-end">
                  <button onClick={() => handleViewOnMap(v)} className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded text-xs font-medium" title="View this vehicle on the map">🗺 Map</button>
                  <button onClick={() => setInfoAsset({ kind: "vehicle", asset: v })} className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-xs font-medium" title="View info & compliance documents">ℹ️ Info</button>
                  <button onClick={() => startEditVehicle(v)} className="text-blue-600 hover:underline text-sm">Edit</button>
                  <button onClick={() => handleDeleteVehicle(v.id)} className="text-red-600 hover:underline text-sm">Delete</button>
                </div>
              </li>
            ))}
          </ul>

          {/* ── Trailers list ── */}
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Trailers</h3>
          {trailers.length === 0 && <p className="text-gray-400 text-sm">No trailers added yet.</p>}
          {trailers.length > 0 && filteredTrailers.length === 0 && <p className="text-gray-400 text-sm">No trailers match "{search}".</p>}
          <ul className="space-y-2">
            {filteredTrailers.map((t) => (
              <li key={t.id} id={`asset-row-${t.id}`} className={`flex justify-between items-center bg-white border rounded-lg px-4 py-3 shadow-sm transition-shadow ${highlightedId === t.id ? "ring-2 ring-purple-500 border-purple-400" : ""}`}>
                <div>
                  <span className="font-bold text-gray-800 font-mono">{t.registration}</span>
                  {canUseFeature("complianceDocuments") && t.expiringDocsCount > 0 && (
                    <span className="ml-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle"
                      title={`${t.expiringDocsCount} document(s) need attention — open Info to view`}>
                      {t.expiringDocsCount}
                    </span>
                  )}
                  {t.dealerStocked && (
                    <span className="ml-2 bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle">
                      🏪 Dealer Stocked
                    </span>
                  )}
                  {t.description && <span className="text-gray-500 text-sm ml-2">— {t.description}</span>}
                  {(t.make || t.model || t.year) && <div className="text-gray-400 text-xs mt-0.5">{[t.make, t.model, t.year].filter(Boolean).join(" · ")}</div>}
                  {canUseFeature("complianceDocuments") && (
                    <DocumentChips documents={t.documents} onSelect={(doc) => setQuickDoc({ apiBase: TRAILER_API, entityId: t.id, entityLabel: `Trailer — ${t.registration}`, doc })} />
                  )}
                </div>
                <div className="flex gap-2 items-center flex-wrap justify-end">
                  <button onClick={() => setInfoAsset({ kind: "trailer", asset: t })} className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-xs font-medium" title="View info & compliance documents">ℹ️ Info</button>
                  <button onClick={() => startEditTrailer(t)} className="text-blue-600 hover:underline text-sm">Edit</button>
                  <button onClick={() => handleDeleteTrailer(t.id)} className="text-red-600 hover:underline text-sm">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {infoAsset && (
        <AssetInfoModal
          assetKind={infoAsset.kind}
          asset={infoAsset.asset}
          onClose={() => setInfoAsset(null)}
          onChange={() => { fetchVehicles(); fetchTrailers(); }}
        />
      )}

      {quickDoc && (
        <DocumentQuickModal
          apiBase={quickDoc.apiBase}
          entityId={quickDoc.entityId}
          entityLabel={quickDoc.entityLabel}
          doc={quickDoc.doc}
          onClose={() => setQuickDoc(null)}
          onChange={() => { fetchVehicles(); fetchTrailers(); }}
        />
      )}

      {showBin && (
        <AssetBinModal
          onClose={() => setShowBin(false)}
          onChange={() => { fetchVehicles(); fetchTrailers(); fetchBinCount(); }}
        />
      )}
    </div>
  );
}

// ─── Asset Info modal — details + compliance documents, shared by vehicles
// and trailers. Same lazy-load-on-open, fetch-on-view pattern as Drivers. ───
function AssetInfoModal({ assetKind, asset, onClose, onChange }) {
  const apiBase = assetKind === "vehicle" ? VEHICLE_API : TRAILER_API;
  const label = assetKind === "vehicle" ? "Vehicle" : "Trailer";

  const [types, setTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [uploadingTypeId, setUploadingTypeId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [dealerStocked, setDealerStocked] = useState(!!asset.dealerStocked);
  const [togglingDealerStocked, setTogglingDealerStocked] = useState(false);

  const loadAll = () => {
    if (!canUseFeature("complianceDocuments")) { setLoading(false); return; }
    setLoading(true);
    setModalError("");
    Promise.all([
      authFetch(`${ROOT_API}/document-types?appliesTo=${assetKind}&entityId=${asset.id}`).then(r => r.json()),
      authFetch(`${apiBase}/${asset.id}/documents`).then(r => r.json()),
    ])
      .then(([typesData, docsData]) => {
        setTypes(Array.isArray(typesData) ? typesData : []);
        setDocs(Array.isArray(docsData) ? docsData : []);
        onChange?.();
      })
      .catch(() => setModalError("Could not load documents. Please try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAll(); }, [asset.id]);

  const handleToggleDealerStocked = async (checked) => {
    setTogglingDealerStocked(true);
    setModalError("");
    const previous = dealerStocked;
    setDealerStocked(checked); // optimistic — this modal doesn't re-read the asset prop after save
    try {
      const res = await authFetch(`${apiBase}/${asset.id}/dealer-stocked`, {
        method: "PATCH",
        body: JSON.stringify({ dealerStocked: checked }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDealerStocked(previous);
        setModalError(data.error || "Failed to update dealer stocked status");
        return;
      }
      onChange?.();
    } catch {
      setDealerStocked(previous);
      setModalError("Could not update dealer stocked status. Please try again.");
    } finally {
      setTogglingDealerStocked(false);
    }
  };

  const docForType = (typeId) => docs.find(d => d.documentTypeId === typeId);
  const isExpiringSoon = (dateStr) => {
    if (!dateStr) return false;
    return new Date(dateStr) <= new Date(Date.now() + 30 * 86400000);
  };

  const handleView = async (documentId) => {
    try {
      const res = await authFetch(`${apiBase}/${asset.id}/documents/${documentId}`);
      const data = await res.json();
      if (data.fileUrl) window.open(data.fileUrl, "_blank", "noopener,noreferrer");
      else setModalError("Could not open document.");
    } catch {
      setModalError("Could not open document.");
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
      const res = await fetch(`${apiBase}/${asset.id}/documents`, {
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
      const res = await authFetch(`${apiBase}/${asset.id}/documents/${documentId}`, {
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
      const res = await authFetch(`${apiBase}/${asset.id}/documents/${documentId}`, { method: "DELETE" });
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
        body: JSON.stringify({ name: newTypeName.trim(), appliesTo: assetKind, entityId: asset.id }),
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
      const res = await authFetch(`${ROOT_API}/document-types/${typeId}?entityId=${asset.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to delete document type"); return; }
      loadAll();
    } catch {
      setModalError("Could not delete document type. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[#1e293b] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-600" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-white font-mono">{asset.registration}</h2>
            <span className="text-xs text-slate-400">{label}{asset.description ? ` — ${asset.description}` : ""}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {modalError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded">{modalError}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">🔖 Registration</div>
              <div className="text-white text-sm font-medium font-mono">{asset.registration}</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">🚚 Make / Model / Year</div>
              <div className="text-white text-sm font-medium">{[asset.make, asset.model, asset.year].filter(Boolean).join(" · ") || "—"}</div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-3">
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={dealerStocked}
                disabled={togglingDealerStocked}
                onChange={(e) => handleToggleDealerStocked(e.target.checked)}
              />
              🏪 Dealer Stocked
              <span className="text-xs text-slate-400">
                {dealerStocked ? "— not yet in service, no documents needed yet" : "— taken off the road to sell? tick to mark as dealer stocked"}
              </span>
            </label>
          </div>

          {!canUseFeature("complianceDocuments") ? (
            <div className="bg-slate-800 rounded-lg p-4 text-center text-slate-500 text-sm">
              Compliance documents aren't enabled for your company.
            </div>
          ) : (
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
                              <button onClick={() => handleDeleteType(type.id)} className="text-slate-500 hover:text-red-400 text-xs" title="Remove custom document type">✕</button>
                            )}
                          </div>
                          <div className={`text-xs mt-0.5 ${expiring ? "text-red-400 font-semibold" : "text-slate-400"}`}>
                            {doc
                              ? `Expires: ${doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString("en-ZA") : "No expiry date"}${expiring ? " ⚠️ Expiring soon" : ""}`
                              : "Not uploaded"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {doc && <button onClick={() => handleView(doc.id)} className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded">View</button>}
                          <button onClick={() => setUploadingTypeId(uploadingTypeId === type.id ? null : type.id)} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded">
                            {doc ? "Replace" : "+ Upload"}
                          </button>
                          {doc && (
                            <button onClick={() => handleDeleteDocument(doc.id)} className="text-xs bg-red-950 hover:bg-red-900 text-red-300 px-2 py-1 rounded" title="Delete this document">Delete</button>
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
                {types.length === 0 && <div className="bg-slate-800 rounded-lg p-4 text-center text-slate-500 text-sm">No document types yet.</div>}
              </div>
            )}

            {addingType ? (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <input autoFocus value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="e.g. Cross-border Permit"
                    className="flex-1 bg-slate-900 border border-slate-600 text-white text-sm px-3 py-1.5 rounded focus:outline-none focus:border-blue-500"
                    onKeyDown={(e) => e.key === "Enter" && handleAddType()} />
                  <button onClick={handleAddType} disabled={busy || !newTypeName.trim()} className="text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-3 py-1.5 rounded font-medium">Add</button>
                  <button onClick={() => { setAddingType(false); setNewTypeName(""); }} className="text-xs text-slate-400 hover:text-white px-2">Cancel</button>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Only applies to {asset.registration} — other {label.toLowerCase()}s won't see it.</div>
              </div>
            ) : (
              <button onClick={() => setAddingType(true)} className="mt-3 text-sm text-blue-400 hover:text-blue-300 font-medium">+ Add document type</button>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Save works two ways: pick a file → full upload (with whatever date is
// set); no file but an existing document and a changed date → date-only
// PATCH. Same component/logic as Drivers.jsx's DocumentUploadRow.
function DocumentUploadRow({ defaultExpiry, hasExistingDoc, busy, onSubmit, onSaveDateOnly, onCancel }) {
  const [file, setFile] = useState(null);
  const normalizedDefault = defaultExpiry ? defaultExpiry.slice(0, 10) : "";
  const [expiry, setExpiry] = useState(normalizedDefault);
  const dateOnlyChange = !file && hasExistingDoc && expiry !== normalizedDefault;
  const canSave = !!file || dateOnlyChange;

  const handleSave = () => {
    if (file) {
      if (hasExistingDoc && normalizedDefault && !expiry) {
        const ok = window.confirm(`This document currently expires ${normalizedDefault} — continue uploading without setting an expiry date?`);
        if (!ok) return;
      }
      onSubmit(file, expiry);
    } else if (dateOnlyChange) {
      onSaveDateOnly(expiry);
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-slate-700 flex flex-wrap items-center gap-2">
      <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs text-slate-300 max-w-[180px]" />
      <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} title="Expiry date (leave blank if this document type doesn't expire)" className="bg-slate-900 border border-slate-600 text-white text-xs px-2 py-1 rounded" />
      <button disabled={!canSave || busy} onClick={handleSave} className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-2 py-1 rounded font-medium">
        {busy ? "Saving…" : "Save"}
      </button>
      <button onClick={onCancel} className="text-xs text-slate-400 hover:text-white px-2">Cancel</button>
      {hasExistingDoc && !file && <span className="text-[11px] text-slate-500 basis-full">Tip: change just the date above to update it without re-uploading.</span>}
    </div>
  );
}

// ─── Document quick-action popup — opened by clicking a chip on the list.
// Deliberately small and single-purpose: shows just the one document that
// was clicked, defaulting to View/Replace/Delete so the user picks what
// they want instead of always landing in the upload form. Upload/Replace
// only opens DocumentUploadRow once explicitly chosen. ───────────────────────
function DocumentQuickModal({ apiBase, entityId, entityLabel, doc, onClose, onChange }) {
  const [current, setCurrent] = useState(doc); // { typeId, typeName, documentId, expiryDate, uploaded }
  const [mode, setMode] = useState("actions"); // "actions" | "upload"
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");

  const isExpiringSoon = (dateStr) => {
    if (!dateStr) return false;
    return new Date(dateStr) <= new Date(Date.now() + 30 * 86400000);
  };
  const expired = current.uploaded && current.expiryDate && new Date(current.expiryDate) < new Date();
  const expiring = current.uploaded && !expired && isExpiringSoon(current.expiryDate);

  const handleView = async () => {
    try {
      const res = await authFetch(`${apiBase}/${entityId}/documents/${current.documentId}`);
      const data = await res.json();
      if (data.fileUrl) window.open(data.fileUrl, "_blank", "noopener,noreferrer");
      else setModalError("Could not open document.");
    } catch {
      setModalError("Could not open document.");
    }
  };

  const handleUpload = async (file, expiryDate) => {
    setBusy(true);
    setModalError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentTypeId", current.typeId);
      if (expiryDate) fd.append("expiryDate", expiryDate);
      const res = await fetch(`${apiBase}/${entityId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to upload document"); return; }
      setCurrent({ ...current, documentId: data.id, expiryDate: data.expiryDate, uploaded: true });
      setMode("actions");
      onChange?.();
    } catch {
      setModalError("Could not upload document. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDateOnly = async (expiryDate) => {
    setBusy(true);
    setModalError("");
    try {
      const res = await authFetch(`${apiBase}/${entityId}/documents/${current.documentId}`, {
        method: "PATCH",
        body: JSON.stringify({ expiryDate: expiryDate || null }),
      });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to update expiry date"); return; }
      setCurrent({ ...current, expiryDate: expiryDate || null });
      setMode("actions");
      onChange?.();
    } catch {
      setModalError("Could not update expiry date. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this document? You'll need to upload it again later if it's still needed.")) return;
    setBusy(true);
    setModalError("");
    try {
      const res = await authFetch(`${apiBase}/${entityId}/documents/${current.documentId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to delete document"); return; }
      setCurrent({ ...current, documentId: null, expiryDate: null, uploaded: false });
      onChange?.();
    } catch {
      setModalError("Could not delete document. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[#1e293b] rounded-xl w-full max-w-sm border border-slate-600" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h3 className="text-white font-bold">{current.typeName}</h3>
            <span className="text-xs text-slate-400">{entityLabel}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-4">
          {modalError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded mb-3">{modalError}</div>}
          <div className={`text-sm mb-3 ${expired || expiring ? "text-red-400 font-semibold" : "text-slate-300"}`}>
            {current.uploaded
              ? `Expires: ${current.expiryDate ? new Date(current.expiryDate).toLocaleDateString("en-ZA") : "No expiry date"}${expired ? " — expired" : expiring ? " ⚠️ Expiring soon" : ""}`
              : "Not uploaded yet"}
          </div>

          {mode === "actions" ? (
            <div className="flex gap-2">
              {current.uploaded && (
                <button onClick={handleView} className="flex-1 text-sm bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded">View</button>
              )}
              <button onClick={() => setMode("upload")} className="flex-1 text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded">
                {current.uploaded ? "Replace" : "Upload"}
              </button>
              {current.uploaded && (
                <button onClick={handleDelete} disabled={busy} className="flex-1 text-sm bg-red-950 hover:bg-red-900 disabled:opacity-50 text-red-300 px-3 py-2 rounded">Delete</button>
              )}
            </div>
          ) : (
            <DocumentUploadRow
              defaultExpiry={current.expiryDate}
              hasExistingDoc={current.uploaded}
              busy={busy}
              onCancel={() => setMode("actions")}
              onSubmit={handleUpload}
              onSaveDateOnly={handleSaveDateOnly}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bin modal — deleted vehicles AND trailers, restorable within 12 months ──
function AssetBinModal({ onClose, onChange }) {
  const [deletedVehicles, setDeletedVehicles] = useState([]);
  const [deletedTrailers, setDeletedTrailers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalError, setModalError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    setModalError("");
    Promise.all([
      authFetch(`${VEHICLE_API}/deleted`).then(r => r.json()),
      authFetch(`${TRAILER_API}/deleted`).then(r => r.json()),
    ])
      .then(([vData, tData]) => {
        setDeletedVehicles(Array.isArray(vData) ? vData : []);
        setDeletedTrailers(Array.isArray(tData) ? tData : []);
      })
      .catch(() => setModalError("Could not load the bin. Please try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRestore = async (kind, id) => {
    const apiBase = kind === "vehicle" ? VEHICLE_API : TRAILER_API;
    setBusyId(id);
    setModalError("");
    try {
      const res = await authFetch(`${apiBase}/${id}/restore`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to restore"); return; }
      load();
      onChange?.();
    } catch {
      setModalError("Could not restore. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handlePermanentDelete = async (kind, id, registration) => {
    if (!window.confirm(`Permanently delete ${registration}? This cannot be undone.`)) return;
    const apiBase = kind === "vehicle" ? VEHICLE_API : TRAILER_API;
    setBusyId(id);
    setModalError("");
    try {
      const res = await authFetch(`${apiBase}/${id}/permanent`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setModalError(data.error || "Failed to permanently delete"); return; }
      load();
      onChange?.();
    } catch {
      setModalError("Could not permanently delete. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const renderRow = (kind, item) => (
    <div key={item.id} className="bg-slate-800 rounded-lg p-3 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-white text-sm font-medium font-mono">{item.registration}</div>
        {item.description && <div className="text-xs text-slate-500">{item.description}</div>}
        <div className="text-xs text-slate-500 mt-0.5">
          Deleted {new Date(item.deletedAt).toLocaleDateString("en-ZA")} — permanently deleted after {new Date(item.purgeAt).toLocaleDateString("en-ZA")}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button disabled={busyId === item.id} onClick={() => handleRestore(kind, item.id)} className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-2 py-1 rounded font-medium">Restore</button>
        <button disabled={busyId === item.id} onClick={() => handlePermanentDelete(kind, item.id, item.registration)} className="text-xs bg-red-950 hover:bg-red-900 text-red-300 disabled:opacity-50 px-2 py-1 rounded">Delete Permanently</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[#1e293b] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-600" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">🗑 Bin</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {modalError && <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-3 py-2 rounded">{modalError}</div>}
          <p className="text-xs text-slate-500">Deleted vehicles and trailers are kept here for 12 months and can be restored. After that they're removed automatically.</p>

          {loading ? (
            <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-400 text-sm animate-pulse">Loading…</div>
          ) : (
            <>
              <div>
                <div className="text-sm font-semibold text-slate-300 mb-2">Vehicles</div>
                {deletedVehicles.length === 0
                  ? <div className="bg-slate-800 rounded-lg p-4 text-center text-slate-500 text-sm">No deleted vehicles.</div>
                  : <div className="space-y-2">{deletedVehicles.map(v => renderRow("vehicle", v))}</div>}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-300 mb-2">Trailers</div>
                {deletedTrailers.length === 0
                  ? <div className="bg-slate-800 rounded-lg p-4 text-center text-slate-500 text-sm">No deleted trailers.</div>
                  : <div className="space-y-2">{deletedTrailers.map(t => renderRow("trailer", t))}</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
