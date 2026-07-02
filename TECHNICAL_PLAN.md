# fixshitbroken — Technical Plan & Architecture

Prepared June 5, 2026. Scope: resolve the open architecture questions, recommend a stack, define the data model, and lay out a phased build order. This is a planning document, not code. Where a decision rests on a fact, the fact is cited at the bottom.

Read the two red flags in the first section before anything else. They invalidate or reshape decisions the handoff treated as settled.

---

## 1. Two assumptions in the handoff that are now wrong

### 1.1 ProPublica's Congress API is dead

The handoff names ProPublica's Congress API as the data spine and the entire rationale for federal-only scope ("ProPublica's Congress API is clean and centralized"). That API was archived and shut down in February 2025. No new API keys are issued, and the docs are explicitly marked historical-reference-only. Any plan built on it fails on day one.

This does not break the federal-only decision. The replacement sources below are still federal-only and still far cleaner than 50 states of scraping, so the strategic conclusion holds. But the specific integration the handoff assumes has to be replaced. See section 4.

### 1.2 State-pick onboarding cannot produce the core score

The product's headline metric, the Constituent Alignment Score, requires knowing whether a poll respondent is an actual constituent of the legislator being scored. For senators, state is enough. For the 435 House members, you need the respondent's congressional district. The handoff locks onboarding as "state-pick, not address-entry" because address entry is "too much friction."

These two decisions contradict each other. With only a state, you cannot:

- compute a House member's alignment score (you don't know which of a state's districts the respondent belongs to),
- award the Town Hall "local" green checkmark for a House board (same reason).

So one of three things has to give, and this should be a deliberate, surfaced decision rather than a quiet collapse later:

1. **Senators-only alignment scoring at launch.** Keep state-pick onboarding. Score and badge only the 100 senators. House scores come later behind district verification. Cleanest, and it matches the onboarding's own logic that "senators are the emotional payoff." Recommended for v1.
2. **Progressive disclosure.** State-pick for signup and senator reveal, then ask for address (or ZIP+4) only at the moment a user tries to do something district-specific (poll on a House vote, post on a House board). Friction is paid only by engaged users, in exchange for the feature they're reaching for.
3. **ZIP-to-district.** Resolve district from ZIP code. Rejected: roughly a third of ZIP codes straddle two or more districts, so this silently misassigns constituents and corrupts the exact number the product is built on.

Recommendation: ship option 1, design for option 2. Do not pretend a state-level signup yields a defensible House score.

---

## 2. The score is the product's biggest liability, not just its biggest feature

This sits above stack choices because it shapes the data model, the moderation plan, and the legal exposure.

**It is a self-selected poll, not a referendum.** People who opt into an accountability app and answer a poll are not a representative sample of a district. The honest description of the metric is "alignment between this legislator's votes and the views of fixshitbroken's verified respondents in their state or district," which is not the same as "alignment with their constituents." Naming it Constituent Alignment Score and ranking legislators in a Hall of Shame presents a self-selected sample as if it were the district's will. That is a methodological overclaim and, combined with permanent indexed pages, a defamation surface.

**It is attackable.** The whole value proposition collapses if a campaign, a PAC, or a motivated subreddit can move a legislator's score. Phone verification raises the cost of fake accounts but does not stop a coordinated real-person brigade or someone with a drawer of SIM cards. The score needs, from day one: one verified person to one vote per poll, district binding, rate limiting, anomaly detection on vote velocity and source, and a publicly documented methodology so the number can be defended when a legislator's office attacks it.

**Mitigations to bake in now**

- Always show the sample size and a margin/confidence next to any score. A score from 40 respondents is not a score from 4,000, and the UI must never hide that.
- Publish the methodology page before launch, not after. The "open-source the methodology" promise in the manifesto is also the legal shield.
- Treat the score as opinion-grounded-in-disclosed-data (here is the vote, here is how our respondents wanted it, here is n), never as a bare factual verdict. That framing is both more honest and more defensible.

---

## 3. Recommended stack

The handoff floats Next.js + Tailwind and asks the next team to decide. Here is the decision with the reasoning and the honest counterargument.

