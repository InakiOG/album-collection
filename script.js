const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");

const overlay = document.getElementById("overlay");
const overlayImg = document.getElementById("overlay-img");
const overlayTitle = document.getElementById("overlay-title");
const overlayArtist = document.getElementById("overlay-artist");
const overlayMeta = document.getElementById("overlay-meta");
const overlayGenres = document.getElementById("overlay-genres");
const overlayLink = document.getElementById("overlay-link");

function releaseUrl(r) {
  return `https://www.discogs.com/release/${r.id}`;
}

function openOverlay(r) {
  overlayImg.src = r.cover;
  overlayImg.alt = r.title;
  overlayTitle.textContent = r.title;
  overlayArtist.textContent = r.artists.join(", ");
  const year = r.pressingYear ? `${r.year} (${r.pressingYear} pressing)` : r.year;
  overlayMeta.textContent = [year, r.formats.join(", "), r.label].filter(Boolean).join(" · ");
  overlayGenres.textContent = [...r.genres, ...r.styles].join(", ");
  overlayLink.href = releaseUrl(r);

  overlay.classList.remove("hidden");
}

function closeOverlay() {
  overlay.classList.add("hidden");
}

overlay.addEventListener("click", (e) => {
  if (e.target.tagName === "A") return;
  if (e.target.closest(".overlay-card") && e.target !== e.currentTarget) return;
  closeOverlay();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeOverlay();
});

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

function buildFallbackCover(r) {
  const div = document.createElement("div");
  div.className = "cover cover-fallback";
  div.textContent = `${r.artists.join(", ")} — ${r.title}`;
  return div;
}

function render(list) {
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const r of list) {
    const wrap = document.createElement("div");
    wrap.className = "cover-wrap";
    wrap.style.animationDuration = `${(6 + Math.random() * 4.8).toFixed(2)}s`;
    wrap.style.animationDelay = `-${(Math.random() * 8).toFixed(2)}s`;
    for (let i = 1; i <= 4; i++) {
      wrap.style.setProperty(`--dx${i}`, `${(Math.random() * 16 - 8).toFixed(1)}px`);
      wrap.style.setProperty(`--dy${i}`, `${(Math.random() * 16 - 8).toFixed(1)}px`);
      wrap.style.setProperty(`--dr${i}`, `${(Math.random() * 4 - 2).toFixed(1)}deg`);
    }
    wrap.addEventListener("click", () => openOverlay(r));

    if (r.cover) {
      const img = document.createElement("img");
      img.className = "cover";
      img.src = r.cover;
      img.alt = r.title;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        img.replaceWith(buildFallbackCover(r));
      });
      wrap.appendChild(img);
    } else {
      wrap.appendChild(buildFallbackCover(r));
    }

    if (r.formats.some(f => f.toUpperCase() === "CD")) {
      const badge = document.createElement("span");
      badge.className = "cd-badge";
      badge.textContent = "CD";
      wrap.appendChild(badge);
    }

    frag.appendChild(wrap);
  }
  grid.appendChild(frag);
}

const sortToggle = document.getElementById("sort-toggle");
let currentReleases = [];
let sortMode = "alphabetical";

function applySort() {
  const sorted = sortMode === "alphabetical" ? sortAlphabetical(currentReleases) : sortRecent(currentReleases);
  render(sorted);
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

    currentReleases = data.releases;
    applySort();
    countEl.textContent = `${data.releases.length} albums`;
    statusEl.classList.add("hidden");
  } catch (err) {
    clearTimeout(timeout);
    statusEl.textContent = `Couldn't load collection: ${err.message}`;
  }
}

loadCollection();
