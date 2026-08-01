import { readdir, writeFile, mkdir } from "node:fs/promises";

const MUSIC_DIR = new URL("../music/", import.meta.url);
const OUT_FILE = new URL("../data/music.json", import.meta.url);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac"]);

function titleFromFilename(name) {
  return name.replace(/\.[^.]+$/, "");
}

async function main() {
  const entries = await readdir(MUSIC_DIR, { withFileTypes: true });
  const tracks = entries
    .filter(e => e.isFile() && AUDIO_EXTENSIONS.has(e.name.slice(e.name.lastIndexOf(".")).toLowerCase()))
    .map(e => ({
      title: titleFromFilename(e.name),
      file: `music/${e.name}`,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify({ tracks }, null, 2) + "\n");
  console.log(`Wrote ${tracks.length} tracks to data/music.json`);
}

main();
