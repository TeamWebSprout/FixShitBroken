#!/usr/bin/env node
/*
 * summarize-bills.mjs — the "Legislation for Dummies" pipeline.
 * ---------------------------------------------------------------------------
 * Finds bills, reads their official record, and writes plain-English summaries
 * to ../web/data/bill-summaries.json (consumed by generate-rep-pages.mjs).
 *
 * WHAT IT DOES, AUTOMATICALLY, PER BILL:
 *   1. Resolves the bill to its GovInfo BILLSTATUS XML (keyless, public domain).
 *   2. Pulls the official title, policy area, sponsor, CBO cost estimate, and the
 *      Congressional Research Service (CRS) plain-English summary — the same
 *      authoritative summary Congress.gov and GovTrack display.
 *   3. Produces the bullet breakdown shown in the app.
 *
 * TWO SUMMARY MODES:
 *   • default (keyless, authoritative): turns the CRS summary into bullets by
 *     splitting its own sentences. No AI, no key. Nothing is invented — every
 *     bullet is CRS text. Safe to run unattended.
 *   • --ai (needs LLM_API_KEY): additionally asks an LLM to render the punchy
 *     "what it does / who it helps / who pays" format from the CRS summary + CBO
 *     estimate. Output is tagged { source:"ai-draft", reviewed:false } because
 *     winners/losers is an analytical claim — per the project's own plan it
 *     should be human-reviewed before it's presented as fact.
 *
 * WHICH BILLS:
 *   --from-votes         every distinct bill in ../web/data/votes-by-member.json (default)
 *   --bills "S. 1318,H R 556"   an explicit list
 *   --congress 119       (with --from-votes) the Congress to resolve against (default 119)
 *
 * RUN:
 *   node worker/summarize-bills.mjs --from-votes
 *   node worker/summarize-bills.mjs --bills "H R 6422"
 *   LLM_API_KEY=sk-... node worker/summarize-bills.mjs --from-votes --ai
 *
 * Requires network + Node. Designed to run as a scheduled worker (see
 * TECHNICAL_PLAN.md §3) — the web app only ever reads the JSON it writes.
 */

import { XMLParser } from "fast-xml-parser";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, "../../web/data");
const CONGRESS = argValue("--congress") || "119";

// --- bill id → GovInfo BILLSTATUS -----------------------------------------
const TYPE_SLUG = {
  "H R": "hr", "S": "s",
  "H RES": "hres", "S RES": "sres",
  "H J RES": "hjres", "S J RES": "sjres",
  "H CON RES": "hconres", "S CON RES": "sconres",
};

function parseBillId(bill) {
  const raw = String(bill).trim();
  if (/^PN/i.test(raw)) return null; // nominations have no bill summary
  const norm = raw.replace(/\./g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  const m = norm.match(/^(.*?)\s*(\d+)$/);
  if (!m) return null;
  const slug = TYPE_SLUG[m[1].replace(/\s+/g, " ").trim()];
  if (!slug) return null;
  return { slug, number: m[2] };
}

function govinfoUrl(bill) {
  const p = parseBillId(bill);
  if (!p) return null;
  return `https://www.govinfo.gov/bulkdata/BILLSTATUS/${CONGRESS}/${p.slug}/BILLSTATUS-${CONGRESS}${p.slug}${p.number}.xml`;
}

function congressGovUrl(bill) {
  const p = parseBillId(bill);
  if (!p) return null;
  const SLUG = {
    hr: "house-bill", s: "senate-bill", hres: "house-resolution", sres: "senate-resolution",
    hjres: "house-joint-resolution", sjres: "senate-joint-resolution",
    hconres: "house-concurrent-resolution", sconres: "senate-concurrent-resolution",
  };
  return `https://www.congress.gov/bill/${CONGRESS}th-congress/${SLUG[p.slug]}/${p.number}`;
}

// --- extraction ------------------------------------------------------------
const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: "__cdata" });

