/* Squado icon + emoji system (single source of truth).
   Functional UI  -> Lucide SVG (I)
   Expressive emoji -> Twemoji SVG (TW, CC-BY 4.0, jdecked/twemoji)
   User-generated content stays native (esc() turns emoji into entities so UI() never touches it).
   Brand logos -> official assets.
*/

const eh = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    })[c],
  );

const EMX =
  /\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]|\p{Extended_Pictographic}/gu;

const esc = (s) =>
  eh(s)
    .replace(EMX, (m) =>
      [...m]
        .map(
          (c) =>
            "&#x" +
            c.codePointAt(0).toString(16) +
            ";",
        )
        .join(""),
    );

const ALT = {
  "triangle-alert": "AlertTriangle",
  "circle-x": "XCircle",
  "circle-check": "CheckCircle",
  house: "Home",
  "users-round": "Users",
  "user-round": "User",
  "calendar-days": "Calendar",
  "building-2": "Building2",
  "repeat-2": "Repeat2",
  "ellipsis-vertical": "MoreVertical",
  "messages-square": "MessagesSquare",
  "map-pinned": "MapPinned",
};

const ICC = {};

function I(n, s = "1.1em", c = "") {
  const k = n + s + c;

  if (ICC[k] !== undefined) {
    return ICC[k];
  }

  const L = window.lucide;

  let h = `<span class="ic ic-${n} ${c}" style="width:${s};height:${s}"></span>`;

  if (L && L.icons) {
    const P = (x) =>
      x
        .split("-")
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join("");

    const node = L.icons[P(n)] || L.icons[ALT[n]];

    if (node) {
      const el = L.createElement(node);

      el.setAttribute("width", s);
      el.setAttribute("height", s);
      el.setAttribute("class", "ic lucide ic-" + n + " " + c);
      el.setAttribute("aria-hidden", "true");

      h = el.outerHTML;
    }
  }

  return (ICC[k] = h);
}

/* functional emoji -> Lucide.
   Anything not listed here (🔥 🫡 👀 💀 😭 🎉 🫶 🪩 ...)
   is expressive and becomes Twemoji.
*/

const EM = {
  "📍": "map-pin",
  "🕘": "clock",
  "👥": "users-round",
  "🎯": "target",
  "📌": "pin",
  "🔒": "lock",
  "🛡️": "shield-check",
  "🔔": "bell",
  "🏠": "house",
  "🔭": "compass",
  "💬": "users-round",
  "👤": "user-round",
  "🌗": "sun-moon",
  "📷": "camera",
  "🚺": "venus",
  "🚹": "mars",
  "🔴": ["circle", ".7em", "fill"],
  "🫠": "moon",
  "🪔": "landmark",
  "💃": "music-2",
  "🍛": "soup",
  "🍕": "utensils",
  "☕": "coffee",
  "📸": "camera",
  "🛍️": "shopping-bag",
  "🏙️": "building-2",
  "✨": "sparkles",
  "🚶": "footprints",
  "🧭": "compass",
  "🎶": "music",
  "🎬": "clapperboard",
  "⚽": "trophy",
  "🎮": "gamepad-2",
  "🎟️": "ticket",
  "🔁": "repeat-2",
  "🌱": "sprout",
  "✅": "badge-check",
  "⏳": "hourglass",
  "⏰": "alarm-clock",
  "👑": "crown",
};

const EMN = {};

Object.entries(EM).forEach(([k, v]) => {
  EMN[k.replace(/\uFE0F/g, "")] = v;
});

const LBLX = {
  "🪩": "zap",
  "🧃": "cup-soda",
  "🤡": "dices",
  "🎉": "party-popper",
};

const ARW = {
  "←": "arrow-left",
  "➜": "arrow-right",
  "✓": "check",
  "✕": "x",
  "＋": "plus",
};

const TI = {
  garba: "music-2",
  pandal: "landmark",
  bhandara: "soup",
  food: "utensils",
  chai: "coffee",
  photo: "camera",
  shopping: "shopping-bag",
  city: "compass",
  outside: "moon",
  custom: "sparkles",
  random: "party-popper",
};

const FI = {
  "Friendly vibe": "smile",
  Respectful: "heart-handshake",
  "Fun to hang out with": "sparkles",
  "Good communicator": "message-circle",
  Reliable: "badge-check",
  "Felt safe": "shield-check",
  "Fun experience": "party-popper",
  "Good communication": "message-circle",
  "Well organized": "list-checks",
  "Would meet again": "repeat",
  "Made everyone feel welcome": "hand-heart",
};

function TW(e) {
  const cp = [...e].map((c) =>
    c.codePointAt(0).toString(16),
  );

  const k = e.includes("\u200D")
    ? cp
    : cp.filter((x) => x != "fe0f");

  return `<img class="tw" alt="${e}" src="https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${k.join(
    "-",
  )}.svg" draggable="false">`;
}

function lbl(s) {
  s = String(s);

  const m =
    /^(\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*)\s+(.*)$/u.exec(
      s,
    );

  if (!m) {
    return esc(s);
  }

  const k = m[1].replace(/\uFE0F/g, "");
  const n = EMN[k] || LBLX[k];

  return (
    (n
      ? typeof n == "string"
        ? I(n)
        : I(n[0], n[1], n[2])
      : TW(m[1])) +
    " " +
    esc(m[2])
  );
}

const UXR =
  /(\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*)|[←➜✓✕＋]/gu;

const UI = (h) =>
  h
    .split(/(<[^>]*>)/)
    .map((x, i) =>
      i % 2
        ? x
        : x.replace(UXR, (m) => {
            if (ARW[m]) {
              return I(ARW[m]);
            }

            const n = EMN[m.replace(/\uFE0F/g, "")];

            return n
              ? typeof n == "string"
                ? I(n)
                : I(n[0], n[1], n[2])
              : TW(m);
          }),
    )
    .join("");

document.addEventListener(
  "error",
  (e) => {
    const t = e.target;

    if (
      t &&
      t.tagName == "IMG" &&
      t.classList &&
      t.classList.contains("tw")
    ) {
      t.replaceWith(
        document.createTextNode(t.alt),
      );
    }
  },
  true,
);