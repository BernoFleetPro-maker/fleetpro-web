import React, { useEffect, useMemo, useState } from "react";
import api from "../api";

// FleetProPay — driver spend cards. Every rule (who can see this, who can
// change limits, whether the company has it at all) is enforced by
// /api/pay on the server; this page only hides buttons the server would
// refuse anyway, based on /pay/access.

function authHeaders() {
  const token = localStorage.getItem("fleetpro_token") || "";
  return { headers: { Authorization: `Bearer ${token}` } };
}

const money = (n) => Number(n || 0).toLocaleString("en-ZA", { style: "currency", currency: "ZAR" });
const when = (d) => new Date(d).toLocaleString("en-ZA", {
  timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});

const STATUS_STYLES = {
  not_connected: { label: "Not connected", cls: "bg-slate-100 text-slate-600" },
  active:        { label: "Active",        cls: "bg-green-100 text-green-700" },
  frozen:        { label: "Frozen",        cls: "bg-blue-100 text-blue-700" },
  cancelled:     { label: "Cancelled",     cls: "bg-red-100 text-red-700" },
};

const DECLINE_REASONS = {
  daily_limit:          "Daily limit reached",
  monthly_limit:        "Monthly limit reached",
  category_daily_limit: "Category daily limit reached",
  category_blocked:     "Category not allowed",
  card_frozen:          "Card frozen",
  card_cancelled:       "Card cancelled",
  card_not_connected:   "Card not connected",
  invalid_amount:       "Invalid amount",
};

const AUDIT_ACTIONS = {
  card_created:       "Card created",
  limits_changed:     "Limits changed",
  categories_changed: "Categories changed",
  card_frozen:        "Card frozen",
  card_unfrozen:      "Card unfrozen",
  card_cancelled:     "Card cancelled",
  provider_changed:   "Bank login changed",
};

function StatusBadge({ card }) {
  const s = STATUS_STYLES[card.status] || { label: card.status, cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>
      {s.label}{card.status === "frozen" && card.frozenReason === "driver_deleted" ? " (driver deleted)" : ""}
    </span>
  );
}

