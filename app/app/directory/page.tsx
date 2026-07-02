import RepCard from "@/components/RepCard";
import { createPublicClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const CHAMBERS = [
  { key: "", label: "All 535" },
  { key: "senate", label: "Senate" },
  { key: "house", label: "House" },
];

type Search = { chamber?: string; state?: string };

async function loadLegislators(search: Search) {
  try {
    const supabase = createPublicClient();
    let q = supabase
      .from("legislator")
      .select("bioguide_id, full_name, party, photo_url, current_chamber, state, district")
      .eq("in_office", true)
      .order("state", { ascending: true })
      .order("full_name", { ascending: true });

    if (search.chamber === "house" || search.chamber === "senate") {
      q = q.eq("current_chamber", search.chamber);
    }
    if (search.state) q = q.eq("state", search.state.toUpperCase());

    const { data, error } = await q;
    if (error) return { rows: null, error: error.message };
    return { rows: data ?? [], error: null };
  } catch (e) {
    return { rows: null, error: (e as Error).message };
  }
}

export default async function Directory({ searchParams }: { searchParams: Search }) {
  const { rows, error } = await loadLegislators(searchParams);
  const active = searchParams.chamber ?? "";

  return (
    <section style={{ paddingTop: 16 }}>
      <h1 style={{ fontSize: "2.2rem" }}>The 535</h1>
      <p style={{ color: "var(--brown-600)", marginTop: 6 }}>
        Every member of Congress. Click through for the record.
      </p>

      <div style={{ display: "flex", gap: 8, margin: "20px 0 24px" }}>
        {CHAMBERS.map((c) => {
          const isActive = active === c.key;
          const href = c.key ? `/directory?chamber=${c.key}` : "/directory";
          return (
            <a
              key={c.key || "all"}
              href={href}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: "0.85rem",
                fontWeight: 600,
                border: "1px solid var(--brown-200)",
                background: isActive ? "var(--rust)" : "transparent",
                color: isActive ? "#fff" : "var(--brown-700)",
              }}
            >
              {c.label}
            </a>
          );
        })}
      </div>

      {rows == null ? (
        <SetupNotice error={error} />
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--brown-500)" }}>
          No legislators loaded yet. Run <code>npm run ingest:legislators</code> to populate the database.
        </p>
      ) : (
        <>
          <p style={{ fontSize: "0.82rem", color: "var(--brown-500)", marginBottom: 12 }}>
            {rows.length} members
          </p>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            }}
          >
            {rows.map((l) => (
              <RepCard key={l.bioguide_id} l={l} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SetupNotice({ error }: { error: string | null }) {
  return (
    <div className="legis-card" style={{ borderLeftColor: "var(--brown-400)" }}>
      <div className="legis-card__tag">Setup</div>
      <p style={{ marginTop: 8 }}>
        The directory can&rsquo;t reach the database yet. Copy <code>.env.example</code> to{" "}
        <code>.env.local</code>, fill in your Supabase keys, run the migration in{" "}
        <code>supabase/migrations</code>, then <code>npm run ingest:legislators</code>.
      </p>
      {error && (
        <p style={{ marginTop: 8, fontSize: "0.8rem", color: "var(--brown-500)" }}>
          Detail: {error}
        </p>
      )}
    </div>
  );
}
