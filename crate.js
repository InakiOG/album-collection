const crate = document.getElementById("crate-shelf");
const crateEl = document.getElementById("crate");
const crateTrack = document.getElementById("crate-track");
const prevSideBtn = document.getElementById("crate-side-prev");
const nextSideBtn = document.getElementById("crate-side-next");
const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");
const sortToggle = document.getElementById("sort-toggle");

const crateBoxImgs = crateTrack.querySelectorAll(".crate-box");

const PEEK_STEP = 5.52;
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

const DOT_BASE_HUE = 32; // warm wood tone, matching box 0's unrotated crate photo

function dotColorForBox(boxIndex) {
  const hue = (DOT_BASE_HUE + hueForBox(boxIndex)) % 360;
  return `hsl(${hue}, 55%, 50%)`;
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
  const baseY = -idx * PEEK_STEP;
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
    img.src = r.cover;
    img.alt = r.title;
    img.loading = "lazy";
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
  const baseY = -idx * PEEK_STEP;
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

function mountAll() {
  crate.innerHTML = "";
  crate.classList.remove("ready");
  mounted.clear();
  const frag = document.createDocumentFragment();
  activeBoxReleases.forEach((r, idx) => {
    const card = createCard(idx, r);
    styleCard(card, idx);
    frag.appendChild(card);
    mounted.set(idx, card);
  });
  crate.appendChild(frag);

  // let the initial (untransitioned) layout paint once, then turn on
  // transitions so the pile appears in place instead of animating in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => crate.classList.add("ready"));
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

function updateSideBoxes() {
  prevSideBtn.disabled = currentBoxIndex <= 0;
  nextSideBtn.disabled = currentBoxIndex >= boxes.length - 1;
  applyHue(crateBoxImgs, currentBoxIndex);
  prevSideBtn.style.background = dotColorForBox(currentBoxIndex - 1);
  nextSideBtn.style.background = dotColorForBox(currentBoxIndex + 1);
}

function loadBox(boxIndex) {
  const clamped = Math.max(0, Math.min(boxIndex, boxes.length - 1));
  currentBoxIndex = clamped;
  activeBoxReleases = boxes[currentBoxIndex] || [];
  resetStack();
  updateSideBoxes();
}

prevSideBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  loadBox(currentBoxIndex - 1);
});

nextSideBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  loadBox(currentBoxIndex + 1);
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
