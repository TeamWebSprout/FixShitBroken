# fixshitbroken — Session Handoff

_Handoff for continuing in a new chat. Paste or attach this file at the start of the new session so the next agent has full context._

Project folder: `FSB/FixShitBroken/` (a congressional-accountability web app).

---

## 1. TL;DR — where things stand

The site is **real, end to end**, built as **static HTML in `web/`** populated by **Node workers in `app/worker/`**. Everything the U.S. government publishes for free is loaded and live:

- All **537 members** (roster, directory, dashboard delegation, 537 profile pages).
- **Real recent roll-call votes** (10 House + 10 Senate), expandable, each with a real **CRS plain-English bill summary**.
- A **52-bill Legislation feed** (every 2026 floor-voted bill, real CRS summaries, newest-first, searchable).
- **Real donor data** proven on 2 members: **Moran (M001224)** shows all 3 campaigns (2026/2024/2022) with per-cycle individual-vs-PAC funding sources from OpenFEC; **Cruz (C001098)** shows his cycles from Ballotpedia.

**The one remaining step is deployment.** Filling donor data (and full bill corpus, and nightly refresh) for **all 537** requires the workers to run on a machine with internet + free API keys. That can't happen in the chat sandbox (see constraints) or the user's Mac (no Node). The path is the **GitHub Actions deploy** already built (`.github/workflows/` + `DEPLOY.md`). The user was about to do that and asked "how do I run the workflow" — answer in §7.

---

## 2. What's real right now (per surface)

- **Directory** (`web/pillar-will.html` + `js/directory.js`): all 537 real members; filters = state dropdown + chamber + party + search, all combine; loads from `web/data/legislators-data.js` (works over `file://`).
- **Dashboard** (`web/dashboard.html` + `js/dashboard.js`): pick a state → real senators + real House delegation for it; honest empty states for legislation/town-hall; no fabricated people.
- **Profiles** (`web/reps/{bioguide}.html`, 537 of them): real name/party/state/district/tenure/phone/office/site. Two tabs only: **Voting record** + **Donors** ("In their own words" and "Town hall" tabs were removed per user; Town hall remains its own nav page for the user to build later).
  - **Voting record**: real votes, expandable rows (chevron), each expands to a real CRS bill summary + Congress.gov link. Nominations correctly show no bill summary.
  - **Donors**: one card per campaign, newest first, each with total raised / spent / cash-on-hand and the **individual-vs-PAC funding-source bars** (+ itemized vs small-dollar). Renders real data when present; honest "loads when the FEC pull runs" otherwise.
- **Legislation feed** (`web/pillar-legislation.html` + `js/legislation.js`): 52 real bills, CRS summary bullets, policy tag, latest-action date, sponsor, official link, search.
- **Legislation/Town-hall/Memes/index/onboarding**: all fabricated sample content removed; honest states or real illustrative captions. No made-up officials or bills anywhere (verified by grep).

The one profile still showing an old element: the **"Constituent Alignment Score" ring** at the top of each profile (shows "—"/"no score"). It's honest (no fabricated number) but is the retired concept from `SCORE_REDESIGN.md`. Converting the header to the Receipts-led layout was offered but not done.

---

## 3. Data files (`web/data/`)