### Frontend / app framework: Next.js (App Router) + Tailwind

Two product requirements force server-side rendering, which is the real deciding factor:

- **Town Hall's entire accountability mechanism is SEO.** "Public, permanent, Google-indexed URL, surfaceable by reporters" only works if each post and board renders server-side with real content and clean metadata. A client-rendered SPA undermines the core feature.
- **The 535 directory and the legislation feed are data-heavy, mostly-read pages** that benefit from server rendering and caching.

Next.js App Router covers both, hosts trivially, has the largest auth and component ecosystem, and the existing `shared.css` tokens port cleanly to a Tailwind theme (or stay as CSS variables, which is actually less work; see 3.5).

**Counterargument, stated fairly.** Most of the public site is content with islands of interactivity (a poll widget, an upvote button, a map). Astro is arguably a better fit for that shape and ships less JavaScript. The reason to still pick Next.js is the logged-in surface: dashboard, watchlists, voting, notification prefs, and a Town Hall that wants near-live updates is genuinely app-like, and running one framework beats stitching Astro plus a separate app together. If the logged-in experience turns out thin, revisit Astro before the codebase is large. This is the one stack call worth keeping open the longest.

### Database: Postgres via Supabase

Postgres is the obvious data layer (the handoff already assumes it). Supabase is the recommendation over raw Postgres or Neon because, for a budget-constrained project with no VC and a $5/month funding model, it collapses four needs into one managed service: Postgres, authentication (email + phone OTP), row-level security for the moderation and ownership rules, and file storage for meme images. That removes a meaningful amount of infrastructure you would otherwise build and pay for separately.

Caveats, surfaced deliberately: it is vendor lock-in, the free tier will not carry real traffic, and Supabase auth still needs custom logic layered on top for constituent (district) verification, which is not an off-the-shelf feature. If lock-in is unacceptable, the open alternative is Neon (Postgres) plus Auth.js plus a separate object store, at the cost of more wiring. Either is defensible. Supabase ships faster.

### Data ingestion: a separate scheduled worker, not request-path code

The Congress data sync, the Senate XML scraping, and the legislation summarization pipeline must not run inside web request handlers. They are batch jobs on a schedule. Cheapest defensible setup: a small Node or Python worker triggered on a cron (GitHub Actions for the daily bulk legislator pull, plus a lightweight always-cheap worker on Railway or Render, or Supabase scheduled Edge Functions for the lighter API polls). It writes to Postgres; the web app only ever reads the already-ingested, already-summarized rows. This keeps the user-facing app fast and lets the data layer fail and retry without taking the site down.

### Hosting

Vercel for the Next.js app (its native home, generous-enough hobby tier, scales with traffic). Supabase hosts the database, auth, and storage. The ingestion worker lives on whatever is cheapest that supports long-running or cron jobs (Railway, Render, or Fly). Three small bills instead of one big one, all usage-based, which fits the funding model.

### 3.5 On porting `shared.css` to Tailwind

You do not have to. The design system is already a clean set of CSS custom properties (`--rust`, `--sage`, the brown ramp) plus component classes (`.rep-card`, `.legis-card`, `.score-ring`). Two valid paths:

- **Keep the CSS variables, adopt Tailwind only for layout utilities.** Map the tokens into `tailwind.config` so `bg-rust` etc. exist, but let the existing component classes survive as components. Least churn, preserves the editorial design exactly.
- **Full port to Tailwind components.** Cleaner long-term consistency, but it is real work to re-express the hand-tuned shadows, the Instrument Serif italic interplay, and the score-ring SVG, with risk of visual drift from a design that was deliberately matched to a reference.

Recommendation: keep `shared.css` tokens and components, add Tailwind for new layout and responsive work. Rewrite components into Tailwind only if and when they need to change anyway.

---

## 4. Data sources (replacing ProPublica)

