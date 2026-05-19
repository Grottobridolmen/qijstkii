// Local player physics: walking, jumping, voxel AABB collisions.

const GRAVITY = 26;
const WALK_SPEED = 4.5;
const JUMP_VELOCITY = 8.5;
const PLAYER_HALF = 0.3;
const PLAYER_HEIGHT = 1.75;
const EYE_HEIGHT = 1.6;

export class LocalPlayer {
  constructor() {
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.hp = 20;
    this.alive = true;
  }

  setPosition(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
  }

  applyInput(input, dt, world) {
    if (!this.alive) {
      this.vx = 0; this.vy = 0; this.vz = 0;
      return;
    }
    // Look
    const lookSensX = 0.0035;
    const lookSensY = 0.0035;
    this.yaw -= input.look.x * lookSensX;
    this.pitch -= input.look.y * lookSensY;
    const lim = Math.PI / 2 - 0.01;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;

    // Movement vector in world space.
    const mx = input.move.x;
    const my = input.move.y;
    let dirX = 0, dirZ = 0;
    if (mx !== 0 || my !== 0) {
      // Forward = -y in screen (up). In world space:
      // forward when yaw=0 is -Z; right is +X. Mapping screen to world:
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // forward axis (yaw): -sin, -cos  (because camera looks -Z when yaw=0)
      const fx = -sin, fz = -cos;
      // right axis: cos, -sin
      const rx = cos, rz = -sin;
      dirX = fx * (-my) + rx * mx;
      dirZ = fz * (-my) + rz * mx;
      const d = Math.hypot(dirX, dirZ);
      if (d > 0) { dirX /= d; dirZ /= d; }
    }
    this.vx = dirX * WALK_SPEED;
    this.vz = dirZ * WALK_SPEED;

    // Jump.
    if (input.jump && this.onGround) {
      this.vy = JUMP_VELOCITY;
      this.onGround = false;
    }
    // Gravity.
    this.vy -= GRAVITY * dt;
    if (this.vy < -40) this.vy = -40;

    // Integrate with AABB voxel collisions, one axis at a time.
    this._moveAxis(world, 'x', this.vx * dt);
    this._moveAxis(world, 'z', this.vz * dt);
    const beforeY = this.y;
    this._moveAxis(world, 'y', this.vy * dt);
    if (this.vy < 0 && this.y === beforeY) {
      // Stopped on ground.
      this.onGround = true;
      this.vy = 0;
    } else if (this.vy > 0 && this.y === beforeY) {
      this.vy = 0;
    } else if (this.vy < 0) {
      this.onGround = false;
    }
  }

  _moveAxis(world, axis, delta) {
    if (delta === 0) return;
    const r = PLAYER_HALF;
    const h = PLAYER_HEIGHT;
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.2));
    const step = delta / steps;
    for (let s = 0; s < steps; s++) {
      const candidate = { x: this.x, y: this.y, z: this.z };
      candidate[axis] += step;
      if (this._collides(world, candidate.x, candidate.y, candidate.z, r, h)) {
        return;
      }
      this.x = candidate.x; this.y = candidate.y; this.z = candidate.z;
    }
  }

  _collides(world, x, y, z, r, h) {
    const minX = Math.floor(x - r), maxX = Math.floor(x + r);
    const minY = Math.floor(y), maxY = Math.floor(y + h - 0.01);
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

  get eyeY() { return this.y + EYE_HEIGHT; }
}
