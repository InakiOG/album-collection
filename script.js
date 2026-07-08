const USERNAME = "InakiOG";
const PER_PAGE = 100;

const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");

const overlay = document.getElementById("overlay");
const overlayImg = document.getElementById("overlay-img");
const overlayTitle = document.getElementById("overlay-title");
const overlayArtist = document.getElementById("overlay-artist");
const overlayMeta = document.getElementById("overlay-meta");
const overlayGenres = document.getElementById("overlay-genres");
const overlayLink = document.getElementById("overlay-link");

let releases = [];

function releaseUrl(r) {
  return `https://www.discogs.com/release/${r.basic_information.id}`;
}

function artistNames(info) {
  return (info.artists || []).map(a => a.name.replace(/\s\(\d+\)$/, "")).join(", ");
}

function openOverlay(r) {
  const info = r.basic_information;
  overlayImg.src = info.cover_image || info.thumb;
  overlayImg.alt = info.title;
  overlayTitle.textContent = info.title;
  overlayArtist.textContent = artistNames(info);

  const format = (info.formats || []).map(f => f.name).join(", ");
  const label = (info.labels || [])[0];
  overlayMeta.textContent = [info.year, format, label && label.name].filter(Boolean).join(" · ");

  overlayGenres.textContent = [...(info.genres || []), ...(info.styles || [])].join(", ");
  overlayLink.href = releaseUrl(r);

  overlay.classList.remove("hidden");
}

function closeOverlay() {
  overlay.classList.add("hidden");
}

overlay.addEventListener("click", (e) => {
  if (e.target.closest(".overlay-card") && e.target.tagName !== "A") return;
  if (e.target.tagName === "A") return;
  closeOverlay();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeOverlay();
});

function render(list) {
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const r of list) {
    const info = r.basic_information;
    const img = document.createElement("img");
    img.className = "cover";
    img.src = info.cover_image || info.thumb;
    img.alt = info.title;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("click", () => openOverlay(r));
    frag.appendChild(img);
  }
  grid.appendChild(frag);
}

async function loadCollection() {
  let page = 1;
  let totalPages = 1;

  try {
    do {
      const res = await fetch(
        `https://api.discogs.com/users/${USERNAME}/collection/folders/0/releases?page=${page}&per_page=${PER_PAGE}&sort=artist&sort_order=asc`
      );
      if (!res.ok) throw new Error(`Discogs API error: ${res.status}`);
      const data = await res.json();

      totalPages = data.pagination.pages;
      releases = releases.concat(data.releases);

      statusEl.textContent = `Loaded ${releases.length} of ${data.pagination.items}…`;
      render(releases);

      page++;
    } while (page <= totalPages);

    statusEl.classList.add("hidden");
  } catch (err) {
    statusEl.textContent = `Couldn't load collection: ${err.message}`;
  }
}

loadCollection();
