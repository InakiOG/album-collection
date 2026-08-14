const crate = document.getElementById("crate-shelf");
const crateEl = document.getElementById("crate");
const crateTrack = document.getElementById("crate-track");
const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");
const sortToggle = document.getElementById("sort-toggle");

const crateBoxImgs = crateTrack.querySelectorAll(".crate-box");

const cdPileEl = document.getElementById("cd-pile");
const tapeEl = document.getElementById("tape-recorder");
const expandBackdropEl = document.getElementById("expand-backdrop");

const PEEK_STEP_RATIO = 5.52 / 441; // fraction of the card size, so the stack scales with it
const SCALE_STEP = 0.006;
const LIFT_FRACTION = 0.48;
const TILT_DEG = -28;
const BOX_SIZE = 30;
const RISE_MS = 340; // matches the .stack-card transform transition duration
const HUE_STEP = 55; // degrees between each box's crate color, spread around the wheel

// body's background.png (the wall+table photo) is sized with
// background-size:cover and background-position:"center 75%" — where its
// front table edge actually lands on screen shifts with the viewport's
// aspect ratio, since "cover" crops a different slice of the (fixed 4:3)
// photo depending on whether width or height is the binding dimension.
// Reproduces that same cover/position math here so --table-edge always
// lands exactly on the photo's table line, in px up from the viewport
// bottom, no matter the device — fixed vh offsets drift off the line and
// end up floating the CD pile/tape recorder above the table on some
// aspect ratios.
const TABLE_IMG_W = 6000;
const TABLE_IMG_H = 4500;
const TABLE_EDGE_FRAC = 0.7025; // measured: fraction down background.png where the table front edge sits
const TABLE_POS_Y = 0.75; // must match body's `background-position: center 75%`

function updateTableAnchor() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.max(vw / TABLE_IMG_W, vh / TABLE_IMG_H);
  const edgeFromTop = TABLE_POS_Y * vh - (TABLE_POS_Y - TABLE_EDGE_FRAC) * TABLE_IMG_H * scale;
  const edgeFromBottom = vh - edgeFromTop;
  document.documentElement.style.setProperty("--table-edge", `${edgeFromBottom}px`);
}

updateTableAnchor();
window.addEventListener("resize", updateTableAnchor);
window.addEventListener("orientationchange", updateTableAnchor);

function hueForBox(boxIndex) {
  return boxIndex === 0 ? 0 : (boxIndex * HUE_STEP) % 360; // box 0 keeps the original color
}

function applyHue(imgs, boxIndex) {
  const deg = hueForBox(boxIndex);
  const filter = deg ? `hue-rotate(${deg}deg)` : "";
  imgs.forEach((img) => (img.style.filter = filter));
}

let sortedReleases = []; // full collection
let boxes = []; // sortedReleases chunked into BOX_SIZE-album crates
let currentBoxIndex = 0;
let activeBoxReleases = []; // boxes[currentBoxIndex] — what's currently in the middle crate
let currentIndex = 0;
let expandedIdx = null;
let hasInteracted = false; // no album rises until the user scrolls/swipes/navigates
const mounted = new Map(); // absolute index -> element
// absolute index -> { letter, i, total, isYear } divider-tab info for the
// month/letter group that starts there (isYear: label is a year, not a month)
let letterBreaksByIdx = new Map();

function releaseUrl(r) {
  return `https://www.discogs.com/release/${r.id}`;
}

// per-record personal notes, shown inside the Info paper (see fillInfo)
const RECORD_NOTES = {
  30712517: "hello world", // Social Cues — Cage The Elephant

  28644541: "Este álbum es de los favoritos de Alex y Sam", // Ultraviolence — Lana Del Rey
  29588590: "De los favs de Alex", // Mezzanine — Massive Attack

  // Duster
  28426747: "Siempre que lo escucho me acuerdo de ti", // Stratosphere
  13803601: "Siempre que lo escucho me acuerdo de ti", // Contemporary Movement

  30832662: "El álbum de Mar", // Submarine — The Marías
  32301257: "Rita me lo enseñó :)", // Alvvays
  36698716: "Para Alex", // Peek! — Unperro Andaluz
  35667808: "La primera canción que me aprendí en batería en la banda con Diego y Sam fue say aint so", // Blue Album — Weezer
  26806592: "Este álbum siempre va a ser de nosotros", // In Rainbows — Radiohead
  7097051: "Te extraño Nelly", // Nevermind — Nirvana
  10658192: "De los favoritos de mi papá", // Hopes And Fears — Keane
  22727822: "Me lo regaló mi papá :)", // Pablo Honey — Radiohead
  13839494: "Marcó mi adolescencia", // Crystal Castles

  // Parachutes (Coldplay) y Currents (Tame Impala)
  31728419: "Me lo regalaron Pé y Arce :)",
  7252111: "Me lo regalaron Pé y Arce :)",

  // Abbey Road y Let It Be — The Beatles
  30834342: "Me los regaló Abi",
  11092658: "Me los regaló Abi",

  9063908: "Me lo regaló mi abuelo :)", // Meddle — Pink Floyd
  25676449: "Mi primer álbum en vinilo", // The Dark Side Of The Moon — Pink Floyd
  32292255: "Me lo regaló Dani por mi cumpleaños", // Igor — Tyler, The Creator
  22786961: "Me lo regaló Dani :)", // Call Me If You Get Lost — Tyler, The Creator
  26724584: "Me lo regaló Dani por navidad!", // Random Access Memories (RAM) — Daft Punk
  27361662: "Me lo regaló Dani!!", // Ponyo — Joe Hisaishi
  5777037: "Me lo compró Dani en un bazar", // Los 3 Grandes — Various

  // Greatest Hits (Elton John) y Fun And Games (Chuck Mangione)
  5918431: "Me lo regaló el papá de Dani",
  13447300: "Me lo regaló el papá de Dani",

  29277010: "Me lo regalaron Pe y Arce", // Discovery — Daft Punk
  14662264: "Se lo cambié a Marieli por un tocadiscos viejo", // Point Of Know Return — Kansas
  10036282: "Me lo regaló Dani :)", // Eye In The Sky — The Alan Parsons Project
};

function noteFor(r) {
  return RECORD_NOTES[r.id] || null;
}

// stacks CD cases directly on top of one another, flat and square, each one
// offset just enough to peek out from under the case above it. Clicking
// anywhere on the resting pile opens the full-screen browser (see below)
// instead of any one case directly — the individual cases here are just a
// preview, not independently clickable.
function renderCdPile(cdReleases) {
  cdPileEl.innerHTML = "";
  const n = cdReleases.length;
  if (!n) return;

  const caseSize = 78;
  const peek = 6; // how much of each case shows below the one stacked on top of it (before foreshortening)

  cdReleases.forEach((r, i) => {
    const wrap = document.createElement("div");
    wrap.className = "cd-disc-wrap";
    wrap.style.bottom = `${(i * peek).toFixed(1)}px`;
    wrap.style.zIndex = String(i);

    const img = document.createElement("img");
    img.className = "cd-disc";
    img.style.width = `${caseSize}px`;
    img.style.height = `${caseSize}px`;
    img.src = r.cover;
    img.alt = r.title;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.title = `${r.artists.join(", ")} — ${r.title}`;

    wrap.appendChild(img);
    cdPileEl.appendChild(wrap);
  });
}

// --- CD browser: clicking the resting pile brings the CDs front-and-center,
// top case foremost, each one already styled like an opened jewel case
// (black spine bar, rainbow glare) rather than a flat cover photo. Scrolling
// or swiping sends the front case flying to the back and promotes the next
// one; the whole front case is clickable — tapping it reveals a white info
// paper sliding out from behind it. Clicking anywhere else (the backdrop, or
// a peeking case behind the front one) returns to the resting pile.
const cdBrowserEl = document.getElementById("cd-browser");
const cdBrowserStackEl = document.getElementById("cd-browser-stack");
const CD_SHIFT_MS = 320;
// the shuffle animation's own z-index tiers — well clear of the resting
// stack's own 44-50 range (see cdRestDepth) so ordering between a card
// mid-shuffle and the resting deck is never ambiguous
const CD_Z_FRONT = 100; // the card currently claiming the front slot
const CD_Z_LIFT = 90; // a card mid-shuffle, elevated above the resting deck
const CD_LIFT_Y = "-70%"; // how far up a card rises during the shuffle
const CD_LIFT_SCALE = 0.9;
const CD_PHASE_MS = 150; // duration of the lift/front-claim beats
const CD_SETTLE_MS = 220; // duration of the drop-and-shrink beat into/out of the back
let allCdReleases = [];
let cdOrder = []; // release objects, front-to-back
let cdCardEls = []; // parallel to cdOrder — persistent elements, reordered rather than recreated
let cdBrowsing = false;
let cdShifting = false;

