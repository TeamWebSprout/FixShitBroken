export const dynamic = "force-dynamic";

export default function Legislation() {
  return (
    <section style={{ paddingTop: 16 }}>
      <h1 style={{ fontSize: "2.2rem" }}>Legislation</h1>
      <p style={{ color: "var(--brown-600)", marginTop: 6, maxWidth: 620 }}>
        The bills, in plain language: what it does, who wins, who loses, who pays.
      </p>
      <div className="legis-card" style={{ marginTop: 24 }}>
        <div className="legis-card__tag">Phase 2 · Editorial pipeline</div>
        <h2 className="legis-card__title">Coming next</h2>
        <p style={{ color: "var(--brown-700)" }}>
          Bills, sponsors, and status sync from the Congress.gov API in Phase 1. The
          plain-language summaries (the &ldquo;Legislation for Dummies&rdquo; layer) are
          hand-written through the <code>legislation_summary</code> schema in Phase 2,
          with provenance fields behind every claim.
        </p>
      </div>
    </section>
  );
}
