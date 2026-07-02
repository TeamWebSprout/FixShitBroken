# fixshitbroken — Data Acquisition Plan

Prepared June 5, 2026. This maps every piece of data the four pillars need to a specific live source, with how fresh it actually is, what it costs, how it is licensed, how often we refresh it, and where the real gaps are. Every source named here was checked against its live site or docs and is current as of this date. Sources at the bottom.

## Read this first: three things "live and flawless" cannot mean

You asked for the most recent data possible on bills, votes, and donations. Bills and votes can be near-real-time. Donations cannot, and two donor-related features in the mockups have no clean live source at all. Setting these expectations now prevents building a UI that promises freshness the underlying disclosure system does not provide.

1. **Donations are structurally stale, by law.** Campaign finance is not a live feed. Committees file on a schedule (quarterly for most, monthly for some, with 48-hour notices only for large contributions near an election). The FEC then updates nightly with up to a 48-hour processing lag. So between filing deadlines, the "most recent" donation data can legitimately be weeks to months old. This is the disclosure law, not a source limitation, and no API fixes it. The UI must date-stamp donation data ("as reported through [last filing date]"), never imply real-time.

2. **"Donor sectors" no longer has a turnkey source.** The mockup's Donors tab shows industry/sector breakdowns. The organization that did that classification, OpenSecrets, discontinued its API on April 15, 2025. Raw FEC data gives you contributions but does not label them by industry. Getting sector breakdowns now means either licensing OpenSecrets bulk data (lagging, with terms), or building industry classification on top of raw FEC yourself (the hard, decades-long problem OpenSecrets existed to solve). This is the single biggest data gap in the product. See the Donors row.

3. **"Lobbying positions" (support/oppose per bill) is not in the disclosure data.** Lobbying disclosure (LDA) filings tell you which registrants lobbied on which bills, but not whether they were for or against. The clean support/oppose framing on the legislation-detail page does not exist in any filing. It has to be sourced editorially or dropped. See the Lobbying row.

Everything else is in good shape. Bills, votes, sponsors, and the legislator roster are all available from official, free, current sources.

---

## Freshness tiers (what each pillar can honestly promise)

| Data | Realistic freshness | Limiting factor |
|---|---|---|
| Roll-call votes | Minutes (House), ~1 hour (Senate) | Official XML publication speed |
| Bills, sponsors, status, schedule | Same day to 24h | Congress.gov / GovInfo update cadence |
| Legislator roster | Days (rarely changes) | Volunteer-maintained dataset |
| Donations (totals, contributions) | Weeks to months between filings | Disclosure law filing schedule + 48h FEC processing |
| Donor sectors/industries | Stale and unowned | No live classification source since April 2025 |
| Lobbying activity | Quarterly | LD-2 filing schedule |

---

## Source-by-source inventory

### Legislator roster (the 535) — pillar: Will of the People, all pages
- **Source:** `unitedstates/congress-legislators` (open dataset, YAML/JSON/CSV).
- **Gives you:** every current member, party, state, district, bioguide ID, terms, committee links, social handles, office contacts. The cross-reference key (bioguide ID) that ties every other source together.
- **Freshness:** updated within days of any membership change. Rarely changes mid-session.
- **Cost / license:** free, public domain (CC0-style).
- **Refresh cadence:** pull nightly (cheap), or weekly. Treat as the spine; load it first.

### Bills, current and upcoming — pillar: Legislation for Dummies
- **Primary source:** Congress.gov API (Library of Congress, official). Free API key required.
- **Gives you:** every bill and resolution as introduced (this is your "future"/upcoming legislation, the moment it is filed), full status, sponsor, cosponsors, committee referrals, official summaries, subjects, latest actions.
- **Bulk backfill / mirror:** GovInfo Bulk Data (govinfo.gov) for full-text and historical loads if you need to seed at scale.
- **Freshness:** same-day to 24h.
- **Cost / license:** free, U.S. government work, not copyrighted.
- **Refresh cadence:** poll the "latest actions" and "introduced this congress" endpoints a few times daily; poll bills on your watchlists more often around scheduled votes.
- **Note:** "voting this week" / upcoming-vote framing comes from combining introduced bills with the House and Senate floor schedules (both published as XML), not from a single "upcoming votes" endpoint.

