#!/usr/bin/env node
/*
 * Vote ingestion orchestrator (Phase 1)
 * ---------------------------------------------------------------------------
 * Pulls House votes (Congress.gov API) + Senate votes (senate.gov XML) for a
 * congress, normalizes both onto one internal shape keyed on Bioguide ID, and
 * writes web/data/votes-by-member.json (consumed by the page generator). With
 * DATABASE_URL set it also upserts roll_call_vote + member_vote into Postgres.
 *
 *   CONGRESS_GOV_API_KEY=xxx node worker/ingest-votes.mjs --congress 119 --session 2
 *   ... --house-limit 25 --senate-limit 25   # cap for a quick smoke run
 *   ... --no-db                              # JSON only, skip Postgres
 *
 * Needs network to api.congress.gov + senate.gov. The parsing/normalization it
 * relies on is unit-tested in worker/__test__ against fixtures.
 */
import { fetchLegislators, transformLegislator } from "./ingest-legislators.mjs";
import {
  listHouseVotes, fetchHouseVote, fetchHouseVoteMembers,
  normalizeHouseVote, normalizeHouseMembers,
} from "./lib/congress-gov.mjs";
import { fetchVoteMenu, fetchSenateVote, normalizeSenateVote } from "./lib/senate-xml.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** "HR 4471", "S 1234", "H.J.Res. 5" — display label for a bill. */
export function formatBill(type, number) {
  if (!type || number == null) return null;
  const map = { hr: "HR", s: "S", hjres: "H.J.Res.", sjres: "S.J.Res.", hconres: "H.Con.Res.", sconres: "S.Con.Res.", hres: "H.Res.", sres: "S.Res." };
  return `${map[type] || type.toUpperCase()} ${number}`;
}

/** Append one normalized vote (+ a member's position) to the per-member index. */
export function addVote(byMember, rc, memberVotes) {
  const entry = {
    chamber: rc.chamber,
    congress: rc.congress,
    session: rc.session,
    roll: rc.roll_number,
    date: rc.vote_date,
    question: rc.question,
    title: rc.title,
    bill: formatBill(rc.bill_type, rc.bill_number),
    result: rc.result,
  };
  for (const mv of memberVotes) {
    (byMember[mv.bioguide] ||= []).push({ ...entry, position: mv.position });
  }
}

/** Sort each member's votes newest-first and cap the list. */
export function finalize(byMember, maxPerMember) {
  for (const bioguide of Object.keys(byMember)) {
    byMember[bioguide].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    if (maxPerMember) byMember[bioguide] = byMember[bioguide].slice(0, maxPerMember);
  }
  return byMember;
}

async function main() {
  const congress = Number(arg("--congress", "119"));
  const session = Number(arg("--session", "2"));
  const houseLimit = Number(arg("--house-limit", "0")) || Infinity;
  const senateLimit = Number(arg("--senate-limit", "0")) || Infinity;
  const maxPerMember = Number(arg("--max-per-member", "40"));
  const noDb = process.argv.includes("--no-db");
  const apiKey = process.env.CONGRESS_GOV_API_KEY;

  console.log(`Loading roster to build the LIS->Bioguide crosswalk...`);
  const roster = (await fetchLegislators()).map(transformLegislator).filter(Boolean);
  const lisToBioguide = {};
  for (const { legislator: l } of roster) if (l.lis_id) lisToBioguide[l.lis_id] = l.bioguide_id;
  console.log(`Crosswalk: ${Object.keys(lisToBioguide).length} senators with LIS ids.`);

  const byMember = {};
  const allVotes = []; // {rc, memberVotes} for optional DB write

  // --- House (Congress.gov) ---
  if (!apiKey) {
    console.warn("CONGRESS_GOV_API_KEY not set — skipping House votes.");
  } else {
    const rolls = await listHouseVotes(congress, session, apiKey);
    const take = rolls.slice(0, houseLimit === Infinity ? rolls.length : houseLimit);
    console.log(`House: ${rolls.length} votes found, ingesting ${take.length}.`);
    for (const roll of take) {
      try {
        const [detailRaw, membersRaw] = await Promise.all([
          fetchHouseVote(congress, session, roll, apiKey),
          fetchHouseVoteMembers(congress, session, roll, apiKey),
        ]);
        const rc = normalizeHouseVote(detailRaw, congress, session, roll);
        const memberVotes = normalizeHouseMembers(membersRaw);
        addVote(byMember, rc, memberVotes);
        allVotes.push({ rc, memberVotes });
        await sleep(120);
      } catch (e) {
        console.warn(`  House roll ${roll} failed: ${e.message}`);
      }
    }
  }

  // --- Senate (XML) ---
  try {
    const menu = await fetchVoteMenu(congress, session);
    const take = menu.slice(0, senateLimit === Infinity ? menu.length : senateLimit);
    console.log(`Senate: ${menu.length} votes found, ingesting ${take.length}.`);
    for (const item of take) {
      try {
        const parsed = await fetchSenateVote(congress, session, item.vote_number);
        const { roll_call_vote: rc, member_votes } = normalizeSenateVote(parsed, lisToBioguide);
        addVote(byMember, rc, member_votes);
        allVotes.push({ rc, memberVotes: member_votes });
        await sleep(120);
      } catch (e) {
        console.warn(`  Senate vote ${item.vote_number} failed: ${e.message}`);
      }
    }
  } catch (e) {
    console.warn(`Senate menu failed: ${e.message}`);
  }

  finalize(byMember, maxPerMember);

  // --- Write static JSON ---
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const out = arg("--out", resolve(here, "../../web/data/votes-by-member.json"));
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(byMember));
  const memberCount = Object.keys(byMember).length;
  const voteCount = allVotes.length;
  console.log(`Wrote votes for ${memberCount} members (${voteCount} roll calls) to ${out}`);

  // --- Optional Postgres ---
  if (!noDb && process.env.DATABASE_URL) {
    await writeToDb(allVotes);
  }
}

async function writeToDb(allVotes) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    let rcN = 0, mvN = 0;
    for (const { rc, memberVotes } of allVotes) {
      const { rows } = await client.query(
        `insert into roll_call_vote
           (source, congress, session, roll_number, chamber, vote_date, question, result)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (source, congress, session, roll_number, chamber) do update set
           vote_date=excluded.vote_date, question=excluded.question, result=excluded.result
         returning id`,
        [rc.source, rc.congress, rc.session, rc.roll_number, rc.chamber, rc.vote_date, rc.question, rc.result]
      );
      const voteId = rows[0].id;
      rcN++;
      for (const mv of memberVotes) {
        await client.query(
          `insert into member_vote (roll_call_vote_id, bioguide_id, position)
           values ($1,$2,$3)
           on conflict (roll_call_vote_id, bioguide_id) do update set position=excluded.position`,
          [voteId, mv.bioguide, mv.position]
        ).catch(() => { /* skip members not in legislator table */ });
        mvN++;
      }
    }
    console.log(`DB: upserted ${rcN} roll calls, ${mvN} member votes.`);
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
