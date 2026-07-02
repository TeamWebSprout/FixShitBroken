# fixshitbroken — Session Handoff (v2, 2026-07-02)

_Attach this file at the start of a new chat. It supersedes the previous SESSION_HANDOFF.md. The next agent should be able to continue from this file alone._

Project folder: `FSB/FixShitBroken/` (congressional-accountability web app). Ask the user to connect the `FSB` folder first.

---

## 1. TL;DR — where things stand

The site is real end to end (static HTML in `web/`, Node workers in `app/worker/`). **This session accomplished the deploy setup that the last handoff called the highest-value next action:**

- Repo **published to GitHub: `TeamWebSprout/FixShitBroken` (public)**, via GitHub Desktop.
- Both secrets added under Settings → Secrets and variables → Actions: `CONGRESS_GOV_API_KEY` and `FEC_API_KEY` (both are api.data.gov keys; interchangeable across data.gov APIs).
- Actions enabled. **"Refresh congressional data" run #1 was IN PROGRESS when the session ended** (manually triggered, full_bills unchecked, ~10+ min elapsed; expected 15–40 min total — the Donors step makes ~537 OpenFEC calls with 429 backoff).
- Root `.gitignore` added (`.DS_Store`, `node_modules`, `*.log`). `app/.gitignore` already excluded the 410MB `node_modules` (two files exceed GitHub's 100MB limit), so the publish worked.

**First things to check in the new session (ask the user, or have them screenshot):**

1. Did workflow run #1 succeed? (Actions tab → Refresh congressional data → run #1. If red, get the job log for the failed step.) On success it commits refreshed `web/` data — donor cards for all 537 members.
2. Was **Settings → Pages → Source: GitHub Actions** actually set? The user was instructed but never confirmed. The sidebar showed a failed `github-pages` deployment (red ✕) from the initial push — expected before Pages is configured, but must be resolved. Live URL will be `https://teamwebsprout.github.io/FixShitBroken/` (confirm under Settings → Pages).
3. If refresh succeeded but the site didn't publish, run/verify `pages.yml` (may need a re-run after Pages source is set, or after the bot's data commit — note the bot commit uses `[skip ci]`, so a manual Pages run may be needed).
4. Have the user pull the bot's commit in GitHub Desktop (Fetch/Pull) so the local folder gets the refreshed data.

## 2. What the site contains (unchanged from v1)

