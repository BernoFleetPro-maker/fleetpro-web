const COLORS = {
  bg: "#0B0F17",
  panel: "#121826",
  text: "#E7EAF0",
  textMuted: "#8B95A7",
  blueLight: "#5B9BD9",
  line: "rgba(255,255,255,0.08)",
};

const FONT_IMPORT_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";

function Section({ eyebrow, title, children }) {
  return (
    <section style={{ padding: "28px 0", borderTop: `1px solid ${COLORS.line}` }}>
      {eyebrow && (
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            letterSpacing: "0.08em",
            color: COLORS.blueLight,
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          {eyebrow}
        </div>
      )}
      {title && <h2 style={{ fontWeight: 600, fontSize: 19, margin: "0 0 12px" }}>{title}</h2>}
      <div style={{ fontSize: 14.5, lineHeight: 1.7, color: COLORS.textMuted }}>{children}</div>
    </section>
  );
}

// First-draft privacy policy — scoped to what FleetPro's web platform and
// driver app actually collect, confirmed against the real code (app.json's
// requested permissions, what each controller reads/stores) rather than
// generic boilerplate. Needed as a working, public URL for the driver app's
// Play Store listing (Data safety section + policy link requirement) — not
// legal advice, meant as a starting point for Berno (or a lawyer) to adjust
// before treating it as final.
export default function PrivacyPolicyPage() {
  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>
      <link rel="stylesheet" href={FONT_IMPORT_URL} />
      <style>{`
        * { box-sizing: border-box; }
        .fp-link { color: ${COLORS.blueLight}; text-decoration: none; }
        .fp-link:hover { text-decoration: underline; }
        ul { margin: 8px 0; padding-left: 20px; }
        li { margin-bottom: 6px; }
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 80px" }}>
        <a href="/" className="fp-link" style={{ fontSize: 13 }}>&larr; Back to FleetPro</a>

        <h1 style={{ fontWeight: 700, fontSize: 32, margin: "20px 0 6px", letterSpacing: "-0.01em" }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 13.5, color: COLORS.textMuted, margin: "0 0 8px" }}>
          Last updated: 15 September 2026
        </p>
        <p style={{ fontSize: 14.5, lineHeight: 1.7, color: COLORS.textMuted }}>
          FleetPro is a fleet management platform operated in South Africa, used by
          logistics companies ("customers") to manage their own vehicles, drivers, and
          deliveries. This page explains what information FleetPro collects, through
          the web platform and the FleetPro Driver mobile app, and how it's used.
        </p>

        <Section eyebrow="Who this covers" title="Staff, drivers, and clients of a FleetPro customer">
          <p>
            FleetPro is provided to logistics companies, not directly to the public.
            If you're a driver, staff member, or client contact using FleetPro, your
            account and data belong to the company you work with or for — that
            company is responsible for what it asks FleetPro to store on its behalf.
          </p>
        </Section>

        <Section eyebrow="What we collect" title="Information collected through the platform">
          <p>Depending on your role, this can include:</p>
          <ul>
            <li><strong>Account details</strong> — name, phone number, and for staff/admin/client logins, an email address and password.</li>
            <li><strong>Delivery and task data</strong> — load and dropoff locations, timestamps, order references, and status updates, entered by staff or generated as a task progresses.</li>
            <li><strong>Proof-of-delivery photos</strong> — captured by a driver through the app's camera when completing a delivery, and compliance documents (e.g. licences, permits) uploaded by staff.</li>
            <li><strong>Vehicle location</strong> — sourced from the customer's own GPS tracking hardware/provider fitted to the vehicle, not from a driver's personal phone.</li>
            <li><strong>Push notification token</strong> — used to deliver task alerts to the correct device.</li>
            <li><strong>Contact form submissions</strong> — name, company, email, phone, and message, if you fill in the "Talk to us" form on this site.</li>
          </ul>
          <p>
            The FleetPro Driver app does not request or collect your phone's GPS
            location, contacts, or messages — it only requests camera access (for
            delivery photos) and storage access (to attach them).
          </p>
        </Section>

        <Section eyebrow="How it's used" title="What this information is used for">
          <ul>
            <li>Operating the core service — assigning and tracking deliveries, showing live vehicle positions, and giving clients proof of delivery.</li>
            <li>Sending task notifications to the right driver's device.</li>
            <li>Responding to enquiries submitted through the contact form.</li>
          </ul>
          <p>We do not sell personal data, and we do not use it for advertising.</p>
        </Section>

        <Section eyebrow="Where it's stored" title="Storage and sharing">
          <p>
            Data is kept separate per customer — one company's data is never visible
            to another company using FleetPro. Records are stored in FleetPro's
            database and, for photos and documents, in Cloudinary, a third-party
            file storage provider. Vehicle tracking data is sourced from each
            customer's own tracking provider account, under that provider's own
            terms.
          </p>
        </Section>

        <Section eyebrow="How long we keep it" title="Retention">
          <p>
            A driver or vehicle removed by an admin is kept for up to 12 months
            (so it can be restored if removed by mistake) before being permanently
            deleted. Task and delivery history is retained as part of the
            customer's own operational records.
          </p>
        </Section>

        <Section eyebrow="Your rights" title="Access, correction, and deletion">
          <p>
            If you'd like to access, correct, or request deletion of your personal
            information, contact the company you drive for or work with — they
            control the account — or reach us directly and we'll help route the
            request.
          </p>
        </Section>

        <Section eyebrow="Contact" title="Questions about this policy">
          <p>
            Email <a className="fp-link" href="mailto:bernokuduplant@gmail.com">bernokuduplant@gmail.com</a> with
            any questions about this policy or your data.
          </p>
        </Section>
      </div>
    </div>
  );
}
