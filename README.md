# Take Back the Hill

Two parts:

- **`web/`** — the frontend. The designed site (from the mockups), connected and
  navigable, served as static HTML. Open `web/index.html`, or run a static server:
  `cd web && python3 -m http.server 8000` → http://localhost:8000.
- **`app/`** — the backend. Next.js + Supabase: the schema
  (`app/supabase/migrations/0001_init.sql`), the ingestion worker, and the
  `/api/legislators` data API. See `app/README.md`.
- **`design/`** — the original zip mockups + PNG renders (reference).
- Planning docs: `TECHNICAL_PLAN.md`, `DATA_SOURCES.md`, `SCORE_REDESIGN.md`.

## How the frontend gets real data (for now)

The 535 directory (`web/pillar-will.html`) reads `web/data/legislators.json`.
That file is produced by the ingestion worker from the canonical
`unitedstates/congress-legislators` dataset:

```bash
cd app
npm install
node worker/ingest-legislators.mjs --dry-run     # writes ../web/data/legislators.json, no DB needed
```

Until that file exists, the directory shows the designed sample grid. Once it
exists, the page renders all real members with working chamber/party filters and
search. (This sandbox can't reach the dataset, so run the line above on your
machine to populate it.)

## Individual legislator pages (all 535)

Each member gets a real, SEO-friendly static page at `web/reps/{bioguide}.html`,
generated from the rep-detail design + roster data:

```bash
cd app
npm run build:site     # writes web/data/legislators.json AND web/reps/*.html (all 535)
# or just the pages:
npm run generate:rep-pages
```

The header and contact block are real and unique per legislator (name, party,
state, district, chamber, tenure, phone, office, website, social). Sections we
have no data for yet (voting record, donor sectors, alignment score) keep the
design but render honest "loads in Phase 1" states — we never attribute
fabricated votes or scores to a real, named person. The directory links straight
to these pages once `legislators.json` is present.

`web/reps/` currently holds three sample pages (Sanders, AOC, Cruz) so you can
open one immediately; running the command above fills in all 535.

## Real voting records (Phase 1)

The voting record on each rep page is wired to the official feeds:

- **House** — Congress.gov API (`/house-vote/...`, 118th Congress / 2023 onward).
  Needs a free key: https://api.congress.gov/sign-up/ → set `CONGRESS_GOV_API_KEY`.
- **Senate** — senate.gov per-vote XML, mapped from LIS member id back to Bioguide
  via the roster crosswalk (no key needed).

```bash
cd app
export CONGRESS_GOV_API_KEY=your-key
npm run build:site:full            # roster JSON + votes + regenerate all pages
# or just votes:
npm run ingest:votes -- --congress 119 --session 2 --no-db
# quick smoke run (cap the volume):
npm run ingest:votes -- --house-limit 25 --senate-limit 25 --no-db
```

`ingest:votes` writes `web/data/votes-by-member.json`; the generator bakes the most
recent votes into each page (real position per member: YES/NO/PRESENT/NO VOTE, with
the bill, date, question, and result). Pages without vote data keep the empty state.

Two beta caveats: the Congress.gov House-vote JSON field names are read defensively
(several candidate paths) — if a field comes back empty, run
`node worker/lib/congress-gov.mjs --probe 119 2` to see the live envelope and adjust
the candidate lists in `normalizeHouseVote` / `normalizeHouseMembers`. Per-member
alignment (the "voted with constituents" measure) is deliberately NOT shown here —
it's poll-derived (Phase 4), not inferable from votes.

## Production path

Same worker, with `DATABASE_URL` set, writes to Supabase. A deployed Next
frontend reads `/api/legislators` instead of the static JSON. Migrating the
static pages to Next routes (for the server-rendering the Town Hall SEO needs)
is the next structural step.

## Design fidelity notes

Built to follow the mockups closely. Two honest deviations, both deliberate:

- **Per-member alignment score.** Real alignment is poll-derived and doesn't
  exist until polling (Phase 4). Rather than fabricate a number for 535 real,
  named people, the live directory tiles render the score as `—` /
  "awaiting polls". The static sample pages keep the designed numbers.
- **Donor sectors & lobbying support/oppose** remain in the design as shown but
  have no live source yet (OpenSecrets API shut down April 2025; disclosure
  filings never state a side). They populate when a source is added.
