const crate = document.getElementById("crate-shelf");
const crateEl = document.getElementById("crate");
const crateTrack = document.getElementById("crate-track");
const prevBtn = document.getElementById("crate-prev");
const nextBtn = document.getElementById("crate-next");
const prevSideBtn = document.getElementById("crate-side-prev");
const nextSideBtn = document.getElementById("crate-side-next");
const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");
const sortToggle = document.getElementById("sort-toggle");

const PEEK_STEP = 4;
const SCALE_STEP = 0.006;
const LIFT_FRACTION = 0.4;
const TILT_DEG = -42;
const BOX_SIZE = 30;

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

function styleCard(el, k) {
  if (el.dataset.idx == expandedIdx) return; // expanded card manages its own styles

  const isActive = k === 0 && hasInteracted;
  const baseY = -k * PEEK_STEP;
  const scale = Math.max(1 - k * SCALE_STEP, 0.4);
  const lift = isActive ? cardSizePx() * LIFT_FRACTION : 0;
  const parked = k < 0; // already flipped past

  el.style.transform = `translateY(${baseY - lift}px) scale(${scale}) rotateX(${TILT_DEG}deg)`;
  // all resting/raised cards stay between crate-back (z:1) and crate-front
  // (z:500) — in front of the box body, behind the front lattice wall
  el.style.zIndex = isActive ? "450" : String(Math.max(2, 490 - k));
  el.style.opacity = parked ? "0" : "1";
  el.style.pointerEvents = parked ? "none" : "";
  el.style.filter = isActive ? "none" : `brightness(${1 - Math.min(k, 10) * 0.05})`;
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

function expandCard(idx) {
  const el = mounted.get(idx);
  if (!el) return;
  expandedIdx = idx;
  fillInfo(el.querySelector(".card-info"), activeBoxReleases[idx]);
  el.classList.add("expanded");
  // crate-shelf has its own stacking context (perspective/transform), so an
  // inline z-index here can't outrank the crate-front image sibling — lift
  // the card out to the top level while it's open
  crateEl.appendChild(el);
}

function collapseExpanded() {
  if (expandedIdx === null) return;
  const el = mounted.get(expandedIdx);
  const idx = expandedIdx;
  expandedIdx = null;
  if (el) {
    el.classList.remove("expanded");
    crate.appendChild(el);
    styleCard(el, idx - currentIndex);
  }
}

function updatePositions() {
  for (const [idx, el] of mounted.entries()) {
    styleCard(el, idx - currentIndex);
  }

  prevBtn.disabled = currentIndex <= 0;
  nextBtn.disabled = currentIndex >= activeBoxReleases.length - 1;
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
    styleCard(card, idx - currentIndex);
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

prevBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  goTo(currentIndex - 1);
});

nextBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  goTo(currentIndex + 1);
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
