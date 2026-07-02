#!/usr/bin/env node
/*
 * Legislator ingestion worker (Phase 0)
 * ---------------------------------------------------------------------------
 * Pulls the canonical `unitedstates/congress-legislators` dataset and loads all
 * current members into the `legislator` + `term` tables, keyed on Bioguide ID.
 * Idempotent: re-running upserts. Run on a schedule (weekly is enough).
 *
 *   node worker/ingest-legislators.mjs            # ingest into Postgres
 *   node worker/ingest-legislators.mjs --dry-run  # fetch + transform, no DB write
 *
 * Env: DATABASE_URL (Supabase Postgres URI). Not needed for --dry-run.
 *
 * The transform is exported (transformLegislator / buildPhotoUrl) so it can be
 * unit-tested against a fixture without network or DB. See worker/__test__.
 */

const SOURCES = [
  "https://unitedstates.github.io/congress-legislators/legislators-current.json",
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.json",
];

const PHOTO_BASE = "https://unitedstates.github.io/images/congress/225x275";

export function buildPhotoUrl(bioguide) {
  return bioguide ? `${PHOTO_BASE}/${bioguide}.jpg` : null;
}

function normalizeParty(party) {
  if (!party) return null;
  if (party === "Democrat") return "D";
  if (party === "Republican") return "R";
  // Independent, Libertarian, etc. all map to I for the D/R/I enum.
  return "I";
}

/**
 * Turn one congress-legislators record into the rows we store.
 * Returns { legislator, terms } where terms[] covers the full career.
 */
export function transformLegislator(rec) {
  const bioguide = rec.id?.bioguide;
  if (!bioguide) return null;

  const terms = rec.terms ?? [];
  const current = terms[terms.length - 1] ?? {};

  const fullName =
    rec.name?.official_full ||
    [rec.name?.first, rec.name?.last].filter(Boolean).join(" ");

  const socials = {};
  if (rec.social?.twitter) socials.twitter = rec.social.twitter;
  if (rec.social?.bluesky) socials.bluesky = rec.social.bluesky;
  if (rec.social?.youtube_id) socials.youtube = rec.social.youtube_id;
  if (rec.social?.instagram) socials.instagram = rec.social.instagram;

  const contact = {};
  if (current.url) contact.url = current.url;
  if (current.phone) contact.phone = current.phone;
  if (current.address) contact.address = current.address;
  if (current.office) contact.office = current.office;

  const legislator = {
    bioguide_id: bioguide,
    // LIS id (senators) — the key the Senate roll-call XML uses; null for most reps.
    lis_id: rec.id?.lis ?? null,
    // Official cross-reference IDs for real source links (FEC filings, GovTrack).
    fec_id: rec.id?.fec?.[0] ?? null,
    govtrack_id: rec.id?.govtrack ?? null,
    full_name: fullName,
    party: normalizeParty(current.party),
    photo_url: buildPhotoUrl(bioguide),
    current_chamber: current.type === "sen" ? "senate" : "house",
    state: current.state ?? null,
    district: current.type === "rep" ? current.district ?? null : null,
    in_office: true,
    jurisdiction: "federal",
    socials,
    contact,
  };

  const termRows = terms.map((t) => ({
    bioguide_id: bioguide,
    chamber: t.type === "sen" ? "senate" : "house",
    state: t.state,
    district: t.type === "rep" ? t.district ?? null : null,
    party: normalizeParty(t.party),
    start_date: t.start,
    end_date: t.end ?? null,
    jurisdiction: "federal",
  }));

  return { legislator, terms: termRows };
}