function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (node.__cdata) return node.__cdata;
  if (node["#text"]) return node["#text"];
  return "";
}

function htmlToBullets(html) {
  if (!html) return [];
  // Split on paragraph/list boundaries, strip tags, then sentence-split long ones.
  const blocks = String(html)
    .replace(/&nbsp;/g, " ")
    .split(/<\/p>|<\/li>|<br\s*\/?>/i)
    .map((b) => b.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim())
    .filter((b) => b.length > 0);
  const bullets = [];
  for (const b of blocks) {
    if (b.length <= 240) { bullets.push(b); continue; }
    // long paragraph → split into sentences
    const sentences = b.match(/[^.!?]+[.!?]+/g) || [b];
    let buf = "";
    for (const s of sentences) {
      if ((buf + s).length > 240 && buf) { bullets.push(buf.trim()); buf = s; }
      else buf += s;
    }
    if (buf.trim()) bullets.push(buf.trim());
  }
  return bullets.slice(0, 8);
}

function pickLatestSummary(bill) {
  const s = bill?.summaries?.summary;
  if (!s) return null;
  const arr = Array.isArray(s) ? s : [s];
  arr.sort((a, b) => new Date(textOf(b.updateDate) || 0) - new Date(textOf(a.updateDate) || 0));
  return arr[0] || null;
}

function extract(xml) {
  const doc = parser.parse(xml);
  const bill = doc?.billStatus?.bill;
  if (!bill) return null;
  const sum = pickLatestSummary(bill);
  const sponsor = (Array.isArray(bill?.sponsors?.item) ? bill.sponsors.item[0] : bill?.sponsors?.item) || {};
  let cbo = bill?.cboCostEstimates?.item;
  if (Array.isArray(cbo)) cbo = cbo[cbo.length - 1];
  return {
    shortTitle: textOf(bill.title),
    policyArea: textOf(bill?.policyArea?.name),
    sponsor: textOf(sponsor.fullName),
    crsText: sum ? textOf(sum.text) : "",
    crsVersion: sum ? textOf(sum.actionDesc) : "",
    cboCost: cbo ? { title: textOf(cbo.title), url: textOf(cbo.url) } : null,
  };
}

// --- optional AI layer (winners/losers/who-pays) ---------------------------
async function aiFormat(bill, meta) {
  const key = process.env.LLM_API_KEY;
  if (!key) return null;
  const prompt = `You are writing a neutral "plain-English in 30 seconds" explainer of a U.S. bill for ordinary citizens, in the style of a civic-accountability site. Use ONLY the official Congressional Research Service summary and CBO note below. Do not invent facts, numbers, or effects. If who-benefits / who-pays is not clearly derivable from the text, return an empty array for it rather than guessing.

BILL: ${bill}
TITLE: ${meta.shortTitle}
POLICY AREA: ${meta.policyArea}
CBO: ${meta.cboCost ? meta.cboCost.title : "none"}
CRS SUMMARY: ${meta.crsText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}

Return ONLY JSON: {"whatItDoes":["..."],"whoBenefits":["..."],"whoPays":["..."]} — each an array of short faithful bullet strings.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "claude-sonnet-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) { console.warn(`  AI skipped (${res.status})`); return null; }
  const data = await res.json();
  const text = data?.content?.[0]?.text || "";
  try {
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return { ...json, source: "ai-draft", model: data.model, generatedAt: new Date().toISOString(), reviewed: false };
  } catch { return null; }
}

// --- driver ----------------------------------------------------------------
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

// Reverse of TYPE_SLUG, for turning sitemap filenames back into bill strings.
const SLUG_DISPLAY = {
  hr: "H R", s: "S.", hres: "H RES", sres: "S RES",
  hjres: "H J RES", sjres: "S J RES", hconres: "H CON RES", sconres: "S CON RES",
};

// --all: enumerate EVERY bill in the Congress from GovInfo's public sitemaps.
// This is the full-corpus crawler — it makes the system cover all legislation,
// not just bills tied to a vote. Meant to run on a server (thousands of bills).
async function enumerateAllBills(congress) {
  const bills = [];
  for (const slug of Object.keys(SLUG_DISPLAY)) {
    const sitemap = `https://www.govinfo.gov/sitemap/bulkdata/BILLSTATUS/${congress}${slug}/sitemap.xml`;
    try {
      const res = await fetch(sitemap, { headers: { "user-agent": "fixshitbroken-summarizer" } });
      if (!res.ok) { console.warn(`  sitemap ${slug}: HTTP ${res.status}`); continue; }
      const xml = await res.text();
      const re = new RegExp(`BILLSTATUS-${congress}${slug}(\\d+)\\.xml`, "g");
      const nums = new Set();
      let m;
      while ((m = re.exec(xml))) nums.add(m[1]);
      for (const n of nums) bills.push(`${SLUG_DISPLAY[slug]} ${n}`);
      console.log(`  ${slug}: ${nums.size} bills`);
    } catch (e) {
      console.warn(`  sitemap ${slug}: ${e.message}`);
    }
  }
  return bills;
}

