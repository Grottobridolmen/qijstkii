// Procedural canvas textures, packed into a single atlas (no external assets needed).
// Returns { texture: THREE.CanvasTexture, uvFor(blockId, face) -> [u0,v0,u1,v1] }.
/* global THREE */

import { BLOCK } from './constants.js';

const TILE = 64;
const COLS = 8;
const ROWS = 2;
const ATLAS_W = TILE * COLS;
const ATLAS_H = TILE * ROWS;

// Where each (block, face) lives in the atlas grid (col, row).
const TILE_POS = {
  [`${BLOCK.GRASS}:top`]:    [0, 0],
  [`${BLOCK.GRASS}:side`]:   [1, 0],
  [`${BLOCK.GRASS}:bottom`]: [2, 0],
  [`${BLOCK.DIRT}:top`]:     [2, 0],
  [`${BLOCK.DIRT}:side`]:    [2, 0],
  [`${BLOCK.DIRT}:bottom`]:  [2, 0],
  [`${BLOCK.STONE}:top`]:    [3, 0],
  [`${BLOCK.STONE}:side`]:   [3, 0],
  [`${BLOCK.STONE}:bottom`]: [3, 0],
  [`${BLOCK.SAND}:top`]:     [4, 0],
  [`${BLOCK.SAND}:side`]:    [4, 0],
  [`${BLOCK.SAND}:bottom`]:  [4, 0],
  [`${BLOCK.COAL}:top`]:     [5, 0],
  [`${BLOCK.COAL}:side`]:    [5, 0],
  [`${BLOCK.COAL}:bottom`]:  [5, 0],
  [`${BLOCK.IRON}:top`]:     [6, 0],
  [`${BLOCK.IRON}:side`]:    [6, 0],
  [`${BLOCK.IRON}:bottom`]:  [6, 0],
  [`${BLOCK.GOLD}:top`]:     [7, 0],
  [`${BLOCK.GOLD}:side`]:    [7, 0],
  [`${BLOCK.GOLD}:bottom`]:  [7, 0],
  [`${BLOCK.DIAMOND}:top`]:  [0, 1],
  [`${BLOCK.DIAMOND}:side`]: [0, 1],
  [`${BLOCK.DIAMOND}:bottom`]:[0,1],
  [`${BLOCK.BEDROCK}:top`]:  [1, 1],
  [`${BLOCK.BEDROCK}:side`]: [1, 1],
  [`${BLOCK.BEDROCK}:bottom`]:[1,1],
  [`${BLOCK.WOOD}:top`]:     [2, 1],
  [`${BLOCK.WOOD}:side`]:    [3, 1],
  [`${BLOCK.WOOD}:bottom`]:  [2, 1],
  [`${BLOCK.LEAVES}:top`]:   [4, 1],
  [`${BLOCK.LEAVES}:side`]:  [4, 1],
  [`${BLOCK.LEAVES}:bottom`]:[4, 1],
  [`${BLOCK.WATER}:top`]:    [5, 1],
  [`${BLOCK.WATER}:side`]:   [5, 1],
  [`${BLOCK.WATER}:bottom`]: [5, 1],
  [`${BLOCK.SHOP}:top`]:     [6, 1],
  [`${BLOCK.SHOP}:side`]:    [7, 1],
  [`${BLOCK.SHOP}:bottom`]:  [7, 1],
};

// Deterministic RNG so the atlas looks the same each time.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function rgb(r, g, b) {
  return `rgb(${clamp(r|0,0,255)},${clamp(g|0,0,255)},${clamp(b|0,0,255)})`;
}
function rgba(r, g, b, a) {
  return `rgba(${clamp(r|0,0,255)},${clamp(g|0,0,255)},${clamp(b|0,0,255)},${a})`;
}

