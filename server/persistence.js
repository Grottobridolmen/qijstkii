// Save / load game state to disk.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVE_DIR = path.resolve(__dirname, '..', 'save');
const SAVE_FILE = path.join(SAVE_DIR, 'world.json');

function ensureDir() {
  if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });
}

export function loadGame() {
  try {
    if (!fs.existsSync(SAVE_FILE)) return null;
    const raw = fs.readFileSync(SAVE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[persistence] load failed:', e.message);
    return null;
  }
}

export function saveGame(state) {
  try {
    ensureDir();
    fs.writeFileSync(SAVE_FILE, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('[persistence] save failed:', e.message);
    return false;
  }
}

// Throttled save: at most once per `intervalMs`.
export function makeThrottledSave(intervalMs = 5000) {
  let timer = null;
  let pendingState = null;
  return function schedule(stateGetter) {
    pendingState = stateGetter;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const s = pendingState ? pendingState() : null;
      pendingState = null;
      if (s) saveGame(s);
    }, intervalMs);
  };
}