// Allow reading the roster from a local file (--input=PATH or --input PATH)
// instead of the network. Lets the whole build run offline once the raw
// legislators-current.json has been downloaded into the repo.
function localInputPath() {
  const eq = process.argv.find((a) => a.startsWith("--input="));
  if (eq) return eq.slice("--input=".length);
  const i = process.argv.indexOf("--input");
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

export async function fetchLegislators() {
  const input = localInputPath();
  if (input) {
    const { readFile } = await import("node:fs/promises");
    console.log(`Reading roster from local file: ${input}`);
    return JSON.parse(await readFile(input, "utf8"));
  }
  let lastErr;
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "fixshitbroken-ingest" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      console.warn(`source failed (${url}): ${err.message}`);
    }
  }
  throw new Error(`all sources failed: ${lastErr?.message}`);
}

async function upsertAll(rows) {
  const { default: pg } = await import("pg");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to write to Postgres.");

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    let legCount = 0;
    let termCount = 0;
    for (const { legislator: l, terms } of rows) {
      await client.query(
        `insert into legislator
           (bioguide_id, full_name, party, photo_url, current_chamber, state,
            district, in_office, jurisdiction, socials, contact, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
         on conflict (bioguide_id) do update set
           full_name=excluded.full_name, party=excluded.party,
           photo_url=excluded.photo_url, current_chamber=excluded.current_chamber,
           state=excluded.state, district=excluded.district,
           in_office=excluded.in_office, socials=excluded.socials,
           contact=excluded.contact, updated_at=now()`,
        [
          l.bioguide_id, l.full_name, l.party, l.photo_url, l.current_chamber,
          l.state, l.district, l.in_office, l.jurisdiction,
          JSON.stringify(l.socials), JSON.stringify(l.contact),
        ]
      );
      legCount++;

      for (const t of terms) {
        await client.query(
          `insert into term
             (bioguide_id, chamber, state, district, party, start_date, end_date, jurisdiction)
           values ($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (bioguide_id, start_date, chamber) do update set
             state=excluded.state, district=excluded.district,
             party=excluded.party, end_date=excluded.end_date`,
          [t.bioguide_id, t.chamber, t.state, t.district, t.party,
           t.start_date, t.end_date, t.jurisdiction]
        );
        termCount++;
      }
    }
    return { legCount, termCount };
  } finally {
    await client.end();
  }
}

/**
 * Write the slim JSON the static site (web/data/legislators.json) consumes.
 * Only the fields the directory needs — keeps the file small.
 */
async function emitStaticJson(rows, outPath) {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const slim = rows.map(({ legislator: l }) => ({
    bioguide_id: l.bioguide_id,
    lis_id: l.lis_id,
    full_name: l.full_name,
    party: l.party,
    state: l.state,
    district: l.district,
    current_chamber: l.current_chamber,
    photo_url: l.photo_url,
  }));
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(slim));
  console.log(`Wrote ${slim.length} members to ${outPath}`);
}

function flagValue(name, fallback) {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  return process.argv.includes(name) ? fallback : null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Fetching congress-legislators${dryRun ? " (dry run)" : ""}...`);

  const raw = await fetchLegislators();
  const rows = raw.map(transformLegislator).filter(Boolean);

  const byChamber = rows.reduce((acc, r) => {
    acc[r.legislator.current_chamber] = (acc[r.legislator.current_chamber] || 0) + 1;
    return acc;
  }, {});
  console.log(`Transformed ${rows.length} members:`, byChamber);

  // Emit the static-site JSON. Default path points at ../web/data from app/.
  const { fileURLToPath } = await import("node:url");
  const { dirname: dn, resolve } = await import("node:path");
  const here = dn(fileURLToPath(import.meta.url));
  const defaultOut = resolve(here, "../../web/data/legislators.json");
  const noJson = process.argv.includes("--no-json");
  const jsonOut = noJson ? null : flagValue("--emit-json", defaultOut) || defaultOut;
  if (jsonOut) await emitStaticJson(rows, jsonOut);

  if (dryRun) {
    console.log("Dry run — sample:", JSON.stringify(rows[0]?.legislator, null, 2));
    return;
  }

  const { legCount, termCount } = await upsertAll(rows);
  console.log(`Upserted ${legCount} legislators and ${termCount} terms.`);
}

// Only run when invoked directly, so tests can import the transforms.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
