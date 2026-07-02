/*
 * Will of the People — directory data wiring.
 * Loads data/legislators.json (produced by the ingestion worker). If present,
 * it replaces the sample grid with all real members and enables the filter
 * pills + state dropdown + search. If the file is missing, it falls back to a
 * built-in sample set so every control still works for a layout preview.
 *
 * Filters are independent and combine: state (dropdown) AND chamber/party
 * (pill) AND free-text search all apply together.
 *
 * Note on the score: real per-member alignment is poll-derived and does not
 * exist until Phase 4. Rather than fabricate a number for 535 real, named
 * people (a defamation surface we flagged), tiles render the score slot as "—"
 * with an honest label. Vote counts fill in once vote ingestion lands.
 */
(function () {
  const grid = document.getElementById("rep-grid");
  const search = document.getElementById("rep-search");
  const countEl = document.getElementById("rep-count");
  const showMore = document.getElementById("rep-showmore");
  const stateSel = document.getElementById("rep-state");
  const pills = Array.from(document.querySelectorAll("#filter-row .filter-pill"));
  if (!grid) return;

  // No fabricated sample people. The real roster loads from
  // data/legislators-data.js (embedded, works over file://) or data/legislators.json
  // (over http). If neither is available, the grid shows an honest notice rather
  // than inventing officials.
  const SAMPLE_MEMBERS = [];

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

  let members = [];
  let usingSample = false;
  let pillFilter = "all";   // all | senate | house | R | D | I
  let stateFilter = "all";  // all | 2-letter postal
  let query = "";

  const PARTY_NAME = { D: "Democrat", R: "Republican", I: "Independent" };
  const partyClass = (p) => (p === "R" ? "r" : p === "D" ? "d" : "i");

  function initials(name) {
    const parts = name.replace(/[^A-Za-z\s'-]/g, "").trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }

  function roleLine(m) {
    const prefix = m.current_chamber === "senate" ? "Sen." : "Rep.";
    let place = m.state || "";
    if (m.current_chamber === "house") {
      place += m.district === 0 ? "-AL" : `-${String(m.district).padStart(2, "0")}`;
    }
    return { prefix, place };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function tile(m) {
    const r = roleLine(m);
    const a = document.createElement("a");
    a.className = "rep-tile";
    a.href = m.sample ? "rep-detail.html" : `reps/${encodeURIComponent(m.bioguide_id)}.html`;
    a.innerHTML = `
      <div class="rep-tile-head">
        <div class="rep-tile-ph ${partyClass(m.party)}">${initials(m.full_name)}</div>
        <div>
          <div class="nm">${r.prefix} ${escapeHtml(m.full_name)}</div>
          <div class="role"><span class="party-dot ${m.party || "I"}">${PARTY_NAME[m.party] || "Independent"} · ${r.place}</span></div>
        </div>
      </div>
      <div class="grade">
        <div class="scr mid">—</div>
        <div class="lbl">Alignment<br>awaiting polls</div>
      </div>`;
    return a;
  }

  function matches(m) {
    if (pillFilter === "senate" && m.current_chamber !== "senate") return false;
    if (pillFilter === "house" && m.current_chamber !== "house") return false;
    if ((pillFilter === "R" || pillFilter === "D" || pillFilter === "I") && m.party !== pillFilter)
      return false;
    if (stateFilter !== "all" && m.state !== stateFilter) return false;
    if (query) {
      const hay = `${m.full_name} ${m.state} ${STATE_NAMES[m.state] || ""}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  }

  function render() {
    const rows = members.filter(matches);
    grid.innerHTML = "";
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "grid-column:1/-1;padding:32px;text-align:center;color:var(--brown-500);font-size:14px;";
      empty.textContent = "No members match these filters.";
      grid.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      rows.forEach((m) => frag.appendChild(tile(m)));
      grid.appendChild(frag);
    }
    if (countEl) countEl.innerHTML = `<strong>${rows.length}</strong> of ${members.length} shown`;
    if (showMore) {
      showMore.style.display = usingSample ? "" : "none";
    }
  }

  function buildStateOptions() {
    if (!stateSel) return;
    // Always list every state/territory so the control is complete, even while
    // only sample data is loaded. States with no loaded members simply return
    // an empty grid when selected (honest for sample mode; full once real data
    // lands).
    const all = Object.keys(STATE_NAMES).sort((a, b) =>
      STATE_NAMES[a].localeCompare(STATE_NAMES[b])
    );
    stateSel.innerHTML =
      `<option value="all">All states</option>` +
      all.map((s) => `<option value="${s}">${escapeHtml(STATE_NAMES[s])}</option>`).join("");
    stateSel.value = stateFilter;
  }

  function loadMembers(list, isSample) {
    members = list.slice().sort((a, b) => {
      const s = (STATE_NAMES[a.state] || a.state || "").localeCompare(STATE_NAMES[b.state] || b.state || "");
      return s !== 0 ? s : a.full_name.localeCompare(b.full_name);
    });
    usingSample = !!isSample;
    buildStateOptions();
    render();
  }

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      pillFilter = pill.dataset.filter;
      render();
    });
  });

  if (stateSel) {
    stateSel.addEventListener("change", (e) => {
      stateFilter = e.target.value;
      render();
    });
  }

  if (search) {
    search.addEventListener("input", (e) => {
      query = e.target.value.trim().toLowerCase();
      render();
    });
  }

  // 1) Prefer data embedded via <script src="data/legislators-data.js"> — this
  //    works when the page is opened directly as a file:// URL, where fetch()
  //    of a local file is blocked by the browser. 2) Otherwise fetch the JSON
  //    (works when served over http). 3) Otherwise fall back to the sample.
  if (Array.isArray(window.LEGISLATORS) && window.LEGISLATORS.length) {
    loadMembers(window.LEGISLATORS, false);
  } else {
    fetch("data/legislators.json")
      .then((res) => {
        if (!res.ok) throw new Error("no data file");
        return res.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : data.members || [];
        if (list.length) loadMembers(list, false);
        else loadMembers(SAMPLE_MEMBERS, true);
      })
      .catch(() => {
        // No data available — preview all controls on the built-in sample.
        loadMembers(SAMPLE_MEMBERS, true);
      });
  }
})();
