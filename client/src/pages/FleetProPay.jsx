import React, { useEffect, useMemo, useState } from "react";
import api from "../api";

// FleetProPay — driver spend cards. Every rule (who can see this, who can
// change limits, whether the company has it at all) is enforced by
// /api/pay on the server; this page only hides buttons the server would
// refuse anyway, based on /pay/access.
//
// Drivers open their card by tapping Pay in the app (60 seconds, any
// purchase within the limits); the category they pick only labels the
// payment. So the office side here is about limits, figures and slips.

function authHeaders() {
  const token = localStorage.getItem("fleetpro_token") || "";
  return { headers: { Authorization: `Bearer ${token}` } };
}

const money = (n) => Number(n || 0).toLocaleString("en-ZA", { style: "currency", currency: "ZAR" });
const moneyShort = (n) => (n >= 1000 ? `R${Math.round(n / 1000)}k` : `R${Math.round(n)}`);
const when = (d) => new Date(d).toLocaleString("en-ZA", {
  timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});
const monthLabel = (key) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString("en-ZA", { month: "short", year: "numeric" });

// Same colour per category everywhere on the page (chips, bars, legend).
const CATEGORY_COLORS = {
  toll: "#3b82f6", diesel: "#10b981", petrol: "#14b8a6", oil: "#78716c", truck_stop: "#f59e0b", other: "#8b5cf6",
};

const STATUS_STYLES = {
  not_connected: { label: "Not connected", cls: "bg-slate-100 text-slate-600" },
  active:        { label: "Active",        cls: "bg-green-100 text-green-700" },
  frozen:        { label: "Frozen",        cls: "bg-blue-100 text-blue-700" },
  cancelled:     { label: "Cancelled",     cls: "bg-red-100 text-red-700" },
};

const DECLINE_REASONS = {
  card_locked:        "Card locked (driver didn't tap Pay)",
  daily_limit:        "Daily limit reached",
  monthly_limit:      "Monthly limit reached",
  card_frozen:        "Card frozen",
  card_cancelled:     "Card cancelled",
  card_not_connected: "Card not connected",
  invalid_amount:     "Invalid amount",
};