- **Directory** (`web/pillar-will.html` + `js/directory.js`): all 537 real members; state/chamber/party/search filters; loads `web/data/legislators-data.js` (works over file://).
- **Dashboard** (`web/dashboard.html`): state → real senators + House delegation; honest empty states.
- **Profiles** (`web/reps/{bioguide}.html`, 537): real bio/contact; two tabs — Voting record (real votes, expandable to CRS summaries) + Donors (per-cycle cards with individual-vs-PAC bars; real data pre-deploy only for M001224 Moran and C001098 Cruz; the workflow run fills the rest).
- **Legislation feed** (`web/pillar-legislation.html`): 52 real 2026 floor-voted bills with CRS summaries, searchable.
- No fabricated data anywhere (user is adamant: real data only). Sectors/industry labels unavailable (OpenSecrets API dead since Apr 2025).
- Leftover design item: profile header still shows the retired "Constituent Alignment Score" ring (honest "—", but `SCORE_REDESIGN.md` describes the Receipts-led replacement; offered, not done).

## 3. Data files (`web/data/`)

`legislators-current.json` (raw roster ~1.4MB) · `legislators.json` (slim) · `legislators-data.js` (window.LEGISLATORS embed) · `votes-by-member.json` (10 House + 10 Senate roll calls) · `bill-summaries.json` (60 bills, 52 with CRS) · `legislation-data.js` (embed) · `donors-by-member.json` (M001224 full 3 cycles OpenFEC; C001098 Ballotpedia; rest fill on workflow run).

Donor schema per member: `{ cycles: [{ year, status, contributions, expenditures, cashOnHand, fromIndividuals, individualItemized, individualUnitemized, fromPacs, fromParty }], totalContributions, totalExpenditures, source, coverageThrough }`.

## 4. Workers (`app/worker/`) and workflows

- `ingest-legislators.mjs` (roster, keyless, `--dry-run`/`--input`), `ingest-votes.mjs` (needs CONGRESS_GOV_API_KEY, `--no-db`), `summarize-bills.mjs` (GovInfo, keyless, `--from-votes` or `--all`), `ingest-donors.mjs` (needs FEC_API_KEY; one `/candidate/{fecId}/totals/` call per member, verified against hand-entered Moran data), `build-embeds.mjs`, `generate-rep-pages.mjs`.
- `.github/workflows/refresh.yml` — daily 07:00 UTC cron + manual dispatch (optional `full_bills` input); `permissions: contents: write`; commits `web/` as fixshitbroken-bot with `[skip ci]`.
- `.github/workflows/pages.yml` — publishes `web/` to GitHub Pages.
- npm scripts in `app/package.json`: `ingest:legislators`, `ingest:votes`, `summarize:bills`, `ingest:donors`, `build:embeds`, `generate:rep-pages`, `build:site:full`.
- `DEPLOY.md` — full non-developer setup guide (steps 1–4 now DONE; step 5 in progress).

## 5. HARD environment constraints (unchanged — read this, next agent)

- **Chat sandbox bash has NO internet.** Only `mcp__workspace__web_fetch` reaches the web, and it (a) strips ALL JSON to empty, (b) caps ~90KB (larger XML/HTML saved to host tool-results files readable via Read/Grep). JSON APIs (OpenFEC, Congress.gov, GovTrack) are unreadable in-chat. Claude-in-Chrome blocks the FEC domain. Keyless XML/HTML that DOES work: House Clerk EVS, senate.gov, GovInfo BILLSTATUS, congress-legislators, Ballotpedia.
- **User's Mac has NO Node** ("command not found"). Do not suggest local worker runs; the cloud workflow is the pipeline.
- **The user is not a developer.** This session worked via screenshots + step-by-step GitHub UI instructions. Keep instructions concrete (which tab, which button).
- **Don't fabricate data.** Ever.
- jsdom for headless tests: `npm i jsdom --no-save --prefix /tmp/jsdomtest` (cleared between bash sessions).

## 6. GitHub specifics for this deployment

- Account/org: **TeamWebSprout** · repo: **FixShitBroken** · branch: `main` · initial commit `90f2880`.
- Secrets already stored (don't ask the user for keys again): `CONGRESS_GOV_API_KEY`, `FEC_API_KEY`.
- Workflow permissions left at default "Read repository contents" — fine, refresh.yml elevates itself.
- User has GitHub Desktop installed and the repo added; local folder = `FSB/FixShitBroken`.

## 7. Suggested next steps

1. **Verify run #1 + Pages publish + live URL** (§1 checklist). Debug from job logs if red.
2. Have the user **Pull** in GitHub Desktop, then spot-check locally: open `web/reps/` pages for a few members (e.g. a random House member) — donor cards should show real cycles.
3. Optional: convert profile header score ring → Receipts-led layout (`SCORE_REDESIGN.md`).
4. Optional: build the Town hall page (community feature: accounts/posting/moderation — a build, not a data pull).
5. Optional: occasional manual run with `full_bills` checked to chip away at the full ~15,000-bill corpus.

## 8. Verify anything quickly (in-sandbox)

```
cd app
node --check worker/*.mjs
node worker/generate-rep-pages.mjs --input=../web/data/legislators-current.json   # rebuild 537 pages
# open web/reps/M001224.html — 3 real donor campaign cards
# open web/pillar-will.html — 537-member directory
```

Planning docs at repo root: `README.md`, `TECHNICAL_PLAN.md`, `DATA_SOURCES.md`, `SCORE_REDESIGN.md`, `DEPLOY.md`.