| Need | Source | Notes |
|---|---|---|
| Legislator roster, bios, IDs, party, terms, social, offices | `unitedstates/congress-legislators` (open YAML/JSON/CSV) | The canonical free dataset and the spine of the 535 directory. Pull bulk, refresh weekly. Use `bioguide` ID as the primary cross-reference key. |
| Legislation, sponsors, cosponsors, status, subjects | Congress.gov API (Library of Congress, official) | Requires a free API key. The current, maintained successor to ProPublica for bills. |
| House roll-call votes + per-member positions | Congress.gov API, House Roll Call Votes endpoints | Beta. Covers legislation-related votes from the 118th Congress (2023) forward. Non-legislation House votes are a stated future phase, not available yet. |
| Senate roll-call votes + per-member positions | senate.gov per-vote XML feed | Congress.gov does not yet serve Senate votes. Senate publishes structured XML per vote (back to the 101st Congress), posted within about an hour of each vote. You will scrape and normalize these yourself. |
| Address to congressional district (for verification) | US Census Geocoder (free REST API) | Single-record `geographies` lookup returns the current congressional district by default. Free, no key. Note: the batch endpoint returns only state/county/tract/block, not district, so per-user verification at signup runs as single-record calls (which is the natural shape anyway, one user at a time). This is the replacement for the Google Civic Representatives API, turned down April 30, 2025. |
| Address to district, paid fallback | Geocodio | Paid, but returns district plus current officials in one call and is more forgiving of messy address input. Worth it if Census match rates frustrate users. |

