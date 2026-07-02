/*
 * Legislation feed — renders summarized bills from data/legislation-data.js
 * (produced from bill-summaries.json, which the summarize-bills worker fills
 * from the Congressional Research Service via GovInfo). Every card is a real,
 * public-domain CRS summary. No fabricated bills or numbers.
 */
(function () {
  const data = Array.isArray(window.LEGISLATION) ? window.LEGISLATION : [];
  const grid = document.getElementById("legis-grid");
  const countEl = document.getElementById("legis-count");
  const search = document.getElementById("legis-search");
  if (!grid) return;

  let q = "";
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  function tile(b) {
    const bullets = (b.summaryBullets || []).slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join("");
    return `<div class="legis-tile">
      <div class="meta"><span class="num">${esc(b.bill)}</span>${b.policyArea ? `<span class="tag">${esc(b.policyArea)}</span>` : ""}${b.latestActionDate ? `<span class="num">· ${esc(b.latestActionDate)}</span>` : ""}</div>
      <h3>${esc(b.shortTitle || b.bill)}</h3>
      <ul class="tile-bullets">${bullets}</ul>
      <div class="footer">
        <span class="poll">${b.sponsor ? esc(b.sponsor) : "U.S. Congress"}</span>
        ${b.congressUrl ? `<a class="save-btn" href="${esc(b.congressUrl)}" target="_blank" rel="noopener">Official text →</a>` : ""}
      </div>
    </div>`;
  }

  function render() {
    const rows = data.filter((b) => {
      if (!q) return true;
      const hay = `${b.bill || ""} ${b.shortTitle || ""} ${b.policyArea || ""} ${(b.summaryBullets || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    grid.innerHTML = rows.length
      ? rows.map(tile).join("")
      : `<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--brown-500);font-size:14px;">No bills match “${esc(q)}”.</div>`;
    if (countEl) {
      countEl.innerHTML = data.length
        ? `<strong>${rows.length}</strong> of ${data.length} bills summarized`
        : "No summaries yet — run the summarize-bills worker.";
    }
  }

  if (search) search.addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); render(); });
  render();
})();