- `legislators-current.json` — raw `unitedstates/congress-legislators` roster (user downloaded it; ~1.4MB). Source of FEC ids, govtrack ids, etc.
- `legislators.json` — slim roster (537) for the directory.
- `legislators-data.js` — `window.LEGISLATORS = [...]` embed (directory + dashboard use this over file://).
- `votes-by-member.json` — real votes keyed by bioguide (532 members, 10 House + 10 Senate roll calls).
- `bill-summaries.json` — 60 bills, 52 with real CRS summaries (from GovInfo BILLSTATUS).
- `legislation-data.js` — `window.LEGISLATION = [...]` embed for the Legislation feed.
- `donors-by-member.json` — real donor data. Currently only **M001224 (full 3 cycles, OpenFEC)** and **C001098 (Ballotpedia cycles)**. Everyone else fills on deploy.

**Donor schema** (the shape the display + worker use):
```json
{ "M001224": {
  "cycles": [
    { "year":"2026","status":"On the Ballot general","contributions":1385301,"expenditures":1131997,
      "cashOnHand":634251,"fromIndividuals":507215,"individualItemized":350489,
      "individualUnitemized":156726,"fromPacs":613650,"fromParty":0 }
  ],
  "totalContributions":3520717,"totalExpenditures":2886467,
  "source":"Federal Election Commission (OpenFEC), per-cycle filings","coverageThrough":"2026-03-31" } }
```

---

## 4. Workers (`app/worker/`)

- `ingest-legislators.mjs` — roster from congress-legislators (keyless). Supports `--dry-run` and `--input <local-file>` (offline). Exports `fetchLegislators`, `transformLegislator`.
- `ingest-votes.mjs` — House (Congress.gov API, needs `CONGRESS_GOV_API_KEY`) + Senate XML. Writes `votes-by-member.json`. (Note: recent real votes in the repo were pulled keyless from House Clerk EVS + senate.gov XML during the session; this worker uses the Congress.gov API path.)
- `summarize-bills.mjs` — CRS bill summaries from GovInfo BILLSTATUS (keyless). `--from-votes` (bills that were voted) or `--all` (full-corpus crawl via GovInfo sitemaps, thousands of bills, merges). Writes/merges `bill-summaries.json`. Optional `--ai` layer (needs `LLM_API_KEY`) for winners/losers — tagged `reviewed:false`.
- `ingest-donors.mjs` — **real FEC donor data via OpenFEC** (needs free `FEC_API_KEY`). Now pulls **every cycle** per member with individual/PAC split (`cyclesFromTotals` verified to exactly match the hand-entered Moran data). Writes/merges `donors-by-member.json`.
- `generate-rep-pages.mjs` — builds all 537 `web/reps/*.html` from the roster + votes + summaries + donors. Reads `--input <file>` offline.
- `build-embeds.mjs` — regenerates `legislators-data.js` + `legislation-data.js` from the JSON.

npm scripts (`app/package.json`): `ingest:legislators`, `ingest:votes`, `summarize:bills`, `ingest:donors`, `build:embeds`, `generate:rep-pages`, `build:site:full`.

---

## 5. HARD environment constraints (read this, next agent)

- **The chat sandbox bash has NO internet** (proxy blocks all hosts). Only `mcp__workspace__web_fetch` reaches the web, and it **(a) strips ALL JSON to empty**, and **(b) caps ~90KB, saving larger XML/CSV/HTML to a host file** under `/var/folders/.../tool-results/` (readable via Read/Grep, not in the bash mount).
- Therefore **JSON APIs are unreadable in-chat**: OpenFEC, Congress.gov, GovTrack all return empty. Claude-in-Chrome **also blocks the FEC domain**. Keyless **XML/HTML** feeds DO work via web_fetch: House Clerk EVS, senate.gov, GovInfo BILLSTATUS, congress-legislators, **Ballotpedia** (renders FEC/OpenSecrets finance as HTML tables).
- **The user has NO Node installed** on their Mac (every local `node`/`npm` command returned "command not found"). Do not tell them to run workers locally without first installing Node — the agreed path is the cloud deploy.
- **Donor totals via OpenFEC JSON were obtained by having the user paste API responses in-chat** (they can hit the API in their browser). That's how Moran got real data. Not scalable — the deploy is the real answer.
- **Don't fabricate.** The user is adamant about real data only. Sectors/industry labels are NOT available (OpenSecrets API shut down April 2025) — top employers is the honest substitute.
- jsdom for headless tests installs to `/tmp/jsdomtest` (cleared between bash sessions; reinstall: `npm i jsdom --no-save --prefix /tmp/jsdomtest`).

---

## 6. Deploy (built, not yet run by user)

- `.github/workflows/refresh.yml` — daily cron + manual. Runs roster → votes → summaries → donors → embeds → generate → commits `web/`. Uses secrets `CONGRESS_GOV_API_KEY` and `FEC_API_KEY`.
- `.github/workflows/pages.yml` — publishes `web/` to GitHub Pages.
- `DEPLOY.md` — full non-developer setup (get 2 free keys → publish folder via GitHub Desktop → add secrets → enable Actions + Pages → run workflow).

Free keys: Congress.gov `https://api.congress.gov/sign-up/`; OpenFEC `https://api.open.fec.gov/developers/`.

---

## 7. The user's open question: "How do I run the workflow?"

Once the repo is on GitHub with the secrets added (steps 1–4 of `DEPLOY.md`):

1. Open the repo on **github.com**.
2. Click the **"Actions"** tab (top bar).
3. In the left sidebar, click **"Refresh congressional data"**.
4. Click the **"Run workflow"** button on the right (a dropdown appears). Optionally tick **full_bills** to summarize every bill in Congress (slow); leave unticked for the fast run.
5. Click the green **"Run workflow"** to confirm. It runs in a few minutes; when it finishes it commits the refreshed data and the site publishes via `pages.yml`. Live URL appears under **Settings → Pages**.

**Prerequisite still to do:** the user has NOT yet published the project to GitHub or added the secrets. That's the actual next action (needs their GitHub account + the free keys — the agent cannot do the login or enter the keys for them).

---

## 8. Suggested next steps (pick up here)

1. **Walk the user through the GitHub publish** (GitHub Desktop → publish `FixShitBroken` folder → add `CONGRESS_GOV_API_KEY` + `FEC_API_KEY` secrets → enable Actions/Pages → run workflow). This lights up donors for all 537 + nightly refresh. This is the highest-value next action.
2. Optional: convert the profile header's retired **"Constituent Alignment Score" ring** to the Receipts-led layout from `SCORE_REDESIGN.md`.
3. Optional: build the **Town hall** page (its own nav section now) — it's an unbuilt community feature (accounts + posting + moderation), not a data pull.
4. Optional: expand donor coverage before deploy by pulling more members from **Ballotpedia** (keyless, HTML-readable) — but per-cycle individual/PAC split needs OpenFEC (the deploy).

---

## 9. Verify anything quickly

```
cd app
node --check worker/*.mjs
node worker/generate-rep-pages.mjs --input=../web/data/legislators-current.json   # rebuild 537 pages
# open web/reps/M001224.html (Moran) — 3 real donor campaign cards with funding sources
# open web/pillar-will.html — 537-member directory; web/pillar-legislation.html — 52-bill feed
```

Planning docs at repo root: `README.md`, `TECHNICAL_PLAN.md`, `DATA_SOURCES.md`, `SCORE_REDESIGN.md`, `DEPLOY.md`.
