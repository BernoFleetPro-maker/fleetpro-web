import React, { useEffect, useMemo, useState } from "react";
import api from "../api";

// Fuel — diesel fill-ups sent by drivers from the app (replaces slip photos
// in the WhatsApp group). Everything is worked out on the server
// (/api/fuel); this page lists, corrects and reports.
//
// km/L is tank-to-tank: from one FULL fill to the next full fill of the
// same truck — km between the two odometer readings, divided by every truck
// litre put in after the first one (part fills in between count). Trailer
// (tanker pump) litres never count towards the truck.

function authHeaders() {
  const token = localStorage.getItem("fleetpro_token") || "";
  return { headers: { Authorization: `Bearer ${token}` } };
}
const errorText = (err, fallback) => err?.response?.data?.error || fallback;

const money = (n) => Number(n || 0).toLocaleString("en-ZA", { style: "currency", currency: "ZAR" });
const litres = (n) => `${Number(n || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })} L`;
const km = (n) => `${Number(n || 0).toLocaleString("en-ZA")} km`;
const when = (d) => new Date(d).toLocaleString("en-ZA", {
  timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const monthLabel = (key) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
const weekLabel = (key) => {
  const start = new Date(`${key}T12:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86400e3);
  const f = (d) => d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  return `Week ${f(start)} – ${f(end)} ${end.getUTCFullYear()}`;
};

const PHOTO_LABELS = { slip: "Slip", odometer: "Odometer", pump: "Pump" };

// SA date (YYYY-MM-DD) → range bounds the server understands.
const SA = "+02:00";
const dayStart = (d) => `${d}T00:00:00${SA}`;
const dayEnd = (d) => `${d}T23:59:59${SA}`;
function todaySA() {
  return new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);
}
function presetRange(preset) {
  const today = todaySA();
  const [y, m] = today.split("-").map(Number);
  const first = (yy, mm) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  const prev = (yy, mm, back) => { let mm2 = mm - back, yy2 = yy; while (mm2 < 1) { mm2 += 12; yy2 -= 1; } return [yy2, mm2]; };
  if (preset === "this_month") return { from: first(y, m), to: today };
  if (preset === "last_month") {
    const [py, pm] = prev(y, m, 1);
    const end = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
    return { from: first(py, pm), to: end };
  }
  if (preset === "3_months") { const [py, pm] = prev(y, m, 2); return { from: first(py, pm), to: today }; }
  if (preset === "12_months") { const [py, pm] = prev(y, m, 11); return { from: first(py, pm), to: today }; }
  return null;
}
const PRESETS = [["this_month", "This month"], ["last_month", "Last month"], ["3_months", "Last 3 months"], ["12_months", "Last 12 months"]];

function RangePicker({ range, setRange }) {
  const inputCls = "border border-slate-300 rounded-lg px-2 py-1.5 text-sm";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={inputCls} value={range.preset} onChange={e => {
        const p = e.target.value;
        setRange(p === "custom" ? { ...range, preset: p } : { preset: p, ...presetRange(p) });
      }}>
        {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        <option value="custom">Choose dates…</option>
      </select>
      {range.preset === "custom" && (
        <>
          <input type="date" className={inputCls} value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} />
          <span className="text-slate-400 text-sm">to</span>
          <input type="date" className={inputCls} value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} />
        </>
      )}
    </div>
  );
}

function PhotoViewer({ photos, index, onClose }) {
  const [i, setI] = useState(index);
  const p = photos[i];
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI(x => Math.min(photos.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI(x => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, onClose]);
  if (!p) return null;
  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex flex-col items-center justify-center p-4" onClick={onClose}>
      <img src={p.url} alt={PHOTO_LABELS[p.kind]} className="max-h-[80vh] max-w-full rounded-lg" onClick={e => e.stopPropagation()} />
      <div className="mt-3 flex items-center gap-4 text-white text-sm" onClick={e => e.stopPropagation()}>
        <button disabled={i === 0} onClick={() => setI(i - 1)} className="px-3 py-1 rounded bg-white/20 disabled:opacity-30">‹ Prev</button>
        <span>{PHOTO_LABELS[p.kind] || p.kind} · {i + 1} of {photos.length}</span>
        <button disabled={i === photos.length - 1} onClick={() => setI(i + 1)} className="px-3 py-1 rounded bg-white/20 disabled:opacity-30">Next ›</button>
        <a href={p.url} target="_blank" rel="noreferrer" className="underline">Open full size</a>
        <button onClick={onClose} className="px-3 py-1 rounded bg-white/20">Close</button>
      </div>
    </div>
  );
}

function Thumbs({ photos, onOpen }) {
  if (!photos?.length) return <span className="text-xs text-red-500 font-semibold">No photos</span>;
  return (
    <div className="flex gap-1">
      {photos.slice(0, 3).map((p, i) => (
        <button key={p.id} onClick={(e) => { e.stopPropagation(); onOpen(photos, i); }} title={PHOTO_LABELS[p.kind]}
          className="w-9 h-9 rounded overflow-hidden border border-slate-200 bg-slate-100">
          <img src={p.url} alt={p.kind} className="w-full h-full object-cover" loading="lazy" />
        </button>
      ))}
      {photos.length > 3 && <span className="text-xs text-slate-500 self-center">+{photos.length - 3}</span>}
    </div>
  );
}

const HISTORY_FIELDS = {
  vehicleReg: "Truck", trailerReg: "Trailer", odometerKm: "Odometer", truckLitres: "Truck litres",
  trailerLitres: "Trailer litres", pricePerLitre: "Price/L", stationName: "Station", fullTank: "Full tank", filledAt: "Date",
};
const showValue = (k, v) => v == null || v === "" ? "—" : k === "fullTank" ? (v ? "Yes" : "No") : k === "filledAt" ? when(v) : String(v);

function historyLine(h) {
  if (h.action === "corrected") {
    return Object.entries(h.changes || {}).map(([k, [a, b]]) => `${HISTORY_FIELDS[k] || k}: ${showValue(k, a)} → ${showValue(k, b)}`).join(" · ");
  }
  return { added: "Added by the office", removed: `Removed${h.reason ? ` — ${h.reason}` : ""}`, restored: "Put back", photo_removed: `${PHOTO_LABELS[h.kind] || "Photo"} photo removed` }[h.action] || h.action;
}

// SA local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">.
const toLocalInput = (d) => new Date(new Date(d).getTime() + 2 * 3600e3).toISOString().slice(0, 16);

function FillModal({ fill, options, onClose, onSaved, onOpenPhotos }) {
  const isNew = !fill;
  const [form, setForm] = useState(() => ({
    vehicleId: fill?.vehicleId || "",
    trailerId: fill?.trailerId || "",
    driverId: fill?.driverId || "",
    odometerKm: fill?.odometerKm ?? "",
    truckLitres: fill?.truckLitres ?? "",
    trailerLitres: fill?.trailerLitres ?? "",
    pricePerLitre: fill?.pricePerLitre ?? "",
    stationName: fill?.stationName || "",
    fullTank: fill ? fill.fullTank : true,
    filledAt: toLocalInput(fill?.filledAt || new Date()),
  }));
  const [photos, setPhotos] = useState(fill?.photos || []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadKind, setUploadKind] = useState("slip");
  const [uploading, setUploading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const total = (Number(String(form.truckLitres).replace(",", ".")) + Number(String(form.trailerLitres || 0).replace(",", "."))) * Number(String(form.pricePerLitre).replace(",", "."));

  async function save(e) {
    e.preventDefault();
    setError(""); setSaving(true);
    const payload = {
      ...form,
      trailerId: form.trailerId || null,
      filledAt: new Date(`${form.filledAt}:00${SA}`).toISOString(),
    };
    if (!isNew) delete payload.driverId;
    else if (!payload.driverId) delete payload.driverId;
    try {
      const r = isNew
        ? await api.post("/fuel/fills", payload, authHeaders())
        : await api.patch(`/fuel/fills/${fill.id}`, payload, authHeaders());
      onSaved(r.data, isNew);
    } catch (err) {
      setError(errorText(err, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  async function addPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("kind", uploadKind);
      fd.append("photo", file);
      const r = await api.post(`/fuel/fills/${fill.id}/photos`, fd, authHeaders());
      setPhotos(p => [...p, r.data]);
      onSaved({ ...fill, photos: [...photos, r.data] }, false, true);
    } catch (err) {
      setError(errorText(err, "Failed to upload the photo"));
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(p) {
    if (!window.confirm(`Remove this ${PHOTO_LABELS[p.kind]?.toLowerCase() || ""} photo?`)) return;
    try {
      await api.delete(`/fuel/fills/${fill.id}/photos/${p.id}`, authHeaders());
      const left = photos.filter(x => x.id !== p.id);
      setPhotos(left);
      onSaved({ ...fill, photos: left }, false, true);
    } catch (err) {
      setError(errorText(err, "Failed to remove the photo"));
    }
  }

  const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500";
  const labelCls = "text-xs text-slate-500 font-semibold block mb-1";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl p-5 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{isNew ? "Add a fill-up" : "Correct fill-up"}</h2>
            {!isNew && <p className="text-xs text-slate-500">Sent by {fill.driverName || "the office"} · {when(fill.createdAt)}{fill.source === "office" ? " · added by the office" : ""}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Truck</label>
            <select className={inputCls} value={form.vehicleId} onChange={set("vehicleId")} required>
              <option value="">Choose…</option>
              {options.vehicles.map(v => <option key={v.id} value={v.id}>{v.registration}</option>)}
              {fill && fill.vehicleId && !options.vehicles.some(v => v.id === fill.vehicleId) && <option value={fill.vehicleId}>{fill.vehicleReg}</option>}
            </select>
          </div>
          <div>
            <label className={labelCls}>Odometer (km)</label>
            <input className={inputCls} inputMode="numeric" value={form.odometerKm} onChange={set("odometerKm")} required />
          </div>
          <div>
            <label className={labelCls}>Truck litres</label>
            <input className={inputCls} inputMode="decimal" value={form.truckLitres} onChange={set("truckLitres")} required />
          </div>
          <div>
            <label className={labelCls}>Price per litre (R)</label>
            <input className={inputCls} inputMode="decimal" value={form.pricePerLitre} onChange={set("pricePerLitre")} required />
          </div>
          <div>
            <label className={labelCls}>Trailer</label>
            <select className={inputCls} value={form.trailerId} onChange={e => setForm(f => ({ ...f, trailerId: e.target.value, trailerLitres: e.target.value ? f.trailerLitres : "" }))}>
              <option value="">No trailer filled</option>
              {options.trailers.map(t => <option key={t.id} value={t.id}>{t.registration}</option>)}
              {fill && fill.trailerId && !options.trailers.some(t => t.id === fill.trailerId) && <option value={fill.trailerId}>{fill.trailerReg}</option>}
            </select>
          </div>
          <div>
            <label className={labelCls}>Trailer litres (tanker pump)</label>
            <input className={inputCls} inputMode="decimal" value={form.trailerLitres ?? ""} onChange={set("trailerLitres")} placeholder="Empty if not filled" disabled={!form.trailerId} />
          </div>
          <div>
            <label className={labelCls}>Filling station</label>
            <input className={inputCls} value={form.stationName} onChange={set("stationName")} required />
          </div>
          <div>
            <label className={labelCls}>Date and time</label>
            <input type="datetime-local" className={inputCls} value={form.filledAt} onChange={set("filledAt")} required />
          </div>
          {isNew && (
            <div>
              <label className={labelCls}>Driver (optional)</label>
              <select className={inputCls} value={form.driverId} onChange={set("driverId")}>
                <option value="">—</option>
                {options.drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer self-end pb-2">
            <input type="checkbox" className="rounded border-slate-300" checked={form.fullTank} onChange={e => setForm(f => ({ ...f, fullTank: e.target.checked }))} />
            Filled to full (counts for km/L)
          </label>

          <div className="sm:col-span-2 text-sm text-slate-600">
            Total: <strong>{Number.isFinite(total) ? money(total) : "—"}</strong>
            <span className="text-slate-400"> (truck + trailer litres × price)</span>
          </div>
          {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
          <div className="sm:col-span-2 flex gap-3">
            <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2 rounded-lg font-semibold text-sm">
              {saving ? "Saving…" : isNew ? "Add fill-up" : "Save correction"}
            </button>
            <button type="button" onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-semibold text-sm">Cancel</button>
          </div>
        </form>

        {!isNew && (
          <>
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Photos</h3>
              {photos.length === 0 && <p className="text-sm text-red-500">No photos were sent with this fill-up.</p>}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photos.map((p, i) => (
                  <div key={p.id} className="relative group">
                    <button onClick={() => onOpenPhotos(photos, i)} className="block w-full aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                      <img src={p.url} alt={p.kind} className="w-full h-full object-cover" />
                    </button>
                    <div className="text-[11px] text-slate-600 mt-0.5 flex justify-between">
                      <span>{PHOTO_LABELS[p.kind] || p.kind}</span>
                      <button onClick={() => removePhoto(p)} className="text-red-500 hover:underline">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <select className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" value={uploadKind} onChange={e => setUploadKind(e.target.value)}>
                  {options.photoKinds.map(k => <option key={k} value={k}>{PHOTO_LABELS[k] || k}</option>)}
                </select>
                <label className={`bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                  {uploading ? "Uploading…" : "+ Add photo"}
                  <input type="file" accept="image/*" className="hidden" onChange={addPhoto} />
                </label>
              </div>
            </div>
            {fill.history?.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-1">Changes</h3>
                <ul className="text-xs text-slate-600 space-y-1">
                  {fill.history.slice().reverse().map((h, i) => (
                    <li key={i}><span className="text-slate-400">{when(h.at)} · {h.by}:</span> {historyLine(h)}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FillsTab({ options }) {
  const [range, setRange] = useState(() => ({ preset: "this_month", ...presetRange("this_month") }));
  const [vehicleId, setVehicleId] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [fills, setFills] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);   // fill, or "new"
  const [viewer, setViewer] = useState(null);

  async function load() {
    if (!range.from || !range.to) return;
    setError("");
    try {
      const params = new URLSearchParams({ from: dayStart(range.from), to: dayEnd(range.to) });
      if (vehicleId) params.set("vehicleId", vehicleId);
      if (showRemoved) params.set("removed", "1");
      const r = await api.get(`/fuel/fills?${params}`, authHeaders());
      setFills(r.data);
    } catch (err) {
      setError(errorText(err, "Failed to load fill-ups"));
    }
  }
  useEffect(() => { load(); }, [range.from, range.to, vehicleId, showRemoved]); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(f) {
    const reason = window.prompt(`Remove the ${f.vehicleReg} fill-up of ${when(f.filledAt)}? It's kept under "Removed" and left out of every figure.\n\nReason (optional):`, "");
    if (reason === null) return;
    try {
      await api.post(`/fuel/fills/${f.id}/remove`, { reason }, authHeaders());
      setEditing(null);
      load();
    } catch (err) {
      setError(errorText(err, "Failed to remove"));
    }
  }
  async function restore(f) {
    try {
      await api.post(`/fuel/fills/${f.id}/restore`, {}, authHeaders());
      load();
    } catch (err) {
      setError(errorText(err, "Failed to put it back"));
    }
  }

  // Photo add/remove keeps the modal open; a field save closes it. Both
  // reload, since one correction can change the km/L of the next fill too.
  function onSaved(_saved, _isNew, keepOpen) {
    if (!keepOpen) setEditing(null);
    load();
  }

  const sums = useMemo(() => (fills || []).reduce((s, f) => ({
    truck: s.truck + f.truckLitres, trailer: s.trailer + (f.trailerLitres || 0), cost: s.cost + f.totalCost,
  }), { truck: 0, trailer: 0, cost: 0 }), [fills]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <RangePicker range={range} setRange={setRange} />
        <select className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
          <option value="">All trucks</option>
          {options.vehicles.map(v => <option key={v.id} value={v.id}>{v.registration}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" className="rounded border-slate-300" checked={showRemoved} onChange={e => setShowRemoved(e.target.checked)} />
          Show removed
        </label>
        <button onClick={() => setEditing("new")} className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">+ Add fill-up</button>
      </div>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {fills && !showRemoved && fills.length > 0 && (
        <p className="text-sm text-slate-600 mb-2">
          {fills.length} fill-up{fills.length === 1 ? "" : "s"} · Trucks <strong>{litres(sums.truck)}</strong>
          {sums.trailer > 0 && <> · Trailers <strong>{litres(sums.trailer)}</strong></>} · <strong>{money(sums.cost)}</strong>
        </p>
      )}
      {/* The server sends at most 1 000 (take: 1000 in fuelRoutes.js GET /fills) */}
      {fills?.length >= 1000 && (
        <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 mb-2">
          Showing the latest 1 000 fill-ups only — choose fewer dates or one truck to see the rest. The Reports tab always counts all of them.
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Truck</th>
              <th className="text-right px-3 py-2">Odometer</th>
              <th className="text-right px-3 py-2">km since last</th>
              <th className="text-right px-3 py-2">Truck litres</th>
              <th className="text-right px-3 py-2">km/L</th>
              <th className="text-left px-3 py-2">Trailer</th>
              <th className="text-right px-3 py-2">Price/L</th>
              <th className="text-right px-3 py-2">Total</th>
              <th className="text-left px-3 py-2">Station</th>
              <th className="text-left px-3 py-2">Driver</th>
              <th className="text-left px-3 py-2">Photos</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {fills === null && <tr><td colSpan={13} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>}
            {fills?.length === 0 && <tr><td colSpan={13} className="px-3 py-6 text-center text-slate-400">{showRemoved ? "Nothing removed in this period." : "No fill-ups in this period."}</td></tr>}
            {fills?.map(f => (
              <tr key={f.id} className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${f.deletedAt ? "opacity-60" : ""}`} onClick={() => !f.deletedAt && setEditing(f)}>
                <td className="px-3 py-2 whitespace-nowrap">{when(f.filledAt)}{f.history?.some(h => h.action === "corrected") && <span title="Corrected by the office" className="ml-1 text-amber-600">✎</span>}</td>
                <td className="px-3 py-2 font-semibold whitespace-nowrap">{f.vehicleReg}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{f.odometerKm.toLocaleString("en-ZA")}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{f.kmSinceLast != null ? f.kmSinceLast.toLocaleString("en-ZA") : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{litres(f.truckLitres)}{!f.fullTank && <div className="text-[11px] text-amber-600">part fill</div>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{f.kmPerLitre != null ? f.kmPerLitre.toFixed(2) : <span className="text-slate-300 font-normal">—</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{f.trailerReg ? <>{f.trailerReg}{f.trailerLitres ? <span className="text-slate-500"> · {litres(f.trailerLitres)}</span> : null}</> : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">R{f.pricePerLitre.toFixed(2)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">{money(f.totalCost)}</td>
                <td className="px-3 py-2">{f.stationName}</td>
                <td className="px-3 py-2 whitespace-nowrap">{f.driverName || <span className="text-slate-400">Office</span>}</td>
                <td className="px-3 py-2"><Thumbs photos={f.photos} onOpen={(p, i) => setViewer({ photos: p, index: i })} /></td>
                <td className="px-3 py-2 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                  {f.deletedAt
                    ? <><span className="text-xs text-slate-500 mr-2">Removed by {f.deletedByName}</span><button onClick={() => restore(f)} className="text-blue-600 hover:underline text-xs font-semibold">Put back</button></>
                    : <><button onClick={() => setEditing(f)} className="text-blue-600 hover:underline text-xs font-semibold mr-3">Correct</button><button onClick={() => remove(f)} className="text-red-600 hover:underline text-xs font-semibold">Remove</button></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        km/L is worked out from one full fill to the next full fill of the same truck. A part fill shows “—”; its litres count towards the next full fill. Trailer (tanker pump) diesel never counts towards the truck.
      </p>

      {editing && (
        <FillModal
          fill={editing === "new" ? null : editing}
          options={options}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onOpenPhotos={(p, i) => setViewer({ photos: p, index: i })}
        />
      )}
      {viewer && <PhotoViewer photos={viewer.photos} index={viewer.index} onClose={() => setViewer(null)} />}
    </div>
  );
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Per-truck overview for the chosen range, built to stay compact at 500+
// trucks: one thin row per truck with small in-cell bars (litres, cost,
// km/L), sortable by any column, a search box, and the top rows first with
// "Show all" opening a scrolling list. Each bar column is one measure, so
// one colour and no legend — the column header names it.
const BAR = "#2a78d6";
const TOP_ROWS = 15;

function sumByTruck(rows) {
  const trucks = new Map();
  for (const r of rows) {
    const key = r.vehicleId || r.vehicleReg;
    const t = trucks.get(key) || { key, reg: r.vehicleReg, fills: 0, truckLitres: 0, trailerLitres: 0, truckCost: 0, trailerCost: 0, km: 0, segmentKm: 0, segmentLitres: 0, segmentCost: 0 };
    for (const f of ["fills", "truckLitres", "trailerLitres", "truckCost", "trailerCost", "km", "segmentKm", "segmentLitres", "segmentCost"]) t[f] += r[f] || 0;
    trucks.set(key, t);
  }
  return [...trucks.values()].map(t => ({
    ...t,
    kmPerLitre: t.segmentKm > 0 && t.segmentLitres > 0 ? t.segmentKm / t.segmentLitres : null,
    costPerKm: t.segmentKm > 0 ? t.segmentCost / t.segmentKm : null,
  }));
}

// Small bar + value in one cell. The value text stays in the text colour;
// the bar only carries the size. `mark` draws the fleet-average tick.
function BarCell({ value, max, text, mark }) {
  return (
    <td className="px-2 py-0.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 h-2.5 min-w-[60px]">
          {value > 0 && <div className="absolute inset-y-0 left-0 rounded-r-sm" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: BAR }} />}
          {mark != null && <div className="absolute -top-0.5 -bottom-0.5 border-l border-dashed border-slate-500" style={{ left: `${(mark / max) * 100}%` }} />}
        </div>
        <span className="w-[4.75rem] text-right tabular-nums whitespace-nowrap">{text}</span>
      </div>
    </td>
  );
}

const SORTS = {
  reg:         { label: "Truck", get: t => t.reg, asc: true },
  truckLitres: { label: "Litres", get: t => t.truckLitres },
  truckCost:   { label: "Cost", get: t => t.truckCost },
  kmPerLitre:  { label: "km/L", get: t => t.kmPerLitre },
  costPerKm:   { label: "Cost/km", get: t => t.costPerKm },
  km:          { label: "km", get: t => t.km },
  fills:       { label: "Fills", get: t => t.fills },
};

function TruckOverview({ report }) {
  const [sort, setSort] = useState({ key: "truckCost", desc: true });
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const trucks = useMemo(() => sumByTruck(report.rows), [report]);
  const all = useMemo(() => sumByTruck(report.rows.map(r => ({ ...r, vehicleId: "all", vehicleReg: "all" })))[0], [report]);

  const sorted = useMemo(() => {
    const { get } = SORTS[sort.key];
    const needle = q.trim().toLowerCase();
    return trucks
      .filter(t => !needle || t.reg.toLowerCase().includes(needle))
      .sort((a, b) => {
        const va = get(a), vb = get(b);
        if (va == null && vb == null) return a.reg.localeCompare(b.reg);
        if (va == null) return 1;           // no figure yet → always last
        if (vb == null) return -1;
        const c = typeof va === "string" ? va.localeCompare(vb) : va - vb;
        return (sort.desc ? -c : c) || a.reg.localeCompare(b.reg);
      });
  }, [trucks, sort, q]);
  if (!trucks.length) return null;

  // reduce, not Math.max(...arr) — spreading 500+ values is fine, but this
  // keeps working for any fleet size.
  const top = (f) => trucks.reduce((m, t) => Math.max(m, f(t) || 0), 0) || 1;
  const max = {
    truckLitres: top(t => t.truckLitres),
    truckCost: top(t => t.truckCost),
    kmPerLitre: Math.max(top(t => t.kmPerLitre), all.kmPerLitre || 0),
  };
  const shown = showAll || q ? sorted : sorted.slice(0, TOP_ROWS);
  const clickSort = (key) => setSort(s => s.key === key ? { key, desc: !s.desc } : { key, desc: !SORTS[key].asc });
  const th = (k, className = "") => (
    <th key={k} className={`px-2 py-1.5 font-semibold cursor-pointer select-none whitespace-nowrap hover:text-slate-700 ${className}`} onClick={() => clickSort(k)}>
      {SORTS[k].label}{sort.key === k ? (sort.desc ? " ▾" : " ▴") : ""}
    </th>
  );
  const tiles = [
    ["Trucks", trucks.length.toLocaleString("en-ZA")],
    ["Truck diesel", litres(Math.round(all.truckLitres))],
    ["Truck cost", money(all.truckCost)],
    ["Fleet km/L", all.kmPerLitre != null ? all.kmPerLitre.toFixed(2) : "—"],
    ["Cost/km", all.costPerKm != null ? `R${all.costPerKm.toFixed(2)}` : "—"],
    ["Trailer pump diesel", all.trailerLitres ? `${litres(Math.round(all.trailerLitres))} · ${money(all.trailerCost)}` : "—"],
  ];

  return (
    <div className="mb-5">
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
        {tiles.map(([k, v]) => (
          <div key={k} className="bg-white rounded-lg border border-slate-200 px-3 py-1.5">
            <div className="text-[11px] text-slate-500">{k}</div>
            <div className="text-sm font-bold text-slate-800 whitespace-nowrap truncate" title={v}>{v}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800 text-sm">Per truck</h3>
          <span className="text-xs text-slate-500">Click a column to sort · dashed tick = fleet km/L</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find truck…"
            className="ml-auto border border-slate-300 rounded-md px-2 py-1 text-xs w-36" />
        </div>
        <div className={showAll && !q ? "max-h-[28rem] overflow-y-auto" : ""}>
          <table className="w-full text-xs text-slate-700">
            <thead className="text-slate-500 text-[11px] uppercase bg-slate-50 sticky top-0 z-10">
              <tr>
                {th("reg", "text-left w-28")}
                {th("truckLitres", "text-left")}
                {th("truckCost", "text-left")}
                {th("kmPerLitre", "text-left")}
                {th("costPerKm", "text-right")}
                {th("km", "text-right")}
                {th("fills", "text-right")}
              </tr>
            </thead>
            <tbody>
              {shown.map(t => (
                <tr key={t.key} className="border-t border-slate-100 hover:bg-slate-50"
                  title={t.trailerLitres ? `Trailer pump: ${litres(t.trailerLitres)} · ${money(t.trailerCost)}` : undefined}>
                  <td className="px-2 py-0.5 font-semibold whitespace-nowrap">{t.reg}</td>
                  <BarCell value={t.truckLitres} max={max.truckLitres} text={litres(Math.round(t.truckLitres))} />
                  <BarCell value={t.truckCost} max={max.truckCost} text={`R${Math.round(t.truckCost).toLocaleString("en-ZA")}`} />
                  <BarCell value={t.kmPerLitre || 0} max={max.kmPerLitre} mark={all.kmPerLitre}
                    text={t.kmPerLitre != null ? t.kmPerLitre.toFixed(2) : <span className="text-slate-400">—</span>} />
                  <td className="px-2 py-0.5 text-right tabular-nums whitespace-nowrap">{t.costPerKm != null ? `R${t.costPerKm.toFixed(2)}` : "—"}</td>
                  <td className="px-2 py-0.5 text-right tabular-nums whitespace-nowrap">{t.km ? t.km.toLocaleString("en-ZA") : "—"}</td>
                  <td className="px-2 py-0.5 text-right tabular-nums">{t.fills}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={7} className="px-2 py-3 text-center text-slate-400">No truck matches “{q}”.</td></tr>}
            </tbody>
          </table>
        </div>
        {!q && sorted.length > TOP_ROWS && (
          <button onClick={() => setShowAll(s => !s)} className="w-full border-t border-slate-200 py-1.5 text-xs font-semibold text-blue-600 hover:bg-slate-50">
            {showAll ? `Show top ${TOP_ROWS} only` : `Show all ${sorted.length} trucks`}
          </button>
        )}
      </div>
    </div>
  );
}

function ReportsTab() {
  const [group, setGroup] = useState("month");
  const [range, setRange] = useState(() => ({ preset: "3_months", ...presetRange("3_months") }));
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  // Which period folds are open; unset = the default (open only for a small fleet)
  const [openPeriods, setOpenPeriods] = useState({});

  useEffect(() => {
    if (!range.from || !range.to) return;
    setError(""); setReport(null); setOpenPeriods({});
    const params = new URLSearchParams({ group, from: dayStart(range.from), to: dayEnd(range.to) });
    api.get(`/fuel/report?${params}`, authHeaders())
      .then(r => setReport(r.data))
      .catch(err => setError(errorText(err, "Failed to load the report")));
  }, [group, range.from, range.to]);

  const label = group === "month" ? monthLabel : weekLabel;
  const byPeriod = useMemo(() => {
    if (!report) return [];
    return report.totals.map(t => ({ total: t, rows: report.rows.filter(r => r.period === t.period) }));
  }, [report]);

  function downloadCsv() {
    const head = ["Period", "Truck", "Fill-ups", "Truck litres", "km", "km/L", "Truck cost (R)", "Cost per km (R)", "Trailer litres", "Trailer cost (R)", "Total cost (R)"];
    const line = (r, truck) => [label(r.period), truck, r.fills, r.truckLitres, r.km, r.kmPerLitre ?? "", r.truckCost.toFixed(2), r.costPerKm ?? "", r.trailerLitres, r.trailerCost.toFixed(2), r.totalCost.toFixed(2)];
    const lines = [head];
    for (const { total, rows } of byPeriod) {
      for (const r of rows) lines.push(line(r, r.vehicleReg));
      lines.push(line(total, "ALL TRUCKS"));
    }
    const blob = new Blob([lines.map(l => l.map(csvCell).join(",")).join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fuel-${group}-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const Row = ({ r, truck, bold }) => (
    <tr className={`border-t border-slate-100 ${bold ? "bg-slate-50 font-semibold" : ""}`}>
      <td className="px-3 py-1 whitespace-nowrap">{truck}</td>
      <td className="px-3 py-1 text-right">{r.fills}</td>
      <td className="px-3 py-1 text-right whitespace-nowrap">{litres(r.truckLitres)}</td>
      <td className="px-3 py-1 text-right whitespace-nowrap">{r.km ? km(r.km) : "—"}</td>
      <td className="px-3 py-1 text-right whitespace-nowrap">{r.kmPerLitre != null ? r.kmPerLitre.toFixed(2) : "—"}</td>
      <td className="px-3 py-1 text-right whitespace-nowrap">{money(r.truckCost)}</td>
      <td className="px-3 py-1 text-right whitespace-nowrap">{r.costPerKm != null ? `R${r.costPerKm.toFixed(2)}` : "—"}</td>
      <td className="px-3 py-1 text-right whitespace-nowrap border-l border-slate-100">{r.trailerLitres ? litres(r.trailerLitres) : "—"}</td>
      <td className="px-3 py-1 text-right whitespace-nowrap">{r.trailerCost ? money(r.trailerCost) : "—"}</td>
      <td className="px-3 py-1 text-right whitespace-nowrap border-l border-slate-100">{money(r.totalCost)}</td>
    </tr>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          {[["week", "Weekly"], ["month", "Monthly"]].map(([k, l]) => (
            <button key={k} onClick={() => setGroup(k)} className={`px-4 py-1.5 font-semibold ${group === k ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{l}</button>
          ))}
        </div>
        <RangePicker range={range} setRange={setRange} />
        <button onClick={downloadCsv} disabled={!byPeriod.length} className="ml-auto bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-sm font-semibold px-4 py-2 rounded-lg">Download CSV</button>
      </div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {!report && !error && <p className="text-sm text-slate-400">Loading…</p>}
      {report && byPeriod.length === 0 && <p className="text-sm text-slate-400">No fill-ups in this period.</p>}
      {report && byPeriod.length > 0 && <TruckOverview report={report} />}

      {/* One fold per period — open by default only while the fleet is small,
          so 500 trucks don't turn every month into 500 rows on screen. */}
      <div className="space-y-2">
        {byPeriod.map(({ total, rows }) => {
          const isOpen = openPeriods[total.period] ?? rows.length <= TOP_ROWS;
          return (
          <details key={`${group}-${total.period}`} open={isOpen}
            onToggle={e => { const o = e.currentTarget.open; if (o !== isOpen) setOpenPeriods(p => ({ ...p, [total.period]: o })); }}
            className="group bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <summary className="px-4 py-2 flex flex-wrap items-baseline gap-x-4 cursor-pointer select-none list-none hover:bg-slate-50">
              <span className="text-slate-400 text-xs group-open:rotate-90 transition-transform">▶</span>
              <h3 className="font-semibold text-slate-800 text-sm">{label(total.period)}</h3>
              <span className="text-xs text-slate-500">{rows.length} truck{rows.length === 1 ? "" : "s"} · {money(total.totalCost)} · {litres(Math.round(total.truckLitres + total.trailerLitres))}{total.kmPerLitre != null && <> · fleet {total.kmPerLitre.toFixed(2)} km/L</>}</span>
            </summary>
            {/* Rows are only drawn while open, so a closed month costs nothing */}
            {isOpen && <table className="w-full text-xs border-t border-slate-200">
              <thead className="text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-1">Truck</th>
                  <th className="text-right px-3 py-1">Fill-ups</th>
                  <th className="text-right px-3 py-1">Truck litres</th>
                  <th className="text-right px-3 py-1">km</th>
                  <th className="text-right px-3 py-1">km/L</th>
                  <th className="text-right px-3 py-1">Truck cost</th>
                  <th className="text-right px-3 py-1">Cost/km</th>
                  <th className="text-right px-3 py-1 border-l border-slate-100">Trailer litres</th>
                  <th className="text-right px-3 py-1">Trailer cost</th>
                  <th className="text-right px-3 py-1 border-l border-slate-100">Total cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => <Row key={r.vehicleReg} r={r} truck={r.vehicleReg} />)}
                {rows.length > 1 && <Row r={total} truck="All trucks" bold />}
              </tbody>
            </table>}
          </details>
          );
        })}
      </div>
      {report && byPeriod.length > 0 && (
        <p className="text-xs text-slate-400 mt-3">
          km = odometer distance between this truck's fill-ups in the period. km/L = tank-to-tank stretches (full fill to full fill) that ended in the period.
          Cost/km uses the same full-to-full stretches (so a truck's first fill, burnt before it was recorded, doesn't count) and truck diesel only. Trailer litres are tanker-pump diesel, shown apart and not counted in the truck's km/L or cost/km.
        </p>
      )}
    </div>
  );
}

export default function Fuel() {
  const [tab, setTab] = useState("fills");
  const [options, setOptions] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/fuel/options", authHeaders())
      .then(r => setOptions(r.data))
      .catch(err => setError(errorText(err, "Failed to load Fuel")));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">Fuel</h1>
      <p className="text-sm text-slate-500 mb-4">Diesel fill-ups sent by drivers from the app, with slip, odometer and pump photos.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {options && (
        <>
          <div className="flex gap-1 border-b border-slate-200 mb-4">
            {[["fills", "Fill-ups"], ["reports", "Reports"]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 whitespace-nowrap ${tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === "fills" && <FillsTab options={options} />}
          {tab === "reports" && <ReportsTab />}
        </>
      )}
    </div>
  );
}
