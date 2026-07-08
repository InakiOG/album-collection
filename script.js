const USERNAME = "InakiOG";
const PER_PAGE = 100;

const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");
const searchEl = document.getElementById("search");

let releases = [];

function releaseUrl(r) {
  return `https://www.discogs.com/release/${r.basic_information.id}`;
}

function render(list) {
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const r of list) {
    const info = r.basic_information;
    const artist = (info.artists || []).map(a => a.name.replace(/\s\(\d+\)$/, "")).join(", ");
    const img = info.cover_image || info.thumb;

    const a = document.createElement("a");
    a.className = "card";
    a.href = releaseUrl(r);
    a.target = "_blank";
    a.rel = "noopener";

    a.innerHTML = `
      <img src="${img}" alt="${info.title}" loading="lazy" referrerpolicy="no-referrer">
      <div class="card-body">
        <p class="card-title">${info.title}</p>
        <p class="card-artist">${artist}</p>
        <p class="card-year">${info.year || ""}</p>
      </div>
    `;
    frag.appendChild(a);
  }
  grid.appendChild(frag);
}

function applyFilter() {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) {
    render(releases);
    return;
  }
  const filtered = releases.filter(r => {
    const info = r.basic_information;
    const artist = (info.artists || []).map(a => a.name).join(" ").toLowerCase();
    return info.title.toLowerCase().includes(q) || artist.includes(q);
  });
  render(filtered);
}

searchEl.addEventListener("input", applyFilter);

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

      countEl.textContent = `— ${data.pagination.items} records`;
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
