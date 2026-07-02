/*
 * Town Hall — boards directory + single-board wiring.
 *
 * Two responsibilities, one file (kept together because they share the roster
 * loader and the same member helpers):
 *
 *   1) Boards index (pillar-town-hall.html): renders a board for every real
 *      member of Congress from data/legislators-data.js (window.LEGISLATORS) or
 *      data/legislators.json. State dropdown + chamber/party pills + free-text
 *      search all combine, exactly like the Will-of-the-People directory.
 *
 *   2) Single board (town-hall-board.html?id=<bioguide>): hydrates the board
 *      header from the same roster using the ?id= query param.
 *
 * Honesty rules carried over from the rest of the site:
 *   - No fabricated members, handles, posts, or counts. Boards exist as real
 *     containers for real members, but they are empty until Phase 5. A tile
 *     shows the member and an honest "Not open yet" status, never an invented
 *     post/activity number.
 *   - If the roster can't load, the page says so rather than inventing officials.
 */
(function () {
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
  const PARTY_NAME = { D: "Democrat", R: "Republican", I: "Independent" };
  const partyClass = (p) => (p === "R" ? "r" : p === "D" ? "d" : "i");

  function initials(name) {
    const parts = String(name).replace(/[^A-Za-z\s'-]/g, "").trim().split(/\s+/);
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

  // Resolve the roster from the embed (works over file://) or the JSON (http),
  // then hand it to a callback. Returns nothing; async by nature.
  function withRoster(cb) {
    if (Array.isArray(window.LEGISLATORS) && window.LEGISLATORS.length) {
      cb(window.LEGISLATORS);
      return;
    }
    fetch("data/legislators.json")
      .then((res) => {
        if (!res.ok) throw new Error("no data file");
        return res.json();
      })
      .then((data) => cb(Array.isArray(data) ? data : data.members || []))
      .catch(() => cb([]));
  }

  /* ---------------------------------------------------------------------- */
  /* 1) BOARDS INDEX                                                          */
  /* ---------------------------------------------------------------------- */
  function initIndex() {
    const grid = document.getElementById("board-grid");
    if (!grid) return false;

    const search = document.getElementById("board-search");
    const countEl = document.getElementById("board-count");
    const stateSel = document.getElementById("board-state");
    const pills = Array.from(document.querySelectorAll("#board-filter-row .filter-pill"));

    let members = [];
    let pillFilter = "all";
    let stateFilter = "all";
    let query = "";

    function tile(m) {
      const r = roleLine(m);
      const a = document.createElement("a");
      a.className = "board-tile";
      a.href = `town-hall-board.html?id=${encodeURIComponent(m.bioguide_id)}`;
      a.innerHTML = `
        <div class="board-tile-head">
          <div class="board-tile-ph ${partyClass(m.party)}">${initials(m.full_name)}${m.photo_url ? `<img class="avatar-img" src="${escapeHtml(m.photo_url)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</div>
          <div class="board-tile-id">
            <div class="nm">${r.prefix} ${escapeHtml(m.full_name)}</div>
            <div class="role"><span class="party-dot ${m.party || "I"}">${PARTY_NAME[m.party] || "Independent"} · ${escapeHtml(r.place)}</span></div>
          </div>
        </div>
        <div class="board-tile-foot">
          <span class="board-status">Not open yet</span>
          <span class="board-go">View board →</span>
        </div>`;
      return a;
    }

    function matches(m) {
      if (pillFilter === "senate" && m.current_chamber !== "senate") return false;
      if (pillFilter === "house" && m.current_chamber !== "house") return false;
      if ((pillFilter === "R" || pillFilter === "D" || pillFilter === "I") && m.party !== pillFilter) return false;
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
      if (!members.length) {
        const e = document.createElement("div");
        e.className = "board-grid-note";
        e.textContent = "The roster couldn't load, so no boards are shown. We don't invent members — reload once the data file is in place.";
        grid.appendChild(e);
      } else if (!rows.length) {
        const e = document.createElement("div");
        e.className = "board-grid-note";
        e.textContent = "No boards match these filters.";
        grid.appendChild(e);
      } else {
        const frag = document.createDocumentFragment();
        rows.forEach((m) => frag.appendChild(tile(m)));
        grid.appendChild(frag);
      }
      if (countEl) countEl.innerHTML = `<strong>${rows.length}</strong> of ${members.length} boards`;
    }

    function buildStateOptions() {
      if (!stateSel) return;
      const all = Object.keys(STATE_NAMES).sort((a, b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b]));
      stateSel.innerHTML =
        `<option value="all">All states</option>` +
        all.map((s) => `<option value="${s}">${escapeHtml(STATE_NAMES[s])}</option>`).join("");
      stateSel.value = stateFilter;
    }

    pills.forEach((pill) => {
      pill.addEventListener("click", () => {
        pills.forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        pillFilter = pill.dataset.filter;
        render();
      });
    });
    if (stateSel) stateSel.addEventListener("change", (e) => { stateFilter = e.target.value; render(); });
    if (search) search.addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); render(); });

    withRoster((list) => {
      members = list.slice().sort((a, b) => {
        const s = (STATE_NAMES[a.state] || a.state || "").localeCompare(STATE_NAMES[b.state] || b.state || "");
        return s !== 0 ? s : a.full_name.localeCompare(b.full_name);
      });
      buildStateOptions();
      render();
    });
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* 2) SINGLE BOARD                                                          */
  /* ---------------------------------------------------------------------- */
  function initBoard() {
    const root = document.getElementById("board-page");
    if (!root) return false;

    const id = new URLSearchParams(window.location.search).get("id");
    const nameEl = document.getElementById("bp-name");
    const roleEl = document.getElementById("bp-role");
    const phEl = document.getElementById("bp-ph");
    const crumbEl = document.getElementById("bp-crumb-here");
    const profileLink = document.getElementById("bp-profile-link");

    function setNotFound() {
      if (nameEl) nameEl.textContent = "Board not found";
      if (roleEl) roleEl.innerHTML = `<span style="color:var(--brown-500)">We couldn't match that member. Pick a board from the <a href="pillar-town-hall.html" style="color:var(--brown-700);font-weight:600;">Town Hall directory</a>.</span>`;
      if (phEl) { phEl.textContent = "—"; phEl.className = "bp-ph i"; }
    }

    withRoster((list) => {
      const m = id ? list.find((x) => x.bioguide_id === id) : null;
      if (!m) { setNotFound(); return; }
      const r = roleLine(m);
      document.title = `take back the hill — Town Hall: ${r.prefix} ${m.full_name}`;
      if (nameEl) nameEl.textContent = `${r.prefix} ${m.full_name}`;
      if (roleEl) roleEl.innerHTML = `<span class="party-dot ${m.party || "I"}">${PARTY_NAME[m.party] || "Independent"} · ${escapeHtml(r.place)}</span>`;
      if (phEl) { phEl.innerHTML = escapeHtml(initials(m.full_name)) + (m.photo_url ? `<img class="avatar-img" src="${escapeHtml(m.photo_url)}" alt="" loading="lazy" onerror="this.remove()">` : ""); phEl.className = `bp-ph ${partyClass(m.party)}`; }
      if (crumbEl) crumbEl.textContent = `${r.prefix} ${m.full_name}`;
      if (profileLink) profileLink.href = `reps/${encodeURIComponent(m.bioguide_id)}.html`;
    });
    return true;
  }

  // Run whichever page we're on.
  initIndex() || initBoard();
})();
