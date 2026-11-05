const COLORS = {
  bg: "#0B0F17",
  panel: "#121826",
  text: "#E7EAF0",
  textMuted: "#8B95A7",
  blue: "#2E6CB8",
  blueLight: "#5B9BD9",
  green: "#1FAE6E",
  line: "rgba(255,255,255,0.08)",
};

const FONT_IMPORT_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.bernostrubing.fleetprodriverapp";

// Real https:// landing page for a driver invite — exists because WhatsApp
// (and most chat apps) won't turn a custom-scheme link like
// fleetprodriver://invite/<token> into something tappable, but will always
// linkify a normal https link.
//
// It deliberately does NOT open the app by itself: the office also sends
// this link to get drivers onto the latest version, and jumping straight
// into an old installed app skipped the Play Store. So the page shows two
// steps — 1. install/update on Google Play, 2. open the app, which hands it
// the invite (App.tsx's Linking handler).
export default function InviteRedirectPage({ token }) {
  const appLink = `fleetprodriver://invite/${token}`;

  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>
      <link rel="stylesheet" href={FONT_IMPORT_URL} />
      <style>{`
        * { box-sizing: border-box; }
        .fp-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 100%; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 15px;
          padding: 14px 20px; border-radius: 10px; cursor: pointer; text-decoration: none;
          border: 1px solid transparent; transition: opacity 0.15s ease;
        }
        .fp-btn:active { opacity: 0.85; }
        .fp-btn-solid { background: ${COLORS.blue}; color: #fff; }
        .fp-btn-outline { background: transparent; color: ${COLORS.text}; border-color: ${COLORS.line}; }
        .fp-step { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${COLORS.blueLight}; }
        .fp-step-text { font-size: 14.5px; line-height: 1.5; color: ${COLORS.textMuted}; margin: 6px 0 14px; }
      `}</style>

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "20vh 24px 40px", textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 19, marginBottom: 40 }}>FleetPro Driver</div>

        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 28, textAlign: "left" }}>
          <div className="fp-step">Step 1</div>
          <p className="fp-step-text">Install FleetPro Driver, or update it if you already have it.</p>
          <a className="fp-btn fp-btn-solid" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
            Install / Update on Google Play
          </a>

          <div className="fp-step" style={{ marginTop: 28 }}>Step 2</div>
          <p className="fp-step-text">Come back to this page and open the app to connect to your company.</p>
          <a className="fp-btn fp-btn-outline" href={appLink}>
            Open FleetPro Driver
          </a>
        </div>
      </div>
    </div>
  );
}
