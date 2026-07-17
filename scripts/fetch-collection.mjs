import { writeFile, mkdir } from "node:fs/promises";

const USERNAME = "InakiOG";
const PER_PAGE = 100;
const HEADERS = { "User-Agent": "album-collection-static-site/1.0" };

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function slim(r) {
  const info = r.basic_information;
  return {
    id: info.id,
    masterId: info.master_id || null,
    title: info.title,
    pressingYear: info.year,
    artists: (info.artists || []).map(a => a.name.replace(/\s\(\d+\)$/, "")),
    formats: (info.formats || []).map(f => f.name),
    label: (info.labels || [])[0]?.name || null,
    genres: info.genres || [],
    styles: info.styles || [],
    cover: info.cover_image || info.thumb,
    dateAdded: r.date_added,
  };
}

async function fetchAll() {
  let page = 1;
  let totalPages = 1;
  const releases = [];

  do {
    const res = await fetch(
      `https://api.discogs.com/users/${USERNAME}/collection/folders/0/releases?page=${page}&per_page=${PER_PAGE}&sort=artist&sort_order=asc`,
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error(`Discogs API error: ${res.status} ${await res.text()}`);
    const data = await res.json();

    totalPages = data.pagination.pages;
    releases.push(...data.releases.map(slim));

    page++;
  } while (page <= totalPages);

  return releases;
}

// The collection endpoint only gives the year of this specific pressing.
// The master release holds the year the album was originally released,
// which is what we actually want to sort by.
async function attachOriginalYears(releases) {
  const masterIds = [...new Set(releases.map(r => r.masterId).filter(Boolean))];
  const yearByMaster = new Map();

  for (const masterId of masterIds) {
    const res = await fetch(`https://api.discogs.com/masters/${masterId}`, { headers: HEADERS });
    if (res.ok) {
      const data = await res.json();
      if (data.year) yearByMaster.set(masterId, data.year);
    }
    const remaining = Number(res.headers.get("x-discogs-ratelimit-remaining") || "1");
    await sleep(remaining <= 2 ? 3000 : 1100);
  }

  for (const r of releases) {
    r.year = (r.masterId && yearByMaster.get(r.masterId)) || r.pressingYear;
    if (r.year === r.pressingYear) delete r.pressingYear;
  }

  return releases;
}

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

const raw = await fetchAll();
const withYears = await attachOriginalYears(raw);
const releases = sortReleases(withYears);

await mkdir(new URL("../data", import.meta.url), { recursive: true });
await writeFile(
  new URL("../data/collection.json", import.meta.url),
  JSON.stringify({ updatedAt: new Date().toISOString(), releases }, null, 2)
);

console.log(`Wrote ${releases.length} releases.`);
