# fixshitbroken — Phase 0 scaffold

Next.js (App Router) + Supabase. Implements the Phase 0 foundations and the start
of Phase 1 (a clickable, server-rendered directory) from `../TECHNICAL_PLAN.md`.

## What's here

```
app/
  app/                      # routes (App Router)
    page.tsx                #   home
    directory/              #   the 535 — reads from Supabase, chamber filter
    legislator/[bioguide]/  #   detail page (Receipts + labeled Pulse ring)
    legislation/            #   placeholder feed (wires up in Phase 1/2)
    globals.css             #   design system (tokens + rep-card / legis-card / score-ring)
  components/               # RepCard, ScoreRing
  lib/supabase.ts           # read-only public client
  supabase/migrations/      # 0001_init.sql — the full section-5 data model
  worker/
    ingest-legislators.mjs  # loads all 535 from unitedstates/congress-legislators
    __test__/transform.test.mjs
```

## Run it

```bash
cd app
npm install
cp .env.example .env.local      # fill in Supabase URL + keys + DATABASE_URL

# 1. create the schema — paste supabase/migrations/0001_init.sql into the
#    Supabase SQL editor, or: psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql

# 2. load the legislators (writes legislator + term)
npm run ingest:legislators          # or :dry to preview without a DB

# 3. run the app
npm run dev                         # http://localhost:3000
```

Before any DB is wired, the pages render a setup notice instead of erroring.

## Tests

```bash
node worker/__test__/transform.test.mjs   # transform: chambers, D/R/I, career terms
```

## Decisions baked in (from the planning docs)

- **Lead with The Receipts.** No single headline number at launch. The Pulse
  (polling) is a labeled supplement and always shows `respondent_n`.
- **Donations** are date-stamped, not chased in real time (quarterly by law).
- **Donor sectors** deferred (OpenSecrets API shut down April 2025).
- **Lobbying** ships neutral: `lobbying_position.stance` is nullable; filings say
  who lobbied, never which side.
- **jurisdiction/chamber** are real columns so state/local is later a data change.

## Not yet (by phase)

- Phase 1: Congress.gov + Senate XML ingestion → real votes & bills.
- Phase 2: hand-written `legislation_summary` rows.
- Phase 3: Supabase auth, RLS policies, district verification (Census Geocoder).
- Phase 4: polls → alignment scores + methodology page.
- Phase 5: Town Hall + moderation stack.

## Reconstructed, not ported

The original `shared.css` wasn't in the handoff, so `globals.css` reconstructs
the design system from `TECHNICAL_PLAN.md` §3.5 (rust/sage, brown ramp, Instrument
Serif, score-ring). Drop the real `shared.css` in to replace it — `tailwind.config.ts`
already references these variable names.
