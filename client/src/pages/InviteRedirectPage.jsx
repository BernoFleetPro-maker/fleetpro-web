import { useEffect, useState } from "react";

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

// Real https:// landing page for a driver invite — exists specifically
// because WhatsApp (and most chat apps) won't turn a custom-scheme link
// like fleetprodriver://invite/<token> into something tappable, but will
// always linkify a normal https link. This page just re-issues that same
// custom-scheme redirect from inside a real browser tab, which the app is
// already listening for (App.tsx's Linking handler) — no app update
// needed for this to work. If nothing installed catches the redirect,
// the page reveals a Play Store fallback instead of looking broken.
export default function InviteRedirectPage({ token }) {
  const [showFallback, setShowFallback] = useState(false);
  const appLink = `fleetprodriver://invite/${token}`;

  useEffect(() => {
    // Most mobile browsers only honour a custom-scheme navigation as a
    // direct result of a user gesture — a plain page-load redirect is
    // often silently swallowed. Firing it anyway costs nothing when it's
    // blocked, and catches the browsers that do allow it.
    window.location.href = appLink;
    const t = setTimeout(() => setShowFallback(true), 1500);
    return () => clearTimeout(t);
  }, [appLink]);

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
        .fp-spinner {
          width: 28px; height: 28px; border-radius: 50%;
          border: 3px solid ${COLORS.line}; border-top-color: ${COLORS.blueLight};
          animation: fp-spin 0.8s linear infinite;
        }
        @keyframes fp-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .fp-spinner { animation: none; }
        }
      `}</style>

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "20vh 24px 40px", textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 19, marginBottom: 40 }}>FleetPro Driver</div>

        {!showFallback ? (
          <>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <div className="fp-spinner" />
            </div>
            <p style={{ fontSize: 14.5, color: COLORS.textMuted, margin: 0 }}>
              Opening the app&hellip;
            </p>
          </>
        ) : (
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 28 }}>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: COLORS.textMuted, margin: "0 0 20px" }}>
              If nothing happened, use the button below — or install the app first if you don't have it yet.
            </p>
            <a className="fp-btn fp-btn-solid" href={appLink} style={{ marginBottom: 12 }}>
              Open FleetPro Driver
            </a>
            <a className="fp-btn fp-btn-outline" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
              Get the app on Google Play
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
