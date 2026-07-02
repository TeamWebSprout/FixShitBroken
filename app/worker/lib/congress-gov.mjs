/*
 * Congress.gov API client — House roll-call votes (118th Congress onward).
 * Docs: https://github.com/LibraryOfCongress/api.congress.gov
 * Endpoints (v3, beta):
 *   /house-vote/{congress}/{session}                      -> list
 *   /house-vote/{congress}/{session}/{roll}               -> vote detail
 *   /house-vote/{congress}/{session}/{roll}/members       -> per-member positions (Bioguide IDs)
 *
 * The House vote endpoints are beta and their exact JSON field names may shift.
 * All field access goes through pick()/pickArray() with several candidate paths,
 * so adapting to the live shape means editing the candidate lists in ONE place
 * (the normalizers below), not the call sites. Probe one real response with
 * `node worker/lib/congress-gov.mjs --probe <congress> <session>` before a full run.
 */

const BASE = "https://api.congress.gov/v3";

export const VOTE_CAST = (raw) => {
  const v = String(raw ?? "").trim().toLowerCase();
  if (["yea", "aye", "yes"].includes(v)) return "yes";
  if (["nay", "no"].includes(v)) return "no";
  if (v === "present") return "present";
  if (["not voting", "not-voting", "notvoting", "absent"].includes(v)) return "not_voting";
  return "not_voting";
};

/** Read the first defined value among dotted candidate paths. */
function pick(obj, paths) {
  for (const p of paths) {
    const val = p.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return undefined;
}

/** Return the first array found among candidate paths. */
function pickArray(obj, paths) {
  for (const p of paths) {
    const val = p.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (Array.isArray(val)) return val;
  }
  return [];
}

async function congressGet(path, apiKey, params = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Congress.gov ${res.status} for ${path}`);
  return res.json();
}

/** List all roll-call vote numbers for a congress+session (paginated). */
export async function listHouseVotes(congress, session, apiKey) {
  const out = [];
  let offset = 0;
  const limit = 250;
  for (;;) {
    const raw = await congressGet(`/house-vote/${congress}/${session}`, apiKey, { limit, offset });
    const items = pickArray(raw, ["houseRollCallVotes", "votes", "houseVotes"]);
    for (const it of items) {
      const roll = pick(it, ["rollCallNumber", "rollCall", "rollNumber", "number"]);
      if (roll != null) out.push(Number(roll));
    }
    if (items.length < limit) break;
    offset += limit;
  }
  return out;
}

export const fetchHouseVote = (congress, session, roll, apiKey) =>
  congressGet(`/house-vote/${congress}/${session}/${roll}`, apiKey);

export const fetchHouseVoteMembers = (congress, session, roll, apiKey) =>
  congressGet(`/house-vote/${congress}/${session}/${roll}/members`, apiKey);

/** Normalize a vote-detail response to our internal roll_call_vote shape. */
export function normalizeHouseVote(raw, congress, session, roll) {
  const v = raw?.houseRollCallVote ?? raw?.houseVote ?? raw?.vote ?? raw ?? {};
  const billType = pick(v, ["legislationType", "billType"]);
  const billNumber = pick(v, ["legislationNumber", "billNumber"]);
  return {
    source: "house_api",
    chamber: "house",
    congress: Number(pick(v, ["congress"]) ?? congress),
    session: Number(pick(v, ["sessionNumber", "session"]) ?? session),
    roll_number: Number(pick(v, ["rollCallNumber", "rollNumber"]) ?? roll),
    vote_date: pick(v, ["startDate", "date", "voteTimestamp", "updateDate"]) ?? null,
    question: pick(v, ["voteQuestion", "question", "voteType"]) ?? null,
    result: pick(v, ["result", "voteResult"]) ?? null,
    bill_type: billType ? String(billType).toLowerCase() : null,
    bill_number: billNumber != null ? Number(billNumber) : null,
    title: pick(v, ["legislationTitle", "title", "voteQuestion"]) ?? null,
  };
}

/** Normalize the members response to [{bioguide, position}]. */
export function normalizeHouseMembers(raw) {
  const members = pickArray(raw, [
    "houseRollCallVoteMemberVotes.results",
    "houseRollCallVoteMemberVotes.memberVotes",
    "memberVotes",
    "votes.memberVotes",
    "results",
  ]);
  const out = [];
  for (const m of members) {
    const bioguide = pick(m, ["bioguideID", "bioguideId", "bioguide_id", "member.bioguideId"]);
    const cast = pick(m, ["voteCast", "vote", "voteState", "position"]);
    if (bioguide) out.push({ bioguide: String(bioguide), position: VOTE_CAST(cast) });
  }
  return out;
}

// Optional probe helper: prints the raw envelope so you can confirm field paths.
if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--probe")) {
  const [, , , congress = "119", session = "2"] = process.argv;
  const key = process.env.CONGRESS_GOV_API_KEY;
  if (!key) throw new Error("Set CONGRESS_GOV_API_KEY to probe.");
  const list = await congressGet(`/house-vote/${congress}/${session}`, key, { limit: 1 });
  console.log(JSON.stringify(list, null, 2).slice(0, 4000));
}