// depth is capped — beyond it, cards are fully stacked/hidden together
// rather than spreading out indefinitely
function cdRestDepth(i) {
  return Math.min(i, 6);
}

function styleCdCard(el, i) {
  const depth = cdRestDepth(i);
  const offset = depth * 10;
  const scale = Math.max(1 - depth * 0.05, 0.7);
  el.style.transform = `translate(${offset}px, ${offset}px) scale(${scale})`;
  el.style.zIndex = String(50 - depth);
  el.style.opacity = depth < 6 ? "1" : "0";
  el.style.pointerEvents = i === 0 ? "auto" : "none";
  // cards are reordered in the cdCardEls array, not in the actual DOM (the
  // elements themselves never move) — a real DOM-order selector like
  // :first-child would keep pointing at whichever element was created
  // first, so "which one is the front" is tracked with this class instead
  el.classList.toggle("cd-browser-card--front", i === 0);
}

// builds one case: cover art (clipped, with the spine/glare painted via
// crate.css's ::before/::after) plus its own tucked info paper — same
// fields the old CD overlay showed, reusing style.css's .overlay-info look
function buildCdBrowserCard(r) {
  const card = document.createElement("div");
  card.className = "cd-browser-card";

  const face = document.createElement("div");
  face.className = "cd-case-face";
  const img = document.createElement("img");
  img.src = r.cover;
  img.alt = r.title;
  img.referrerPolicy = "no-referrer";
  img.loading = "lazy";
  face.appendChild(img);
  card.appendChild(face);

  const info = document.createElement("div");
  info.className = "overlay-info cd-browser-info";
  const h2 = document.createElement("h2");
  h2.textContent = r.title;
  info.appendChild(h2);
  const artist = document.createElement("p");
  artist.textContent = r.artists.join(", ");
  info.appendChild(artist);
  const year = r.pressingYear ? `${r.year} (${r.pressingYear} pressing)` : r.year;
  const meta = document.createElement("p");
  meta.textContent = [year, r.formats.join(", "), r.label].filter(Boolean).join(" · ");
  info.appendChild(meta);
  const genres = document.createElement("p");
  genres.textContent = [...r.genres, ...r.styles].join(", ");
  info.appendChild(genres);

  const preview = document.createElement("p");
  preview.className = "card-preview-status cd-preview-status";
  preview.textContent = "";
  preview.addEventListener("click", (e) => {
    e.stopPropagation();
    // manual retry — covers the browser refusing the initial autoplay
    if (!previewPlaylist.length) return;
    previewAudio.play().then(() => setPreviewStatus("♪ Playing preview…")).catch(() => {});
  });
  info.appendChild(preview);

  const link = document.createElement("a");
  link.href = releaseUrl(r);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "View on Discogs →";
  info.appendChild(link);
  card.appendChild(info);

  return card;
}

function openCdBrowser() {
  if (cdBrowsing || cdShifting || !allCdReleases.length) return;
  cdBrowsing = true;

  // topmost case in the resting pile (last child — highest z-index/offset)
  // becomes the front of the browser
  cdOrder = [...allCdReleases].reverse();
  cdBrowserStackEl.innerHTML = "";
  cdCardEls = cdOrder.map((r) => {
    const card = buildCdBrowserCard(r);
    card.style.transition = "none"; // land in the fanned-out formation instantly, before the container's own FLIP grow-in plays
    cdBrowserStackEl.appendChild(card);
    return card;
  });
  cdCardEls.forEach((el, i) => styleCdCard(el, i));
  void cdBrowserStackEl.offsetWidth; // flush the snap
  cdCardEls.forEach((el) => (el.style.transition = ""));
  syncPreviewToSelection();

  const topDisc = cdPileEl.querySelector(".cd-disc-wrap:last-child");
  const startRect = (topDisc || cdPileEl).getBoundingClientRect();

  cdBrowserEl.classList.remove("hidden");
  cdPileEl.style.visibility = "hidden";

  // FLIP: pin the whole stack at the resting pile's on-screen spot, then
  // let it transition out to its real centered/full size
  const endRect = cdBrowserStackEl.getBoundingClientRect();
  const dx = startRect.left + startRect.width / 2 - (endRect.left + endRect.width / 2);
  const dy = startRect.top + startRect.height / 2 - (endRect.top + endRect.height / 2);
  const scale = startRect.width / endRect.width;

  cdBrowserStackEl.style.transition = "none";
  cdBrowserStackEl.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cdBrowserEl.classList.add("active");
      cdBrowserStackEl.style.transition = "transform 0.38s cubic-bezier(0.2, 0.8, 0.2, 1)";
      cdBrowserStackEl.style.transform = "translate(0, 0) scale(1)";
    });
  });
}

function closeCdBrowser() {
  if (!cdBrowsing) return;
  cdBrowsing = false;
  syncPreviewToSelection(); // falls back to whatever's selected in the crate, if anything

  const topDisc = cdPileEl.querySelector(".cd-disc-wrap:last-child");
  const endRect = (topDisc || cdPileEl).getBoundingClientRect();
  const startRect = cdBrowserStackEl.getBoundingClientRect();
  const dx = endRect.left + endRect.width / 2 - (startRect.left + startRect.width / 2);
  const dy = endRect.top + endRect.height / 2 - (startRect.top + startRect.height / 2);
  const scale = endRect.width / startRect.width;

  const frontInfo = cdCardEls[0] && cdCardEls[0].querySelector(".cd-browser-info");
  if (frontInfo) frontInfo.classList.remove("info-open");

  cdBrowserEl.classList.remove("active");
  cdBrowserStackEl.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.6, 1)";
  cdBrowserStackEl.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;

  setTimeout(() => {
    cdBrowserEl.classList.add("hidden");
    cdBrowserStackEl.style.transition = "";
    cdBrowserStackEl.style.transform = "";
    cdBrowserStackEl.innerHTML = "";
    cdCardEls = [];
    cdPileEl.style.visibility = "";
  }, CD_SHIFT_MS);
}

