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
const overlayEl = document.getElementById("overlay");
const overlayImgEl = document.getElementById("overlay-img");
const overlayCaseEl = overlayEl.querySelector(".jewel-case");
const overlayTitleEl = document.getElementById("overlay-title");
const overlayArtistEl = document.getElementById("overlay-artist");
const overlayMetaEl = document.getElementById("overlay-meta");
const overlayGenresEl = document.getElementById("overlay-genres");
const overlayLinkEl = document.getElementById("overlay-link");

const PEEK_STEP_RATIO = 5.52 / 441; // fraction of the card size, so the stack scales with it
const SCALE_STEP = 0.006;
const LIFT_FRACTION = 0.48;
const TILT_DEG = -28;
const BOX_SIZE = 30;
const RISE_MS = 340; // matches the .stack-card transform transition duration
const HUE_STEP = 55; // degrees between each box's crate color, spread around the wheel

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

let overlaySourceEl = null;

function openOverlay(r, sourceEl) {
  overlaySourceEl = sourceEl || null;
  overlayImgEl.src = r.cover;
  overlayImgEl.alt = r.title;
  overlayTitleEl.textContent = r.title;
  overlayArtistEl.textContent = r.artists.join(", ");
  const year = r.pressingYear ? `${r.year} (${r.pressingYear} pressing)` : r.year;
  overlayMetaEl.textContent = [year, r.formats.join(", "), r.label].filter(Boolean).join(" · ");
  overlayGenresEl.textContent = [...r.genres, ...r.styles].join(", ");
  overlayLinkEl.href = releaseUrl(r);

  const card = overlayEl.querySelector(".overlay-card");
  const paper = overlayEl.querySelector(".overlay-info");
  paper.classList.remove("info-open"); // each CD opens back to the small "Info" tab
  card.classList.remove("info-open"); // cover starts centered
  // on phones the paper sits on top of the cover and peeks down from the
  // top edge instead of sliding in from behind the side — same treatment
  // as the vinyl crate's expanded view at this size
  const isPhone = window.matchMedia("(max-width: 560px)").matches;
  const paperRestTransform = isPhone ? "translate(-50%, 0)" : "rotate(6deg) translate(0, 0) scale(1)";
  // tucked almost entirely behind the cover — % is relative to the paper's
  // own width, so it retreats fully out of sight before sliding out
  const paperTuckedTransform = isPhone
    ? "translate(-50%, -100%)"
    : "rotate(6deg) translate(-72%, 10px) scale(0.94)";

  if (sourceEl) {
    // grow the cover out from the clicked case (FLIP: measure start/end,
    // then transition between), while the paper slides out from behind it
    const startRect = sourceEl.getBoundingClientRect();
    card.style.animation = "none";
    overlayEl.classList.remove("hidden");
    const endRect = overlayCaseEl.getBoundingClientRect();

    const dx = startRect.left + startRect.width / 2 - (endRect.left + endRect.width / 2);
    const dy = startRect.top + startRect.height / 2 - (endRect.top + endRect.height / 2);
    const scaleX = startRect.width / endRect.width;
    const scaleY = startRect.height / endRect.height;

    // animate the whole case (spine, glare and photo together, since
    // they're all part of this one element) rather than just the photo
    overlayCaseEl.style.transition = "none";
    overlayCaseEl.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
    paper.style.transition = "none";
    paper.style.opacity = "0";
    paper.style.transform = paperTuckedTransform;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlayCaseEl.style.transition = "transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)";
        overlayCaseEl.style.transform = "translate(0, 0) scale(1, 1)";
        paper.style.transition = "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.12s, opacity 0.4s ease 0.12s";
        paper.style.opacity = "1";
        paper.style.transform = paperRestTransform;
      });
    });

    overlayCaseEl.addEventListener(
      "transitionend",
      () => {
        overlayCaseEl.style.transition = "";
        overlayCaseEl.style.transform = "";
      },
      { once: true }
    );
  } else {
    card.style.animation = "";
    overlayCaseEl.style.transition = "";
    overlayCaseEl.style.transform = "";
    paper.style.transition = "";
    paper.style.opacity = "";
    paper.style.transform = "";
    overlayEl.classList.remove("hidden");
  }
}

