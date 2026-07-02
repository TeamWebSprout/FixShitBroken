/*
 * Dashboard — real delegation renderer.
 * Reads window.LEGISLATORS (from data/legislators-data.js) and renders the real
 * senators and House delegation for a selected state. No fabricated people, and
 * no fabricated alignment scores — alignment is poll-derived (Phase 4) and does
 * not exist yet, so it is shown as an honest "awaiting polls" note, never a
 * made-up number. Every member links to their real profile page.
 */
(function () {
  const data = Array.isArray(window.LEGISLATORS) ? window.LEGISLATORS : [];
  const sel = document.getElementById("dash-state");
  const senWrap = document.getElementById("dash-senators");
  const houseWrap = document.getElementById("dash-house");
  const houseFoot = document.getElementById("house-foot-link");
  const houseHeadLink = document.getElementById("house-viewall");

  const PARTY_NAME = { D: "Democrat", R: "Republican", I: "Independent" };
  const STATE_NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
    NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
    ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
    TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
    PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands", AS: "American Samoa",
    MP: "Northern Mariana Islands",
  };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  const partyClass = (p) => (p === "R" ? "r" : p === "D" ? "d" : "i");
  const href = (m) => `reps/${encodeURIComponent(m.bioguide_id)}.html`;
  function initials(name) {
    const parts = String(name).replace(/[^A-Za-z\s'-]/g, "").trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function districtLabel(m) {
    if (m.district === 0 || m.district == null) return `${m.state} · At-Large`;
    return `${m.state}-${String(m.district).padStart(2, "0")}`;
  }

  function senCard(m) {
    return `<div class="sen-block">
      <div class="sen-block-head">
        <div class="sen-photo ${partyClass(m.party)}">${initials(m.full_name)}</div>
        <div>
          <div class="sen-name"><a href="${href(m)}" style="color:inherit;text-decoration:none;">Sen. ${esc(m.full_name)}</a></div>
          <div class="sen-meta">${PARTY_NAME[m.party] || "Independent"} · ${esc(STATE_NAMES[m.state] || m.state)} · US Senate</div>
        </div>
      </div>
      <div class="next-vote">
        <div>
          <div class="lbl">The receipts</div>
          <div class="ttl">Real voting record, funding &amp; statements</div>
        </div>
        <a class="when" href="${href(m)}" style="text-decoration:none;">Open →</a>
      </div>
      <div class="sen-note">Constituent alignment is poll-derived and opens in a later phase — shown with sample size when live, never inferred or invented.</div>
    </div>`;
  }

  function houseCard(m) {
    return `<a class="house-card" href="${href(m)}">
      <div class="ph ${partyClass(m.party)}">${initials(m.full_name)}</div>
      <div class="info"><div class="nm">Rep. ${esc(m.full_name)}</div><div class="dst">${esc(districtLabel(m))} · ${esc(m.party || "I")}</div></div>
      <div class="scr" style="font-size:15px;color:var(--brown-400);">→</div>
    </a>`;
  }

  function emptyNote(msg) {
    return `<div style="grid-column:1/-1;padding:20px;color:var(--brown-500);font-size:14px;">${esc(msg)}</div>`;
  }

  const states = Array.from(new Set(data.map((m) => m.state).filter(Boolean)))
    .sort((a, b) => (STATE_NAMES[a] || a).localeCompare(STATE_NAMES[b] || b));
  let current = states.includes("TX") ? "TX" : states[0];

  function render() {
    if (!data.length) {
      if (senWrap) senWrap.innerHTML = emptyNote("Roster not loaded. Add web/data/legislators-data.js to populate real members.");
      return;
    }
    const sens = data.filter((m) => m.state === current && m.current_chamber === "senate")
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
    const house = data.filter((m) => m.state === current && m.current_chamber === "house")
      .sort((a, b) => (a.district ?? 0) - (b.district ?? 0));

    if (senWrap) senWrap.innerHTML = sens.length
      ? sens.map(senCard).join("")
      : emptyNote(`${STATE_NAMES[current] || current} has no senators (territories and DC elect a delegate, not senators).`);

    if (houseWrap) houseWrap.innerHTML = house.length
      ? house.map(houseCard).join("")
      : emptyNote("No House members found for this selection.");

    const label = `${house.length} member${house.length === 1 ? "" : "s"} in ${STATE_NAMES[current] || current}`;
    if (houseFoot) houseFoot.textContent = `View all ${label} in the directory →`;
    if (houseHeadLink) houseHeadLink.textContent = "Open the directory →";
  }

  if (sel) {
    sel.innerHTML = states.map((s) => `<option value="${s}">${esc(STATE_NAMES[s] || s)}</option>`).join("");
    sel.value = current;
    sel.addEventListener("change", () => { current = sel.value; render(); });
  }
  render();
})();