const AUDIT_ACTIONS = {
  card_created:       "Card added",
  card_assigned:      "Card assigned",
  card_reassigned:    "Card reassigned",
  card_unassigned:    "Card unassigned",
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

function CategoryChip({ category, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 whitespace-nowrap">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[category] || "#94a3b8" }} />
      {label || category}
    </span>
  );
}

function errorText(err, fallback) {
  return err.response?.data?.error || fallback;
}

// ── Dashboard tab ────────────────────────────────────────────────────────────
function StatTile({ label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: accent }}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function DashboardTab({ categories }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [driverPeriod, setDriverPeriod] = useState("month");
  const catLabel = useMemo(() => Object.fromEntries(categories.map(c => [c.key, c.label])), [categories]);

  useEffect(() => {
    api.get("/pay/stats", authHeaders())
      .then(r => setStats(r.data))
      .catch(err => setError(errorText(err, "Failed to load spend figures")));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!stats) return <p className="text-sm text-slate-400">Loading…</p>;

  const catMax = Math.max(1, ...stats.byCategoryMonth.map(c => c.amount));
  const trendMax = Math.max(1, ...stats.trend.map(t => t.total));
  const drivers = [...stats.drivers].sort((a, b) => b[driverPeriod] - a[driverPeriod]);
  const driverMax = Math.max(1, ...drivers.map(d => d[driverPeriod]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Spent today" value={money(stats.totals.today)} accent="#0f172a" />
        <StatTile label="Spent this week" value={money(stats.totals.week)} sub="Since Monday" accent="#0f172a" />
        <StatTile label="Spent this month" value={money(stats.totals.month)} sub={`${stats.totals.monthCount} payment${stats.totals.monthCount === 1 ? "" : "s"}`} accent="#d97706" />
        <StatTile label="Cards" value={stats.cards.total}
          sub={`${stats.cards.active} active · ${stats.cards.frozen} frozen${stats.cards.notConnected ? ` · ${stats.cards.notConnected} not connected` : ""}`} accent="#2563eb" />
      </div>
      {stats.slipsMissingThisMonth > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-2">
          <strong>{stats.slipsMissingThisMonth}</strong> payment{stats.slipsMissingThisMonth === 1 ? "" : "s"} this month without a slip photo — see "Pay taps & slips".
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Spend by category — this month</h3>
          <div className="space-y-2">
            {stats.byCategoryMonth.map(c => (
              <div key={c.category} className="flex items-center gap-3 text-sm">
                <div className="w-24 shrink-0"><CategoryChip category={c.category} label={catLabel[c.category]} /></div>
                <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${(c.amount / catMax) * 100}%`, background: CATEGORY_COLORS[c.category] }} />
                </div>
                <div className="w-28 text-right text-slate-600 text-xs">{money(c.amount)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Monthly spend — last 6 months</h3>
          <div className="flex flex-wrap gap-3 mb-3">
            {categories.map(c => <CategoryChip key={c.key} category={c.key} label={c.label} />)}
          </div>
          <div className="flex items-end gap-3 h-48">
            {stats.trend.map(t => (
              <div key={t.month} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="text-[10px] text-slate-500 mb-1 whitespace-nowrap">{t.total > 0 ? moneyShort(t.total) : ""}</div>
                <div className="w-full max-w-[48px] flex flex-col-reverse rounded overflow-hidden" style={{ height: `${(t.total / trendMax) * 100}%` }}
                  title={`${monthLabel(t.month)}: ${money(t.total)}`}>
                  {categories.map(c => t.byCategory[c.key] > 0 && (
                    <div key={c.key} style={{ height: `${(t.byCategory[c.key] / t.total) * 100}%`, background: CATEGORY_COLORS[c.key] }} />
                  ))}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 whitespace-nowrap">{monthLabel(t.month)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Spend per driver</h3>
          <div className="flex gap-1">
            {[["today", "Today"], ["week", "This week"], ["month", "This month"]].map(([key, label]) => (
              <button key={key} onClick={() => setDriverPeriod(key)}
                className={`text-xs px-3 py-1 rounded-full ${driverPeriod === key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {drivers.length === 0 ? (
          <p className="text-sm text-slate-400">No payments this month yet.</p>
        ) : (
          <div className="space-y-2">
            {drivers.map(d => (
              <div key={d.driverId || d.driverName} className="flex items-center gap-3 text-sm">
                <div className="w-40 shrink-0 truncate text-slate-700">{d.driverName}</div>
                <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                  <div className="h-full bg-blue-500 rounded" style={{ width: `${(d[driverPeriod] / driverMax) * 100}%` }} />
                </div>
                <div className="w-28 text-right text-xs text-slate-600">{money(d[driverPeriod])}</div>
                <div className="w-28 text-right text-xs">
                  {d.slipsMissing > 0
                    ? <span className="text-amber-700 font-semibold">{d.slipsMissing} slip{d.slipsMissing === 1 ? "" : "s"} missing</span>
                    : <span className="text-slate-400">{d.count} payment{d.count === 1 ? "" : "s"}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────
// Cards are created by the company in its own online banking, added here, and
// assigned to drivers — unassigned when a driver leaves, then given to the
// next one. A driver holds at most one card at a time.

function cardName(card) {
  const digits = card.last4 ? `•••• ${card.last4}` : "";
  return [card.label, digits].filter(Boolean).join(" ") || "Card";
}

const UNASSIGN_REASONS = {
  manual: "unassigned",
  reassigned: "reassigned",
  driver_deleted: "driver deleted",
  card_cancelled: "card cancelled",
};

// Add a card, or edit its name and limits.
function CardFormModal({ card, drivers, onClose, onSaved }) {
  const editing = !!card;
  const [label, setLabel] = useState(editing ? card.label || "" : "");
  const [last4, setLast4] = useState("");
  const [driverId, setDriverId] = useState("");
  const [dailyLimit, setDailyLimit] = useState(editing ? String(card.dailyLimit) : "");
  const [monthlyLimit, setMonthlyLimit] = useState(editing && card.monthlyLimit != null ? String(card.monthlyLimit) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!editing && !label.trim() && !last4.trim()) { setError("Give the card a name or its last 4 digits."); return; }
    if (!editing && last4.trim() && !/^\d{4}$/.test(last4.trim())) { setError("Last 4 digits must be exactly 4 numbers."); return; }
    if (!dailyLimit.trim()) { setError("Enter a daily limit."); return; }
    setSaving(true);
    try {
      const monthly = monthlyLimit.trim() === "" ? null : monthlyLimit;
      if (editing) {
        await api.patch(`/pay/cards/${card.id}`, { label, dailyLimit, monthlyLimit: monthly }, authHeaders());
      } else {
        await api.post("/pay/cards", { label, last4: last4.trim(), dailyLimit, monthlyLimit: monthly, driverId: driverId || undefined }, authHeaders());
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
      <form onSubmit={save} className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
        <h2 className="text-lg font-bold text-slate-800">{editing ? `Edit ${cardName(card)}` : "Add a card"}</h2>
        {!editing && (
          <p className="text-xs text-slate-500">
            Create the virtual card in your online banking first, then add it here with the same name and its last 4 digits.
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className={editing ? "col-span-3" : "col-span-2"}>
            <label className="text-xs text-slate-500 font-semibold block mb-1">Card name</label>
            <input className={inputCls} placeholder="e.g. Card 3 or KUDU 01" value={label} onChange={e => setLabel(e.target.value)} />
          </div>
          {!editing && (
            <div>
              <label className="text-xs text-slate-500 font-semibold block mb-1">Last 4 digits</label>
              <input className={inputCls} inputMode="numeric" maxLength={4} placeholder="4321" value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, ""))} />
            </div>
          )}
        </div>

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

        {!editing && (
          <div>
            <label className="text-xs text-slate-500 font-semibold block mb-1">Assign to (optional)</label>
            <select className={inputCls} value={driverId} onChange={e => setDriverId(e.target.value)}>
              <option value="">Leave unassigned for now</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.phone}</option>)}
            </select>
          </div>
        )}

        <p className="text-[11px] text-slate-400">
          The card stays locked until its driver taps Pay in the app. It then accepts any purchase for 60 seconds, up to these limits.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2 rounded-lg font-semibold text-sm">
            {saving ? "Saving…" : editing ? "Save" : "Add card"}
          </button>
          <button type="button" onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-semibold text-sm">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// Assign / reassign a card, with who has had it before.
function AssignModal({ card, drivers, canManage, onClose, onSaved }) {
  const [driverId, setDriverId] = useState("");
  const [history, setHistory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/pay/cards/${card.id}/assignments`, authHeaders())
      .then(r => setHistory(r.data))
      .catch(() => setHistory([]));
  }, [card.id]);

  async function save(e) {
    e.preventDefault();
    if (!driverId) { setError("Choose a driver."); return; }
    setSaving(true);
    setError("");
    try {
      await api.post(`/pay/cards/${card.id}/assign`, { driverId }, authHeaders());
      onSaved();
    } catch (err) {
      setError(errorText(err, "Failed to assign card"));
    } finally {
      setSaving(false);
    }
  }

  const day = (d) => new Date(d).toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", year: "numeric" });
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <form onSubmit={save} className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
        <h2 className="text-lg font-bold text-slate-800">{cardName(card)}</h2>
        <p className="text-sm text-slate-600">
          {card.driver ? <>Assigned to <strong>{card.driver.name}</strong></> : "Not assigned to anyone"}
        </p>

        {canManage && card.status !== "cancelled" && (
          <div>
            <label className="text-xs text-slate-500 font-semibold block mb-1">{card.driver ? "Reassign to" : "Assign to"}</label>
            {drivers.length === 0 ? (
              <p className="text-sm text-slate-500">Every driver already has a card. Unassign one first.</p>
            ) : (
              <select className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" value={driverId} onChange={e => setDriverId(e.target.value)}>
                <option value="">Choose a driver…</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.phone}</option>)}
              </select>
            )}
            {card.driver && <p className="text-[11px] text-slate-400 mt-1">{card.driver.name} loses the card straight away.</p>}
          </div>
        )}

        <div>
          <div className="text-xs text-slate-500 font-semibold mb-1">Who has had this card</div>
          {history === null ? <p className="text-xs text-slate-400">Loading…</p>
            : history.length === 0 ? <p className="text-xs text-slate-400">Nobody yet.</p>
            : (
              <ul className="text-xs text-slate-600 space-y-1 max-h-40 overflow-y-auto">
                {history.map(h => (
                  <li key={h.id}>
                    <span className="font-medium text-slate-800">{h.driverName}</span>
                    {" · "}{day(h.assignedAt)} – {h.unassignedAt ? `${day(h.unassignedAt)} (${UNASSIGN_REASONS[h.unassignReason] || h.unassignReason})` : "now"}
                  </li>
                ))}
              </ul>
            )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-1">
          {canManage && card.status !== "cancelled" && drivers.length > 0 && (
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2 rounded-lg font-semibold text-sm">
              {saving ? "Saving…" : card.driver ? "Reassign" : "Assign"}
            </button>
          )}
          <button type="button" onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-semibold text-sm">
            Close
          </button>
        </div>
      </form>
    </div>
  );
}

function CardsTab({ access }) {
  const [cards, setCards] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);     // null | { card?: card }
  const [assigning, setAssigning] = useState(null);

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

  async function act(card, action) {
    const name = cardName(card);
    if (action === "cancel" && !window.confirm(`Cancel ${name}? Only do this if the card was cancelled in your online banking too. It can't be undone.`)) return;
    if (action === "freeze" && !window.confirm(`Freeze ${name}? All payments will be declined until it's unfrozen.`)) return;
    if (action === "unassign" && !window.confirm(`Take ${name} away from ${card.driver?.name}? They won't be able to pay with it any more.`)) return;
    setError("");
    try {
      await api.post(`/pay/cards/${card.id}/${action}`, {}, authHeaders());
      load();
    } catch (err) {
      setError(errorText(err, `Failed to ${action} card`));
    }
  }

  const unassignedCount = cards.filter(c => !c.driver).length;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-sm text-slate-500">
          {cards.length} card{cards.length === 1 ? "" : "s"}{unassignedCount > 0 && ` · ${unassignedCount} unassigned`}
        </p>
        {access.canManage && (
          <button onClick={() => setForm({})} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            + Add card
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Card</th>
              <th className="text-left px-4 py-3">Assigned to</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Today</th>
              <th className="text-left px-4 py-3">This week</th>
              <th className="text-left px-4 py-3">This month</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : cards.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No cards yet. Create one in your online banking, then add it here.</td></tr>
            ) : cards.map(card => (
              <tr key={card.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800 whitespace-nowrap">{card.label || "Card"}</div>
                  <div className="text-xs text-slate-400">{card.last4 ? `•••• ${card.last4}` : ""}</div>
                </td>
                <td className="px-4 py-3">
                  {card.driver ? (
                    <div>
                      <div className="text-slate-800">{card.driver.name}</div>
                      <div className="text-xs text-slate-400">{card.driver.phone}</div>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3"><StatusBadge card={card} /></td>
                <td className="px-4 py-3"><SpendBar spent={card.spentToday} limit={card.dailyLimit} /></td>
                <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{money(card.spentThisWeek)}</td>
                <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                  {money(card.spentThisMonth)}
                  {card.monthlyLimit != null && <span className="text-slate-400"> of {money(card.monthlyLimit)}</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                  <button onClick={() => setAssigning(card)} className="text-blue-600 hover:underline text-xs font-semibold">
                    {!access.canManage ? "History" : card.driver ? "Reassign" : "Assign"}
                  </button>
                  {access.canManage && (
                    <>
                      {card.driver && <button onClick={() => act(card, "unassign")} className="text-amber-700 hover:underline text-xs font-semibold">Unassign</button>}
                      <button onClick={() => setForm({ card })} className="text-blue-600 hover:underline text-xs font-semibold">Limits</button>
                      {card.status === "frozen" ? (
                        <button onClick={() => act(card, "unfreeze")} className="text-green-700 hover:underline text-xs font-semibold">Unfreeze</button>
                      ) : (
                        <button onClick={() => act(card, "freeze")} className="text-blue-700 hover:underline text-xs font-semibold">Freeze</button>
                      )}
                      <button onClick={() => act(card, "cancel")} className="text-red-600 hover:underline text-xs font-semibold">Cancel</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <CardFormModal card={form.card} drivers={drivers} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />
      )}
      {assigning && (
        <AssignModal card={assigning} drivers={drivers} canManage={access.canManage}
          onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); load(); }} />
      )}
    </div>
  );
}

// Driver list for the filter dropdowns — every current driver of the company.
// (Not taken from the cards: a driver whose card was reassigned still has
// payments to look up.)
function useCardDrivers() {
  const [drivers, setDrivers] = useState([]);
  useEffect(() => {
    api.get("/drivers", authHeaders()).then(r => {
      const list = Array.isArray(r.data) ? r.data : [];
      setDrivers(list.map(d => [d.id, d.name]).sort((a, b) => a[1].localeCompare(b[1])));
    }).catch(() => {});
  }, []);
  return drivers;
}

// Whole days in South African time, whatever timezone this browser is in.
function dateParams(params, from, to) {
  if (from) params.set("from", `${from}T00:00:00+02:00`);
  if (to) params.set("to", `${to}T23:59:59.999+02:00`);
}

// ── Payments tab ─────────────────────────────────────────────────────────────
function PaymentsTab({ categories }) {
  const [rows, setRows] = useState([]);
  const drivers = useCardDrivers();
  const [filters, setFilters] = useState({ driverId: "", category: "", status: "", from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const catLabel = useMemo(() => Object.fromEntries(categories.map(c => [c.key, c.label])), [categories]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (filters.driverId) params.set("driverId", filters.driverId);
    if (filters.category) params.set("category", filters.category);
    if (filters.status) params.set("status", filters.status);
    dateParams(params, filters.from, filters.to);
    setLoading(true);
    api.get(`/pay/transactions?${params}`, authHeaders())
      .then(r => { if (!cancelled) { setRows(r.data); setError(""); } })
      .catch(err => { if (!cancelled) setError(errorText(err, "Failed to load payments")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters]);

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
              <th className="text-left px-4 py-3">Slip</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">No payments yet.</td></tr>
            ) : rows.map(t => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-2 whitespace-nowrap text-slate-600">{when(t.occurredAt)}</td>
                <td className="px-4 py-2">{t.driverName}</td>
                <td className="px-4 py-2 text-slate-600">{t.vehicle?.registration || "—"}</td>
                <td className="px-4 py-2">
                  {t.merchantName}
                  {t.merchantCity && <span className="text-xs text-slate-400"> · {t.merchantCity}</span>}
                </td>
                <td className="px-4 py-2"><CategoryChip category={t.category} label={catLabel[t.category]} /></td>
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
                <td className="px-4 py-2 text-xs">
                  {t.session?.slipPhotoUrl
                    ? <a href={t.session.slipPhotoUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View</a>
                    : t.status === "approved" ? <span className="text-amber-700 font-semibold">Missing</span> : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pay taps & slips tab ─────────────────────────────────────────────────────
// Every time a driver opened their card, and whether the slip came in.
function SessionsTab({ categories }) {
  const [rows, setRows] = useState([]);
  const drivers = useCardDrivers();
  const [filters, setFilters] = useState({ driverId: "", slip: "", from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const catLabel = useMemo(() => Object.fromEntries(categories.map(c => [c.key, c.label])), [categories]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (filters.driverId) params.set("driverId", filters.driverId);
    if (filters.slip) params.set("slip", filters.slip);
    dateParams(params, filters.from, filters.to);
    setLoading(true);
    api.get(`/pay/sessions?${params}`, authHeaders())
      .then(r => { if (!cancelled) { setRows(r.data); setError(""); } })
      .catch(err => { if (!cancelled) setError(errorText(err, "Failed to load pay taps")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters]);

  const set = (key) => (e) => setFilters(f => ({ ...f, [key]: e.target.value }));
  const selCls = "border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white";

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <select className={selCls} value={filters.driverId} onChange={set("driverId")}>
          <option value="">All drivers</option>
          {drivers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className={selCls} value={filters.slip} onChange={set("slip")}>
          <option value="">All taps</option>
          <option value="missing">Paid, slip missing</option>
          <option value="has">With slip</option>
        </select>
        <input type="date" className={selCls} value={filters.from} onChange={set("from")} title="From" />
        <input type="date" className={selCls} value={filters.to} onChange={set("to")} title="To" />
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Tapped Pay</th>
              <th className="text-left px-4 py-3">Driver</th>
              <th className="text-left px-4 py-3">For</th>
              <th className="text-left px-4 py-3">Payment</th>
              <th className="text-left px-4 py-3">Slip</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No pay taps yet.</td></tr>
            ) : rows.map(s => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-4 py-2 whitespace-nowrap text-slate-600">{when(s.openedAt)}</td>
                <td className="px-4 py-2">{s.driverName}</td>
                <td className="px-4 py-2"><CategoryChip category={s.category} label={catLabel[s.category]} /></td>
                <td className="px-4 py-2 text-xs">
                  {s.transaction ? (
                    <span className={s.transaction.status === "approved" ? "text-slate-800" : "text-red-600"}>
                      {money(s.transaction.amount)} · {s.transaction.merchantName}
                      {s.transaction.status !== "approved" && ` (${s.transaction.status})`}
                    </span>
                  ) : <span className="text-slate-400">No payment came through</span>}
                </td>
                <td className="px-4 py-2 text-xs">
                  {s.slipPhotoUrl ? (
                    <a href={s.slipPhotoUrl} target="_blank" rel="noreferrer">
                      <img src={s.slipPhotoUrl} alt="Slip" className="h-10 w-10 object-cover rounded border border-slate-200" />
                    </a>
                  ) : s.transaction?.status === "approved"
                    ? <span className="text-amber-700 font-semibold">Missing</span>
                    : <span className="text-slate-300">—</span>}
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

  const nameByCard = useMemo(() => Object.fromEntries(cards.map(c => [c.id, cardName(c)])), [cards]);
  const detail = (r) => {
    const c = r.changes || {};
    if (r.action === "limits_changed" && c.before && c.after) {
      const part = (label, a, b) => (a === b ? null : `${label} ${a == null ? "none" : money(a)} → ${b == null ? "none" : money(b)}`);
      return [part("daily", c.before.dailyLimit, c.after.dailyLimit), part("monthly", c.before.monthlyLimit, c.after.monthlyLimit)].filter(Boolean).join(", ");
    }
    if (r.action === "card_created") return `daily ${money(c.dailyLimit)}${c.monthlyLimit != null ? `, monthly ${money(c.monthlyLimit)}` : ""}`;
    if (r.action === "card_assigned") return `to ${c.driver}`;
    if (r.action === "card_reassigned") return `${c.from} → ${c.driver}`;
    if (r.action === "card_unassigned") return `from ${c.driver || "driver"}${c.reason === "driver_deleted" ? " (driver deleted)" : ""}`;
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
            {r.cardId && nameByCard[r.cardId] && <span className="text-slate-600">· {nameByCard[r.cardId]}</span>}
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
  const [tab, setTab] = useState("dashboard");

  useEffect(() => {
    Promise.all([api.get("/pay/access", authHeaders()), api.get("/pay/categories", authHeaders())])
      .then(([a, c]) => { setAccess(a.data); setCategories(c.data); })
      .catch(err => setError(errorText(err, "Failed to load FleetProPay")));
  }, []);

  const tabs = [["dashboard", "Dashboard"], ["cards", "Cards"], ["payments", "Payments"], ["sessions", "Pay taps & slips"], ["history", "History"]];
  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-slate-800">FleetProPay</h1>
      <p className="text-sm text-slate-500 mb-4">Driver cards for tolls, fuel, oil and truck stops — paid by tapping their phone.</p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {access && (
        <>
          {access.provider === "none" && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 mb-4">
              <strong>Your bank isn't connected yet.</strong> You can set up cards and limits now, but no card can pay until it is.
            </div>
          )}
          <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto overflow-y-hidden">
            {tabs.map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 whitespace-nowrap ${tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === "dashboard" && <DashboardTab categories={categories} />}
          {tab === "cards" && <CardsTab access={access} />}
          {tab === "payments" && <PaymentsTab categories={categories} />}
          {tab === "sessions" && <SessionsTab categories={categories} />}
          {tab === "history" && <HistoryTab />}
        </>
      )}
    </div>
  );
}
