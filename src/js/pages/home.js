function home() {
  /* If live location is available, home suggestions must be nearby rather than merely same-city. */
  const V = vis().filter(p => !geoOn() || (d(p) != null && d(p) <= 25));

  const Lv = V
    .filter((p) => p.live)
    .sort(byDist)
    .slice(0, 3);

  const n = nowM();

  const So = V
    .filter(
      (p) =>
        !p.live &&
        mins(p.when) >= n &&
        mins(p.when) - n <= 180,
    )
    .sort(
      (a, b) => mins(a.when) - mins(b.when),
    )
    .slice(0, 3);

  const Fy = V
    .filter(
      (p) =>
        !Lv.includes(p) &&
        !So.includes(p),
    )
    .sort((a, b) => score(b) - score(a))
    .slice(0, 2);

  const pg = pings();
  const hd = Lv.concat(So).slice(0, 3);

  const sq = S.me.guest
    ? []
    : S.plans.filter(
        (p) =>
          p.members.includes("me") &&
          p.status == "open",
      );

  const G = (h) =>
    `<div class="grid">${h
      .map(card)
      .join("")}</div>`;

  return `
    <main class="wrap">
      <div class="two">
        <div>
          <div
            class="row sp"
            style="margin:0 0 6px"
          >
            <span
              class="sticker"
              style="margin:0"
            >
              ${
                S.me.guest
                  ? "Browse first. Join when ready 👀"
                  : "Hey " + esc(S.me.name) + " 👋"
              }
            </span>

            ${
              S.me.guest
                ? ""
                : `
                  <button
                    class="iconbtn"
                    data-a="notifs"
                    aria-label="Notifications${
                      unreadN() ? ", unread" : ""
                    }"
                  >
                    ${I("bell", "22px")}

                    ${
                      unreadN()
                        ? '<i class="dotb"></i>'
                        : ""
                    }
                  </button>
                `
            }
          </div>

          <h1>
            So... what are we doing?
          </h1>

          <p class="mut">
            Pandal hopping, garba nights, random meetups —
            find your people and go.
          </p>

          <div class="row">
            <a
              class="btn pink"
              href="#/explore"
            >
              Find a Plan
            </a>

            <a
              class="btn ghost"
              href="#/create"
            >
              Make a Plan
            </a>
          </div>

          ${geoBar()}

          <div class="banner">
            <h2>Still outside? 👀</h2>

            <p>
              Friends left? You're not done yet.
            </p>

            <div class="row">
              <button
                class="btn"
                style="background:var(--lime);color:#17131F;box-shadow:3px 3px 0 var(--ink)"
                data-a="osFind"
              >
                Find people
              </button>

              <button
                class="btn ghost"
                data-a="osMake"
              >
                Make a plan
              </button>
            </div>
          </div>

          ${fbPrompts()}

          ${
            sq.length
              ? `
                <h2>Your squads</h2>

                ${sq
                  .slice(0, 2)
                  .map(
                    (p) =>
                      `
                        <a
                          class="li"
                          href="#/gc/${p.id}"
                        >
                          <span
                            style="font-size:1.5rem"
                          >
                            ${T[p.type][0]}
                          </span>

                          <div style="flex:1">
                            <b>
                              ${esc(p.title)}
                            </b>

                            <br>

                            <span class="mut">
                              ${p.members.length} /
                              ${p.max} people ·
                              ${
                                p.live
                                  ? "Live now"
                                  : p.when
                              }
                            </span>
                          </div>

                          ${I("chevron-right")}
                        </a>
                      `,
                  )
                  .join("")}

                <a
                  class="btn ghost sm"
                  href="#/groups"
                >
                  All squads
                </a>
              `
              : ""
          }

          ${
            pg.length
              ? `
                <h2>For you 👀</h2>

                ${pg
                  .map(
                    (x) =>
                      `
                        <a
                          class="li"
                          href="#/plan/${x.id}"
                        >
                          🔔 ${x.x}
                        </a>
                      `,
                  )
                  .join("")}
              `
              : S.me.guest || S.me.interests.length
                ? ""
                : `
                  <a
                    class="li"
                    href="#/me"
                  >
                    ✨ Add interests for plans and pings
                    that match you
                  </a>
                `
          }
        </div>

        <div>
          ${
            !O.loaded.home
              ? loader(
                  "Asking who's still outside...",
                )
              : `
                <h2 style="margin-top:0">
                  Live Now 🔴
                </h2>

                ${
                  Lv.length
                    ? G(Lv)
                    : empty(
                        "It's giving... empty 😭",
                        "Nobody's live nearby yet.",
                        "Be the first",
                        "#/outside",
                      )
                }

                ${
                  So.length
                    ? `
                      <h2>Starting soon</h2>
                      ${G(So)}
                    `
                    : ""
                }

                ${
                  hd.length
                    ? `
                      <h2>
                        Who's heading where 👀
                      </h2>

                      ${hd
                        .map(
                          (p) =>
                            `
                              <div class="li">
                                ${av(p.creator, 30)}

                                <span>
                                  <b>
                                    ${esc(
                                      usr(p.creator).name,
                                    )}
                                  </b>
                                  is heading to
                                  ${esc(p.loc)}
                                </span>
                              </div>
                            `,
                        )
                        .join("")}
                    `
                    : ""
                }

                <h2>Upcoming events near you</h2>

                <div class="grid">
                  ${(() => {
                    const normCity = value => String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
                    const selectedCity = normCity(viewCity());
                    const publishedEvents = (Array.isArray(S.events) ? S.events : [])
                      .filter(e => e && e.status === 'published')
                      .filter(e => {
                        const eventCity = normCity(e.city || e.locCity || cityOfLoc(e.loc));
                        return !selectedCity || !eventCity || eventCity === selectedCity;
                      })
                      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
                    return publishedEvents.slice(0, 3).map(evCard).join('') || empty('No upcoming events yet', 'Published Squado events will appear here.', 'Explore plans', '#/explore');
                  })()}
                </div>

                <h2>Picked for you</h2>

                ${G(Fy)}

                <p style="margin-top:16px">
                  <a
                    class="btn ghost sm"
                    href="#/explore"
                  >
                    See everything
                  </a>
                </p>
              `
          }
        </div>
      </div>
    </main>
  `;
}