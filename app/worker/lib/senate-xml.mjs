/*
 * Senate roll-call vote client — per-vote XML feed.
 * Source: https://www.senate.gov/general/common/generic/XML_Availability.htm
 *   menu:  /legislative/LIS/roll_call_lists/vote_menu_{congress}_{session}.xml
 *   vote:  /legislative/LIS/roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{NNNNN}.xml
 *
 * Senate XML identifies members by LIS id (e.g. "S313"), NOT Bioguide. Callers
 * pass a lisToBioguide map (built from the roster's id.lis) so votes normalize
 * onto the same Bioguide key the House data uses.
 */
import { XMLParser } from "fast-xml-parser";
import { VOTE_CAST } from "./congress-gov.mjs";

const SENATE_BASE = "https://www.senate.gov/legislative/LIS";
const parser = new XMLParser({ ignoreAttributes: true, trimValues: true, parseTagValue: false });

const toArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const pad5 = (n) => String(n).replace(/\D/g, "").padStart(5, "0");

export const senateVoteMenuUrl = (congress, session) =>
  `${SENATE_BASE}/roll_call_lists/vote_menu_${congress}_${session}.xml`;

export const senateVoteUrl = (congress, session, voteNumber) =>
  `${SENATE_BASE}/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${pad5(voteNumber)}.xml`;

async function fetchXml(url) {
  const res = await fetch(url, { headers: { "user-agent": "fixshitbroken-ingest", accept: "application/xml" } });
  if (!res.ok) throw new Error(`Senate XML ${res.status} for ${url}`);
  return res.text();
}

/** Parse the session vote menu into a list of vote numbers + light metadata. */
export function parseVoteMenu(xml) {
  const root = parser.parse(xml);
  const summary = root.vote_summary ?? root;
  const votes = toArray(summary.votes?.vote);
  return votes.map((v) => ({
    vote_number: Number(String(v.vote_number).replace(/\D/g, "")),
    vote_date: v.vote_date ?? null,
    issue: v.issue ?? null,
    question: v.question ?? null,
    result: v.result ?? null,
    title: v.title ?? null,
  }));
}

/** Parse a single per-vote XML into { meta, members:[{lis, position, party, state}] }. */
export function parseSenateVote(xml) {
  const root = parser.parse(xml);
  const rc = root.roll_call_vote ?? root;
  const doc = rc.document ?? {};
  const members = toArray(rc.members?.member).map((m) => ({
    lis: m.lis_member_id ? String(m.lis_member_id) : null,
    position: VOTE_CAST(m.vote_cast),
    party: m.party ?? null,
    state: m.state ?? null,
    name: m.member_full ?? null,
  }));
  const billType = doc.document_type ? String(doc.document_type).toLowerCase() : null;
  const billNumber = doc.document_number != null ? Number(String(doc.document_number).replace(/\D/g, "")) : null;
  return {
    meta: {
      source: "senate_xml",
      chamber: "senate",
      congress: Number(rc.congress),
      session: Number(rc.session),
      roll_number: Number(String(rc.vote_number).replace(/\D/g, "")),
      vote_date: rc.vote_date ?? null,
      question: rc.vote_question_text ?? rc.question ?? null,
      result: rc.vote_result ?? rc.result ?? null,
      bill_type: billType,
      bill_number: Number.isFinite(billNumber) ? billNumber : null,
      title: doc.document_title ?? doc.document_name ?? null,
    },
    members,
  };
}

/** Map a parsed Senate vote onto our internal shape using the LIS crosswalk. */
export function normalizeSenateVote(parsed, lisToBioguide) {
  const member_votes = [];
  let unmatched = 0;
  for (const m of parsed.members) {
    const bioguide = m.lis ? lisToBioguide[m.lis] : null;
    if (!bioguide) {
      unmatched++;
      continue;
    }
    member_votes.push({ bioguide, position: m.position });
  }
  return { roll_call_vote: parsed.meta, member_votes, unmatched };
}

export const _fetchXml = fetchXml;
export async function fetchVoteMenu(congress, session) {
  return parseVoteMenu(await fetchXml(senateVoteMenuUrl(congress, session)));
}
export async function fetchSenateVote(congress, session, voteNumber) {
  return parseSenateVote(await fetchXml(senateVoteUrl(congress, session, voteNumber)));
}