### Roll-call votes — pillar: Will of the People (the scoring input)
This is two different systems. You normalize both into one internal schema keyed on bioguide ID.
- **House:** Office of the Clerk EVS XML (`clerk.house.gov/evs/...`), one XML file per roll call with each member's position. Published within minutes of the vote. This is your freshest vote source.
  - Congress.gov also exposes House votes via API (beta), but only legislation-related votes from the 118th Congress (2023) forward, and with more lag. Use it for enrichment, use the Clerk XML for speed and for the full record.
- **Senate:** senate.gov roll-call XML (per-vote files plus per-session vote menus), posted within about an hour. Congress.gov does not serve Senate votes yet, so this scrape is mandatory, not optional.
- **Freshness:** minutes (House), ~1 hour (Senate).
- **Cost / license:** free, government work.
- **Refresh cadence:** poll both during session hours (e.g. every 5 to 15 minutes when either chamber is in session), idle otherwise.
- **Coverage limit:** clean structured per-member House vote data via the API reaches back to 2023; the Clerk EVS archives go back much further (1990s) if you want a longer career record.

### Donations — pillar: Will of the People (rep-detail Donors tab)
- **Source:** OpenFEC API (`api.open.fec.gov`), the FEC's official REST API. Free API key.
- **Gives you:** candidate and committee totals, individual contributions (Schedule A), disbursements (Schedule B), PAC activity, filing history. Keyed to FEC candidate/committee IDs, which `congress-legislators` maps to bioguide IDs for you.
- **Freshness:** nightly updates, up to 48h processing lag, and fundamentally bounded by the filing schedule (see constraint 1). Date-stamp everything.
- **Cost / license:** free, public domain.
- **Refresh cadence:** nightly is plenty; the data does not change faster than that.
- **What it does NOT give you:** industry/sector classification. See next row.

### Donor sectors / industries — pillar: Will of the People (Donors sidebar) — GAP
- **The problem:** OpenSecrets discontinued its API on April 15, 2025. There is no longer a maintained API that returns "top industries to this member."
- **Options, in order of effort:**
  1. **OpenSecrets bulk data** (downloadable CSVs with their industry codes). Lagging and governed by their data-use terms; check licensing before shipping. Lowest effort if terms allow.
  2. **Build classification on raw FEC data** using employer/occupation fields and a maintained industry-code mapping. This is real, ongoing data-science work and is exactly what OpenSecrets spent decades doing. High effort, high maintenance.
  3. **Ship raw FEC instead of sectors at launch:** show top PAC and individual contributors and top contributing committees (which FEC gives you directly), and defer industry rollups. Recommended for v1.
- **Recommendation:** launch with raw FEC contributor data (honest, free, official), label the sector view "coming soon," and decide later whether sector classification is worth licensing or building.

### Lobbying — pillar: Legislation for Dummies (legislation-detail "lobbying positions") — GAP
- **Source:** Lobbying Disclosure Act filings. The Senate LDA REST API (`lda.senate.gov/api`) currently serves LD-1 registrations and LD-2 quarterly activity reports. Note: the Senate LDA site is being retired after June 30, 2026, with REST access moving to LDA.gov / lda.congress.gov. Build against the new endpoint, not the retiring one.
- **Gives you:** which registrants/clients lobbied, on which general issues and named bills, how much they spent, quarterly.
- **What it does NOT give you:** a support/oppose position. Filings disclose that an org lobbied on a bill, not which side. The mockup's clean "supports / opposes" framing has no source in the data.
- **Options:** (a) reframe the feature as "who is lobbying on this" (neutral, fully sourced from LDA), or (b) source positions editorially from public statements, coalition letters, and testimony, with citations. Do not infer a position from a disclosure filing; that is unsupported and a liability.
- **Recommendation:** ship the neutral "who lobbied" version from LDA data; add editorially-sourced positions later only with receipts.