// dir > 0 — the front case is pulled and dealt to the back of the deck, in
// three beats:
//   1. it rises straight up
//   2. the next case steps into the now-empty front slot, in front of it
//   3. it drops down and shrinks into its resting spot at the very back,
//      disappearing behind the rest of the deck (now all in front of it)
// dir < 0 plays the same three beats in reverse, pulling the back-most case
// out from behind and dealing it into the front slot.
function shiftCdBrowser(dir) {
  if (!cdBrowsing || cdShifting || cdCardEls.length < 2) return;
  cdShifting = true;

  if (dir > 0) {
    const departing = cdCardEls.shift();
    const info = departing.querySelector(".cd-browser-info");
    if (info) info.classList.remove("info-open");
    cdOrder.push(cdOrder.shift());
    syncPreviewToSelection();
    const newFront = cdCardEls[0];

    // beat 1: straight up, above everything
    departing.style.pointerEvents = "none";
    departing.style.transition = `transform ${CD_PHASE_MS}ms cubic-bezier(0.3, 0, 0.6, 1)`;
    departing.style.zIndex = String(CD_Z_LIFT);
    departing.style.transform = `translate(0, ${CD_LIFT_Y}) scale(${CD_LIFT_SCALE})`;

    setTimeout(() => {
      // beat 2: the next case claims the front, stepping in ahead of it —
      // and every other case behind it shifts forward a slot too, same as
      // it always does on a plain restyle
      cdCardEls.forEach((el, i) => styleCdCard(el, i));
      if (newFront) newFront.style.zIndex = String(CD_Z_FRONT); // outrank the still-elevated departing case

      setTimeout(() => {
        // beat 3: drop down and shrink into its real resting spot at the
        // back, disappearing behind everything now in front of it. Once the
        // deck's deeper than the visible-depth cap, that resting spot's own
        // opacity is 0 — transitioning opacity too (not just transform)
        // means it visibly shrinks away first instead of instantly
        // vanishing the moment this phase starts
        cdCardEls.push(departing);
        departing.style.transition = `transform ${CD_SETTLE_MS}ms cubic-bezier(0.4, 0, 0.7, 1), opacity ${CD_SETTLE_MS}ms ease`;
        styleCdCard(departing, cdCardEls.length - 1);

        setTimeout(() => {
          departing.style.transition = "";
          // departing has settled at its own low resting z-index now, so
          // the front no longer needs the elevated tier that was only
          // there to outrank it while it was still up — back to its normal
          // resting z-index (everything else about it is unchanged)
          if (newFront) styleCdCard(newFront, 0);
          cdShifting = false;
        }, CD_SETTLE_MS);
      }, CD_PHASE_MS);
    }, CD_PHASE_MS);
  } else {
    const incoming = cdCardEls.pop();
    cdOrder.unshift(cdOrder.pop());
    syncPreviewToSelection();

    // beat 1 (reverse of beat 3): rise up out of its resting spot at the
    // back, growing and lifting clear above the rest of the deck
    incoming.style.transition = `transform ${CD_SETTLE_MS}ms cubic-bezier(0.3, 0, 0.6, 1)`;
    incoming.style.zIndex = String(CD_Z_LIFT);
    incoming.style.opacity = "1";
    incoming.style.pointerEvents = "none";
    incoming.style.transform = `translate(0, ${CD_LIFT_Y}) scale(${CD_LIFT_SCALE})`;

    setTimeout(() => {
      // beat 2 (reverse of beat 2): the rest of the deck steps back a slot
      // to make room (the array doesn't have `incoming` back in it yet, so
      // index j's real final slot is j + 1)
      cdCardEls.forEach((el, j) => styleCdCard(el, j + 1));

      setTimeout(() => {
        // beat 3 (reverse of beat 1): drop down into the front slot
        cdCardEls.unshift(incoming);
        incoming.style.transition = `transform ${CD_PHASE_MS}ms cubic-bezier(0.4, 0, 0.7, 1)`;
        styleCdCard(incoming, 0);

        setTimeout(() => {
          incoming.style.transition = "";
          cdShifting = false;
        }, CD_PHASE_MS);
      }, CD_SETTLE_MS);
    }, CD_PHASE_MS);
  }
}

cdPileEl.addEventListener("click", (e) => {
  e.stopPropagation();
  openCdBrowser();
});

cdBrowserEl.addEventListener("click", (e) => {
  if (!cdBrowsing) return;
  if (e.target.tagName === "A") return; // let the Discogs link work normally
  const front = cdCardEls[0];
  if (front && front.contains(e.target)) {
    e.stopPropagation();
    const info = front.querySelector(".cd-browser-info");
    if (info.classList.contains("info-open")) {
      // clicked the case itself (outside the open paper) — tuck it back
      if (!info.contains(e.target)) info.classList.remove("info-open");
    } else {
      info.classList.add("info-open");
    }
    return;
  }
  closeCdBrowser();
});

cdBrowserEl.addEventListener(
  "wheel",
  (e) => {
    if (!cdBrowsing) return;
    e.preventDefault();
    if (e.deltaY > 0) shiftCdBrowser(1);
    else if (e.deltaY < 0) shiftCdBrowser(-1);
  },
  { passive: false }
);

let cdTouchStart = null;
cdBrowserEl.addEventListener(
  "touchstart",
  (e) => {
    if (!cdBrowsing) return;
    const t = e.touches[0];
    cdTouchStart = { x: t.clientX, y: t.clientY };
  },
  { passive: true }
);
cdBrowserEl.addEventListener(
  "touchend",
  (e) => {
    if (!cdBrowsing || !cdTouchStart) return;
    const dx = e.changedTouches[0].clientX - cdTouchStart.x;
    const dy = e.changedTouches[0].clientY - cdTouchStart.y;
    cdTouchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) > Math.abs(dy)) shiftCdBrowser(dx < 0 ? 1 : -1);
    else shiftCdBrowser(dy < 0 ? 1 : -1);
  },
  { passive: true }
);

function sortKey(r) {
  return (r.artists[0] || "").toLowerCase().replace(/^the\s+/, "");
}

function sortAlphabetical(releases) {
  return [...releases].sort((a, b) => {
    const artistCmp = sortKey(a).localeCompare(sortKey(b));
    if (artistCmp !== 0) return artistCmp;
    return (a.year || 0) - (b.year || 0);
  });
}

function sortRecent(releases) {
  return [...releases].sort((a, b) => {
    const dateCmp = new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
    if (dateCmp !== 0) return dateCmp;
    return sortKey(a).localeCompare(sortKey(b));
  });
}

// the letter this release files under, for the alphabetical-sort divider tabs
function letterFor(r) {
  const ch = (sortKey(r).match(/[a-z0-9]/) || ["#"])[0];
  return ch.toUpperCase();
}

// the month this release was added, for the recent-sort divider tabs
function monthFor(r) {
  const d = new Date(r.dateAdded || 0);
  const abbr = d.toLocaleString("es-ES", { month: "short" }).replace(".", "");
  return abbr.charAt(0).toUpperCase() + abbr.slice(1);
}

// the year this release was added, for the recent-sort divider tabs
function yearFor(r) {
  return String(new Date(r.dateAdded || 0).getFullYear());
}

// whichever divider label applies to the current sort mode — recent mode
// shows the month, except on a January break, where the year replaces it
function tabLabelFor(r) {
  if (sortMode === "alphabetical") return letterFor(r);
  const month = monthFor(r);
  return month === "Ene" ? yearFor(r) : month;
}

// the key that decides whether this release starts a new divider group —
// letter mode groups by letter alone; recent mode groups by month AND year,
// so two Januaries a year apart don't collapse into a single, misleading tab
function tabGroupKeyFor(r) {
  return sortMode === "alphabetical" ? letterFor(r) : `${monthFor(r)}|${yearFor(r)}`;
}

// one entry per spot in the box where the divider group changes — each
// becomes a small tab poking out just ahead of that album, showing the
// month/letter (or the year, on a January break — see tabLabelFor).
// seedRelease is the previous box's last album, so a box that opens
// mid-group doesn't repeat a tab its predecessor just showed.
function computeLabelBreaks(releases, seedRelease = null) {
  const breaks = [];
  let prevKey = seedRelease ? tabGroupKeyFor(seedRelease) : null;
  releases.forEach((r, idx) => {
    const key = tabGroupKeyFor(r);
    if (key !== prevKey) {
      breaks.push({ idx, label: tabLabelFor(r), isYear: sortMode !== "alphabetical" && monthFor(r) === "Ene" });
      prevKey = key;
    }
  });
  return breaks;
}

// a box's breaks, seeded with whatever the previous box left off on
function computeBoxLabelBreaks(boxIndex) {
  const releases = boxes[boxIndex] || [];
  const prevBox = boxes[boxIndex - 1];
  const seedRelease = prevBox && prevBox.length ? prevBox[prevBox.length - 1] : null;
  return computeLabelBreaks(releases, seedRelease);
}

// turns a flat breaks list into the lookup map createCard reads
function buildTabMap(breaks) {
  return new Map(
    breaks.map(({ idx, label, isYear }, i) => [idx, { letter: label, i, total: breaks.length, isYear }])
  );
}

function buildFallbackArt(r) {
  const div = document.createElement("div");
  div.className = "record-fallback";
  div.textContent = `${r.artists.join(", ")} — ${r.title}`;
  return div;
}

function cardSizePx() {
  return crate.getBoundingClientRect().width || 220;
}

// 30s song previews, sourced from the iTunes Search API (no key needed, CORS-
// open) since Discogs data has no track-level audio. Plays for as long as an
// album is selected — peeking or expanded — cycling through that album's
// tracks back-to-back so something is always playing. Keyed by release id so
// re-selecting an already-looked-up album doesn't refetch.
const previewAudio = new Audio();
previewAudio.preload = "none";
const previewCache = new Map(); // release.id -> previewUrl[] (empty array = no matches found)
let previewToken = 0; // bumped on every stop/start so a slow, now-stale fetch can't act after the fact
let previewSelectionId = null; // release.id the playlist below belongs to
let previewPlaylist = [];
let previewTrackIdx = 0;
let previewStatusText = ""; // mirrored into the currently-visible Info paper's status line

