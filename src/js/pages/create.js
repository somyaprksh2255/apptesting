/* The regular Create route stays focused on the original Plan/Group flow.
 * Event publishing and administration live exclusively in admin.html. */
function create() {
  return createPlanForm();
}

function createPlanForm() {
  const w = O.W;
  const ev =
    w.event &&
    S.events.find((e) => e.id == w.event);

  return `
    <main style="max-width:680px">
      <a class="back" href="#" data-a="goBack">← Back</a>

      <h1>Make a Plan</h1>

      ${
        ev
          ? `<p class="pill" style="display:inline-block">
              🎟️ For: ${esc(ev.title)}
            </p>`
          : ""
      }

      ${
        w.carry && w.carry.length
          ? `
            <div class="card" style="margin:10px 0">
              <b>Taking the squad along 🔁</b>

              <p class="mut" style="margin:4px 0 8px">
                Tap to drop anyone.
              </p>

              <div class="chips">
                ${w.carry
                  .map(
                    (c) =>
                      `<button
                        class="chip"
                        aria-pressed="true"
                        data-a="drop"
                        data-v="${c}"
                      >
                        ${esc(usr(c).name)} ✕
                      </button>`,
                  )
                  .join("")}
              </div>
            </div>
          `
          : ""
      }

      <h2>What are we doing?</h2>

      <div class="opt">
        ${Object.keys(T)
          .filter((k) => k != "random")
          .map(
            (k) =>
              `<button
                class="chip"
                aria-pressed="${w.type == k}"
                data-a="set"
                data-k="W.type"
                data-v="${k}"
              >
                ${T[k][0]} ${T[k][1]}
              </button>`,
          )
          .join("")}
      </div>

      ${
        w.type == "custom"
          ? `
            <input
              type="text"
              style="margin-top:10px"
              maxlength="24"
              data-in="W.custom"
              value="${esc(w.custom || "")}"
              placeholder="Name your thing (e.g. Rangoli walk)"
              aria-label="Custom activity"
            >
          `
          : ""
      }

      <h2>What's the vibe?</h2>

      ${chips(VIBES, "W.vibe", w.vibe, 1)}

      <h2>Where we pulling up?</h2>

      <div class="location-flow-card">
        <button class="btn ghost sm" data-a="geoPick" data-k="W.loc">${I("map-pin", "1em")} Use my location</button>
        ${quickLocationSuggestions('W.loc')}
        <div class="location-custom-search">
          <div><b>Choose another place</b><small>Search for a meeting spot in ${esc(S.me.city || 'your selected city')}.</small></div>
          <button class="btn pink sm" data-a="locationPicker" data-v="W.loc">${I("map-pinned", "1em")} Search map</button>
        </div>
        ${w.loc && (w.locSource === 'openstreetmap-nominatim' || ev)
          ? `<div class="location-selected"><span class="location-selected__pin">${I("map-pin", "1.1em")}</span><div><b>${esc(w.loc)}</b><small>${esc(w.locSource === 'openstreetmap-nominatim' ? [w.locCity || S.me.city, w.locState].filter(Boolean).join(', ') : (ev ? `Event venue · ${ev.title}` : S.me.city))}</small></div><button class="btn ghost sm" data-a="locationPicker" data-v="W.loc">Change</button></div>`
          : `<p class="mut location-flow-hint">Select a suggested place or search the map to set your meeting point.</p>`}
      </div>
      <p class="mut location-privacy-note">Only the area shows publicly. Exact spot goes to the squad.</p>

      <h2>Which day?</h2>

      ${ev ? `
        <div class="event-default-field">
          <label for="event-plan-day">Event date</label>
          <input id="event-plan-day" type="date" data-in="W.day" min="${esc(ev.dateISO || '')}" value="${esc(w.day || ev.dateISO || ev.date || '')}" aria-label="Plan date">
          <small>Prefilled from this Event — change it if your squad is meeting another day.</small>
        </div>
      ` : chips(["Today", "Tomorrow"], "W.day", w.day || "Today")}

      <h2>When we outside?</h2>

      ${ev ? `
        <div class="event-default-field">
          <label for="event-plan-time">Event start time</label>
          <input id="event-plan-time" type="time" data-in="W.time" value="${esc(w.time || ev.startTime || '19:00')}" aria-label="Plan time">
          <small>Prefilled from this Event — customize the time for your plan.</small>
        </div>
      ` : chips(
        w.day == "Tomorrow"
          ? ["9:00 PM", "10:00 PM", "11:00 PM", "Custom"]
          : ["Now", "9:00 PM", "10:00 PM", "11:00 PM", "Custom"],
        "W.when",
        w.when,
      )}
      ${!ev && w.when == "Custom" ? `
        <input type="time" style="margin-top:10px;max-width:180px" data-in="W.time" value="${esc(w.time || '')}" aria-label="Custom time">
      ` : ""}

      <h2>Who can join?</h2>

      ${chips(
        ["Everyone", "Girls only", "Boys only"],
        "W.who",
        w.who || "Everyone",
      )}

      <h2>How big's the squad? (max)</h2>

      ${chips(
        ["2", "3", "4", "5", "6", "8"],
        "W.size",
        String(w.size),
      )}

      <h2>Say the vibe</h2>

      <textarea
        rows="3"
        maxlength="140"
        data-in="W.desc"
        placeholder="My friends left but I'm still not done 😭"
        aria-label="Description"
      >${esc(w.desc)}</textarea>

      ${w.who && w.who !== "Everyone" ? `
        <h2>Host controls</h2>

        ${chips(
          ["Review requests", "Auto-accept"],
          "W.mode",
          w.mode || "Review requests",
        )}

        <p class="mut" style="margin-top:8px">
          ${
            (w.mode || "Review requests") == "Auto-accept"
              ? "First come, first served until the squad is full."
              : "You approve each person after seeing their profile. Recommended."
          }
        </p>
      ` : `<p class="mut" style="margin-top:12px">Everyone can join. Host approval controls aren't needed for this group type.</p>`}

      <h2>Preview</h2>

      <div
        class="pv"
        aria-hidden="true"
        style="pointer-events:none"
      >
        ${card(prevPlan(w))}
      </div>

      <p style="margin-top:20px">
        <button
          class="btn pink wide ${O.posting ? "loading" : ""}"
          data-a="post"
        >
          ${O.posting ? "Posting…" : "Post the plan"}
        </button>
      </p>
    </main>
  `;
}

function postMissing() {
  const w = O.W;

  return !w.type
    ? "what we're doing"
    : w.type == "custom" && !(w.custom || "").trim()
      ? "a name for it"
      : !w.loc
        ? "where"
        : !w.when ||
            (w.day == "Tomorrow" && w.when == "Now")
          ? "a time"
          : !w.size
            ? "squad size"
            : "";
}

function prevPlan(w) {
  return {
    id: "preview",
    creator: "me",
    type: w.type || "garba",
    custom: (w.custom || "").trim() || null,

    title: (
      {
        garba: "Garba gang, assemble",
        pandal: "Pandal hop, no plans",
        bhandara: "Anyone wanna go to this Bhandara?",
        food: "Food run?",
        chai: "Chai & yap?",
        photo: "Photo walk, pics first",
        shopping: "Shopping spree?",
        city: "City explore",
        outside: "Still out, still down",
        custom: w.custom || "Your plan",
      }
    )[w.type || "garba"],

    desc:
      w.desc ||
      "Your plan description shows up here.",

    vibe: w.vibe || [],
    loc: w.loc || "Pick a place",

    when:
      w.when == "Now"
        ? "LIVE NOW"
        : w.when || "Pick a time",

    live: w.when == "Now",
    day: w.day || "Today",
    max: w.size || 4,
    members: ["me"],
    who: w.who || "Everyone",
    reqs: [],
    status: "open",
  };
}