// Fill base color and sprinkle per-pixel noise to add organic texture.
function fillNoise(ctx, S, baseR, baseG, baseB, amp, rand) {
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // simple low-frequency cell to add some blotch
      const blotch = (Math.sin(x * 0.6 + y * 0.4) * 0.5 + 0.5) * 0.15;
      const j = (rand() - 0.5) * 2 * amp + (blotch - 0.075) * amp * 2;
      const r = baseR + j;
      const g = baseG + j;
      const b = baseB + j;
      const i = (y * S + x) * 4;
      d[i] = clamp(r, 0, 255) | 0;
      d[i + 1] = clamp(g, 0, 255) | 0;
      d[i + 2] = clamp(b, 0, 255) | 0;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Tinted speckles: scatter colored pixels.
function speckle(ctx, S, count, color, rand, size = 1) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = (rand() * S) | 0;
    const y = (rand() * S) | 0;
    ctx.fillRect(x, y, size, size);
  }
}

// ---------- tile painters ----------

function paintGrassTop(ctx, S, rand) {
  fillNoise(ctx, S, 86, 138, 60, 18, rand);
  // darker tufts
  for (let i = 0; i < S * 1.5; i++) {
    const x = (rand() * S) | 0;
    const y = (rand() * S) | 0;
    ctx.fillStyle = rgb(50, 95, 35);
    ctx.fillRect(x, y, 1, 1);
  }
  // lighter highlights
  for (let i = 0; i < S * 1.2; i++) {
    const x = (rand() * S) | 0;
    const y = (rand() * S) | 0;
    ctx.fillStyle = rgb(135, 180, 80);
    ctx.fillRect(x, y, 1, 1);
  }
  // a few small dark patches
  for (let i = 0; i < 8; i++) {
    const x = rand() * S, y = rand() * S;
    ctx.fillStyle = rgba(35, 70, 25, 0.3);
    ctx.beginPath(); ctx.arc(x, y, 2 + rand() * 3, 0, Math.PI * 2); ctx.fill();
  }
}

