// Cave monsters: zombie-style mobs that chase the nearest player and bite.
import {
  MOB_MAX_HP, MOB_DAMAGE, MOB_SPEED, MOB_DETECT_RADIUS, MOB_COIN_DROP,
  PLAYER_MAX_HP, BLOCK,
} from './constants.js';

let nextMobId = 1;

export class Mob {
  constructor(x, y, z) {
    this.id = nextMobId++;
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.hp = MOB_MAX_HP;
    this.attackCooldown = 0;
    this.alive = true;
  }

  tick(dt, world, players) {
    if (!this.alive) return;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    // Find nearest player.
    let nearest = null;
    let nearestD = MOB_DETECT_RADIUS;
    for (const p of players.values()) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z);
      if (d < nearestD) { nearestD = d; nearest = p; }
    }

    if (nearest) {
      const dx = nearest.x - this.x;
      const dz = nearest.z - this.z;
      const dh = Math.hypot(dx, dz) || 1;
      this.vx = (dx / dh) * MOB_SPEED;
      this.vz = (dz / dh) * MOB_SPEED;
      // Attack on contact.
      if (nearestD < 1.4 && this.attackCooldown <= 0) {
        nearest.hp = Math.max(0, nearest.hp - MOB_DAMAGE);
        this.attackCooldown = 1.0;
        if (nearest.hp <= 0) nearest.alive = false;
      }
    } else {
      // wander slow random
      this.vx *= 0.85;
      this.vz *= 0.85;
    }

    // Apply gravity
    this.vy -= 18 * dt;
    if (this.vy < -25) this.vy = -25;

    // Integrate with simple voxel collision.
    this._moveAxis(world, 'x', this.vx * dt);
    this._moveAxis(world, 'y', this.vy * dt);
    this._moveAxis(world, 'z', this.vz * dt);

    // Try to jump over 1-block obstacles when chasing.
    if (nearest && this._onGround(world)) {
      const ahead = {
        x: this.x + Math.sign(this.vx) * 0.6,
        y: this.y,
        z: this.z + Math.sign(this.vz) * 0.6,
      };
      if (world.isSolid(Math.floor(ahead.x), Math.floor(ahead.y), Math.floor(ahead.z)) &&
          !world.isSolid(Math.floor(ahead.x), Math.floor(ahead.y) + 1, Math.floor(ahead.z))) {
        this.vy = 7;
      }
    }
  }

  _moveAxis(world, axis, delta) {
    const r = 0.35; // half-width
    const h = 1.7;  // height
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.3));
    const step = delta / steps;
    for (let s = 0; s < steps; s++) {
      const next = { x: this.x, y: this.y, z: this.z };
      next[axis] += step;
      if (this._collides(world, next.x, next.y, next.z, r, h)) {
        if (axis === 'y') this.vy = 0;
        else this[`v${axis}`] = 0;
        return;
      }
      this.x = next.x; this.y = next.y; this.z = next.z;
    }
  }

  _collides(world, x, y, z, r, h) {
    const minX = Math.floor(x - r), maxX = Math.floor(x + r);
    const minY = Math.floor(y), maxY = Math.floor(y + h);
    const minZ = Math.floor(z - r), maxZ = Math.floor(z + r);
    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (world.isSolid(bx, by, bz)) return true;
        }
      }
    }
    return false;
  }

  _onGround(world) {
    return world.isSolid(Math.floor(this.x), Math.floor(this.y) - 1, Math.floor(this.z))
        || world.isSolid(Math.floor(this.x), Math.floor(this.y - 0.05), Math.floor(this.z));
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  randomCoinDrop() {
    const [a, b] = MOB_COIN_DROP;
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  serialize() {
    return { id: this.id, x: this.x, y: this.y, z: this.z, hp: this.hp };
  }
}

// Try to find a valid spawn point in a dark/underground spot reasonably far from players.
export function findCaveSpawn(world, players, rng = Math.random) {
  const SX = world.sx, SY = world.sy, SZ = world.sz;
  for (let tries = 0; tries < 200; tries++) {
    const x = 1 + Math.floor(rng() * (SX - 2));
    const z = 1 + Math.floor(rng() * (SZ - 2));
    const y = 2 + Math.floor(rng() * Math.max(1, world.surfaceY(x, z) - 4));
    if (!world.inBounds(x, y, z)) continue;
    if (world.getBlock(x, y, z) !== BLOCK.AIR) continue;
    if (world.getBlock(x, y + 1, z) !== BLOCK.AIR) continue;
    if (!world.isSolid(x, y - 1, z)) continue;
    // not too close to a player
    let tooClose = false;
    for (const p of players.values()) {
      const d = Math.hypot(p.x - x, p.y - y, p.z - z);
      if (d < 8) { tooClose = true; break; }
    }
    if (tooClose) continue;
    return { x: x + 0.5, y, z: z + 0.5 };
  }
  return null;
}

export const _MOB_MAX_HP = MOB_MAX_HP;
export const _PLAYER_MAX_HP = PLAYER_MAX_HP;
