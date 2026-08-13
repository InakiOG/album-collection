const crate = document.getElementById("crate-shelf");
const crateEl = document.getElementById("crate");
const crateTrack = document.getElementById("crate-track");
const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");
const sortToggle = document.getElementById("sort-toggle");

const crateBoxImgs = crateTrack.querySelectorAll(".crate-box");

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

function releaseUrl(r) {
  return `https://www.discogs.com/release/${r.id}`;
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
  const lift = isActive ? cardSizePx() * LIFT_FRACTION : 0;
  const dist = Math.abs(idx - currentIndex);

  el.style.transform = `translateY(${baseY - lift}px) scale(${scale}) rotateX(${TILT_DEG}deg)`;
  // all resting/raised cards stay between crate-back (z:1) and crate-front
  // (z:500) — in front of the box body, behind the front lattice wall.
  // depth order always follows each card's own place in the stack, so a
  // raised card still rises up from — not in front of — albums ahead of it
  el.style.zIndex = String(Math.max(2, 490 - idx));
  el.style.opacity = "1";
  el.style.pointerEvents = "";
  el.style.filter = isActive ? "none" : `brightness(${1 - Math.min(dist, 10) * 0.05})`;
  el.classList.toggle("front", isActive);
}

function createCard(idx, r) {
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

  const info = document.createElement("div");
  info.className = "card-info";
  card.appendChild(info);

  card.addEventListener("click", (e) => {
    e.stopPropagation();
    if (expandedIdx === idx) return;
    if (idx === currentIndex) {
      expandCard(idx);
    } else {
      goTo(idx);
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
  fillInfo(el.querySelector(".card-info"), activeBoxReleases[idx]);

  // step 1: rise straight up, still in its place in the stack
  el.style.transform = riseTransform(idx);

  setTimeout(() => {
    if (expandedIdx !== idx) return; // collapsed again before the rise finished
    // step 2: jump to the front, centered, on top of everything else.
    // crate-shelf has its own stacking context (perspective/transform), so
    // an inline z-index here can't outrank the crate-front image sibling —
    // lift the card out to the top level while it's open
    crateEl.appendChild(el);
    el.classList.add("expanded");
  }, RISE_MS);
}

function collapseExpanded() {
  if (expandedIdx === null) return;
  const el = mounted.get(expandedIdx);
  const idx = expandedIdx;
  expandedIdx = null;
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

function updatePositions() {
  for (const [idx, el] of mounted.entries()) {
    styleCard(el, idx);
  }
}

function goTo(index) {
  const wasInteracted = hasInteracted;
  hasInteracted = true;
  const max = activeBoxReleases.length - 1;
  const clamped = Math.max(0, Math.min(index, max));
  if (clamped === currentIndex) {
    if (!wasInteracted) updatePositions(); // first gesture still raises the current album
    return;
  }
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

// set by animateShiftTo — the first album of the incoming box, already
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
    // above already pulls the gap in to compensate for that, so this only
    // needs to be a small corner-sized sliver on top of it
    : Math.max(12, Math.min(30, window.innerWidth * 0.04));
  const gap = Math.max(0, window.innerWidth / 2 - crateWidth / 2 - overflow - peek);
  crateRowEl.style.gap = `${gap}px`;
}

window.addEventListener("resize", updateRowSpacing);
window.addEventListener("orientationchange", updateRowSpacing);

// clicking a side crate slides the whole row sideways — like a conveyor
// belt — carrying it into the middle, then swaps the underlying box data
// and snaps back to neutral. Wraps around indefinitely at both ends.
const SHIFT_ANIM_MS = 360;
let shifting = false;

function slotStepPx() {
  const gap = parseFloat(getComputedStyle(crateRowEl).columnGap) || 0;
  return crateEl.getBoundingClientRect().width + gap;
}

function animateShiftTo(targetIndex, toward) {
  // toward: "prev" slides the row right to bring the left crate to center;
  // "next" slides it left to bring the right crate to center
  if (shifting || !boxes.length || targetIndex === currentBoxIndex) return;
  shifting = true;

  const step = slotStepPx();
  const offset = toward === "prev" ? step : -step;
  const sideEl = toward === "prev" ? prevSlotEl : nextSlotEl;

  // the first album of the box being switched to rides along inside the
  // crate as it slides to the middle, instead of the crate arriving empty
  const sideShelf = sideEl.querySelector(".crate-shelf");
  const firstRelease = (boxes[targetIndex] || [])[0];
  if (sideShelf && firstRelease) {
    const card = createCard(0, firstRelease);
    card.style.transform = collapsedTransform();
    card.style.zIndex = "490";
    card.style.opacity = "1";
    sideShelf.appendChild(card);
    travelingCard = card;
  }

  // on desktop the side crates sit lower than the main one (see the
  // landscape translateY(10%) rule) — animate that height difference away
  // in sync with the horizontal slide, so the clicked crate rises into
  // place while the outgoing main crate sinks down to the side height
  const isLandscape = !window.matchMedia("(orientation: portrait)").matches;
  const vertTransition = "transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1)";

  crateRowEl.style.transition = vertTransition;
  crateRowEl.style.transform = `translateX(calc(-50% + ${offset}px))`;

  if (isLandscape) {
    sideEl.style.transition = vertTransition;
    sideEl.style.transform = "translateY(0%)";
    crateEl.style.transition = vertTransition;
    crateEl.style.transform = "translateY(10%)";
  }

  setTimeout(() => {
    // snap back instantly with transitions off, then swap the content in
    // while nobody's watching, so it reads as one continuous belt
    crateRowEl.style.transition = "none";
    crateRowEl.style.transform = "translateX(-50%)";
    if (isLandscape) {
      sideEl.style.transition = "none";
      sideEl.style.transform = "";
      crateEl.style.transition = "none";
      crateEl.style.transform = "";
    }
    loadBox(targetIndex);
    void crateRowEl.offsetWidth; // flush the snap before re-enabling transitions
    crateRowEl.style.transition = "";
    if (isLandscape) {
      sideEl.style.transition = "";
      crateEl.style.transition = "";
    }
    shifting = false;
  }, SHIFT_ANIM_MS);
}

prevSlotEl.addEventListener("click", (e) => {
  e.stopPropagation();
  animateShiftTo((currentBoxIndex - 1 + boxes.length) % boxes.length, "prev");
});

nextSlotEl.addEventListener("click", (e) => {
  e.stopPropagation();
  animateShiftTo((currentBoxIndex + 1) % boxes.length, "next");
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

let touchStartY = null;
crateTrack.addEventListener(
  "touchstart",
  (e) => {
    touchStartY = e.touches[0].clientY;
  },
  { passive: true }
);
crateTrack.addEventListener(
  "touchend",
  (e) => {
    if (touchStartY === null) return;
    const dy = touchStartY - e.changedTouches[0].clientY;
    touchStartY = null;
    if (Math.abs(dy) < 28) return;
    if (dy > 0) goTo(currentIndex + 1);
    else goTo(currentIndex - 1);
  },
  { passive: true }
);

document.addEventListener("click", (e) => {
  if (expandedIdx === null) return;
  const expandedEl = mounted.get(expandedIdx);
  if (expandedEl && !expandedEl.contains(e.target)) collapseExpanded();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") collapseExpanded();
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
    applySort();
    countEl.textContent = `${currentReleases.length} albums`;
    statusEl.classList.add("hidden");
  } catch (err) {
    clearTimeout(timeout);
    statusEl.textContent = `Couldn't load collection: ${err.message}`;
  }
}

loadCollection();