function paintGrassSide(ctx, S, rand) {
  // dirt body
  fillNoise(ctx, S, 124, 92, 58, 22, rand);
  // pebbles
  for (let i = 0; i < 15; i++) {
    const x = rand() * S, y = rand() * S;
    ctx.fillStyle = rgb(95, 70, 45);
    ctx.beginPath(); ctx.arc(x, y, 0.8 + rand() * 1.2, 0, Math.PI * 2); ctx.fill();
  }
  // green grass overhang on top ~22% with jagged underside
  const stripH = Math.floor(S * 0.22);
  for (let y = 0; y < stripH; y++) {
    for (let x = 0; x < S; x++) {
      const j = (rand() - 0.5) * 30;
      ctx.fillStyle = rgb(86 + j, 138 + j, 60 + j);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // grass tongues drooping into the dirt
  for (let x = 0; x < S; x++) {
    if (rand() < 0.65) continue;
    const h = stripH + ((rand() * 5) | 0);
    for (let y = stripH; y <= h; y++) {
      const j = (rand() - 0.5) * 20;
      ctx.fillStyle = rgb(60 + j, 110 + j, 40 + j);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function paintDirt(ctx, S, rand) {
  fillNoise(ctx, S, 124, 92, 58, 24, rand);
  for (let i = 0; i < 25; i++) {
    const x = rand() * S, y = rand() * S;
    ctx.fillStyle = rgb(90, 65, 40);
    ctx.beginPath(); ctx.arc(x, y, 0.8 + rand() * 1.6, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 20; i++) {
    const x = rand() * S, y = rand() * S;
    ctx.fillStyle = rgb(150, 115, 75);
    ctx.fillRect(x, y, 1, 1);
  }
}

function paintStone(ctx, S, rand, base = [140, 140, 140], amp = 18) {
  fillNoise(ctx, S, base[0], base[1], base[2], amp, rand);
  // darker blobs
  for (let i = 0; i < 18; i++) {
    const x = rand() * S, y = rand() * S;
    ctx.fillStyle = rgba(70, 70, 70, 0.4);
    ctx.beginPath(); ctx.arc(x, y, 2 + rand() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // hairline cracks
  ctx.strokeStyle = rgba(50, 50, 50, 0.6);
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const x0 = rand() * S, y0 = rand() * S;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    let x = x0, y = y0;
    for (let s = 0; s < 6; s++) {
      x += (rand() - 0.5) * 16;
      y += (rand() - 0.5) * 16;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function paintBedrock(ctx, S, rand) {
  paintStone(ctx, S, rand, [60, 60, 65], 12);
  // chunkier dark blobs
  for (let i = 0; i < 12; i++) {
    const x = rand() * S, y = rand() * S;
    ctx.fillStyle = rgba(20, 20, 20, 0.55);
    ctx.beginPath(); ctx.arc(x, y, 2 + rand() * 4, 0, Math.PI * 2); ctx.fill();
  }
}

function paintSand(ctx, S, rand) {
  fillNoise(ctx, S, 226, 200, 138, 14, rand);
  // very fine grain
  for (let i = 0; i < S * 8; i++) {
    const x = (rand() * S) | 0;
    const y = (rand() * S) | 0;
    const a = rand();
    ctx.fillStyle = a < 0.5 ? rgb(210, 180, 110) : rgb(245, 220, 165);
    ctx.fillRect(x, y, 1, 1);
  }
}

function paintOre(ctx, S, rand, oreColor, blobCount = 8) {
  paintStone(ctx, S, rand);
  // colored ore blobs
  for (let i = 0; i < blobCount; i++) {
    const x = rand() * S, y = rand() * S;
    const r = 2 + rand() * 3;
    ctx.fillStyle = oreColor;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // brighter highlight
    ctx.fillStyle = rgba(255, 255, 255, 0.25);
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2); ctx.fill();
  }
}

function paintWoodTop(ctx, S, rand) {
  fillNoise(ctx, S, 155, 110, 65, 18, rand);
  // concentric rings centered randomly
  const cx = S / 2 + (rand() - 0.5) * 6;
  const cy = S / 2 + (rand() - 0.5) * 6;
  ctx.strokeStyle = rgba(90, 60, 30, 0.7);
  ctx.lineWidth = 1;
  for (let r = 4; r < S; r += 4 + rand() * 3) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // dark center
  ctx.fillStyle = rgba(80, 50, 25, 0.7);
  ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
}

function paintWoodSide(ctx, S, rand) {
  fillNoise(ctx, S, 130, 90, 50, 18, rand);
  // vertical grain streaks
  for (let i = 0; i < 12; i++) {
    const x = (rand() * S) | 0;
    ctx.strokeStyle = rgba(90, 55, 25, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    let y = 0;
    let xx = x;
    ctx.moveTo(xx, y);
    while (y < S) {
      y += 4 + rand() * 4;
      xx += (rand() - 0.5) * 1.5;
      ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
  // knot
  if (rand() < 0.5) {
    const kx = rand() * S, ky = rand() * S;
    ctx.fillStyle = rgba(75, 45, 20, 0.7);
    ctx.beginPath(); ctx.arc(kx, ky, 3 + rand() * 2, 0, Math.PI * 2); ctx.fill();
  }
}

function paintLeaves(ctx, S, rand) {
  fillNoise(ctx, S, 50, 100, 40, 24, rand);
  // brighter highlights — clusters of pixels
  for (let i = 0; i < 70; i++) {
    const x = rand() * S, y = rand() * S;
    const c = rand() < 0.5 ? rgb(95, 150, 60) : rgb(135, 180, 80);
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
  // darker holes
  for (let i = 0; i < 20; i++) {
    const x = rand() * S, y = rand() * S;
    ctx.fillStyle = rgba(20, 50, 15, 0.55);
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
  }
}

function paintWater(ctx, S, rand) {
  fillNoise(ctx, S, 35, 105, 175, 18, rand);
  // wavy highlights
  ctx.strokeStyle = rgba(180, 220, 255, 0.45);
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y0 = (rand() * S) | 0;
    ctx.beginPath();
    for (let x = 0; x <= S; x += 2) {
      const yy = y0 + Math.sin((x + i * 7) * 0.4) * 2;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

function paintShopTop(ctx, S, rand) {
  fillNoise(ctx, S, 230, 190, 60, 14, rand);
  // sparkles
  for (let i = 0; i < 18; i++) {
    const x = rand() * S, y = rand() * S;
    ctx.fillStyle = rgba(255, 255, 255, 0.7);
    ctx.beginPath();
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x + 1, y);
    ctx.lineTo(x, y + 2);
    ctx.lineTo(x - 1, y);
    ctx.closePath();
    ctx.fill();
  }
  // border
  ctx.strokeStyle = rgba(150, 110, 30, 0.8);
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, S - 2, S - 2);
}

function paintShopSide(ctx, S, rand) {
  fillNoise(ctx, S, 200, 160, 50, 12, rand);
  // vertical lines (wooden panel feel)
  for (let i = 1; i < 6; i++) {
    const x = (i / 6) * S;
    ctx.strokeStyle = rgba(120, 85, 25, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
  }
  // sign/label hint: dark plaque
  ctx.fillStyle = rgba(80, 55, 20, 0.85);
  ctx.fillRect(S * 0.2, S * 0.4, S * 0.6, S * 0.2);
  ctx.fillStyle = rgba(255, 230, 120, 0.95);
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SHOP', S / 2, S / 2 + 1);
}

// ---------- atlas builder ----------

export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Background fill so any unmapped tile is debug-purple.
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);

  // Paint each unique tile slot once.
  const painters = {
    '0,0': (c, S) => paintGrassTop(c, S, makeRng(1)),
    '1,0': (c, S) => paintGrassSide(c, S, makeRng(2)),
    '2,0': (c, S) => paintDirt(c, S, makeRng(3)),
    '3,0': (c, S) => paintStone(c, S, makeRng(4)),
    '4,0': (c, S) => paintSand(c, S, makeRng(5)),
    '5,0': (c, S) => paintOre(c, S, makeRng(6), 'rgb(20,20,20)', 9),
    '6,0': (c, S) => paintOre(c, S, makeRng(7), 'rgb(200,165,120)', 8),
    '7,0': (c, S) => paintOre(c, S, makeRng(8), 'rgb(230,200,70)', 7),
    '0,1': (c, S) => paintOre(c, S, makeRng(9), 'rgb(110,220,230)', 6),
    '1,1': (c, S) => paintBedrock(c, S, makeRng(10)),
    '2,1': (c, S) => paintWoodTop(c, S, makeRng(11)),
    '3,1': (c, S) => paintWoodSide(c, S, makeRng(12)),
    '4,1': (c, S) => paintLeaves(c, S, makeRng(13)),
    '5,1': (c, S) => paintWater(c, S, makeRng(14)),
    '6,1': (c, S) => paintShopTop(c, S, makeRng(15)),
    '7,1': (c, S) => paintShopSide(c, S, makeRng(16)),
  };

  // Use an offscreen sub-canvas to keep each tile's drawing self-contained.
  const off = document.createElement('canvas');
  off.width = TILE;
  off.height = TILE;
  const offCtx = off.getContext('2d');
  for (const key in painters) {
    const [col, row] = key.split(',').map(Number);
    offCtx.clearRect(0, 0, TILE, TILE);
    painters[key](offCtx, TILE);
    ctx.drawImage(off, col * TILE, row * TILE);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = false; // canvas top = v=0
  if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
  else if ('encoding' in texture) texture.encoding = THREE.sRGBEncoding;
  texture.needsUpdate = true;

  const padU = 0.5 / ATLAS_W;
  const padV = 0.5 / ATLAS_H;

  function uvFor(blockId, face) {
    const slot = TILE_POS[`${blockId}:${face}`] ?? [0, 0];
    const u0 = (slot[0] * TILE) / ATLAS_W + padU;
    const u1 = ((slot[0] + 1) * TILE) / ATLAS_W - padU;
    const v0 = (slot[1] * TILE) / ATLAS_H + padV;
    const v1 = ((slot[1] + 1) * TILE) / ATLAS_H - padV;
    return [u0, v0, u1, v1];
  }

  return { texture, uvFor, canvas };
}
