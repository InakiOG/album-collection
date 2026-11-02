const trackList = document.getElementById("track-list");
const statusEl = document.getElementById("status");
const playerBar = document.getElementById("player-bar");
const audio = document.getElementById("audio");
const nowPlaying = document.getElementById("now-playing");

let tracks = [];
let currentIndex = -1;

// "Canción Menú C&I" -> "cancion-menu-c-i"
function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "track";
}

// Slugs come from titles, so a track keeps its link when other songs are added.
function assignSlugs(list) {
  const seen = new Map();
  for (const track of list) {
    const base = slugify(track.title);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    track.slug = count === 1 ? base : `${base}-${count}`;
  }
}

function trackUrl(track) {
  return new URL(`#${track.slug}`, location.href).href;
}

function setHash(slug) {
  if (location.hash.slice(1) !== slug) {
    history.replaceState(null, "", `#${slug}`);
  }
}

function playTrack(index) {
  const track = tracks[index];
  if (!track) return;

  if (currentIndex !== index) {
    currentIndex = index;
    audio.src = track.file;
  }
  nowPlaying.textContent = track.title;
  playerBar.classList.remove("hidden");
  setHash(track.slug);

  for (const row of trackList.children) {
    row.classList.toggle("playing", Number(row.dataset.index) === index);
  }

  // Autoplay with sound may be blocked on direct link loads; the player stays ready for a tap.
  audio.play().catch(() => {});
}

audio.addEventListener("ended", () => {
  if (currentIndex + 1 < tracks.length) {
    playTrack(currentIndex + 1);
  }
});

async function shareTrack(track, button) {
  const url = trackUrl(track);
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title: track.title, url });
    } catch {}
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    flash(button, "Copied");
  } catch {
    window.prompt("Copy this link:", url);
  }
}

function flash(button, text) {
  clearTimeout(button.flashTimer);
  button.textContent = text;
  button.classList.add("copied");
  button.flashTimer = setTimeout(() => {
    button.textContent = "Link";
    button.classList.remove("copied");
  }, 1500);
}

function render() {
  trackList.innerHTML = "";
  const frag = document.createDocumentFragment();
  tracks.forEach((track, index) => {
    const row = document.createElement("div");
    row.className = "track-row";
    row.id = track.slug;
    row.dataset.index = index;

    const item = document.createElement("button");
    item.type = "button";
    item.className = "track";
    item.textContent = track.title;
    item.addEventListener("click", () => playTrack(index));

    const share = document.createElement("button");
    share.type = "button";
    share.className = "track-share";
    share.textContent = "Link";
    share.title = `Copy link to "${track.title}"`;
    share.setAttribute("aria-label", share.title);
    share.addEventListener("click", () => shareTrack(track, share));

    row.append(item, share);
    frag.appendChild(row);
  });
  trackList.appendChild(frag);
}

function openFromHash() {
  let slug = location.hash.slice(1);
  try {
    slug = decodeURIComponent(slug);
  } catch {}
  const index = tracks.findIndex(t => t.slug === slug);
  if (index === -1 || index === currentIndex) return;

  playTrack(index);
  document.getElementById(slug).scrollIntoView({ block: "center" });
}

window.addEventListener("hashchange", openFromHash);

async function loadTracks() {
  try {
    const res = await fetch("data/music.json");
    if (!res.ok) throw new Error(`Failed to load music.json: ${res.status}`);
    const data = await res.json();

    tracks = data.tracks;
    assignSlugs(tracks);
    render();
    statusEl.textContent = tracks.length ? "" : "No tracks found.";
    statusEl.classList.toggle("hidden", tracks.length > 0);
    openFromHash();
  } catch (err) {
    statusEl.textContent = `Couldn't load tracks: ${err.message}`;
  }
}

loadTracks();