Two integration realities to plan around: House and Senate votes come from two different systems with two different shapes, so you need a normalization layer that maps both into one internal `vote` / `member_vote` schema keyed on bioguide ID. And House vote data only reaches back to 2023, so any "career voting record" claim is bounded by that unless you backfill from another source (GovTrack's bulk data, also winding down, or the raw House Clerk XML).

---

## 5. Data model (core entities)

Designed so that adding state and local later is a data change, not a schema rewrite. The trick is a `jurisdiction` / `chamber` dimension on the structural tables rather than hardcoding "federal." Do not build state/local features now; just do not paint yourself out of them.

**Reference / ingested (read-only to the app, written by the worker)**

- `legislator` — bioguide_id (pk), full_name, party (D/R/I), photo, current chamber, state, district (null for senators), in_office, social handles, contact. Sourced from congress-legislators.
- `chamber` — house | senate, and a `jurisdiction` field (federal now) to leave room later.
- `term` — legislator_id, chamber, state, district, start, end. Supports historical and "career" views.
- `legislation` — congress_gov_id, type+number (e.g. HR 4471), title, status, introduced_date, sponsor_id, summary_official.
- `legislation_cosponsor` — legislation_id, legislator_id, date.
- `roll_call_vote` — source (house_api | senate_xml), congress, session, roll_number, chamber, date, question, legislation_id (nullable), result.
- `member_vote` — roll_call_vote_id, legislator_id, position (yes | no | present | not_voting).

**Editorial (written by humans / the pipeline, with provenance)**

- `legislation_summary` — legislation_id, plain_summary (30-second), what_it_does (bullets), winners, losers, who_pays, status, author, reviewed_by, published_at. Provenance fields matter for the "comparable to source text" promise. Per the copy rule, nothing here references how the summary was produced.
- `lobbying_position` — legislation_id, org, stance (support | oppose), source_url.

**Users & verification (the integrity core)**

- `user` — id, email, email_verified_at, phone, phone_verified_at, home_state, home_district (nullable until district-verified), display_name, created_at.
- `verification_event` — user_id, type (email | phone | district), method, evidence_ref, verified_at. Auditable trail behind every badge and every counted vote.
- `watchlist_item` — user_id, target_type (legislation | legislator), target_id.
- `notification_pref` — user_id, channel, event_types.

**Polling (feeds the score)**

- `poll` — legislation_id or roll_call_vote_id, question, opens_at, closes_at.
- `poll_response` — poll_id, user_id, position, user_state, user_district (snapshotted at vote time), created_at. Unique on (poll_id, user_id). The snapshot matters: if a user moves, their past votes should not silently re-attribute.
- `alignment_score` — materialized/derived: legislator_id, window, score, respondent_n, confidence, computed_at. Never store this as if it were authored truth; recompute it and always surface `respondent_n`.

**Community surfaces (highest moderation risk)**

- `board` — one per legislator (535). legislator_id, activity_metrics.
- `post` — board_id, user_id, body, is_local (constituent badge), score (upvotes), status (visible | removed | under_review), permalink_slug, created_at. The permalink is the permanent indexed URL; status drives whether it renders or 410s.
- `post_vote` — post_id, user_id, value. Unique on (post_id, user_id).
- `meme` — user_id, image_ref, caption, status, week, created_at.
- `meme_vote` — meme_id, user_id. Unique on (meme_id, user_id).
- `hall_of_fame` — week, meme_ids (top 3), computed Mondays 09:00 ET.
- `moderation_action` — target_type, target_id, actor, action, reason, created_at. Required for appeals and for the "permanent but removable" tension below.

---

## 6. Moderation: the highest-risk surface, needs a policy before launch

Town Hall combines three things that are individually manageable and collectively dangerous: user-generated content, a stated promise of permanence, and Google indexing. That means defamation and harassment, once posted, live at a stable, search-ranked URL forever, and "we promised permanence" is not a legal defense against a libel or a doxxing claim.

**The permanence-versus-removal tension, stated plainly.** The brand promises "the receipts don't disappear." Moderation requires that some posts do disappear. Resolve this in writing before launch: permanence is a promise about not memory-holing legitimate criticism, not a promise to host illegal or policy-violating content. A removed post should return a tombstone ("removed for violating X"), not silently vanish, which honors the spirit of permanence while allowing takedowns. Bake this into `post.status` and the tombstone render path now.

**Recommended posture for v1**

- **Posting gated to verified users**, and ideally to verified constituents of that board. Raising the barrier to entry is the single most effective spam and brigade control, and it reinforces the product's own "constituent" framing.
- **Automated pre-screen** for slurs, threats, and obvious doxxing (the content rules the handoff already lists), feeding a **human review queue** rather than hard auto-deletion.
- **Clear, public content policy** mapped to the existing rules (punch up, both parties fair game, no targeting voters, no slurs), plus the things the handoff has not yet written down: threats, doxxing, illegal content.
- **Section 230 posture and a real takedown + appeal process.** As a host of third-party content the platform has protection, but it needs a documented notice-and-action flow to keep it and to behave responsibly.
- **Do not reintroduce the print-and-mail mechanism.** The handoff removed it; noting it here so it stays removed.

Staffing reality: a small team cannot manually review everything at scale. The realistic model is automated filtering plus community flagging plus a small human backstop on the queue, with verified-constituent gating keeping volume sane early. Plan the queue tooling as part of v1, not after the first incident.

---

## 7. Constituency verification: proving residency without postal mail

Section 1.2 defers House-district binding to "the moment it is needed," and section 4 already has the Census Geocoder resolving an address to a district for free. This section resolves the question that leaves open: once a user types an address, how do you gain confidence they actually live there, without the print-and-mail postcard (rejected in section 6 for cost and labor)?

**Separate the two problems first.** They get bundled as "verify the address," but only one is hard. *Resolving* an address to a congressional district is solved and free (Census Geocoder, single-record call; Geocodio as the paid fallback). *Proving the person lives at the address they typed* is the actual problem, and it has an honest ceiling worth stating up front: every cheap, non-intrusive method is defeatable by a motivated individual. None are unspoofable. The goal is therefore not proof; it is raising the cost of brigading a *specific* district high enough that it is not worth it. Calibrate every choice below to that bar, not to certainty.

**Reframe address as constituency.** What the product actually needs is not a mailing address but the answer to "is this person a constituent of district X." Framing it that way opens methods a utility bill cannot reach, and several of them map more directly to the thing that matters (can this person vote for this member) than proof of a postal address does.

### 7.1 The right architecture: risk-based, tiered — not one gate for everyone

Requiring strong residency proof from every user at signup is the expensive, high-friction path, and it contradicts the funding model. The model that fits is **tiered verification with step-up on risk**:

- **Baseline (everyone):** email + phone OTP (already built) + self-attested address geocoded to a district and bound to the verified identity. This grants a "verified constituent (self-reported)" state and the ability to post. Assurance is low on its own, but bound to one-verified-identity-per-account and a logged, bannable false-attestation rule, it raises cost meaningfully at zero marginal spend.
- **Step-up (only when a risk signal fires):** require one stronger check — voter-file match, payment AVS, or a one-time device geofence (7.2) — when the system sees a velocity spike, an IP geolocating to the wrong region, a flagged account, a contentious board, or any counted-vote context where the score is attackable (section 2).

This keeps expensive verification the exception, not the default, and never touches postal mail. It is also the concrete implementation of section 1.2's "ship option 1, design for option 2."

**Deferred-verification variant, worth considering.** Let people post immediately in a clearly-labeled "unverified" state and reserve the constituent badge (and any constituent-only views or counted votes) for those who pass a check. Friction at signup drops to zero and integrity moves into display logic. The tradeoff is that unverified posts still generate moderation load.

### 7.2 The methods, with what each actually proves

| Method | What it proves | Cost / friction | Where it breaks |
|---|---|---|---|
| **Self-attested + geocoded, identity-bound** | Little on its own; raises cost when tied to verified identity + false-attestation ban | Zero cost, zero friction | Trivially false in isolation — needs the identity binding to matter |
| **Voter-file match** (state files, or L2 / Catalist / TargetSmart) | Registered voter at that address in that district — arguably the *ideal* constituent test | Per-match cost; name + address only, no document upload | Misses the unregistered: renters, young, recent movers, non-citizen residents who are still constituents |
| **Phone-to-address identity match** (Prove, Telesign, Ekata, etc.) | Whether the already-collected phone is associated on record with the claimed name/address | Small per-check cost, no user friction, no labor | Prepaid phones, numbers not in the user's name, younger users |
| **Payment AVS** (billing address checked at charge) | Bank-verified billing address as a side effect of the $5/month charge | Near-zero added friction *if they already pay*, no labor | Excludes non-payers; billing address ≠ residence necessarily |
| **One-time device geofence** (browser/app location at signup) | Physical *presence* in the claimed district, at district accuracy | Free; a permission prompt | Mock-location/dev-tools spoofing; must be home at signup; privacy-sensitive |
| **Reuse a proofed identity** (Login.gov, ID.me, mobile driver's licenses) | High-assurance identity incl. address, proofing offloaded to the provider | Minimal build; provider cost + UX friction + dependency | Coverage gaps; capabilities/pricing shift — verify before committing |
| **Bank-account verification** (Plaid returns bank-on-file address) | Strong, bank-verified name + address | OAuth bank login | Connecting a bank to post on a message board is a trust ask this surface probably can't carry — likely too intrusive |

### 7.3 The brand caveat, decided on principle

Several of the stronger options (phone-to-address, voter file, credit-header lookups) route users through the data-broker economy. For a product whose pitch is "built by citizens, 100% public data, no lobbyist hands on the wheel," quietly piping people through data brokers is a real tension and carries its own privacy-law exposure (state privacy statutes, and TCPA-adjacent consent concerns already flagged in section 10). Direct state voter files, Login.gov, and AVS-on-your-own-payment are more defensible on that axis than broker lookups. Decide this on principle, not just on cost.

**Recommendation.** Ship the baseline (7.1) for launch, since senators-only v1 needs only state anyway (section 1.2). Build voter-file match and payment AVS as the first two step-up checks, because they are the most brand-defensible and the voter-file match doubles as the cleanest definition of "constituent." Treat everything else as later, risk-triggered additions. Do not gate all users behind any paid or broker-backed check by default.

### 7.4 The proposed system, concretely

The spine is two mechanisms working together: **named assurance levels** that permissions and badges check, backed by a **trust score** the risk engine uses to decide when to force a step-up. Levels are the coarse gate; the score is the fine-grained lever.

**Assurance levels**

- **L0 — Reader.** No account, read-only. Most traffic; stays frictionless.
- **L1 — Verified human.** Email verified + phone OTP passed, phone unique (one account per number). Can follow members, build watchlists, set notifications. Cannot post or vote.
- **L2 — Constituent, self-reported.** L1 + address geocoded to a district (Census, section 4), bound to identity, attestation logged as a bannable act. Grants posting where the claimed state/district matches, plus a muted "constituent (self-reported)" badge. **Default posting tier.**
- **L3 — Constituent, corroborated.** L2 + one passing external signal (7.2). Grants the strong "verified local" badge; required for anything that feeds the score or is flagged high-risk.

For senators-only v1, L2 already suffices for senator boards and polls (state is enough), so launch requires no paid external check. L3 is what unlocks House boards later and what the engine forces on contentious surfaces.

**Action → required level**

| Action | Requires |
|---|---|
| Read boards/posts | L0 |
| Watchlist, follow, notifications | L1 |
| Post to your senator's board | L2 |
| Post to a House board · counted poll vote feeding a score | L3 (or L2 + clean risk pass) |
| Any board flagged under brigade pressure | L3 enforced |

**Trust score (tunable defaults).** Signals add points so weak ones combine and no single is a chokepoint:

| Signal | Points |
|---|---|
| Email verified | +1 |
| Phone OTP + unique | +2 |
| Address geocoded + attested | +1 |
| IP region consistent with claimed state (passive) | +1 |
| Device geofence inside claimed district | +2 |
| Payment AVS match on the $5 charge | +3 |
| Voter-file exact match (name + address) | +4 |
| Reused proofed identity (Login.gov / ID.me) | +5 |

Thresholds: **post ≥ 4**, **counted vote / strong badge ≥ 6**, **high-risk context ≥ 6 enforced**. The risk engine raises the *required* threshold — it does not hard-block — when it sees velocity spikes, an IP geolocating to the wrong region, prior flags, or a board under brigade pressure. Below threshold, the user gets a step-up prompt, not a rejection.

**Step-up UX: user picks the path.** No corroboration method has full coverage (renters miss voter files, young users miss phone-to-address, non-payers miss AVS), so L2→L3 presents a short "verify however suits you" menu and takes the first that passes: payment AVS (near-zero friction if already paying), state voter-file match (name + address, no upload), or a one-time device location check. Data-broker phone-to-address stays off the user-facing menu per 7.3 — a silent backend risk signal at most.

**Provider order (most brand-defensible first).** Auth + OTP: Supabase Auth. District: Census, Geocodio fallback. Corroboration: payment AVS via the existing processor → direct state voter files (or L2/Catalist if a vendor is acceptable) → Login.gov. Bank/Plaid stays out.

**Data-model deltas (extend, don't replace).** `verification_event` gains `signal`, `points`, `confidence`, `expires_at`. `user` gains derived, cached `assurance_level` and `trust_score`, recomputed on each event. Continue snapshotting `user_state`/`user_district` at every post and poll vote (already done for `poll_response`) so a later move never re-attributes past actions.

**Anti-abuse specifics that are easy to skip.** Hash and unique-constrain the phone so one number can't farm accounts. Rate-limit *OTP sends* per number/IP/hour and cap daily SMS spend from day one — OTP-pumping is a real DoS against a $5/month project. Re-verify on any address change; expire corroboration after ~12 months so stale badges don't persist. Log every decision with its inputs for the appeal path.

**Privacy posture.** Store the minimum: phone as a salted hash, not plaintext; retain the raw address only long enough to geocode and corroborate, then keep the district plus a hashed reference. Corroboration providers should return a match/confidence, not a stored dossier.

**Honest limitation.** This raises the cost of brigading a specific district and makes counted votes defensible, but the cheap tiers are spoofable by a determined individual, and a coordinated group of *real* verified constituents defeats identity checks entirely. That residual is handled by rate-limiting and velocity anomaly detection (section 2), not by verification.

---

## 8. Open questions, resolved

**Bingo Card: cut from v1.** It is the one feature not attached to a pillar. It adds editorial work and another moderation surface ("Voted with pharma" as a public claim carries the same defamation exposure as a low score, with less rigor behind it). Defer it. Revisit only once the four pillars are real and only if it earns its place.

**State and local roadmap: design for it, do not build it.** Federal-only at launch is correct and the data sources reinforce it. The only thing to do now is keep `jurisdiction`/`chamber` as real dimensions (section 5) so a future state expansion is data and ingestion work, not a schema migration. Do not pick "which states first" now; that is a post-launch decision driven by where your users actually are.

**Backend shape:** Next.js server actions and route handlers for the app's own reads and writes; a separate scheduled worker for all external-data ingestion and summarization (section 3). Keep the two apart.

**Funding-model implication for infra:** the no-ads, no-grants, $5/month model means infrastructure cost is an existential constraint, not a footnote. Every choice above (managed Supabase, usage-based hosting, cheap cron worker, aggressive caching of mostly-static reference data) is made with that constraint in mind. Watch the SMS bill specifically; phone verification via Twilio or Supabase has real per-message cost and is a brigade-attack amplifier (someone can run up your bill by triggering OTPs). Rate-limit verification sends from day one.

---

## 9. Build order

The handoff's instinct ("get the first three pillars real with real data before polls and memes") is sound. Refined:

**Phase 0 — Foundations.** Next.js + Supabase scaffold. Port `shared.css` tokens into the app. Stand up the data model. Build the ingestion worker against `congress-legislators` and load all 535 legislators. No auth yet.

**Phase 1 — Read-only truth.** Make the static pages clickable: tab switching, filter pills, the state map, card links. Wire Congress.gov for legislation and House votes, and the Senate XML scraper for Senate votes, into the directory, the rep detail Votes tab, and the legislation feed. Everything real, nothing yet requiring login. This is the demo that proves the product.

**Phase 2 — Editorial pipeline.** Hand-write summaries for 5 to 10 pieces of live legislation through the `legislation_summary` schema (winners/losers/who-pays), to prove the "Legislation for Dummies" editorial flow and the provenance fields work. Manual first; scale the production method later without ever exposing it in the UI.

**Phase 3 — Accounts and verification.** Email + phone auth via Supabase. State-pick onboarding. Senators-only constituent binding for v1 (section 1.2). Watchlists and notification prefs. District verification (Census Geocoder) built but gated to the moment it is needed (option 2 path).

**Phase 4 — The score.** Polls tied to verified responses. Alignment computation for senators, always shown with `respondent_n` and confidence. Methodology page published simultaneously. This is the phase to move slowly and defensibly on, because it is the phase a legislator's comms office will attack.

**Phase 5 — Community.** Town Hall with the moderation stack from section 6 in place before the first post, not after. Then memes and the weekly Hall of Fame.

**Mobile responsive work runs in parallel from Phase 1**, not as a final pass. The handoff is right that phones are most of the traffic, which means the bottom-nav and stacked-layout work should land alongside each page becoming interactive, not bolted on at the end against ten finished desktop layouts.

---

## 10. Things to get a lawyer on before launch (not legal advice)

- **Defamation exposure** from Hall of Shame, public scores, and permanent indexed Town Hall posts. The opinion-grounded-in-disclosed-data framing and the published methodology are the mitigations, but a media/defamation lawyer should review the score's presentation and the Town Hall takedown flow.
- **TCPA / SMS consent** for phone verification.
- **Platform liability** posture for user content (Section 230 alignment, notice-and-action).
- **Tax and entity structure** given the "no PAC money, no foundation money, membership-only" commitments, which constrain what kind of entity this can be.

---

## Sources

- [ProPublica Congress API (archived, historical reference only)](https://projects.propublica.org/api-docs/congress-api/)
- [Introducing House Roll Call Votes in the Congress.gov API — Library of Congress](https://blogs.loc.gov/law/2025/05/introducing-house-roll-call-votes-in-the-congress-gov-api/)
- [api.congress.gov documentation — Library of Congress (GitHub)](https://github.com/LibraryOfCongress/api.congress.gov)
- [U.S. Senate roll-call votes XML availability](https://www.senate.gov/general/common/generic/XML_Availability.htm)
- [unitedstates/congress-legislators dataset](https://github.com/unitedstates/congress-legislators)
- [US Census Geocoding Services API](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html)
- [Notice of Turndown of the Google Civic Representatives API (April 30, 2025)](https://groups.google.com/g/google-civicinfo-api/c/9fwFn-dhktA)
- [Geocodio congressional district + contact data](https://www.geocod.io/guides/congressional-data)