### Plain-English bill summaries — pillar: Legislation for Dummies (the editorial engine)
- **Source:** internal editorial output, not an external feed. Congress.gov provides official CRS summaries as raw material, but the 30-second plain-English summary with winners/losers/who-pays is your own product.
- **Freshness:** as fast as your editorial pipeline runs.
- **Note:** per the locked copy rule, nothing in the user-facing summary references how it is produced.

### Member statements / "In their own words" — pillar: rep-detail tab
- **Sources:** Congress.gov Congressional Record (floor statements) via API; official press releases and social handles from `congress-legislators`.
- **Freshness:** Congressional Record posts with a short delay (next day typically).
- **Gap note:** there is no single clean "everything this member said" feed. This tab is an aggregation effort; scope it modestly for v1.

---

## Refresh architecture (what the ingestion worker runs, and how often)

The worker (separate from the web app, per the technical plan) runs these on independent schedules so a slow or failed job never blocks the site:

- **During session hours, every 5 to 15 min:** House EVS XML + Senate roll-call XML (votes), floor schedules.
- **A few times daily:** Congress.gov bills, latest actions, watchlisted-bill detail.
- **Nightly:** legislator roster, OpenFEC donation data.
- **Weekly / on-filing-deadline:** LDA lobbying data (quarterly cadence, so weekly polling is generous).
- **On demand:** re-summarization and editorial review queue.

Everything lands in Postgres normalized on bioguide ID. The web app only reads ingested rows. Cache the slow-changing reference data (roster, bills) aggressively; the votes table is the only hot path during session hours.

---

## Accounts and keys to provision (data layer)

- **Congress.gov API key** — free, at api.congress.gov. Needed for bills, members, House votes, Congressional Record.
- **OpenFEC API key** — free, at api.open.fec.gov (DATA.gov key). Needed for donations.
- **LDA.gov API access** — free; register for the new endpoint (the Senate LDA site retires after June 30, 2026).
- **No key needed:** House EVS XML, Senate roll-call XML, `congress-legislators`, Census Geocoder, GovInfo bulk data. All open.
- **Decision required before building Donors fully:** whether to license OpenSecrets bulk data, build sector classification, or ship raw FEC only (recommended).

---

## Gap summary (the only three things not cleanly solved)

1. **Donor sectors:** no live source since April 2025. Ship raw FEC contributors at launch; defer sector rollups.
2. **Lobbying positions:** support/oppose not in any filing. Ship neutral "who lobbied" from LDA; add positions only with editorial citations.
3. **Donation freshness:** bounded by filing law, not technology. Date-stamp, never imply real-time.

Everything else (votes, bills, sponsors, roster, schedules) is official, free, current, and near-real-time.

---

## Sources

- [unitedstates/congress-legislators dataset](https://github.com/unitedstates/congress-legislators)
- [Congress.gov API (Library of Congress)](https://github.com/LibraryOfCongress/api.congress.gov)
- [House Roll Call Votes in the Congress.gov API (coverage from 2023)](https://blogs.loc.gov/law/2025/05/introducing-house-roll-call-votes-in-the-congress-gov-api/)
- [House Clerk roll-call votes (EVS)](https://clerk.house.gov/Votes)
- [Senate roll-call votes XML availability](https://www.senate.gov/general/common/generic/XML_Availability.htm)
- [OpenFEC API (FEC campaign finance)](https://api.open.fec.gov/developers/)
- [OpenSecrets API discontinued April 15, 2025](https://www.opensecrets.org/open-data/api-documentation)
- [Senate LDA Reports API (retiring after June 30, 2026)](https://lda.senate.gov/api/)
- [US Census Geocoder API](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html)
