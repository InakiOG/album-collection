const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");

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
  overlayMeta.textContent = [r.year, r.formats.join(", "), r.label].filter(Boolean).join(" · ");
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

function sortReleases(releases) {
  return [...releases].sort((a, b) => {
    const artistCmp = sortKey(a).localeCompare(sortKey(b));
    if (artistCmp !== 0) return artistCmp;
    return (a.year || 0) - (b.year || 0);
  });
}

function render(list) {
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const r of list) {
    const img = document.createElement("img");
    img.className = "cover";
    img.src = r.cover;
    img.alt = r.title;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("click", () => openOverlay(r));
    frag.appendChild(img);
  }
  grid.appendChild(frag);
}

async function loadCollection() {
  try {
    const res = await fetch("data/collection.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load collection.json: ${res.status}`);
    const data = await res.json();

    render(sortReleases(data.releases));
    statusEl.classList.add("hidden");
  } catch (err) {
    statusEl.textContent = `Couldn't load collection: ${err.message}`;
  }
}

loadCollection();
