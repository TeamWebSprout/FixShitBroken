export default function Home() {
  return (
    <section style={{ paddingTop: 24 }}>
      <h1 style={{ fontSize: "3rem", maxWidth: 720 }}>
        The <span className="serif-italic" style={{ color: "var(--rust)" }}>receipts</span> on all 535.
      </h1>
      <p style={{ maxWidth: 620, marginTop: 16, fontSize: "1.1rem", color: "var(--brown-700)" }}>
        How they voted, who funded them, what they missed, what they said. Every line
        sourced and linkable. Start with the record — it&rsquo;s just true.
      </p>
      <div style={{ display: "flex", gap: 14, marginTop: 28 }}>
        <a
          href="/directory"
          style={{
            background: "var(--rust)", color: "#fff", padding: "11px 20px",
            borderRadius: 10, fontWeight: 600,
          }}
        >
          Browse the 535
        </a>
        <a
          href="/legislation"
          style={{
            border: "1px solid var(--brown-200)", color: "var(--brown-700)",
            padding: "11px 20px", borderRadius: 10, fontWeight: 600,
          }}
        >
          See the legislation
        </a>
      </div>

      <p style={{ marginTop: 40, fontSize: "0.85rem", color: "var(--brown-500)", maxWidth: 620 }}>
        Phase 0 scaffold. The directory reads live from the database once you run the
        legislator ingestion worker. The Pulse (opinion polling) is a labeled supplement,
        shown later with sample size — never as a headline grade.
      </p>
    </section>
  );
}
