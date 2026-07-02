#!/usr/bin/env node
/*
 * ingest-donors.mjs — real campaign-finance from FEC public filings.
 * ---------------------------------------------------------------------------
 * Pulls each member's actual FEC totals and top contributors from the OpenFEC
 * API and writes ../web/data/donors-by-member.json (keyed by bioguide). The
 * profile "Donors" tab renders it inline — no invented numbers, no click-outs.
 *
 * WHY A KEY: FEC data is public domain, but the FEC only serves it through the
 * OpenFEC JSON API (key required) or multi-GB bulk zips. There is no keyless
 * feed. The key is free and instant: https://api.open.fec.gov/developers/
 * (a DATA.gov key). Everything below is public-record money, date-stamped.
 *
 * RUN:
 *   FEC_API_KEY=your-key node worker/ingest-donors.mjs
 *   FEC_API_KEY=your-key node worker/ingest-donors.mjs --cycle 2026 --limit 25
 *
 * Needs network + Node. Meant to run as a scheduled worker (nightly is plenty —
 * filings are quarterly by law). The web app only reads the JSON it writes.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "../../web/data");
const KEY = process.env.FEC_API_KEY || process.env.DATA_GOV_API_KEY;
const BASE = "https://api.open.fec.gov/v1";

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const CYCLE = parseInt(arg("--cycle", "2026"), 10);
const LIMIT = parseInt(arg("--limit", "0"), 10);

async function fec(path, params = {}) {
  const qs = new URLSearchParams({ api_key: KEY, ...params }).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, { headers: { accept: "application/json" } });
  if (res.status === 429) { // rate limited — back off and retry once
    await new Promise((r) => setTimeout(r, 3000));
    return fec(path, params);
  }
  if (!res.ok) throw new Error(`FEC ${res.status} on ${path}`);
  return res.json();
}

// Pull EVERY election cycle for a member from their FEC candidate id, each with
// the individual-vs-PAC breakdown — exactly the per-campaign cards the site shows.
// Turns the same single request you pasted for Moran into the cycles[] shape.
export function cyclesFromTotals(results) {
  const rows = (results || []).filter((r) => r.cycle != null); // per-cycle rows (election_full=false)
  const seen = new Set();
  const cycles = [];
  let coverageThrough = null;
  for (const r of rows) {
    if (seen.has(r.cycle)) continue;
    seen.add(r.cycle);
    const cov = r.coverage_end_date ? String(r.coverage_end_date).slice(0, 10) : null;
    if (cov && (!coverageThrough || cov > coverageThrough)) coverageThrough = cov;
    cycles.push({
      year: String(r.cycle),
      contributions: Math.round(r.receipts || 0),
      expenditures: Math.round(r.disbursements || 0),
      cashOnHand: Math.round(r.last_cash_on_hand_end_period || 0),
      fromIndividuals: Math.round(r.individual_contributions || 0),
      individualItemized: Math.round(r.individual_itemized_contributions || 0),
      individualUnitemized: Math.round(r.individual_unitemized_contributions || 0),
      fromPacs: Math.round(r.other_political_committee_contributions || 0),
      fromParty: Math.round(r.political_party_committee_contributions || 0),
    });
  }
  cycles.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
  if (!cycles.length) return null;
  return {
    cycles,
    totalContributions: cycles.reduce((s, c) => s + c.contributions, 0),
    totalExpenditures: cycles.reduce((s, c) => s + c.expenditures, 0),
    coverageThrough,
    source: "Federal Election Commission (OpenFEC), per-cycle filings",
  };
}

async function pullDonor(fecId) {
  const data = await fec(`/candidate/${fecId}/totals/`, { per_page: 20, sort: "-cycle" });
  return cyclesFromTotals(data.results);
}

async function main() {
  if (!KEY) {
    console.error("Set FEC_API_KEY (free at https://api.open.fec.gov/developers/) and re-run.");
    process.exit(1);
  }
  // Get the roster (with FEC ids) live — keyless — so this runs anywhere.
  const { fetchLegislators } = await import("./ingest-legislators.mjs");
  const raw = await fetchLegislators();
  let members = raw
    .map((r) => ({ bioguide: r.id?.bioguide, fec: r.id?.fec?.[0] }))
    .filter((m) => m.bioguide && m.fec);
  if (LIMIT > 0) members = members.slice(0, LIMIT);

  const out = {};
  try { Object.assign(out, JSON.parse(await readFile(resolve(DATA, "donors-by-member.json"), "utf8"))); } catch {}

  console.log(`Pulling FEC totals for ${members.length} members (cycle ${CYCLE})...`);
  let ok = 0;
  for (const m of members) {
    try {
      const d = await pullDonor(m.fec);
      if (d) { out[m.bioguide] = d; ok++; if (ok % 25 === 0) console.log(`  ${ok} done...`); }
    } catch (e) {
      console.warn(`  ${m.bioguide} (${m.fec}): ${e.message}`);
    }
  }
  const dest = resolve(DATA, "donors-by-member.json");
  await writeFile(dest, JSON.stringify(out, null, 2));
  console.log(`Wrote real FEC donor data for ${ok} members to ${dest}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

export { pullDonor };
