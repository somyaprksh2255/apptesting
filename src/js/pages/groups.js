/* Groups tab: list | conversation.
   Mobile shows one at a time (list -> tap -> full-screen chat);
   desktop shows both.
*/

function groupsPage(id) {
  return `
    <main class="wrap gwrap ${id ? "act" : ""}">
      ${groupList(id)}

      ${
        id
          ? groupChat(id)
          : `
            <section
              class="gpanel ph"
              aria-hidden="true"
            >
              <div class="empty">
                <h3>Pick a squad</h3>

                <p class="mut">
                  Your conversation opens here.
                </p>
              </div>
            </section>
          `
      }
    </main>
  `;
}