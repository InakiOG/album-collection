const trackList = document.getElementById("track-list");
const statusEl = document.getElementById("status");
const playerBar = document.getElementById("player-bar");
const audio = document.getElementById("audio");
const nowPlaying = document.getElementById("now-playing");

let tracks = [];
let currentIndex = -1;

function playTrack(index) {
  const track = tracks[index];
  if (!track) return;

  currentIndex = index;
  audio.src = track.file;
  audio.play();
  nowPlaying.textContent = track.title;
  playerBar.classList.remove("hidden");

  for (const item of trackList.children) {
    item.classList.toggle("playing", Number(item.dataset.index) === index);
  }
}

audio.addEventListener("ended", () => {
  if (currentIndex + 1 < tracks.length) {
    playTrack(currentIndex + 1);
  }
});

function render() {
  trackList.innerHTML = "";
  const frag = document.createDocumentFragment();
  tracks.forEach((track, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "track";
    item.dataset.index = index;
    item.textContent = track.title;
    item.addEventListener("click", () => playTrack(index));
    frag.appendChild(item);
  });
  trackList.appendChild(frag);
}

async function loadTracks() {
  try {
    const res = await fetch("data/music.json");
    if (!res.ok) throw new Error(`Failed to load music.json: ${res.status}`);
    const data = await res.json();

    tracks = data.tracks;
    render();
    statusEl.textContent = tracks.length ? "" : "No tracks found.";
    statusEl.classList.toggle("hidden", tracks.length > 0);
  } catch (err) {
    statusEl.textContent = `Couldn't load tracks: ${err.message}`;
  }
}

loadTracks();