// whichever Info paper is currently showing the selected album — the CD
// browser's front case takes priority since it visually covers the crate
// while it's open
function currentPreviewStatusEl() {
  if (cdBrowsing) {
    const front = cdCardEls[0];
    return front && front.querySelector(".cd-preview-status");
  }
  const el = mounted.get(currentIndex);
  return el && el.querySelector(".card-preview-status");
}

function renderPreviewStatus() {
  const statusEl = currentPreviewStatusEl();
  if (statusEl) statusEl.textContent = previewStatusText;
}

function setPreviewStatus(text) {
  previewStatusText = text;
  renderPreviewStatus();
}

async function fetchPreviewPlaylist(r) {
  if (previewCache.has(r.id)) return previewCache.get(r.id);
  const term = `${r.artists[0] || ""} ${r.title}`.trim();
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=25`;
  let playlist = [];
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const artistLower = (r.artists[0] || "").toLowerCase();
      const titleLower = r.title.toLowerCase();
      const sameAlbum = data.results.filter(
        (t) => t.previewUrl && t.collectionName?.toLowerCase() === titleLower && t.artistName?.toLowerCase().includes(artistLower)
      );
      // fall back to any preview by that artist if we can't line up the exact album (reissues/compilations rename titles a lot)
      const pool = sameAlbum.length
        ? sameAlbum
        : data.results.filter((t) => t.previewUrl && t.artistName?.toLowerCase().includes(artistLower));
      const seen = new Set();
      for (const t of pool) {
        if (!seen.has(t.previewUrl)) {
          seen.add(t.previewUrl);
          playlist.push(t.previewUrl);
        }
      }
    }
  } catch {
    playlist = [];
  }
  previewCache.set(r.id, playlist);
  return playlist;
}

function stopPreview() {
  previewToken++;
  previewSelectionId = null;
  previewPlaylist = [];
  previewTrackIdx = 0;
  previewAudio.pause();
  previewAudio.removeAttribute("src");
  setPreviewStatus("");
}

function playPreviewTrack() {
  if (!previewPlaylist.length) return;
  previewAudio.src = previewPlaylist[previewTrackIdx];
  previewAudio.currentTime = 0;
  previewAudio
    .play()
    .then(() => setPreviewStatus("♪ Playing preview…"))
    .catch(() => setPreviewStatus("Tap ♪ to play preview"));
}

// advances to the next track the instant one preview clip ends, so there's
// always something playing while the album stays selected
previewAudio.addEventListener("ended", () => {
  if (!previewPlaylist.length) return;
  previewTrackIdx = (previewTrackIdx + 1) % previewPlaylist.length;
  playPreviewTrack();
});

async function startPreviewFor(r) {
  if (previewSelectionId === r.id) return; // already the selected album — playlist keeps cycling as-is
  const token = ++previewToken;
  previewSelectionId = r.id;
  previewPlaylist = [];
  previewTrackIdx = 0;
  previewAudio.pause();
  previewAudio.removeAttribute("src");
  setPreviewStatus("♪ Loading preview…");
  const playlist = await fetchPreviewPlaylist(r);
  if (token !== previewToken || previewSelectionId !== r.id) return; // selection moved on while we were fetching
  previewPlaylist = playlist;
  previewTrackIdx = 0;
  if (!playlist.length) {
    setPreviewStatus("No preview available");
    return;
  }
  playPreviewTrack();
}

// keeps the preview in sync with whatever album is currently selected
// (peeking or fully expanded) — call after any change to currentIndex/hasInteracted
// keeps the preview in sync with whatever's currently selected — the CD
// browser's front-most case if that's open, otherwise the crate's
// peeking/expanded album, otherwise nothing (and the music stops)
function syncPreviewToSelection() {
  let r = null;
  if (cdBrowsing && cdOrder.length) {
    r = cdOrder[0];
  } else if (hasInteracted) {
    r = activeBoxReleases[currentIndex];
  }
  if (!r) {
    stopPreview();
    return;
  }
  startPreviewFor(r);
}

function fillInfo(infoEl, r) {
  const year = r.pressingYear ? `${r.year} (${r.pressingYear} pressing)` : r.year;
  infoEl.innerHTML = "";
  infoEl.classList.remove("info-open");

  const tab = document.createElement("span");
  tab.className = "info-tab-label";
  tab.textContent = "Info";
  infoEl.appendChild(tab);

  const h3 = document.createElement("h3");
  h3.textContent = r.title;
  infoEl.appendChild(h3);

  const artist = document.createElement("p");
  artist.textContent = r.artists.join(", ");
  infoEl.appendChild(artist);

  const meta = document.createElement("p");
  meta.textContent = [year, r.formats.join(", "), r.label].filter(Boolean).join(" · ");
  infoEl.appendChild(meta);

  const genres = document.createElement("p");
  genres.textContent = [...r.genres, ...r.styles].join(", ");
  infoEl.appendChild(genres);

  const preview = document.createElement("p");
  preview.className = "card-preview-status";
  preview.textContent = "";
  preview.addEventListener("click", () => {
    // manual retry — covers the browser refusing the initial autoplay
    if (!previewPlaylist.length) return;
    previewAudio.play().then(() => setPreviewStatus("♪ Playing preview…")).catch(() => {});
  });
  infoEl.appendChild(preview);

  const link = document.createElement("a");
  link.href = releaseUrl(r);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "View on Discogs →";
  infoEl.appendChild(link);

  // a personal note — only present on records that have one (see
  // RECORD_NOTES) — shown inside this same Info paper, not a separate tab
  const noteText = noteFor(r);
  if (noteText) {
    const note = document.createElement("p");
    note.className = "card-note";
    const label = document.createElement("strong");
    label.textContent = "Notas: ";
    note.appendChild(label);
    note.appendChild(document.createTextNode(noteText));
    infoEl.appendChild(note);
  }
}

function styleCard(el, idx) {
  if (el.dataset.idx == expandedIdx) return; // expanded card manages its own styles

  // every card keeps a fixed spot based on its own position in the box —
  // scrolling never reflows the pile, it only lifts the active card
  const isActive = idx === currentIndex && hasInteracted;
  const baseY = -idx * cardSizePx() * PEEK_STEP_RATIO;
  const scale = Math.max(1 - idx * SCALE_STEP, 0.4);
  // the peeking album reads wider — 10% on desktop, 3% on phones (matches crate.css's own 480px breakpoint)
  const peekWidthBoost = window.matchMedia("(max-width: 480px)").matches ? 1.03 : 1.1;
  const scaleX = isActive ? scale * peekWidthBoost : scale;
  const lift = isActive ? cardSizePx() * LIFT_FRACTION : 0;

  el.style.transform = `translateY(${baseY - lift}px) scale(${scaleX}, ${scale}) rotateX(${TILT_DEG}deg)`;
  // all resting/raised cards stay between crate-back (z:1) and crate-front
  // (z:500) — in front of the box body, behind the front lattice wall.
  // depth order always follows each card's own place in the stack, so a
  // raised card still rises up from — not in front of — albums ahead of it
  el.style.zIndex = String(Math.max(2, 490 - idx));
  el.style.opacity = "1";
  el.style.pointerEvents = "";
  el.style.filter = "none";
  el.classList.toggle("front", isActive);
}

// the divider info this card should show a tab for, or null — looked up from
// the active box's precomputed breaks (see mountAll). idx 0 is only a break
// when its own label actually differs from the previous box's last album.
function letterTabFor(idx) {
  return letterBreaksByIdx.get(idx) || null;
}

// spreads each divider tab across its own left/right slot, left to right in
// filing order, so tabs never land in the same horizontal spot and overlap
function letterTabLeftPercent(i, total) {
  const MIN = 4;
  const MAX = 90;
  if (total <= 1) return MIN;
  return MIN + ((MAX - MIN) * i) / (total - 1);
}

// narrows the tabs as more of them have to share the same row, so a box
// with many letter breaks doesn't overlap its own dividers
function letterTabWidthPercent(total) {
  return Math.max(4, Math.min(10, 80 / Math.max(total, 1)));
}

// tabInfoOverride lets mountTravelingCard supply idx 0's tab info ahead of
// time, computed against the target box it's traveling into — that box
// isn't the active one yet, so the normal letterBreaksByIdx lookup (built
// for whatever box is currently active) doesn't apply to it
function createCard(idx, r, tabInfoOverride) {
  const card = document.createElement("div");
  card.className = "stack-card";
  card.dataset.idx = String(idx);

  if (r.cover) {
    const img = document.createElement("img");
    img.decoding = "async"; // don't block the main thread decoding it
    img.src = r.cover;
    img.alt = r.title;
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      img.replaceWith(buildFallbackArt(r));
    });
    card.appendChild(img);
  } else {
    card.appendChild(buildFallbackArt(r));
  }

  const tabInfo = tabInfoOverride !== undefined ? tabInfoOverride : letterTabFor(idx);
  if (tabInfo) {
    const tab = document.createElement("span");
    tab.className = tabInfo.isYear ? "letter-tab year-tab" : "letter-tab";
    tab.textContent = tabInfo.letter;
    tab.setAttribute("aria-hidden", "true");
    tab.style.left = `${letterTabLeftPercent(tabInfo.i, tabInfo.total)}%`;
    tab.style.width = `${letterTabWidthPercent(tabInfo.total)}%`;
    card.appendChild(tab);
  }

  const info = document.createElement("div");
  info.className = "card-info";
  info.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.target.tagName === "A") return; // let the Discogs link work normally
    info.classList.add("info-open");
    card.classList.add("info-open"); // shifts the cover left to make room, desktop only
  });
  card.appendChild(info);

  card.addEventListener("click", (e) => {
    e.stopPropagation();
    if (expandedIdx === idx) {
      // on phone there's no little peeking info tab to tap — tapping the
      // cover itself while it's already expanded reveals the info instead
      if (window.matchMedia("(max-width: 480px)").matches && !info.classList.contains("info-open")) {
        info.classList.add("info-open");
        card.classList.add("info-open");
      }
      return;
    }
    collapseExpanded();
    if (idx === currentIndex && hasInteracted) {
      // clicking the album that's already peeking opens the full view —
      // gated on hasInteracted too, since idx 0 is also currentIndex's
      // default value before anything's been peeked yet; without this, the
      // very first click on album 0 would skip straight to the full view
      // instead of just raising it like every other album's first click does
      expandCard(idx);
    } else {
      // clicking any other album just peeks it — set state directly
      // instead of going through goTo(), which only navigates on repeat
      // interactions (its very-first-gesture guard was leaving clicks on a
      // fresh/reset stack with nowhere to go, always landing back on
      // whatever was last expanded)
      currentIndex = idx;
      hasInteracted = true;
      updatePositions();
      syncPreviewToSelection();
    }
  });

  return card;
}

function riseTransform(idx) {
  const baseY = -idx * cardSizePx() * PEEK_STEP_RATIO;
  const scale = Math.max(1 - idx * SCALE_STEP, 0.4);
  const fullLift = cardSizePx() * 0.85;
  return `translateY(${baseY - fullLift}px) scale(${scale}) rotateX(${TILT_DEG}deg)`;
}

function expandCard(idx) {
  const el = mounted.get(idx);
  if (!el) return;
  expandedIdx = idx;
  el.classList.remove("info-open"); // each album opens with the cover centered, info tucked to a tab
  fillInfo(el.querySelector(".card-info"), activeBoxReleases[idx]);
  renderPreviewStatus(); // preview is already playing from when this album was peeked — just reflect its status

  // step 1: rise straight up, still in its place in the stack
  el.style.transform = riseTransform(idx);

  setTimeout(() => {
    if (expandedIdx !== idx) return; // collapsed again before the rise finished
    // step 2: jump to the front, centered, on top of everything else.
    // crate-shelf has its own stacking context (perspective/transform), so
    // an inline z-index here can't outrank the crate-front image sibling —
    // lift the card out to the top level while it's open. #crate-row is
    // itself position:fixed with a transform, which is *also* the
    // containing block position:fixed descendants resolve against — moving
    // the card any further out (e.g. straight to <body>) would escape that
    // and throw off its tuned top/left values, so it only moves as far as
    // #crate. #expand-backdrop lives inside #crate too (see index.html) for
    // exactly the same reason: its z-index only needs to outrank this
    // card's un-expanded siblings (crate-track, at effectively z:0) within
    // that same local context, not compete globally.
    crateEl.appendChild(el);
    el.classList.add("expanded");
    expandBackdropEl.classList.add("active");
  }, RISE_MS);
}

function collapseExpanded() {
  if (expandedIdx === null) return;
  const el = mounted.get(expandedIdx);
  const idx = expandedIdx;
  expandedIdx = null;
  expandBackdropEl.classList.remove("active");
  // preview keeps playing — the album is still selected/peeking, just not expanded
  if (!el) return;

  // step 1 (reverse): drop out of the expanded card back to the risen,
  // in-place position
  el.classList.remove("expanded");
  crate.appendChild(el);
  el.style.transform = riseTransform(idx);

  setTimeout(() => {
    if (expandedIdx !== null) return; // re-expanded before the settle finished
    // step 2 (reverse): settle back down into its place in the stack
    styleCard(el, idx);
  }, RISE_MS);
}

expandBackdropEl.addEventListener("click", (e) => {
  e.stopPropagation();
  collapseExpanded();
});

function updatePositions() {
  for (const [idx, el] of mounted.entries()) {
    styleCard(el, idx);
  }
}

function goTo(index) {
  const wasInteracted = hasInteracted;
  hasInteracted = true;
  if (!wasInteracted) {
    // the very first gesture (either direction) only raises album 0 —
    // otherwise it jumps straight to index 1 and album 0 is never seen raised
    updatePositions();
    syncPreviewToSelection();
    return;
  }
  const max = activeBoxReleases.length - 1;
  const clamped = Math.max(0, Math.min(index, max));
  if (clamped === currentIndex) return;
  currentIndex = clamped;
  collapseExpanded();
  updatePositions();
  syncPreviewToSelection();
}

// mounting all 30 cards' images at once is enough DOM/decode work to cause
// a visible stall right when the switch animation ends — mount the
// front-most, visually dominant cards first and let the rest (mostly
// hidden behind them anyway) follow a frame later
const FIRST_MOUNT_BATCH = 8;

// cards start collapsed into a single flat pile at the front, then — once
// transitions are on — get sent to their real fanned-out positions, so a
// crate switch reads as the albums moving into place rather than popping in
function collapsedTransform() {
  return `translateY(0px) scale(1) rotateX(${TILT_DEG}deg)`;
}

// set by mountTravelingCard — the first album of the incoming box, already
// riding along inside the crate that just slid into the middle. Reused
// as-is for idx 0 instead of being torn down and recreated.
let travelingCard = null;

function mountCard(idx, r, container) {
  if (idx === 0 && travelingCard) {
    const card = travelingCard;
    travelingCard = null;
    card.style.transform = collapsedTransform();
    card.style.zIndex = String(Math.max(2, 490 - idx));
    card.style.pointerEvents = "";
    container.appendChild(card);
    mounted.set(idx, card);
    return;
  }

  const card = createCard(idx, r);
  card.style.transform = collapsedTransform();
  card.style.zIndex = String(Math.max(2, 490 - idx));
  card.style.opacity = "1";
  card.style.pointerEvents = "";
  container.appendChild(card);
  mounted.set(idx, card);
}

function mountAll() {
  crate.innerHTML = "";
  crate.classList.remove("ready");
  mounted.clear();
  // computed before any card is created — createCard reads this per idx to
  // decide whether that card carries a divider tab
  letterBreaksByIdx = buildTabMap(computeBoxLabelBreaks(currentBoxIndex));

  const frag = document.createDocumentFragment();
  activeBoxReleases.slice(0, FIRST_MOUNT_BATCH).forEach((r, idx) => mountCard(idx, r, frag));
  crate.appendChild(frag);

  requestAnimationFrame(() => {
    const rest = document.createDocumentFragment();
    activeBoxReleases
      .slice(FIRST_MOUNT_BATCH)
      .forEach((r, i) => mountCard(FIRST_MOUNT_BATCH + i, r, rest));
    crate.appendChild(rest);

    // let the collapsed pile paint once, then turn on transitions and send
    // every card to its real position — that's the "moving into place" step
    requestAnimationFrame(() => {
      crate.classList.add("ready");
      updatePositions();
    });
  });
}

function resetStack() {
  currentIndex = 0;
  expandedIdx = null;
  hasInteracted = false;
  stopPreview();
  mountAll();
}

function computeBoxes() {
  boxes = [];
  for (let i = 0; i < sortedReleases.length; i += BOX_SIZE) {
    boxes.push(sortedReleases.slice(i, i + BOX_SIZE));
  }
}

// silently fetches a box's cover art ahead of time so switching to it
// later doesn't have to wait on the network
const preloadedCovers = new Set();

function preloadBoxCovers(boxIndex) {
  const releases = boxes[boxIndex];
  if (!releases) return;
  releases.forEach((r) => {
    if (!r.cover || preloadedCovers.has(r.cover)) return;
    preloadedCovers.add(r.cover);
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.src = r.cover;
  });
}

function loadBox(boxIndex) {
  const clamped = Math.max(0, Math.min(boxIndex, boxes.length - 1));
  currentBoxIndex = clamped;
  activeBoxReleases = boxes[currentBoxIndex] || [];
  resetStack();
  applyHue(crateBoxImgs, currentBoxIndex);
  refreshSideSlots();
  updateRowSpacing();
  preloadBoxCovers((currentBoxIndex - 1 + boxes.length) % boxes.length);
  preloadBoxCovers((currentBoxIndex + 1) % boxes.length);
}

// the crates flanking the active one are full-size, just the empty crate
// tinted to match its own box color — no album peek
const crateRowEl = document.getElementById("crate-row");
const prevSlotEl = document.getElementById("crate-slot-prev");
const nextSlotEl = document.getElementById("crate-slot-next");

function renderMiniCrate(slotEl, boxIndex) {
  applyHue(slotEl.querySelectorAll(".crate-box"), boxIndex);
}

function refreshSideSlots() {
  if (!boxes.length) return;
  renderMiniCrate(prevSlotEl, (currentBoxIndex - 1 + boxes.length) % boxes.length);
  renderMiniCrate(nextSlotEl, (currentBoxIndex + 1) % boxes.length);
}

// the gap between crates is computed so that only a sliver — the crate's
// own border — shows at each screen edge, no matter the viewport size.
// landscape screens (desktop, tablets/phones sideways) have width to
// spare, so the sliver can be generous; portrait screens are width-scarce,
// so it stays modest and scales down on narrow phones.
function updateRowSpacing() {
  const crateWidth = crateEl.getBoundingClientRect().width;
  if (!crateWidth) return;
  // the crate photo can deliberately bleed past its own container for a
  // photographic effect (landscape) or be clamped to it (portrait) — measure
  // the side crate's own photo so the gap accounts for whichever applies
  const sidePhoto = nextSlotEl.querySelector(".crate-box");
  const photoWidth = sidePhoto ? sidePhoto.getBoundingClientRect().width : crateWidth;
  const overflow = Math.max(0, (photoWidth - crateWidth) / 2);
  // match the same feature the CSS breakpoints use, so this never disagrees
  // with which .crate-box sizing rule is actually in effect
  const isLandscape = !window.matchMedia("(orientation: portrait)").matches;
  const peek = isLandscape
    ? Math.max(8, Math.min(19, window.innerWidth * 0.0092))
    // side crates keep their full size on phone too — the overflow term
    // above already pulls the gap in to compensate for that. Keep this
    // small so the gap stays large and the side crates sit farther off
    // to the edges, mostly out of view
    : Math.max(4, Math.min(12, window.innerWidth * 0.015));
  const gap = Math.max(0, window.innerWidth / 2 - crateWidth / 2 - overflow - peek);
  crateRowEl.style.gap = `${gap}px`;
}

window.addEventListener("resize", updateRowSpacing);
window.addEventListener("orientationchange", updateRowSpacing);

// clicking a side crate: it grows into the middle, in front of everything.
// The outgoing main crate slides into the exact spot the crate on that
// same side currently rests at (visually becoming the new left/right
// crate), while that displaced crate moves in behind the middle and
// disappears — the two hand off at the same coordinates so it reads as
// one continuous crate arriving. The clicked crate then also switches to a
// brand-new box further out, so it briefly ducks behind the new middle
// crate before sliding out to reclaim its spot. Wraps around indefinitely
// at both ends.
const SHIFT_ANIM_MS = 360;

// if an album is currently raised/selected, play its "lower back down"
// animation first and let it finish before switching crates, instead of
// yanking it away mid-transition. Runs for clicks, swipes, and drags alike
// since they all funnel through here.
let deselecting = false;
function collapseSelectionThen(fn) {
  if (deselecting || shifting) return;
  collapseExpanded();
  if (hasInteracted) {
    deselecting = true;
    hasInteracted = false;
    stopPreview();
    updatePositions();
    setTimeout(() => {
      deselecting = false;
      fn();
    }, 340); // matches .crate-shelf.ready .stack-card's own transition duration
  } else {
    fn();
  }
}
let shifting = false;

function slotStepPx() {
  const gap = parseFloat(getComputedStyle(crateRowEl).columnGap) || 0;
  // the center-to-center distance between adjacent flex items depends on
  // both their layout widths, not just the main crate's — #crate is bigger
  // than the side crates on phone, so assuming equal widths is wrong.
  // offsetWidth (not getBoundingClientRect, which reflects the side
  // crates' scale(0.7) transform) gives the actual untransformed layout
  // size flexbox uses to position siblings.
  return crateEl.offsetWidth / 2 + gap + prevSlotEl.offsetWidth / 2;
}

// #crate is bigger than the flanking .crate-slot-side crates on phone —
// growing a side crate to transform:none only reaches its own (smaller)
// size, causing a visible pop when it hands off to the actually-bigger
// main crate at the swap. Scale up by the size ratio instead.
function growScaleFor(sideEl) {
  const crateSize = parseFloat(getComputedStyle(crateEl).getPropertyValue("--card-size"));
  const sideSize = parseFloat(getComputedStyle(sideEl).getPropertyValue("--card-size"));
  return sideSize ? crateSize / sideSize : 1;
}

// .crate-slot-side .crate-front normally clips off its own blank top ~58%
// so that dead space can't swallow clicks meant for the CD pile behind it.
// That clip sits right at the crate's actual top rim, though — fine at rest,
// but once this element scales way up to become the new main crate, the
// same sliver turns into a visible gap at the rim, and the traveling album
// card (which pokes slightly above its own resting spot) shows through the
// now-missing paint instead of staying hidden behind the front wall. Lift
// the clip for the duration of the grow animation and restore it once the
// element settles back into being an ordinary resting side crate.
function setGrowingClip(slotEl, growing) {
  const front = slotEl.querySelector(".crate-front");
  if (!front) return;
  front.style.clipPath = growing ? "inset(0 17% 0 15%)" : "";
}

// mounts the target box's first album riding inside the given slot, ready
// to travel with it as it slides to the middle
function mountTravelingCard(slotEl, targetIndex) {
  const sideShelf = slotEl.querySelector(".crate-shelf");
  const firstRelease = (boxes[targetIndex] || [])[0];
  if (!sideShelf || !firstRelease) return;
  const tabInfo = buildTabMap(computeBoxLabelBreaks(targetIndex)).get(0) || null;
  const card = createCard(0, firstRelease, tabInfo);
  card.style.transform = collapsedTransform();
  card.style.zIndex = "490";
  card.style.opacity = "1";
  sideShelf.appendChild(card);
  travelingCard = card;
}

// a lightweight stand-in crate, pinned at referenceEl's current on-screen
// spot. Used on desktop so the slot a clicked crate is leaving shows its
// next box immediately, instead of sitting empty until the clicked crate
// finishes traveling to the middle and the real element can take over.
function spawnGhostCrate(referenceEl, boxIndex) {
  const rect = referenceEl.getBoundingClientRect();
  const ghost = document.createElement("div");
  ghost.className = "crate crate-ghost";
  ghost.style.position = "fixed";
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;

  const track = document.createElement("div");
  track.className = "crate-track";
  track.innerHTML =
    '<img class="crate-box crate-back" src="assets/crate.png" alt="" aria-hidden="true">' +
    '<img class="crate-box crate-front" src="assets/crate-front.png" alt="" aria-hidden="true">';
  ghost.appendChild(track);
  applyHue(ghost.querySelectorAll(".crate-box"), boxIndex);

  document.body.appendChild(ghost);
  return ghost;
}

function animateShiftToPrev(targetIndex) {
  if (shifting || !boxes.length || targetIndex === currentBoxIndex) return;
  shifting = true;
  // the outgoing center crate's own albums shouldn't ride along as it
  // slides off — clear them the instant the swap starts instead of letting
  // them travel with the crate for the whole animation. (Fading the shelf
  // via opacity instead of clearing it left a translucent rectangle on
  // phone, since .crate-shelf sits in its own perspective/transform
  // stacking context and doesn't composite a bare opacity change cleanly.)
  crate.innerHTML = "";

  const step = slotStepPx();
  const t = "transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.36s ease";
  // on phone the reveal is a plain fade in place, not a slide
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;

  mountTravelingCard(prevSlotEl, targetIndex);

  // desktop: prevSlotEl is about to leave its slot to travel to the
  // middle — pin a stand-in crate right where it's sitting now, already
  // showing the next box that'll live there, so the slot never looks
  // empty while the real element is busy
  let ghost = null;
  if (!isPortrait) {
    ghost = spawnGhostCrate(prevSlotEl, (targetIndex - 1 + boxes.length) % boxes.length);
  }

  crateRowEl.style.transition = t;
  crateRowEl.style.transform = `translateX(calc(-50% + ${step}px))`;

  // the clicked crate grows into the middle, in front of everything —
  // scaled up to match #crate's actual size, not just its own
  prevSlotEl.style.zIndex = "20";
  prevSlotEl.style.transition = t;
  prevSlotEl.style.transform = `scale(${growScaleFor(prevSlotEl)})`;
  setGrowingClip(prevSlotEl, true);

  crateEl.style.transition = t;
  if (isPortrait) {
    // the outgoing main crate is pushed behind the new middle crate: it
    // cancels the row's own shift so it stays put at center, where the
    // growing crate (higher z-index) covers it
    crateEl.style.transform = `translateX(${-step}px)`;
  } else {
    // desktop: it visibly travels to the other side, arriving on top of
    // (#crate's z-index is already above .crate-slot-side's) the crate
    // that was already there — nextSlotEl doesn't need to move, it just
    // gets covered until the handoff at the swap
    crateEl.style.transform = getComputedStyle(nextSlotEl).transform;
  }

  setTimeout(() => {
    // snap everything back instantly while nobody's watching, then swap
    // in the new box data
    crateRowEl.style.transition = "none";
    crateRowEl.style.transform = "translateX(-50%)";
    crateEl.style.transition = "none";
    crateEl.style.transform = "";

    if (!isPortrait) {
      // desktop: everything's already in its final position from the row
      // slide — snap prevSlotEl back to its own resting look (it was
      // "none" while grown to center), remove the stand-in now that the
      // real element can take over, then swap the main crate's content
      // in, no extra post-swap animation
      prevSlotEl.style.transition = "none";
      prevSlotEl.style.transform = "";
      prevSlotEl.style.zIndex = "";
      setGrowingClip(prevSlotEl, false);
      if (ghost) ghost.remove();
      loadBox(targetIndex);
      void crateRowEl.offsetWidth; // flush the snap before re-enabling transitions
      crateRowEl.style.transition = "";
      crateEl.style.transition = "";
      prevSlotEl.style.transition = "";
      updateRowSpacing();
      shifting = false;
      return;
    }

    // phone: prevSlotEl keeps the same slot role but now shows a brand-new
    // box further out — both it and nextSlotEl (which was pushed behind)
    // hide at their own resting spot, ready to fade in together
    prevSlotEl.style.transition = "none";
    prevSlotEl.style.transform = "";
    prevSlotEl.style.opacity = "0";
    prevSlotEl.style.zIndex = "0";
    setGrowingClip(prevSlotEl, false);

    nextSlotEl.style.transition = "none";
    nextSlotEl.style.opacity = "0";
    nextSlotEl.style.zIndex = "0";

    loadBox(targetIndex);
    void crateRowEl.offsetWidth; // flush the snap before animating the reveal
    crateRowEl.style.transition = "";
    crateEl.style.transition = "";

    // reveal both side crates from behind the middle at the same time
    requestAnimationFrame(() => {
      prevSlotEl.style.transition = "opacity 0.36s ease";
      prevSlotEl.style.opacity = "";
      nextSlotEl.style.transition = "opacity 0.36s ease";
      nextSlotEl.style.opacity = "";

      setTimeout(() => {
        prevSlotEl.style.transition = "";
        prevSlotEl.style.zIndex = "";
        nextSlotEl.style.transition = "";
        nextSlotEl.style.zIndex = "";
        // updateRowSpacing measures nextSlotEl's crate photo — recompute
        // now that everything's back to its normal resting transform,
        // since the mid-animation call in loadBox() could've measured a
        // side crate while its transform (and thus scale) was overridden
        updateRowSpacing();
        shifting = false;
      }, SHIFT_ANIM_MS);
    });
  }, SHIFT_ANIM_MS);
}

// exact mirror of animateShiftToPrev, with prev/next and left/right swapped
function animateShiftToNext(targetIndex) {
  if (shifting || !boxes.length || targetIndex === currentBoxIndex) return;
  shifting = true;
  // the outgoing center crate's own albums shouldn't ride along as it
  // slides off — clear them the instant the swap starts instead of letting
  // them travel with the crate for the whole animation. (Fading the shelf
  // via opacity instead of clearing it left a translucent rectangle on
  // phone, since .crate-shelf sits in its own perspective/transform
  // stacking context and doesn't composite a bare opacity change cleanly.)
  crate.innerHTML = "";

  const step = slotStepPx();
  const t = "transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.36s ease";
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;

  mountTravelingCard(nextSlotEl, targetIndex);

  // desktop: nextSlotEl is about to leave its slot to travel to the
  // middle — pin a stand-in crate right where it's sitting now, already
  // showing the next box that'll live there
  let ghost = null;
  if (!isPortrait) {
    ghost = spawnGhostCrate(nextSlotEl, (targetIndex + 1) % boxes.length);
  }

  crateRowEl.style.transition = t;
  crateRowEl.style.transform = `translateX(calc(-50% - ${step}px))`;

  nextSlotEl.style.zIndex = "20";
  nextSlotEl.style.transition = t;
  nextSlotEl.style.transform = `scale(${growScaleFor(nextSlotEl)})`;
  setGrowingClip(nextSlotEl, true);

  crateEl.style.transition = t;
  if (isPortrait) {
    crateEl.style.transform = `translateX(${step}px)`;
  } else {
    crateEl.style.transform = getComputedStyle(prevSlotEl).transform;
  }

  setTimeout(() => {
    crateRowEl.style.transition = "none";
    crateRowEl.style.transform = "translateX(-50%)";
    crateEl.style.transition = "none";
    crateEl.style.transform = "";

    if (!isPortrait) {
      // desktop: everything's already in its final position from the row
      // slide — snap nextSlotEl back to its own resting look, remove the
      // stand-in now that the real element can take over, then swap the
      // main crate's content in
      nextSlotEl.style.transition = "none";
      nextSlotEl.style.transform = "";
      nextSlotEl.style.zIndex = "";
      setGrowingClip(nextSlotEl, false);
      if (ghost) ghost.remove();
      loadBox(targetIndex);
      void crateRowEl.offsetWidth; // flush the snap before re-enabling transitions
      crateRowEl.style.transition = "";
      crateEl.style.transition = "";
      nextSlotEl.style.transition = "";
      updateRowSpacing();
      shifting = false;
      return;
    }

    nextSlotEl.style.transition = "none";
    nextSlotEl.style.transform = "";
    nextSlotEl.style.opacity = "0";
    nextSlotEl.style.zIndex = "0";
    setGrowingClip(nextSlotEl, false);

    prevSlotEl.style.transition = "none";
    prevSlotEl.style.opacity = "0";
    prevSlotEl.style.zIndex = "0";

    loadBox(targetIndex);
    void crateRowEl.offsetWidth;
    crateRowEl.style.transition = "";
    crateEl.style.transition = "";

    // reveal both side crates from behind the middle at the same time
    requestAnimationFrame(() => {
      nextSlotEl.style.transition = "opacity 0.36s ease";
      nextSlotEl.style.opacity = "";
      prevSlotEl.style.transition = "opacity 0.36s ease";
      prevSlotEl.style.opacity = "";

      setTimeout(() => {
        nextSlotEl.style.transition = "";
        nextSlotEl.style.zIndex = "";
        prevSlotEl.style.transition = "";
        prevSlotEl.style.zIndex = "";
        updateRowSpacing();
        shifting = false;
      }, SHIFT_ANIM_MS);
    });
  }, SHIFT_ANIM_MS);
}

prevSlotEl.addEventListener("click", (e) => {
  e.stopPropagation();
  collapseSelectionThen(() => animateShiftToPrev((currentBoxIndex - 1 + boxes.length) % boxes.length));
});

nextSlotEl.addEventListener("click", (e) => {
  e.stopPropagation();
  collapseSelectionThen(() => animateShiftToNext((currentBoxIndex + 1) % boxes.length));
});

let wheelLocked = false;
crateTrack.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (wheelLocked) return;
    wheelLocked = true;
    setTimeout(() => (wheelLocked = false), 220);
    if (e.deltaY > 0) goTo(currentIndex + 1);
    else if (e.deltaY < 0) goTo(currentIndex - 1);
  },
  { passive: false }
);

// the crate-front photo is deliberately much wider than crate-track's own
// box (it bleeds out to look photographic) and has pointer-events: none so
// clicks pass through to the album cards behind it. That means a
// press/touch over the visible image, outside crate-track's actual layout
// box, never reaches crate-track as an event target at all — it falls
// through to whatever's behind the crate entirely. So gesture tracking
// listens on the document and checks the image's real painted geometry
// (getBoundingClientRect) instead of relying on e.target.
const crateFrontEl = crateTrack.querySelector(".crate-front");

function isOverCrateFront(x, y) {
  const r = crateFrontEl.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

const SWIPE_THRESHOLD = 40;
let suppressNextClick = false;

function shiftFromSwipe(dx) {
  if (shifting || deselecting) return;
  suppressNextClick = true;
  collapseSelectionThen(() => {
    if (dx < 0) animateShiftToNext((currentBoxIndex + 1) % boxes.length);
    else animateShiftToPrev((currentBoxIndex - 1 + boxes.length) % boxes.length);
  });
}

// a card's own click listener runs in the bubble phase — catching this one
// in the capture phase on an ancestor lets us cancel it before it fires,
// so a drag that just switched crates doesn't also expand/select a card
document.addEventListener(
  "click",
  (e) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    e.stopPropagation();
    e.preventDefault();
  },
  true
);

crateTrack.addEventListener("dragstart", (e) => e.preventDefault());

let touchStart = null; // {x, y} — vertical swipes flip albums, horizontal ones switch crates
document.addEventListener(
  "touchstart",
  (e) => {
    const t = e.touches[0];
    touchStart = !cdBrowsing && isOverCrateFront(t.clientX, t.clientY) ? { x: t.clientX, y: t.clientY } : null;
  },
  { passive: true }
);
document.addEventListener(
  "touchend",
  (e) => {
    if (touchStart === null) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y; // positive = swiped down
    touchStart = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) >= SWIPE_THRESHOLD) shiftFromSwipe(dx);
    } else {
      if (Math.abs(dy) < 28) return;
      if (dy > 0) goTo(currentIndex + 1);
      else goTo(currentIndex - 1);
    }
  },
  { passive: true }
);

// horizontal drag with the mouse (desktop) does the same thing a side-crate
// click does — swipe left/right to switch crates. Vertical motion is left
// alone since that's the wheel's job on desktop.
let mouseDragStart = null; // {x, y} while a mouse drag is in progress
document.addEventListener("mousedown", (e) => {
  mouseDragStart = !cdBrowsing && isOverCrateFront(e.clientX, e.clientY) ? { x: e.clientX, y: e.clientY } : null;
});
window.addEventListener("mouseup", (e) => {
  if (!mouseDragStart) return;
  const dx = e.clientX - mouseDragStart.x;
  const dy = e.clientY - mouseDragStart.y;
  mouseDragStart = null;
  if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
    shiftFromSwipe(dx);
  }
});

// clicking the tape recorder plays it flying up into a big front-on view
// (like walking up to it on the table) before handing off to the music page
const TAPE_FLY_MS = 560;
let tapeFlying = false;

tapeEl.addEventListener("click", (e) => {
  e.stopPropagation();
  if (tapeFlying) return;
  tapeFlying = true;

  const rect = tapeEl.getBoundingClientRect();
  const clone = tapeEl.cloneNode(true);
  clone.removeAttribute("id");
  clone.style.position = "fixed";
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = "0";
  clone.style.zIndex = "1500";
  clone.style.cursor = "default";
  clone.style.transition = `transform ${TAPE_FLY_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
  document.body.appendChild(clone);
  // hide the resting recorder immediately so it doesn't show through/behind
  // the clone while the clone travels
  tapeEl.style.visibility = "hidden";

  // grow it toward the viewer until its front panel fills most of the
  // screen, centered, same "clone at current rect, then transform" approach
  // the crate-switch animation uses
  const targetScale =
    Math.min(window.innerWidth / rect.width, window.innerHeight / rect.height) * 0.85;
  const dx = window.innerWidth / 2 - (rect.left + rect.width / 2);
  const dy = window.innerHeight / 2 - (rect.top + rect.height / 2);

  requestAnimationFrame(() => {
    clone.style.transform = `translate(${dx}px, ${dy}px) scale(${targetScale})`;
  });

  setTimeout(() => {
    window.location.href = "music.html";
  }, TAPE_FLY_MS);
});

