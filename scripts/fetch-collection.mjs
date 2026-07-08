import { writeFile, mkdir } from "node:fs/promises";

const USERNAME = "InakiOG";
const PER_PAGE = 100;

function slim(r) {
  const info = r.basic_information;
  return {
    id: info.id,
    title: info.title,
    year: info.year,
    artists: (info.artists || []).map(a => a.name.replace(/\s\(\d+\)$/, "")),
    formats: (info.formats || []).map(f => f.name),
    label: (info.labels || [])[0]?.name || null,
    genres: info.genres || [],
    styles: info.styles || [],
    cover: info.cover_image || info.thumb,
  };
}

async function fetchAll() {
  let page = 1;
  let totalPages = 1;
  const releases = [];

  do {
    const res = await fetch(
      `https://api.discogs.com/users/${USERNAME}/collection/folders/0/releases?page=${page}&per_page=${PER_PAGE}&sort=artist&sort_order=asc`,
      { headers: { "User-Agent": "album-collection-static-site/1.0" } }
    );
    if (!res.ok) throw new Error(`Discogs API error: ${res.status} ${await res.text()}`);
    const data = await res.json();

    totalPages = data.pagination.pages;
    releases.push(...data.releases.map(slim));

    page++;
  } while (page <= totalPages);

  return releases;
}

const releases = await fetchAll();

await mkdir(new URL("../data", import.meta.url), { recursive: true });
await writeFile(
  new URL("../data/collection.json", import.meta.url),
  JSON.stringify({ updatedAt: new Date().toISOString(), releases }, null, 2)
);

console.log(`Wrote ${releases.length} releases.`);