function closeOverlay() {
  if (overlayEl.classList.contains("hidden")) return;

  const card = overlayEl.querySelector(".overlay-card");
  const paper = overlayEl.querySelector(".overlay-info");
  const isPhone = window.matchMedia("(max-width: 560px)").matches;
  const paperTuckedTransform = isPhone
    ? "translate(-50%, -100%)"
    : "rotate(6deg) translate(-72%, 10px) scale(0.94)";
  const targetEl = overlaySourceEl && document.body.contains(overlaySourceEl) ? overlaySourceEl : null;
  overlaySourceEl = null;

  const reset = () => {
    card.style.animation = "";
    overlayCaseEl.style.transition = "";
    overlayCaseEl.style.transform = "";
    paper.style.transition = "";
    paper.style.opacity = "";
    paper.style.transform = "";
  };

  if (!targetEl) {
    overlayEl.classList.add("hidden");
    reset();
    return;
  }

  // shrink the whole case back down into the case it was opened from,
  // while the paper tucks back behind it — the inverse of openOverlay
  const startRect = overlayCaseEl.getBoundingClientRect();
  const endRect = targetEl.getBoundingClientRect();
  const dx = endRect.left + endRect.width / 2 - (startRect.left + startRect.width / 2);
  const dy = endRect.top + endRect.height / 2 - (startRect.top + startRect.height / 2);
  const scaleX = endRect.width / startRect.width;
  const scaleY = endRect.height / startRect.height;

  card.style.animation = "none";
  paper.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.6, 1), opacity 0.26s ease";
  paper.style.opacity = "0";
  paper.style.transform = paperTuckedTransform;
  overlayCaseEl.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.6, 1) 0.08s";
  overlayCaseEl.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    overlayEl.classList.add("hidden");
    reset();
  };
  overlayCaseEl.addEventListener("transitionend", finish, { once: true });
  setTimeout(finish, 420); // fallback in case transitionend doesn't fire
}

overlayEl.addEventListener("click", (e) => {
  if (e.target.tagName === "A") return;
  if (e.target.closest(".overlay-card") && e.target !== e.currentTarget) {
    // clicked inside the card but outside the open info paper — tuck it
    // back down to the small "Info" tab instead of closing the overlay
    const info = overlayEl.querySelector(".overlay-info");
    if (info.classList.contains("info-open") && !info.contains(e.target)) {
      info.classList.remove("info-open");
      overlayEl.querySelector(".overlay-card").classList.remove("info-open");
    }
    return;
  }
  closeOverlay();
});

overlayEl.querySelector(".overlay-info").addEventListener("click", (e) => {
  e.stopPropagation();
  if (e.target.tagName === "A") return; // let the Discogs link work normally
  e.currentTarget.classList.add("info-open");
  overlayEl.querySelector(".overlay-card").classList.add("info-open"); // shifts the cover left to make room
});

// on phone there's no little peeking info tab to tap — tapping the CD case
// itself reveals the info instead
overlayCaseEl.addEventListener("click", (e) => {
  if (!window.matchMedia("(max-width: 560px)").matches) return;
  e.stopPropagation();
  const info = overlayEl.querySelector(".overlay-info");
  if (info.classList.contains("info-open")) return;
  info.classList.add("info-open");
  overlayEl.querySelector(".overlay-card").classList.add("info-open");
});

// stacks CD cases directly on top of one another, flat and square, each one
// offset just enough to peek out from under the case above it
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
    img.addEventListener("click", (e) => openOverlay(r, e.currentTarget));

    wrap.appendChild(img);
    cdPileEl.appendChild(wrap);
  });
}

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

  const link = document.createElement("a");
  link.href = releaseUrl(r);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "View on Discogs →";
  infoEl.appendChild(link);
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
    if (idx === currentIndex) {
      // clicking the album that's already peeking opens the full view
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
    return;
  }
  const max = activeBoxReleases.length - 1;
  const clamped = Math.max(0, Math.min(index, max));
  if (clamped === currentIndex) return;
  currentIndex = clamped;
  collapseExpanded();
  updatePositions();
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
    touchStart = isOverCrateFront(t.clientX, t.clientY) ? { x: t.clientX, y: t.clientY } : null;
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
  mouseDragStart = isOverCrateFront(e.clientX, e.clientY) ? { x: e.clientX, y: e.clientY } : null;
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

// clicking the tape recorder on the table opens the music page
tapeEl.addEventListener("click", (e) => {
  e.stopPropagation();
  window.location.href = "music.html";
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
    updatePositions();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    collapseExpanded();
    closeOverlay();
  }
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
