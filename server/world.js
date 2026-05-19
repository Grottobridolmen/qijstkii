// World storage + procedural generation.
import {
  WORLD_SIZE_X, WORLD_SIZE_Y, WORLD_SIZE_Z, SEA_LEVEL, BLOCK,
} from './constants.js';
import { fbm2D, fbm3D, mulberry32 } from './noise.js';

const SX = WORLD_SIZE_X;
const SY = WORLD_SIZE_Y;
const SZ = WORLD_SIZE_Z;

export class World {
  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this.sx = SX;
    this.sy = SY;
    this.sz = SZ;
    this.blocks = new Uint8Array(SX * SY * SZ);
    this.generate();
  }

  _idx(x, y, z) {
    return (y * SZ + z) * SX + x;
  }

  inBounds(x, y, z) {
    return x >= 0 && x < SX && y >= 0 && y < SY && z >= 0 && z < SZ;
  }

  getBlock(x, y, z) {
    if (!this.inBounds(x, y, z)) return BLOCK.AIR;
    return this.blocks[this._idx(x, y, z)];
  }

  setBlock(x, y, z, type) {
    if (!this.inBounds(x, y, z)) return false;
    const i = this._idx(x, y, z);
    if (this.blocks[i] === type) return false;
    this.blocks[i] = type;
    return true;
  }

  isSolid(x, y, z) {
    const b = this.getBlock(x, y, z);
    return b !== BLOCK.AIR && b !== BLOCK.WATER;
  }

  // Returns surface y (top non-air block index + 1).
  surfaceY(x, z) {
    for (let y = SY - 1; y >= 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b !== BLOCK.AIR && b !== BLOCK.WATER) return y;
    }
    return 0;
  }

  generate() {
    const seed = this.seed;
    // 1) Heightmap.
    const heightMap = new Int32Array(SX * SZ);
    for (let x = 0; x < SX; x++) {
      for (let z = 0; z < SZ; z++) {
        // Combine large-scale + small-scale noise.
        const big = fbm2D(x / 38, z / 38, seed + 1, 4, 2, 0.55);
        const small = fbm2D(x / 9, z / 9, seed + 7, 3, 2, 0.5) * 0.25;
        const v = big + small;
        // Map to height in [SEA_LEVEL-5, SEA_LEVEL+14]
        const h = Math.max(2, Math.min(SY - 6, Math.floor(SEA_LEVEL - 5 + v * 22)));
        heightMap[z * SX + x] = h;
      }
    }
    // 2) Fill terrain layers.
    for (let x = 0; x < SX; x++) {
      for (let z = 0; z < SZ; z++) {
        const h = heightMap[z * SX + x];
        for (let y = 0; y <= h; y++) {
          let block;
          if (y === 0) block = BLOCK.BEDROCK;
          else if (y < h - 4) block = BLOCK.STONE;
          else if (y < h) block = BLOCK.DIRT;
          else {
            // Top block: grass above sea level, sand near it.
            if (h <= SEA_LEVEL + 1 && h >= SEA_LEVEL - 1) block = BLOCK.SAND;
            else block = BLOCK.GRASS;
          }
          this.blocks[this._idx(x, y, z)] = block;
        }
        // Water in low spots up to SEA_LEVEL.
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          this.blocks[this._idx(x, y, z)] = BLOCK.WATER;
        }
      }
    }
    // 3) Carve caves with 3D noise.
    for (let x = 1; x < SX - 1; x++) {
      for (let y = 2; y < SY - 6; y++) {
        for (let z = 1; z < SZ - 1; z++) {
          const idx = this._idx(x, y, z);
          const cur = this.blocks[idx];
          if (cur !== BLOCK.STONE && cur !== BLOCK.DIRT) continue;
          // Deeper => more caves. Above-ground stays solid.
          const depthFactor = Math.min(1, (SEA_LEVEL - y) / 18); // 1 deep down, 0 at sea level
          if (depthFactor <= 0) continue;
          const n = fbm3D(x / 14, y / 10, z / 14, seed + 31, 3, 2, 0.55);
          const threshold = 0.55 - 0.18 * depthFactor; // more permissive deeper
          if (n > threshold) {
            this.blocks[idx] = BLOCK.AIR;
          }
        }
      }
    }
    // 4) Ore veins.
    this._placeOreVeins(seed + 101, BLOCK.COAL, 70, 6, 12, 2, SEA_LEVEL - 1);
    this._placeOreVeins(seed + 102, BLOCK.IRON, 50, 4, 9, 2, SEA_LEVEL - 6);
    this._placeOreVeins(seed + 103, BLOCK.GOLD, 24, 3, 6, 2, SEA_LEVEL - 12);
    this._placeOreVeins(seed + 104, BLOCK.DIAMOND, 12, 2, 5, 1, SEA_LEVEL - 18);
    // 5) Trees.
    this._placeTrees(seed + 911, 14);
    // 6) Shop / trader hut near spawn at center.
    const cx = Math.floor(SX / 2);
    const cz = Math.floor(SZ / 2);
    const sy = this.surfaceY(cx, cz) + 1;
    // 1-block shop marker on the ground
    this.blocks[this._idx(cx, sy, cz)] = BLOCK.SHOP;
    this.shopPos = { x: cx, y: sy, z: cz };
    // Cleared area for spawn
    this.spawnPos = { x: cx + 1.5, y: sy + 1, z: cz + 1.5 };
  }

  _placeOreVeins(seed, blockType, attempts, minSize, maxSize, minY, maxY) {
    const rnd = mulberry32(seed);
    for (let a = 0; a < attempts; a++) {
      const sx = Math.floor(rnd() * SX);
      const sz = Math.floor(rnd() * SZ);
      const sy = Math.floor(rnd() * (maxY - minY + 1)) + minY;
      if (sy <= 1) continue;
      const size = Math.floor(rnd() * (maxSize - minSize + 1)) + minSize;
      // Random walk
      let x = sx, y = sy, z = sz;
      for (let i = 0; i < size; i++) {
        const idx = this._idx(x, y, z);
        if (this.inBounds(x, y, z) && this.blocks[idx] === BLOCK.STONE) {
          this.blocks[idx] = blockType;
        }
        const dir = Math.floor(rnd() * 6);
        if (dir === 0) x++;
        else if (dir === 1) x--;
        else if (dir === 2) y++;
        else if (dir === 3) y--;
        else if (dir === 4) z++;
        else z--;
        if (!this.inBounds(x, y, z)) break;
      }
    }
  }

  _placeTrees(seed, count) {
    const rnd = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const x = 3 + Math.floor(rnd() * (SX - 6));
      const z = 3 + Math.floor(rnd() * (SZ - 6));
      const ground = this.surfaceY(x, z);
      if (this.getBlock(x, ground, z) !== BLOCK.GRASS) continue;
      const trunk = 4 + Math.floor(rnd() * 3); // 4..6
      for (let y = ground + 1; y <= ground + trunk; y++) {
        if (this.inBounds(x, y, z)) this.blocks[this._idx(x, y, z)] = BLOCK.WOOD;
      }
      // Spherical canopy filling: solid core + jittered shell so the tree
      // reads as a full ball, not a sparse pile of cubes (no "see-through"
      // gaps to the sky).
      const ty = ground + trunk;
      const cy = ty + 1;          // canopy center sits one block above trunk top
      const R = 2.6;              // outer radius
      const R2 = R * R;
      const RIN2 = (R - 1.1) * (R - 1.1); // inner core radius squared
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
          for (let dy = -2; dy <= 3; dy++) {
            // Flatten slightly along Y for an oval/spherical canopy.
            const yScale = 1.15;
            const d2 = dx * dx + (dy * yScale) * (dy * yScale) + dz * dz;
            if (d2 > R2) continue;
            // Inner core: always filled. Outer shell: jittered for organic edge.
            if (d2 > RIN2 && rnd() < 0.25) continue;
            const xx = x + dx, yy = cy + dy, zz = z + dz;
            if (!this.inBounds(xx, yy, zz)) continue;
            const cur = this.getBlock(xx, yy, zz);
            if (cur === BLOCK.AIR || cur === BLOCK.LEAVES) {
              this.blocks[this._idx(xx, yy, zz)] = BLOCK.LEAVES;
            }
          }
        }
      }
    }
  }

  // Serialize for network: send block buffer base64 + dims + seed.
  serialize() {
    return {
      sx: SX, sy: SY, sz: SZ,
      seed: this.seed,
      blocks: Buffer.from(this.blocks).toString('base64'),
      shop: this.shopPos,
      spawn: this.spawnPos,
    };
  }

  loadFromSerialized(data) {
    if (!data || !data.blocks) return false;
    const buf = Buffer.from(data.blocks, 'base64');
    if (buf.length !== this.blocks.length) return false;
    this.blocks.set(buf);
    if (data.shop) this.shopPos = data.shop;
    if (data.spawn) this.spawnPos = data.spawn;
    return true;
  }
}