function SpendBar({ spent, limit }) {
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  const color = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-green-500";
  return (
    <div>
      <div className="text-xs text-slate-600 mb-1 whitespace-nowrap">{money(spent)} <span className="text-slate-400">of {money(limit)}</span></div>
      <div className="h-1.5 w-32 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function errorText(err, fallback) {
  return err.response?.data?.error || fallback;
}

// ── Create / edit card form ──────────────────────────────────────────────────
function CardFormModal({ categories, card, drivers, onClose, onSaved }) {
  const editing = !!card;
  const [driverId, setDriverId] = useState("");
  const [dailyLimit, setDailyLimit] = useState(editing ? String(card.dailyLimit) : "");
  const [monthlyLimit, setMonthlyLimit] = useState(editing && card.monthlyLimit != null ? String(card.monthlyLimit) : "");
  const [cats, setCats] = useState(() => Object.fromEntries(categories.map(c => {
    const row = card?.categoryLimits.find(l => l.category === c.key);
    return [c.key, {
      enabled: row ? row.enabled : c.defaultEnabled,
      dailyLimit: row?.dailyLimit != null ? String(row.dailyLimit) : "",
    }];
  })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setCat = (key, patch) => setCats(c => ({ ...c, [key]: { ...c[key], ...patch } }));
  const categoryPayload = () => Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, {
    enabled: v.enabled, dailyLimit: v.dailyLimit.trim() === "" ? null : v.dailyLimit,
  }]));

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!editing && !driverId) { setError("Choose a driver."); return; }
    if (!dailyLimit.trim()) { setError("Enter a daily limit."); return; }
    setSaving(true);
    try {
      const monthly = monthlyLimit.trim() === "" ? null : monthlyLimit;
      if (editing) {
        await api.patch(`/pay/cards/${card.id}`, { dailyLimit, monthlyLimit: monthly }, authHeaders());
        await api.put(`/pay/cards/${card.id}/categories`, categoryPayload(), authHeaders());
      } else {
        await api.post("/pay/cards", { driverId, dailyLimit, monthlyLimit: monthly, categories: categoryPayload() }, authHeaders());
      }
      onSaved();
    } catch (err) {
      setError(errorText(err, "Failed to save card"));
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500";
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <form onSubmit={save} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <h2 className="text-lg font-bold text-slate-800">
          {editing ? `Limits for ${card.driver?.name || "driver"}` : "Give a driver a card"}
        </h2>

        {!editing && (
          <div>
            <label className="text-xs text-slate-500 font-semibold block mb-1">Driver</label>
            {drivers.length === 0 ? (
              <p className="text-sm text-slate-500">Every driver already has a card.</p>
            ) : (
              <select className={inputCls} value={driverId} onChange={e => setDriverId(e.target.value)}>
                <option value="">Choose a driver…</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.phone}</option>)}
              </select>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 font-semibold block mb-1">Daily limit (R)</label>
            <input className={inputCls} inputMode="decimal" placeholder="e.g. 2000" value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-semibold block mb-1">Monthly limit (R)</label>
            <input className={inputCls} inputMode="decimal" placeholder="No monthly limit" value={monthlyLimit} onChange={e => setMonthlyLimit(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 font-semibold block mb-1">What the card can pay for</label>
          <p className="text-[11px] text-slate-400 mb-2">A category's own limit is optional — leave it blank and only the daily limit above applies.</p>
          <div className="space-y-2">
            {categories.map(c => (
              <div key={c.key} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 flex-1 cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-300" checked={cats[c.key].enabled}
                    onChange={e => setCat(c.key, { enabled: e.target.checked })} />
                  {c.label}
                </label>
                <input className="w-28 border border-slate-300 rounded-lg px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                  inputMode="decimal" placeholder="Own limit" disabled={!cats[c.key].enabled}
                  value={cats[c.key].dailyLimit} onChange={e => setCat(c.key, { dailyLimit: e.target.value })} />
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving || (!editing && drivers.length === 0)}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2 rounded-lg font-semibold text-sm">
            {saving ? "Saving…" : editing ? "Save limits" : "Create card"}
          </button>
          <button type="button" onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-semibold text-sm">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Cards tab ────────────────────────────────────────────────────────────────
function CardsTab({ access, categories }) {
  const [cards, setCards] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null); // null | { card?: card }
  const catLabel = useMemo(() => Object.fromEntries(categories.map(c => [c.key, c.label])), [categories]);

  async function load() {
    setError("");
    try {
      const [c, d] = await Promise.all([
        api.get("/pay/cards", authHeaders()),
        access.canManage ? api.get("/pay/drivers-without-card", authHeaders()) : Promise.resolve({ data: [] }),
      ]);
      setCards(c.data);
      setDrivers(d.data);
    } catch (err) {
      setError(errorText(err, "Failed to load cards"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function changeStatus(card, action) {
    const name = card.driver?.name || "this driver";
    if (action === "cancel" && !window.confirm(`Cancel ${name}'s card? This can't be undone — they'd need a new card.`)) return;
    if (action === "freeze" && !window.confirm(`Freeze ${name}'s card? All payments will be declined until it's unfrozen.`)) return;
    setError("");
    try {
      await api.post(`/pay/cards/${card.id}/${action}`, {}, authHeaders());
      load();
    } catch (err) {
      setError(errorText(err, `Failed to ${action} card`));
    }
  }

  return (
    <div>
      {access.canManage && (
        <div className="flex justify-end mb-3">
          <button onClick={() => setForm({})} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            + Give a driver a card
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Driver</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Today</th>
              <th className="text-left px-4 py-3">This month</th>
              <th className="text-left px-4 py-3">Allowed</th>
              {access.canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : cards.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No cards yet.</td></tr>
            ) : cards.map(card => (
              <tr key={card.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{card.driver?.name}</div>
                  <div className="text-xs text-slate-400">{card.last4 ? `•••• ${card.last4}` : card.driver?.phone}</div>
                </td>
                <td className="px-4 py-3"><StatusBadge card={card} /></td>
                <td className="px-4 py-3"><SpendBar spent={card.spentToday} limit={card.dailyLimit} /></td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {money(card.spentThisMonth)}
                  {card.monthlyLimit != null && <span className="text-slate-400"> of {money(card.monthlyLimit)}</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 max-w-xs">
                    {card.categoryLimits.filter(c => c.enabled).map(c => (
                      <span key={c.category} className="bg-slate-100 text-slate-600 text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap">
                        {catLabel[c.category] || c.category}{c.dailyLimit != null ? ` · ${money(c.dailyLimit)}` : ""}
                      </span>
                    ))}
                  </div>
                </td>
                {access.canManage && (
                  <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                    <button onClick={() => setForm({ card })} className="text-blue-600 hover:underline text-xs font-semibold">Limits</button>
                    {card.status === "frozen" ? (
                      <button onClick={() => changeStatus(card, "unfreeze")} className="text-green-700 hover:underline text-xs font-semibold">Unfreeze</button>
                    ) : (
                      <button onClick={() => changeStatus(card, "freeze")} className="text-blue-700 hover:underline text-xs font-semibold">Freeze</button>
                    )}
                    <button onClick={() => changeStatus(card, "cancel")} className="text-red-600 hover:underline text-xs font-semibold">Cancel</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <CardFormModal
          categories={categories}
          card={form.card}
          drivers={drivers}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Payments tab ─────────────────────────────────────────────────────────────
function PaymentsTab({ categories }) {
  const [rows, setRows] = useState([]);
  const [cards, setCards] = useState([]);
  const [filters, setFilters] = useState({ driverId: "", category: "", status: "", from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const catLabel = useMemo(() => Object.fromEntries(categories.map(c => [c.key, c.label])), [categories]);

  useEffect(() => {
    api.get("/pay/cards?includeCancelled=1", authHeaders()).then(r => setCards(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (filters.driverId) params.set("driverId", filters.driverId);
    if (filters.category) params.set("category", filters.category);
    if (filters.status) params.set("status", filters.status);
    // Whole days in South African time, whatever timezone this browser is in.
    if (filters.from) params.set("from", `${filters.from}T00:00:00+02:00`);
    if (filters.to) params.set("to", `${filters.to}T23:59:59.999+02:00`);
    setLoading(true);
    api.get(`/pay/transactions?${params}`, authHeaders())
      .then(r => { if (!cancelled) { setRows(r.data); setError(""); } })
      .catch(err => { if (!cancelled) setError(errorText(err, "Failed to load payments")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters]);

  const drivers = useMemo(() => {
    const seen = new Map();
    for (const c of cards) if (c.driver) seen.set(c.driver.id, c.driver.name);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cards]);
  const approvedTotal = rows.filter(r => r.status === "approved").reduce((s, r) => s + r.amount, 0);
  const set = (key) => (e) => setFilters(f => ({ ...f, [key]: e.target.value }));
  const selCls = "border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white";

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <select className={selCls} value={filters.driverId} onChange={set("driverId")}>
          <option value="">All drivers</option>
          {drivers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className={selCls} value={filters.category} onChange={set("category")}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select className={selCls} value={filters.status} onChange={set("status")}>
          <option value="">Approved and declined</option>
          <option value="approved">Approved only</option>
          <option value="declined">Declined only</option>
        </select>
        <input type="date" className={selCls} value={filters.from} onChange={set("from")} title="From" />
        <input type="date" className={selCls} value={filters.to} onChange={set("to")} title="To" />
        <div className="ml-auto text-sm text-slate-600">Approved total: <strong>{money(approvedTotal)}</strong></div>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">When</th>
              <th className="text-left px-4 py-3">Driver</th>
              <th className="text-left px-4 py-3">Vehicle</th>
              <th className="text-left px-4 py-3">Shop</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-right px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Result</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No payments yet.</td></tr>
            ) : rows.map(t => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-2 whitespace-nowrap text-slate-600">{when(t.occurredAt)}</td>
                <td className="px-4 py-2">{t.driverName}</td>
                <td className="px-4 py-2 text-slate-600">{t.vehicle?.registration || "—"}</td>
                <td className="px-4 py-2">
                  {t.merchantName}
                  {t.merchantCity && <span className="text-xs text-slate-400"> · {t.merchantCity}</span>}
                  {t.slipPhotoUrl && <a href={t.slipPhotoUrl} target="_blank" rel="noreferrer" className="ml-2 text-xs text-blue-600 hover:underline">slip</a>}
                </td>
                <td className="px-4 py-2 text-slate-600">{catLabel[t.category] || t.category}</td>
                <td className={`px-4 py-2 text-right font-medium ${t.status === "approved" ? "text-slate-800" : "text-slate-400 line-through"}`}>{money(t.amount)}</td>
                <td className="px-4 py-2">
                  {t.status === "approved" ? (
                    <span className="text-xs font-semibold text-green-700">Approved</span>
                  ) : t.status === "reversed" ? (
                    <span className="text-xs font-semibold text-slate-500">Reversed</span>
                  ) : (
                    <span className="text-xs font-semibold text-red-600">Declined — {DECLINE_REASONS[t.declineReason] || t.declineReason || "unknown"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── History tab ──────────────────────────────────────────────────────────────
function HistoryTab() {
  const [rows, setRows] = useState([]);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/pay/audit", authHeaders()), api.get("/pay/cards?includeCancelled=1", authHeaders())])
      .then(([a, c]) => { setRows(a.data); setCards(c.data); })
      .catch(err => setError(errorText(err, "Failed to load history")));
  }, []);

  const driverByCard = useMemo(() => Object.fromEntries(cards.map(c => [c.id, c.driver?.name])), [cards]);
  const detail = (r) => {
    const c = r.changes || {};
    if (r.action === "limits_changed" && c.before && c.after) {
      const part = (label, a, b) => (a === b ? null : `${label} ${a == null ? "none" : money(a)} → ${b == null ? "none" : money(b)}`);
      return [part("daily", c.before.dailyLimit, c.after.dailyLimit), part("monthly", c.before.monthlyLimit, c.after.monthlyLimit)].filter(Boolean).join(", ");
    }
    if (r.action === "card_created") return `daily ${money(c.dailyLimit)}${c.monthlyLimit != null ? `, monthly ${money(c.monthlyLimit)}` : ""}`;
    if (c.reason === "driver_deleted") return "driver was deleted";
    return "";
  };

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {rows.length === 0 && !error && <p className="px-4 py-6 text-center text-sm text-slate-400">Nothing yet.</p>}
        {rows.map(r => (
          <div key={r.id} className="px-4 py-3 text-sm flex flex-wrap gap-x-3">
            <span className="text-slate-400 whitespace-nowrap">{when(r.createdAt)}</span>
            <span className="font-medium text-slate-800">{AUDIT_ACTIONS[r.action] || r.action}</span>
            {r.cardId && driverByCard[r.cardId] && <span className="text-slate-600">· {driverByCard[r.cardId]}</span>}
            {detail(r) && <span className="text-slate-500">· {detail(r)}</span>}
            <span className="text-slate-400 ml-auto">{r.actorType === "system" ? "Automatic" : r.actorName || r.actorType}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FleetProPay() {
  const [access, setAccess] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("cards");

  useEffect(() => {
    Promise.all([api.get("/pay/access", authHeaders()), api.get("/pay/categories", authHeaders())])
      .then(([a, c]) => { setAccess(a.data); setCategories(c.data); })
      .catch(err => setError(errorText(err, "Failed to load FleetProPay")));
  }, []);

  const tabs = [["cards", "Cards"], ["payments", "Payments"], ["history", "History"]];
  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-slate-800">FleetProPay</h1>
      <p className="text-sm text-slate-500 mb-4">Driver cards for tolls, truck stops, oil and parts — paid by tapping their phone.</p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {access && (
        <>
          {access.provider === "none" && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 mb-4">
              <strong>Your bank isn't connected yet.</strong> You can set up cards and limits now, but no card can pay until it is.
            </div>
          )}
          <div className="flex gap-1 border-b border-slate-200 mb-4">
            {tabs.map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === "cards" && <CardsTab access={access} categories={categories} />}
          {tab === "payments" && <PaymentsTab categories={categories} />}
          {tab === "history" && <HistoryTab />}
        </>
      )}
    </div>
  );
}
