#!/usr/bin/env node
/*
 * Transform unit test — no network, no DB. Runs the worker's transform against
 * a fixture shaped exactly like congress-legislators records.
 *   node worker/__test__/transform.test.mjs
 */
import assert from "node:assert/strict";
import { transformLegislator, buildPhotoUrl } from "../ingest-legislators.mjs";

// A senator (last term, type "sen") and a representative (type "rep").
const fixture = [
  {
    id: { bioguide: "S000033" },
    name: { official_full: "Bernard Sanders", first: "Bernard", last: "Sanders" },
    social: { twitter: "SenSanders", youtube_id: "senatorsanders" },
    terms: [
      { type: "rep", state: "VT", district: 0, party: "Independent", start: "1991-01-03", end: "1993-01-03" },
      { type: "sen", state: "VT", party: "Independent", start: "2007-01-04", end: "2025-01-03",
        url: "https://www.sanders.senate.gov", phone: "202-224-5141", address: "332 Dirksen" },
    ],
  },
  {
    id: { bioguide: "O000172" },
    name: { official_full: "Alexandria Ocasio-Cortez", first: "Alexandria", last: "Ocasio-Cortez" },
    social: { twitter: "RepAOC" },
    terms: [
      { type: "rep", state: "NY", district: 14, party: "Democrat", start: "2019-01-03", end: "2021-01-03" },
      { type: "rep", state: "NY", district: 14, party: "Democrat", start: "2023-01-03", end: "2025-01-03",
        url: "https://ocasio-cortez.house.gov" },
    ],
  },
  // Edge cases: missing bioguide (dropped), Republican party mapping.
  { id: {}, name: { official_full: "No Bioguide" }, terms: [{ type: "sen", state: "XX", start: "2020-01-01" }] },
  {
    id: { bioguide: "R000600" },
    name: { official_full: "Test Republican" },
    terms: [{ type: "sen", state: "TX", party: "Republican", start: "2021-01-03", end: "2027-01-03" }],
  },
];

const rows = fixture.map(transformLegislator).filter(Boolean);

// 1. The record with no bioguide is dropped.
assert.equal(rows.length, 3, "should drop the record missing a bioguide");

// 2. Sanders: senator, party I, full career = 2 terms, latest term wins for chamber/state.
const bernie = rows.find((r) => r.legislator.bioguide_id === "S000033").legislator;
assert.equal(bernie.current_chamber, "senate");
assert.equal(bernie.party, "I", "Independent maps to I");
assert.equal(bernie.state, "VT");
assert.equal(bernie.district, null, "senators have null district");
assert.equal(bernie.contact.phone, "202-224-5141");
assert.equal(bernie.socials.twitter, "SenSanders");
assert.equal(buildPhotoUrl("S000033"), "https://unitedstates.github.io/images/congress/225x275/S000033.jpg");
const bernieTerms = rows.find((r) => r.legislator.bioguide_id === "S000033").terms;
assert.equal(bernieTerms.length, 2, "full career retained");
assert.equal(bernieTerms[0].chamber, "house", "earliest term was a House term");

// 3. AOC: representative, party D, district 14 (a real district, not null).
const aoc = rows.find((r) => r.legislator.bioguide_id === "O000172").legislator;
assert.equal(aoc.current_chamber, "house");
assert.equal(aoc.party, "D");
assert.equal(aoc.district, 14);

// 4. Republican maps to R.
const rep = rows.find((r) => r.legislator.bioguide_id === "R000600").legislator;
assert.equal(rep.party, "R");

// 5. district 0 (at-large) is preserved as 0, not coerced to null.
assert.equal(bernieTerms[0].district, 0, "at-large district 0 preserved");

console.log("ok — all transform assertions passed (3 members, 2 chambers, D/R/I mapping, career terms)");
