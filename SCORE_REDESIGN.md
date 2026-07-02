# fixshitbroken — Rethinking the Score

Prepared June 5, 2026. You asked to rethink the Constituent Alignment Score entirely. This proposes what replaces it and why. The short version: split the one number into two things it was wrongly combining, make the objective half the centerpiece, and demote the subjective half to a clearly-labeled, attack-resistant supplement.

## Why the original score fails

The Constituent Alignment Score tried to be one authoritative percentage that said "this legislator is X% aligned with their constituents." It has four problems, and they are not cosmetic:

1. **It is a self-selected poll wearing the costume of a referendum.** The people who download an accountability app and answer a poll are not a representative sample of a district. Calling their aggregate "the constituents" is a factual overclaim.
2. **It is trivially gameable.** A campaign, a PAC, or a motivated online group that can create or coordinate verified accounts can move the number. The moment a score can be moved, it can no longer be trusted, and the product's central promise collapses.
3. **It is a defamation surface.** A single authoritative number, published in a "Hall of Shame" at a permanent indexed URL, presented as objective fact, is the most legally exposed possible way to make a contestable claim about a named person.
4. **It buries the strongest material.** The genuinely unimpeachable data (how someone actually voted, who actually funded them, what they actually said) is objective and sourced. Wrapping it inside a squishy poll-based percentage makes the strong evidence inherit the weak evidence's vulnerability.

The fix is not a better formula. It is separating two questions the score conflated.

## The core move: separate the receipts from the opinion

There are two fundamentally different questions here, and they must never share a number:

- **Objective:** What did this legislator actually do? (votes, money, attendance, statements.) This is fact. It needs no scoring, only clear presentation. It cannot be defamatory because it is true and sourced.
- **Subjective:** Do people think that was the right call? This is opinion. It can be shown, but only honestly labeled as the opinion of a self-selected group, with its size visible, never as a verdict.

The original product fused these into one percentage. The redesign keeps them apart and leads with the objective one.

---

## Proposal: a two-layer model

### Layer 1 (the centerpiece): The Receipts — objective, factual, unscored

Every legislator page leads with a factual record, presented plainly, every line sourced and linkable:

- **Voting record:** every roll call, the question, how they voted, link to the official vote. (House EVS XML, Senate XML.)
- **Money:** who funded them, top contributors, PAC vs individual, totals, dated to the last filing. (FEC.) No "sector" spin at launch, just sourced contributors.
- **Attendance:** missed votes as a simple count and rate. (Derivable from vote data.)
- **In their own words:** floor statements and public positions, quoted with citation. (Congressional Record.)

This is the accountability engine. It is unattackable precisely because it makes no judgment. It just shows what happened, with a link to prove it. This is what reporters surface, what voters screenshot, and what no comms office can credibly dispute, because disputing it means disputing the official record.

Crucially, this layer needs no constituent verification, no poll, and no district resolution. It works for all 535 on day one. That also unblocks the launch, because the hardest data and integrity problems (verification, polling, Sybil resistance) are no longer on the critical path to shipping something true and useful.

### Layer 2 (the supplement): The Pulse — subjective, labeled, bounded

The poll-based "did your reps vote how people wanted" idea survives, but reframed so it can never be mistaken for a referendum or be weaponized:

- **Rename it away from "constituent" and "alignment."** Both words assert representativeness the data does not have. Candidate names: **The Pulse**, **Community Read**, **The Room** (as in "read the room"). Recommended: **The Pulse**, with copy like "How fixshitbroken members voted on the same questions."
- **Always show n and recency.** "412 verified members in TX-30, this month." A pulse from 12 people must look like a pulse from 12 people. Never display it as a standalone grade or a leaderboard rank without n attached.
- **Never a single authoritative percentage presented as fact.** Show it as a comparison ("Rep. X voted Yes; 71% of 412 members here wanted No"), not as a character grade. The legislator is described by their actual vote, which is fact; the disagreement is described as the opinion of a named, sized group.
- **Make it expensive to fake.** One verified person, one vote per question, bound to a verified district, with rate limits and anomaly detection on vote velocity and source. Publish the methodology and the integrity measures openly, before launch. The transparency is both the honest thing and the legal shield.
- **No "Hall of Shame" built on the Pulse.** A shame leaderboard ranked by a gameable poll is the worst-case liability. If you keep a leaderboard, rank it on objective Receipts facts (for example missed-vote rate, which is just true), not on opinion.

### What about a single headline number?

If the product genuinely needs one glanceable figure per legislator (for the directory grid and sort), make it an **objective transparency/accountability index built only from Layer 1 facts**, for example a blend of missed-vote rate and votes-against-disclosed-position-statements. It is defensible because every input is a fact. It is not a popularity or "alignment" score, and it should not be branded as one. This is optional; the Receipts can stand without it.

---

## How this maps to the existing mockups

- **pillar-will.html** (Hall of Shame / Hall of Honor, sortable directory): re-anchor the leaderboards and the sort on objective facts (attendance, voting record), not on the poll. Keep the directory; change what the number means.
- **rep-detail.html** (alignment ring): the ring becomes either the objective index above, or gets replaced by a compact Receipts summary. The Pulse appears lower on the page as a clearly-labeled, n-stamped supplement, not the hero metric.
- **Onboarding / verification:** because Layer 1 needs no verification, you can launch the whole factual product with simple accounts, and add district verification only to unlock Layer 2 voting. This also resolves the state-pick-versus-district contradiction from the technical plan: state-pick is fine for everything except casting a Pulse vote, which is the one action that justifiably asks for more.

---

## Why this is strictly better

- **It leads with the strongest, safest material** (the official record) instead of burying it inside a contestable percentage.
- **It removes the biggest legal exposure** (an authoritative shame-grade built on a gameable poll).
- **It unblocks launch:** the factual product ships without solving verification, polling integrity, or the score formula first.
- **It is more honest, which for this brand is also more powerful.** "Here is exactly what they did, here is the receipt" is a harder hit than a number a legislator's office can wave away as a biased online poll.
- **It keeps the original idea alive** (community sentiment), just in its proper, bounded place.

## The one decision this still needs from you

Whether to keep any single headline number at all. Two viable answers:

1. **No headline number.** Lead with Receipts; show the Pulse as a labeled supplement. Cleanest and safest.
2. **An objective index** built only from factual inputs (attendance, voting record), branded honestly (not as "alignment"). Gives the directory something to sort on.

Recommended: launch with option 1, and add an objective index later only if the directory genuinely needs a sort key that facts alone do not provide.