async function billList() {
  const explicit = argValue("--bills");
  if (explicit) return explicit.split(",").map((s) => s.trim()).filter(Boolean);
  let list;
  if (process.argv.includes("--all")) {
    console.log(`Enumerating ALL bills for the ${CONGRESS}th Congress from GovInfo sitemaps...`);
    list = await enumerateAllBills(CONGRESS);
    console.log(`Discovered ${list.length} bills total.`);
  } else {
    // default: distinct non-nomination bills from the votes file
    const votes = JSON.parse(await readFile(resolve(DATA, "votes-by-member.json"), "utf8"));
    const set = new Set();
    for (const arr of Object.values(votes)) for (const v of arr) if (v.bill && !/^PN/i.test(v.bill)) set.add(v.bill);
    list = [...set];
  }
  const limit = parseInt(argValue("--limit") || "0", 10);
  return limit > 0 ? list.slice(0, limit) : list;
}

async function main() {
  const useAi = process.argv.includes("--ai");
  const bills = await billList();
  console.log(`Summarizing ${bills.length} bills (${useAi ? "CRS + AI" : "CRS only"})...`);
  // Merge into any existing corpus so repeated runs accumulate all legislation.
  const dest = resolve(DATA, "bill-summaries.json");
  let out = {};
  try { out = JSON.parse(await readFile(dest, "utf8")); } catch { /* first run */ }
  for (const bill of bills) {
    const url = govinfoUrl(bill);
    if (!url) { console.log(`  skip ${bill} (not a summarizable bill type)`); continue; }
    try {
      const res = await fetch(url, { headers: { "user-agent": "fixshitbroken-summarizer" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const meta = extract(await res.text());
      if (!meta) throw new Error("no billStatus in XML");
      const bullets = htmlToBullets(meta.crsText);
      const entry = {
        shortTitle: meta.shortTitle,
        policyArea: meta.policyArea,
        sponsor: meta.sponsor,
        summaryBullets: bullets,
        cboCost: meta.cboCost,
        hasSummary: bullets.length > 0,
        congressUrl: congressGovUrl(bill),
        source: "Congressional Research Service, Library of Congress (GovInfo)",
      };
      if (useAi) {
        const ai = await aiFormat(bill, meta);
        if (ai) entry.ai = ai;
      }
      out[bill] = entry;
      console.log(`  ${bill}: ${bullets.length} bullets${entry.ai ? " + AI" : ""}`);
    } catch (e) {
      console.warn(`  ${bill}: FAILED (${e.message})`);
    }
  }
  await writeFile(dest, JSON.stringify(out, null, 2));
  console.log(`Corpus now holds ${Object.keys(out).length} bill summaries at ${dest}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

export { parseBillId, govinfoUrl, htmlToBullets, extract };
