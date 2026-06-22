import { useEffect, useRef, useState } from "react";

/**
 * FleetPro marketing landing page — styled to match the live FleetPro app
 * (dark slate UI, blue = en route to load, green = en route to dropoff /
 * delivered, amber = in progress).
 *
 * Drop into: Fleetpro-web/client/src/pages/LandingPage.jsx
 * Route "/" to this component, move the existing login screen to "/login".
 */

const COLORS = {
  bg: "#0B0F17",
  panel: "#121826",
  panelAlt: "#0E1420",
  text: "#E7EAF0",
  textMuted: "#8B95A7",
  blue: "#2E6CB8",
  blueLight: "#5B9BD9",
  green: "#1FAE6E",
  amber: "#E8B339",
  red: "#E5484D",
  line: "rgba(255,255,255,0.08)",
  lineStrong: "rgba(255,255,255,0.14)",
};

const FONT_IMPORT_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";

function useOnScreen(ref) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return visible;
}

function Reveal({ children, delay = 0, as: Tag = "div", style = {} }) {
  const ref = useRef(null);
  const visible = useOnScreen(ref);
  return (
    <Tag
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(14px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/* ---------- Signature element: phase strip, mirrors the real GPS engine ---------- */
function PhaseStrip() {
  const stages = [
    { key: "to_load", label: "en route to loading", color: COLORS.blue },
    { key: "at_load", label: "arrived at loading", color: COLORS.blue },
    { key: "to_drop", label: "en route to dropoff", color: COLORS.green },
    { key: "at_drop", label: "delivered", color: COLORS.green },
  ];
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % stages.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", width: "100%", maxWidth: 560 }}>
      {stages.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i === stages.length - 1 ? "0 0 auto" : 1 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div
              style={{
                width: 11,
                height: 11,
                borderRadius: "50%",
                background: i <= active ? s.color : "transparent",
                border: `1.5px solid ${i <= active ? s.color : COLORS.line}`,
                boxShadow: i <= active ? `0 0 0 3px ${s.color}22` : "none",
                transition: "background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.02em",
                color: i <= active ? COLORS.text : COLORS.textMuted,
                whiteSpace: "nowrap",
              }}
            >
              {s.label}
            </span>
          </div>
          {i < stages.length - 1 && (
            <div
              style={{
                flex: 1,
                height: 1.5,
                background: i < active ? s.color : COLORS.line,
                transition: "background 0.6s ease",
                marginBottom: 19,
                minWidth: 24,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Hero route map, echoes the real live map's route colours ---------- */
function HeroRoute() {
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 10,
        padding: "24px 20px 18px",
      }}
    >
      <svg
        viewBox="0 0 640 230"
        width="100%"
        height="auto"
        style={{ display: "block" }}
        role="img"
        aria-label="Stylised route line from a loading point to a dropoff point, coloured blue then green"
      >
        <path
          d="M 40 190 C 140 190, 160 80, 260 80 S 420 35, 480 35 S 600 70, 600 105"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="3"
          strokeDasharray="1 10"
          strokeLinecap="round"
        />
        <path d="M 40 190 C 140 190, 160 80, 260 80" fill="none" stroke={COLORS.blue} strokeWidth="3" strokeLinecap="round" />
        <path d="M 260 80 S 420 35, 480 35 S 600 70, 600 105" fill="none" stroke={COLORS.green} strokeWidth="3" strokeLinecap="round" />
        <circle cx="40" cy="190" r="6" fill={COLORS.blueLight} />
        <text x="40" y="210" fontFamily="JetBrains Mono, monospace" fontSize="11" fill={COLORS.textMuted} textAnchor="middle">
          load
        </text>
        <circle cx="600" cy="105" r="6" fill={COLORS.green} />
        <text x="600" y="125" fontFamily="JetBrains Mono, monospace" fontSize="11" fill={COLORS.textMuted} textAnchor="middle">
          dropoff
        </text>
        <circle cx="260" cy="80" r="5" fill={COLORS.amber} stroke={COLORS.panel} strokeWidth="2">
          <animate attributeName="r" values="5;7;5" dur="2.4s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}

function Eyebrow({ children }) {
  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        letterSpacing: "0.08em",
        color: COLORS.blueLight,
        textTransform: "uppercase",
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: COLORS.line, width: "100%" }} />;
}

function Pill({ color, children }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        padding: "3px 9px",
        borderRadius: 5,
        background: `${color}1F`,
        color: color,
        border: `1px solid ${color}55`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export default function LandingPage({ onLogin, onSignup, onContact }) {
  const [formState, setFormState] = useState({ name: "", company: "", email: "", phone: "", fleetSize: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onContact) onContact(formState);
    setSubmitted(true);
  };

  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'Inter', sans-serif" }}>
      <link rel="stylesheet" href={FONT_IMPORT_URL} />
      <style>{`
        * { box-sizing: border-box; }
        .fp-link { color: ${COLORS.text}; text-decoration: none; }
        .fp-btn {
          font-family: 'Inter', sans-serif;
          font-weight: 500;
          font-size: 14px;
          padding: 11px 22px;
          border-radius: 7px;
          cursor: pointer;
          border: 1px solid ${COLORS.lineStrong};
          background: transparent;
          color: ${COLORS.text};
          transition: background 0.18s ease, border-color 0.18s ease;
        }
        .fp-btn:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.22); }
        .fp-btn-solid {
          border-color: ${COLORS.blue};
          background: ${COLORS.blue};
          color: #fff;
        }
        .fp-btn-solid:hover { background: #366FB0; border-color: #366FB0; }
        .fp-btn-green {
          border-color: ${COLORS.green};
          background: ${COLORS.green};
          color: #fff;
        }
        .fp-btn-green:hover { background: #18995F; border-color: #18995F; }
        .fp-input {
          width: 100%;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          padding: 11px 13px;
          border: 1px solid ${COLORS.line};
          border-radius: 7px;
          background: ${COLORS.panelAlt};
          color: ${COLORS.text};
        }
        .fp-input::placeholder { color: ${COLORS.textMuted}; }
        .fp-input:focus { outline: 2px solid ${COLORS.blue}; outline-offset: 1px; }
        .fp-nav-link:hover { color: ${COLORS.blueLight}; }
        .fp-card { background: ${COLORS.panel}; border: 1px solid ${COLORS.line}; border-radius: 10px; }
        @media (max-width: 760px) {
          .fp-hero-grid { grid-template-columns: 1fr !important; }
          .fp-feature-grid { grid-template-columns: 1fr !important; }
          .fp-pricing-grid { grid-template-columns: 1fr !important; }
          .fp-form-grid { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>

      {/* ---------- NAV ---------- */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(11,15,23,0.9)",
          backdropFilter: "blur(6px)",
          borderBottom: `1px solid ${COLORS.line}`,
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <a href="#top" className="fp-link" style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.01em" }}>
            FleetPro
          </a>
          <nav style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <a href="#how" className="fp-link fp-nav-link" style={{ fontSize: 14 }}>
              How it works
            </a>
            <a href="#pricing" className="fp-link fp-nav-link" style={{ fontSize: 14 }}>
              Pricing
            </a>
            <a href="#contact" className="fp-link fp-nav-link" style={{ fontSize: 14 }}>
              Contact
            </a>
            <button className="fp-btn" onClick={onLogin} style={{ padding: "9px 18px" }}>
              Log in
            </button>
          </nav>
        </div>
      </header>

      {/* ---------- HERO ---------- */}
      <section id="top" style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 24px 56px" }}>
        <div className="fp-hero-grid" style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 48, alignItems: "center" }}>
          <Reveal>
            <Eyebrow>Fleet management, built in South Africa</Eyebrow>
            <h1
              style={{
                fontWeight: 700,
                fontSize: "clamp(32px, 4.6vw, 50px)",
                lineHeight: 1.12,
                margin: "0 0 22px",
                letterSpacing: "-0.015em",
              }}
            >
              Know where every load is, without calling the driver.
            </h1>
            <p style={{ fontSize: 16.5, lineHeight: 1.65, color: COLORS.textMuted, maxWidth: 480, margin: "0 0 32px" }}>
              FleetPro tracks your trucks live, moves tasks from loading to delivery
              automatically, and gives your clients proof of delivery the moment it
              happens — no extra steps for your drivers, no spreadsheets for you.
            </p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <button className="fp-btn fp-btn-solid" onClick={onSignup}>
                Get a demo
              </button>
              <a href="#how">
                <button className="fp-btn">See how it works</button>
              </a>
            </div>
          </Reveal>
          <Reveal delay={150}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
              <HeroRoute />
              <PhaseStrip />
            </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* ---------- HOW IT WORKS ---------- */}
      <section id="how" style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 24px" }}>
        <Reveal>
          <Eyebrow>How it works</Eyebrow>
          <h2 style={{ fontWeight: 600, fontSize: 28, margin: "0 0 40px", maxWidth: 560, letterSpacing: "-0.01em" }}>
            A task moves itself from "loading" to "delivered" — your controller
            never has to chase an update.
          </h2>
        </Reveal>

        <div className="fp-feature-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
          {[
            { label: "assign", color: COLORS.textMuted, title: "Create the task", body: "Pick a driver, a vehicle, a load point and a dropoff. Takes under a minute." },
            { label: "accept", color: COLORS.amber, title: "Driver accepts on the app", body: "One tap on their phone — name and phone number, no password to forget." },
            { label: "en route", color: COLORS.blue, title: "GPS does the rest", body: "The route line turns from blue to green automatically as the truck moves from load to dropoff. No driver input needed." },
            { label: "delivered", color: COLORS.green, title: "Proof of delivery, instantly", body: "Photos upload from the road. Your client sees them the moment the task is marked complete." },
          ].map((step, i) => (
            <Reveal key={step.label} delay={i * 90}>
              <div
                style={{
                  padding: "0 20px 0 0",
                  borderLeft: i === 0 ? "none" : `1px solid ${COLORS.line}`,
                  paddingLeft: i === 0 ? 0 : 20,
                  height: "100%",
                }}
              >
                <div style={{ marginBottom: 12 }}>
                  <Pill color={step.color}>{step.label}</Pill>
                </div>
                <h3 style={{ fontWeight: 600, fontSize: 17, margin: "0 0 10px" }}>{step.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: COLORS.textMuted, margin: 0 }}>{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <Divider />

      {/* ---------- FEATURES ---------- */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 24px" }}>
        <Reveal>
          <Eyebrow>What's included</Eyebrow>
          <h2 style={{ fontWeight: 600, fontSize: 28, margin: "0 0 36px", maxWidth: 560, letterSpacing: "-0.01em" }}>
            Everything a controller, a driver, and a client each need to see — and
            nothing they don't.
          </h2>
        </Reveal>

        {[
          { tag: "live map", title: "Live vehicle tracking", body: "Every truck's position, refreshed continuously, with route lines colour-coded by phase so you can tell at a glance who's heading to load and who's heading to drop." },
          { tag: "kanban", title: "A task board that updates itself", body: "Unassigned, to do, in progress, completed — tasks move across the board in real time across every browser your team has open, no refresh required." },
          { tag: "pod", title: "Proof of delivery photos", body: "Drivers capture photos and notes on delivery. They're available to your client portal within seconds, stored securely off your main database." },
          { tag: "roles", title: "Built for who's actually using it", body: "Admins and controllers get full access and an audit trail of who changed what. Clients see only their own loads. Drivers get one screen and one job." },
          { tag: "alerts", title: "Push notifications that reach the right driver", body: "New tasks and updates land on the driver's phone the moment they're assigned — not five minutes later, and never on someone else's phone." },
        ].map((row, i) => (
          <Reveal key={row.tag} delay={i * 60}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "110px 1fr",
                gap: 24,
                padding: "22px 0",
                borderTop: `1px solid ${COLORS.line}`,
                alignItems: "baseline",
              }}
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  color: COLORS.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {row.tag}
              </span>
              <div>
                <h3 style={{ fontWeight: 600, fontSize: 18, margin: "0 0 6px" }}>{row.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.65, color: COLORS.textMuted, margin: 0, maxWidth: 620 }}>{row.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
        <Divider />
      </section>

      {/* ---------- PRICING ---------- */}
      <section id="pricing" style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 24px" }}>
        <Reveal>
          <Eyebrow>Pricing</Eyebrow>
          <h2 style={{ fontWeight: 600, fontSize: 28, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
            Priced around the size of your fleet.
          </h2>
          <p style={{ fontSize: 15, color: COLORS.textMuted, margin: "0 0 32px", maxWidth: 560 }}>
            Every fleet is different — number of vehicles, routes, and how many
            client portals you need all factor in. Tell us about your operation and
            we'll put together a quote that fits.
          </p>
        </Reveal>

        <Reveal>
          <div
            className="fp-card"
            style={{
              padding: "40px 32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 24,
            }}
          >
            <div>
              <h3 style={{ fontWeight: 600, fontSize: 20, margin: "0 0 8px" }}>Get a quote for your fleet</h3>
              <p style={{ fontSize: 14, color: COLORS.textMuted, margin: 0, maxWidth: 440 }}>
                Live tracking, the task board, the driver app, and client portal access —
                we'll confirm what's included and the price once we know your fleet size.
              </p>
            </div>
            <a href="#contact">
              <button className="fp-btn fp-btn-solid" style={{ whiteSpace: "nowrap" }}>
                Contact us for pricing
              </button>
            </a>
          </div>
        </Reveal>
      </section>

      <Divider />

      {/* ---------- CONTACT ---------- */}
      <section id="contact" style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 24px" }}>
        <div className="fp-hero-grid" style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 48 }}>
          <Reveal>
            <Eyebrow>Talk to us</Eyebrow>
            <h2 style={{ fontWeight: 600, fontSize: 28, margin: "0 0 16px", maxWidth: 420, letterSpacing: "-0.01em" }}>
              We'll call you back and walk through your fleet, not send you a brochure.
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: COLORS.textMuted, maxWidth: 420 }}>
              Tell us roughly how many vehicles you run and where you're based, and
              we'll get back to you within a business day.
            </p>
          </Reveal>

          <Reveal delay={120}>
            {submitted ? (
              <div className="fp-card" style={{ padding: 32, textAlign: "center" }}>
                <p style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Thanks — got it.</p>
                <p style={{ fontSize: 14, color: COLORS.textMuted, margin: 0 }}>We'll be in touch within one business day.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="fp-card" style={{ padding: 24 }}>
                <div className="fp-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <input className="fp-input" placeholder="Your name" required value={formState.name} onChange={(e) => setFormState({ ...formState, name: e.target.value })} />
                  <input className="fp-input" placeholder="Company name" required value={formState.company} onChange={(e) => setFormState({ ...formState, company: e.target.value })} />
                </div>
                <div className="fp-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <input className="fp-input" type="email" placeholder="Email address" required value={formState.email} onChange={(e) => setFormState({ ...formState, email: e.target.value })} />
                  <input className="fp-input" type="tel" placeholder="Phone number" required value={formState.phone} onChange={(e) => setFormState({ ...formState, phone: e.target.value })} />
                </div>
                <input
                  className="fp-input"
                  placeholder="Roughly how many vehicles?"
                  style={{ marginBottom: 14 }}
                  value={formState.fleetSize}
                  onChange={(e) => setFormState({ ...formState, fleetSize: e.target.value })}
                />
                <textarea
                  className="fp-input"
                  placeholder="Anything else we should know?"
                  rows={3}
                  style={{ marginBottom: 18, resize: "vertical", fontFamily: "'Inter', sans-serif" }}
                  value={formState.message}
                  onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                />
                <button type="submit" className="fp-btn fp-btn-green" style={{ width: "100%" }}>
                  Send
                </button>
              </form>
            )}
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* ---------- FOOTER ---------- */}
      <footer style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px 48px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>FleetPro</span>
          <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>
            © {new Date().getFullYear()} FleetPro. All rights reserved. Registered in South Africa.
          </span>
          <div style={{ display: "flex", gap: 18 }}>
            <a href="#" className="fp-link fp-nav-link" style={{ fontSize: 12.5 }}>Privacy</a>
            <a href="#" className="fp-link fp-nav-link" style={{ fontSize: 12.5 }}>Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
