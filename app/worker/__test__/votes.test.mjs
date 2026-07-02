#!/usr/bin/env node
/*
 * Vote pipeline tests — no network. Exercises the House normalizer, the Senate
 * XML parser + LIS crosswalk, the per-member assembly, and rendering a real
 * vote row into a generated page.
 *   node worker/__test__/votes.test.mjs
 */
import assert from "node:assert/strict";
import { normalizeHouseVote, normalizeHouseMembers, VOTE_CAST } from "../lib/congress-gov.mjs";
import { parseVoteMenu, parseSenateVote, normalizeSenateVote } from "../lib/senate-xml.mjs";
import { addVote, finalize, formatBill } from "../ingest-votes.mjs";
import { transformLegislator } from "../ingest-legislators.mjs";
import { renderRepPage } from "../generate-rep-pages.mjs";

// ---- vote_cast mapping ----
assert.equal(VOTE_CAST("Yea"), "yes");
assert.equal(VOTE_CAST("Nay"), "no");
assert.equal(VOTE_CAST("Present"), "present");
assert.equal(VOTE_CAST("Not Voting"), "not_voting");

// ---- House normalizer (defensive field paths) ----
const houseDetail = {
  houseRollCallVote: {
    congress: 119, sessionNumber: 2, rollCallNumber: 142,
    legislationType: "HR", legislationNumber: 4471,
    voteQuestion: "On Passage", result: "Passed", startDate: "2026-03-10T18:30:00Z",
    legislationTitle: "Protecting American Prosperity Act",
  },
};
const hv = normalizeHouseVote(houseDetail, 119, 2, 142);
assert.equal(hv.chamber, "house");
assert.equal(hv.roll_number, 142);
assert.equal(hv.bill_type, "hr");
assert.equal(hv.bill_number, 4471);
assert.equal(hv.title, "Protecting American Prosperity Act");

const houseMembers = {
  houseRollCallVoteMemberVotes: {
    results: [
      { bioguideID: "O000172", voteCast: "Nay" },
      { bioguideID: "X000001", voteCast: "Yea" },
    ],
  },
};
const hm = normalizeHouseMembers(houseMembers);
assert.equal(hm.length, 2);
assert.deepEqual(hm[0], { bioguide: "O000172", position: "no" });

// ---- Senate XML parsing ----
const senateXml = `<?xml version="1.0" encoding="UTF-8"?>
<roll_call_vote>
  <congress>119</congress><session>2</session>
  <vote_number>00087</vote_number>
  <vote_date>February 10, 2026, 02:30 PM</vote_date>
  <vote_question_text>On the Motion to Proceed</vote_question_text>
  <question>On the Motion</question>
  <vote_result>Agreed to</vote_result>
  <document><document_type>S</document_type><document_number>1234</document_number>
    <document_name>S. 1234</document_name><document_title>Childcare Tax Credit Expansion</document_title></document>
  <members>
    <member><member_full>Sanders (I-VT)</member_full><party>I</party><state>VT</state><vote_cast>Yea</vote_cast><lis_member_id>S313</lis_member_id></member>
    <member><member_full>Cruz (R-TX)</member_full><party>R</party><state>TX</state><vote_cast>Nay</vote_cast><lis_member_id>S341</lis_member_id></member>
  </members>
</roll_call_vote>`;
const parsed = parseSenateVote(senateXml);
assert.equal(parsed.meta.chamber, "senate");
assert.equal(parsed.meta.roll_number, 87, "zero-padded vote number parsed to int");
assert.equal(parsed.meta.bill_type, "s");
assert.equal(parsed.meta.bill_number, 1234);
assert.equal(parsed.meta.title, "Childcare Tax Credit Expansion");
assert.equal(parsed.members.length, 2);
assert.equal(parsed.members[0].position, "yes");

// crosswalk: build LIS->bioguide from a roster fixture, then normalize
const roster = [
  { id: { bioguide: "S000033", lis: "S313" }, name: { official_full: "Bernard Sanders" },
    terms: [{ type: "sen", state: "VT", party: "Independent", start: "2007-01-04", end: "2025-01-03" }] },
  { id: { bioguide: "C001098", lis: "S341" }, name: { official_full: "Ted Cruz" },
    terms: [{ type: "sen", state: "TX", party: "Republican", start: "2013-01-03", end: "2025-01-03" }] },
].map(transformLegislator);
const lisToBioguide = {};
for (const { legislator: l } of roster) if (l.lis_id) lisToBioguide[l.lis_id] = l.bioguide_id;
assert.equal(lisToBioguide["S313"], "S000033", "transform captured LIS id");

const norm = normalizeSenateVote(parsed, lisToBioguide);
assert.equal(norm.member_votes.length, 2);
assert.deepEqual(norm.member_votes[0], { bioguide: "S000033", position: "yes" });
assert.equal(norm.unmatched, 0);

// ---- vote_menu parsing ----
const menuXml = `<vote_summary><congress>119</congress><session>2</session>
  <votes>
    <vote><vote_number>00087</vote_number><issue>S.1234</issue><question>On the Motion</question><result>Agreed to</result></vote>
    <vote><vote_number>00088</vote_number><issue>S.1300</issue><question>On Passage</question><result>Rejected</result></vote>
  </votes></vote_summary>`;
const menu = parseVoteMenu(menuXml);
assert.equal(menu.length, 2);
assert.equal(menu[1].vote_number, 88);

// ---- per-member assembly ----
const byMember = {};
addVote(byMember, hv, hm);
addVote(byMember, norm.roll_call_vote, norm.member_votes);
finalize(byMember, 40);
assert.equal(byMember["O000172"].length, 1);
assert.equal(byMember["S000033"][0].bill, "S 1234");
assert.equal(byMember["S000033"][0].position, "yes");
assert.equal(formatBill("hr", 4471), "HR 4471");

// ---- render real votes into a page ----
const cruz = transformLegislator({ id: { bioguide: "C001098", lis: "S341" }, name: { official_full: "Ted Cruz" },
  terms: [{ type: "sen", state: "TX", party: "Republican", start: "2013-01-03", end: "2025-01-03", phone: "202-224-5922" }] });
const html = renderRepPage(cruz, byMember["C001098"]);
assert.ok(html.includes("votes-list"), "renders the votes list, not the empty state");
assert.ok(html.includes("Childcare Tax Credit Expansion"), "renders the real bill title");
assert.ok(html.includes("pill-vote no") && html.includes(">NO<"), "renders Cruz's NO position");
assert.ok(!html.includes("Voted with Texas voters"), "no fabricated alignment copy");

// empty-state path still works when no votes
const emptyHtml = renderRepPage(cruz, []);
assert.ok(emptyHtml.includes("Voting record loads in Phase 1"));

console.log("ok — votes pipeline: mapping, House normalize, Senate XML + crosswalk, menu, assembly, render (real + empty)");