document.addEventListener("click", (e) => {
  if (expandedIdx !== null) {
    const expandedEl = mounted.get(expandedIdx);
    if (expandedEl && !expandedEl.contains(e.target)) {
      collapseExpanded();
      return;
    }
    // clicked inside the expanded card but outside the open info paper —
    // tuck it back down to the small "Info" tab instead of closing the album
    const info = expandedEl && expandedEl.querySelector(".card-info");
    if (info && info.classList.contains("info-open") && !info.contains(e.target)) {
      info.classList.remove("info-open");
      expandedEl.classList.remove("info-open");
    }
    return;
  }
  // no card expanded, but the current one is still raised — tapping
  // anywhere outside the stack lowers it back down
  if (hasInteracted && !crateTrack.contains(e.target)) {
    hasInteracted = false;
    stopPreview();
    updatePositions();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    collapseExpanded();
    closeCdBrowser();
  }
  if (cdBrowsing) return; // the CD browser only navigates via scroll/swipe, not arrow keys
  if (e.key === "ArrowRight" || e.key === "ArrowDown") goTo(currentIndex + 1);
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") goTo(currentIndex - 1);
});

let currentReleases = [];
let sortMode = "recent";

function applySort() {
  sortedReleases = sortMode === "alphabetical" ? sortAlphabetical(currentReleases) : sortRecent(currentReleases);
  computeBoxes();
  loadBox(0);
}

sortToggle.addEventListener("click", () => {
  sortMode = sortMode === "alphabetical" ? "recent" : "alphabetical";
  sortToggle.textContent = sortMode === "alphabetical" ? "Alphabetical" : "Recent";
  applySort();
});

async function loadCollection() {
  const timeout = setTimeout(() => {
    statusEl.textContent = "Still loading… this is taking longer than expected.";
  }, 8000);

  try {
    const res = await fetch("data/collection.json");
    if (!res.ok) throw new Error(`Failed to load collection.json: ${res.status}`);
    const data = await res.json();
    clearTimeout(timeout);

    currentReleases = data.releases.filter(
      (r) => !r.formats.some((f) => f.toUpperCase() === "CD")
    );
    const cdReleases = data.releases.filter(
      (r) => r.formats.some((f) => f.toUpperCase() === "CD")
    );
    allCdReleases = cdReleases;
    applySort();
    renderCdPile(cdReleases);
    countEl.textContent = `${currentReleases.length} albums`;
    statusEl.classList.add("hidden");
  } catch (err) {
    clearTimeout(timeout);
    statusEl.textContent = `Couldn't load collection: ${err.message}`;
  }
}

loadCollection();
