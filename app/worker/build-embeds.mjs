#!/usr/bin/env node
/*
 * build-embeds.mjs — turns the data JSON into the <script>-loadable embeds the
 * static pages read (so they work when opened as file:// too):
 *   web/data/legislators.json     -> web/data/legislators-data.js   (window.LEGISLATORS)
 *   web/data/bill-summaries.json  -> web/data/legislation-data.js   (window.LEGISLATION, newest-first)
 * Run after the ingest/summarize workers, before/after generate-rep-pages.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/data");

function congressUrl(bill) {
  const norm = String(bill).replace(/\./g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  const m = norm.match(/^(.*?)\s*(\d+)$/);
  if (!m) return null;
  const T = {
    "H R": "house-bill", "S": "senate-bill", "H RES": "house-resolution", "S RES": "senate-resolution",
    "H J RES": "house-joint-resolution", "S J RES": "senate-joint-resolution",
    "H CON RES": "house-concurrent-resolution", "S CON RES": "senate-concurrent-resolution",
  };
  const slug = T[m[1].replace(/\s+/g, " ").trim()];
  return slug ? `https://www.congress.gov/bill/119th-congress/${slug}/${m[2]}` : null;
}

async function main() {
  try {
    const slim = JSON.parse(await readFile(resolve(DATA, "legislators.json"), "utf8"));
    await writeFile(resolve(DATA, "legislators-data.js"), "window.LEGISLATORS=" + JSON.stringify(slim) + ";\n");
    console.log(`legislators-data.js: ${slim.length} members`);
  } catch (e) { console.warn(`legislators embed skipped: ${e.message}`); }

  try {
    const s = JSON.parse(await readFile(resolve(DATA, "bill-summaries.json"), "utf8"));
    const arr = Object.entries(s)
      .filter(([, v]) => v.hasSummary && Array.isArray(v.summaryBullets) && v.summaryBullets.length)
      .map(([bill, v]) => ({
        bill, shortTitle: v.shortTitle, policyArea: v.policyArea, sponsor: v.sponsor,
        summaryBullets: v.summaryBullets, cboCost: v.cboCost,
        latestActionDate: v.latestActionDate || null, latestActionText: v.latestActionText || null,
        congressUrl: v.congressUrl || congressUrl(bill),
      }))
      .sort((a, b) => (b.latestActionDate || "").localeCompare(a.latestActionDate || ""));
    await writeFile(resolve(DATA, "legislation-data.js"), "window.LEGISLATION=" + JSON.stringify(arr) + ";\n");
    console.log(`legislation-data.js: ${arr.length} bills`);
  } catch (e) { console.warn(`legislation embed skipped: ${e.message}`); }
}

main();
