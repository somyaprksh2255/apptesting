function detail(id) {
  if (!idOk(id)) return fallbackPage("invalid");

  const p = pl(id);

  /* a missing plan and a plan you may not see look exactly the same */
  if (!p || !planVisible(p)) return fallbackPage("missing");

  const guest = tier() == "guest";
  const inn = groupAccess(p);
  const host = isAdmin(p);
  const mship = membership(p, "me");
  const rq = mship == "pending";
  const full = p.members.length >= p.max;
  const op = p.status == "open";
  const cr = usr(p.creator);

  const B =
    'class="btn ghost wide" style="margin-top:8px"';

  let act = "";

  if (inn) {
    act = `
      <p>
        <b>
          ${host ? "You're hosting 👑" : "You're in 🫡"}
        </b>
      </p>

      <a
        class="btn pink wide"
        href="#/gc/${p.id}"
      >
        Enter the GC
      </a>

      <button
        ${B}
        data-a="nextSheet"
        data-v="${p.id}"
      >
        Next stop ➜
      </button>
    `;

    act += attPanel(p);

    act += fbPanel(p);

    if (op) {
      act += `
        <button
          ${B}
          data-a="members"
          data-v="${p.id}"
        >
          ${host ? "Manage squad" : "Squad & leave"}
        </button>
      `;
    }
  } else if (!op) {
    act =
      '<span class="btn off wide">' +
      (p.status == "ended"
        ? "Wrapped ✅"
        : "Cancelled") +
      "</span>";
  } else if (mship == "removed") {
    /* permanent removal by the host: no request button, for this squad only */
    act =
      '<span class="btn off wide">Not available for you</span>';
  } else if (rq) {
    act = `
      <span class="btn off wide">
        Requested ⏳ Host's checking
      </span>

      <button
        ${B}
        data-a="unreq"
        data-v="${p.id}"
      >
        Take back request
      </button>
    `;
  } else if (mship == "rejected") {
    act =
      '<span class="btn off wide">Host passed this time 🫶</span>';
  } else if (full) {
    act =
      '<span class="btn off wide">Squad full 🔥</span>';
  } else {
    act = `
      <button
        class="btn pink wide"
        data-a="join"
        data-v="${p.id}"
      >
        I'm down
      </button>
    `;
  }

  return `
    <main class="wrap">
      <a class="back" href="#" data-a="goBack">
        ← Back
      </a>

      <div class="dt">
        <div>
          <div class="row">
            ${tag(p.type, p.custom)}

            ${
              p.live
                ? '<span class="live"><i></i>LIVE NOW</span>'
                : ""
            }

            ${whoB(p)}

            ${
              p.review
                ? '<span class="pill">👀 Under review</span>'
                : ""
            }

            ${
              op
                ? ""
                : `<span class="pill">${
                    p.status == "ended"
                      ? "Wrapped ✅"
                      : "Cancelled"
                  }</span>`
            }
          </div>

          <h1 style="margin-top:12px">
            ${esc(p.title)}
          </h1>

          <p style="font-size:1.2rem">
            ${esc(p.desc)}
          </p>

          <div class="row">
            ${p.vibe
              .map(
                (v) =>
                  `<span class="pill">${lbl(v)}</span>`,
              )
              .join("")}
          </div>

          <div
            class="meta"
            style="margin-top:14px;font-size:1rem"
          >
            <span>
              📍 ${esc(p.loc)}${kmTxt(p)}
            </span>

            <span>
              🕘 ${p.live ? "Live now" : p.when}
            </span>

            <span>
              👥 ${p.members.length} / ${p.max} people
            </span>

            <span>
              🎯 ${
                p.who == "Everyone"
                  ? "Everyone can ask to join"
                  : p.who
              }
            </span>
          </div>

          ${
            inn
              ? `
                <p>
                  📌 <b>Exact spot:</b> ${esc(p.spot)}
                </p>
              `
              : `
                <p class="mut">
                  🔒 Exact spot unlocks once the host accepts you.
                </p>
              `
          }

          <div
            class="li"
            style="margin-top:14px"
          >
            ${av(p.creator, 44)}

            <div
              style="flex:1;min-width:150px"
            >
              <b>${esc(cr.name)}</b>

              ${
                guest
                  ? '<span class="mut">host · sign in to see more</span>'
                  : `
                    <span class="mut">
                      @${esc(cr.username || "")} · host
                    </span>

                    <br>

                    ${trust(cr)}

                    <span
                      class="mut"
                      style="font-size:.85rem"
                    >
                      ${esc(cr.bio || "")}
                    </span>
                  `
              }
            </div>

            ${
              host || !canViewProfile(p.creator)
                ? ""
                : `
                  <button
                    class="btn ghost sm"
                    data-a="user"
                    data-v="${p.creator}"
                  >
                    Profile
                  </button>
                `
            }
          </div>

          ${
            host && op && p.reqs.length
              ? `
                <h2>Who wants in 👀</h2>

                ${p.reqs
                  .map((r) => {
                    const u = usr(r.u);

                    return `
                      <div class="li">
                        ${av(r.u, 40)}

                        <div
                          style="flex:1;min-width:150px"
                        >
                          <b>${esc(u.name)}</b>

                          <span class="mut">
                            @${esc(u.username || "")} ·
                            ${esc(u.gender || "")}
                          </span>

                          <br>

                          ${trust(u)}

                          <span
                            class="mut"
                            style="font-size:.85rem"
                          >
                            ${esc(u.bio || "")}
                          </span>
                        </div>

                        <button
                          class="btn ghost sm"
                          data-a="user"
                          data-v="${r.u}"
                        >
                          Profile
                        </button>

                        <button
                          class="btn pink sm"
                          data-a="accept"
                          data-k="${p.id}"
                          data-v="${r.u}"
                        >
                          Accept
                        </button>

                        <button
                          class="btn ghost sm"
                          data-a="reject"
                          data-k="${p.id}"
                          data-v="${r.u}"
                        >
                          Reject
                        </button>
                      </div>
                    `;
                  })
                  .join("")}
              `
              : ""
          }

          ${nightRoute(p)}

          <p
            class="mut"
            style="font-size:.85rem"
          >
            🛡️ Meet in public, tell a friend.

            <button
              class="chip"
              style="padding:2px 10px"
              data-a="report"
              data-k="plan"
              data-v="${p.id}"
            >
              ${I("flag")} Report plan
            </button>
          </p>
        </div>

        <div class="card">
          <h3 style="margin-top:0">
            The squad
          </h3>

          <div class="row">
            ${
              inn
                ? p.members
                    .map(
                      (m) =>
                        `<button
                          style="all:unset;cursor:pointer"
                          data-a="user"
                          data-v="${m}"
                        >
                          ${av(m, 40)}
                        </button>`,
                    )
                    .join("")
                : avAnonStack(p.members.length, 40, 8)
            }

            ${Array(
              Math.max(
                0,
                p.max - p.members.length,
              ),
            )
              .fill('<span class="slot"></span>')
              .join("")}
          </div>

          <p
            class="mut"
            style="margin:10px 0"
          >
            <b>
              ${p.members.length} / ${p.max} people
            </b>

            ${full ? " · Squad full 🔥" : ""}
          </p>

          ${act}
        </div>
      </div>
    </main>
  `;
}