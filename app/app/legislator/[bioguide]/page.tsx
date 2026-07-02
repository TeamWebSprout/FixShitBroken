import ScoreRing from "@/components/ScoreRing";
import { createPublicClient } from "@/lib/supabase";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function loadLegislator(bioguide: string) {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("legislator")
      .select("bioguide_id, full_name, party, photo_url, current_chamber, state, district, socials, contact")
      .eq("bioguide_id", bioguide)
      .maybeSingle();
    if (error) return { l: null, error: error.message };
    return { l: data, error: null };
  } catch (e) {
    return { l: null, error: (e as Error).message };
  }
}

const PARTY_NAME = { D: "Democrat", R: "Republican", I: "Independent" } as const;

export default async function LegislatorPage({ params }: { params: { bioguide: string } }) {
  const { l, error } = await loadLegislator(params.bioguide);
  if (!error && !l) notFound();

  if (!l) {
    return (
      <section style={{ paddingTop: 24 }}>
        <a href="/directory" style={{ color: "var(--brown-500)", fontSize: "0.85rem" }}>← The 535</a>
        <div className="legis-card" style={{ marginTop: 16, borderLeftColor: "var(--brown-400)" }}>
          <div className="legis-card__tag">Setup</div>
          <p style={{ marginTop: 8 }}>Database not reachable. {error}</p>
        </div>
      </section>
    );
  }

  const role =
    l.current_chamber === "senate"
      ? `U.S. Senator for ${l.state}`
      : `U.S. Representative, ${l.state}-${l.district === 0 ? "AL" : l.district}`;

  return (
    <section style={{ paddingTop: 16 }}>
      <a href="/directory" style={{ color: "var(--brown-500)", fontSize: "0.85rem" }}>← The 535</a>

      <div style={{ display: "flex", gap: 20, alignItems: "center", margin: "16px 0 28px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={l.photo_url ?? ""}
          alt={l.full_name}
          style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--brown-50)" }}
        />
        <div>
          <h1 style={{ fontSize: "2.4rem" }}>{l.full_name}</h1>
          <p style={{ color: "var(--brown-600)", marginTop: 4 }}>
            {l.party && <span className={`party-chip party-chip--${l.party}`}>{PARTY_NAME[l.party as "D" | "R" | "I"]}</span>}{" "}
            {role}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 28, alignItems: "start" }}>
        <div>
          <h2 style={{ fontSize: "1.4rem", marginBottom: 10 }}>The Receipts</h2>
          <div className="legis-card" style={{ borderLeftColor: "var(--sage)" }}>
            <p style={{ color: "var(--brown-700)" }}>
              The objective record — votes, funding, attendance, statements — wires in at Phase 1.
              House votes via Congress.gov (2023+), Senate votes via the senate.gov XML feed,
              normalized on Bioguide ID <code>{l.bioguide_id}</code>.
            </p>
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: "1.4rem", marginBottom: 10 }}>The Pulse</h2>
          {/* Labeled supplement. Null until real responses exist. */}
          <ScoreRing score={null} respondentN={0} />
        </div>
      </div>
    </section>
  );
}
