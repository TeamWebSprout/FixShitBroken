type Legislator = {
  bioguide_id: string;
  full_name: string;
  party: "D" | "R" | "I" | null;
  photo_url: string | null;
  current_chamber: "house" | "senate" | null;
  state: string | null;
  district: number | null;
};

function roleLabel(l: Legislator) {
  if (l.current_chamber === "senate") return `Senator · ${l.state}`;
  if (l.district === 0) return `Representative · ${l.state}-AL`;
  return `Representative · ${l.state}-${l.district}`;
}

export default function RepCard({ l }: { l: Legislator }) {
  return (
    <a href={`/legislator/${l.bioguide_id}`} className="rep-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="rep-card__photo"
        src={l.photo_url ?? ""}
        alt={l.full_name}
        loading="lazy"
      />
      <div style={{ minWidth: 0 }}>
        <div className="rep-card__name">{l.full_name}</div>
        <div className="rep-card__meta">
          {l.party && <span className={`party-chip party-chip--${l.party}`}>{l.party}</span>}{" "}
          {roleLabel(l)}
        </div>
      </div>
    </a>
  );
}
