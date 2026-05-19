// Client-side block storage (mirrors server's Uint8Array).
import { BLOCK, CHUNK_SIZE } from './constants.js';

export class ClientWorld {
  constructor(sx, sy, sz) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.blocks = new Uint8Array(sx * sy * sz);
  }
  static fromInit(data) {
    const w = new ClientWorld(data.sx, data.sy, data.sz);
    // data.blocks is base64 string
    const bin = atob(data.blocks);
    if (bin.length !== w.blocks.length) {
      console.warn('block buffer size mismatch', bin.length, w.blocks.length);
    }
    for (let i = 0; i < Math.min(bin.length, w.blocks.length); i++) {
      w.blocks[i] = bin.charCodeAt(i);
    }
    return w;
  }
  _idx(x, y, z) { return (y * this.sz + z) * this.sx + x; }
  inBounds(x, y, z) {
    return x >= 0 && x < this.sx && y >= 0 && y < this.sy && z >= 0 && z < this.sz;
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
  surfaceY(x, z) {
    for (let y = this.sy - 1; y >= 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b !== BLOCK.AIR && b !== BLOCK.WATER) return y;
    }
    return 0;
  }
  // Yield each chunk origin [cx, cy, cz] in chunk-units.
  *chunks() {
    const cX = Math.ceil(this.sx / CHUNK_SIZE);
    const cY = Math.ceil(this.sy / CHUNK_SIZE);
    const cZ = Math.ceil(this.sz / CHUNK_SIZE);
    for (let cy = 0; cy < cY; cy++) {
      for (let cz = 0; cz < cZ; cz++) {
        for (let cx = 0; cx < cX; cx++) {
          yield [cx, cy, cz];
        }
      }
    }
  }
  chunkKey(cx, cy, cz) { return `${cx},${cy},${cz}`; }
  blockChunkKey(x, y, z) {
    return this.chunkKey(
      Math.floor(x / CHUNK_SIZE),
      Math.floor(y / CHUNK_SIZE),
      Math.floor(z / CHUNK_SIZE),
    );
  }
  // Also include neighbor chunks if block is on a chunk boundary.
  dirtyChunksForBlock(x, y, z) {
    const set = new Set();
    set.add(this.blockChunkKey(x, y, z));
    if (x % CHUNK_SIZE === 0) set.add(this.blockChunkKey(x - 1, y, z));
    if (x % CHUNK_SIZE === CHUNK_SIZE - 1) set.add(this.blockChunkKey(x + 1, y, z));
    if (y % CHUNK_SIZE === 0) set.add(this.blockChunkKey(x, y - 1, z));
    if (y % CHUNK_SIZE === CHUNK_SIZE - 1) set.add(this.blockChunkKey(x, y + 1, z));
    if (z % CHUNK_SIZE === 0) set.add(this.blockChunkKey(x, y, z - 1));
    if (z % CHUNK_SIZE === CHUNK_SIZE - 1) set.add(this.blockChunkKey(x, y, z + 1));
    return set;
  }
}
