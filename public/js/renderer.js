// Three.js renderer: textured chunk meshes, sky dome, lighting, players, mobs, raycasts.
/* global THREE */
import { CHUNK_SIZE, BLOCK } from './constants.js';
import { meshChunk } from './chunkMesher.js';
import { buildAtlas } from './textures.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();

    // Sky / fog tinted to match a realistic daytime horizon.
    const horizon = new THREE.Color(0xcfe6f5);
    const zenith  = new THREE.Color(0x5aa6e6);
    this.scene.background = horizon.clone();
    this.scene.fog = new THREE.Fog(horizon, 40, 110);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 220);
    this.camera.position.set(0, 30, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    else if ('outputEncoding' in this.renderer) this.renderer.outputEncoding = THREE.sRGBEncoding;

    // Lighting: ambient floor so under-faces never go pitch black (otherwise
    // overhangs read as transparent holes); hemisphere for sky/ground tint;
    // directional sun + fill for shape contrast.
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xcfe6f5, 0x9c8a72, 0.55);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1c8, 0.75);
    sun.position.set(50, 90, 35);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x88aacc, 0.30);
    fill.position.set(-40, 30, -20);
    this.scene.add(fill);
    const under = new THREE.DirectionalLight(0xfff1d0, 0.18);
    under.position.set(0, -60, 0);
    this.scene.add(under);

    // Sky dome with gradient (zenith → horizon).
    const skyGeo = new THREE.SphereGeometry(180, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: zenith },
        bottomColor: { value: horizon },
        offset: { value: 12 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // Sun billboard.
    const sunMat = new THREE.SpriteMaterial({ color: 0xfff1c8, depthWrite: false });
    this.sunSprite = new THREE.Sprite(sunMat);
    this.sunSprite.scale.set(14, 14, 1);
    this.sunSprite.position.set(50, 90, 35).multiplyScalar(1.6);
    this.scene.add(this.sunSprite);

    // Procedural texture atlas.
    const atlas = buildAtlas();
    this.atlas = atlas;
    this.uvFor = atlas.uvFor;
    this.material = new THREE.MeshLambertMaterial({
      map: atlas.texture, vertexColors: true,
    });
    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: atlas.texture, vertexColors: true,
      transparent: true, opacity: 0.72, depthWrite: false,
    });

    this.world = null;
    this.chunks = new Map();
    this.waterChunks = new Map();
    this.dirty = new Set();
    this.players = new Map();
    this.mobs = new Map();

    // Block selection highlight: an amber translucent "face overlay" placed
    // exactly on the targeted face — NOT a full wireframe cube. The previous
    // version was an edges-only box, which read as a "ghost / semi-transparent
    // block" floating in the scene. A flat face-tint is unambiguously a UI
    // cursor.
    const hlGeo = new THREE.PlaneGeometry(0.96, 0.96);
    const hlMat = new THREE.MeshBasicMaterial({
      color: 0xffd54a,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const hl = new THREE.Mesh(hlGeo, hlMat);
    hl.renderOrder = 50;
    hl.visible = false;
    this.scene.add(hl);
    // Thin border around the face, drawn on top so it's always visible.
    const borderMat = new THREE.LineBasicMaterial({
      color: 0xffd54a,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const borderGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.48, -0.48, 0),
      new THREE.Vector3( 0.48, -0.48, 0),
      new THREE.Vector3( 0.48,  0.48, 0),
      new THREE.Vector3(-0.48,  0.48, 0),
      new THREE.Vector3(-0.48, -0.48, 0),
    ]);
    const border = new THREE.Line(borderGeo, borderMat);
    border.renderOrder = 51;
    hl.add(border);
    this.highlight = hl;

    this._tmpDir = new THREE.Vector3();
    this._tmpOrigin = new THREE.Vector3();

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  setWorld(world) {
    for (const { mesh, geometry } of this.chunks.values()) {
      this.scene.remove(mesh);
      geometry.dispose();
    }
    for (const { mesh, geometry } of this.waterChunks.values()) {
      this.scene.remove(mesh);
      geometry.dispose();
    }
    this.chunks.clear();
    this.waterChunks.clear();

    this.world = world;
    for (const [cx, cy, cz] of world.chunks()) {
      this.dirty.add(world.chunkKey(cx, cy, cz));
    }
    this.flushDirty();
  }

  markDirtyForBlock(x, y, z) {
    if (!this.world) return;
    const keys = this.world.dirtyChunksForBlock(x, y, z);
    for (const k of keys) this.dirty.add(k);
  }

  flushDirty(limit = Infinity) {
    if (!this.world) return;
    let n = 0;
    for (const key of [...this.dirty]) {
      if (n++ >= limit) break;
      this.dirty.delete(key);
      const [cx, cy, cz] = key.split(',').map(Number);
      this._rebuildChunk(cx, cy, cz, false);
      this._rebuildChunk(cx, cy, cz, true);
    }
  }

  _rebuildChunk(cx, cy, cz, water) {
    const map = water ? this.waterChunks : this.chunks;
    const key = this.world.chunkKey(cx, cy, cz);
    const existing = map.get(key);
    if (existing) {
      this.scene.remove(existing.mesh);
      existing.geometry.dispose();
      map.delete(key);
    }
    const ox = cx * CHUNK_SIZE, oy = cy * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    const data = meshChunk(this.world, ox, oy, oz, { onlyWater: water, uvFor: this.uvFor });
    if (data.positions.length === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    g.setAttribute('normal',   new THREE.Float32BufferAttribute(data.normals, 3));
    g.setAttribute('color',    new THREE.Float32BufferAttribute(data.colors, 3));
    g.setAttribute('uv',       new THREE.Float32BufferAttribute(data.uvs, 2));
    g.setIndex(data.indices);
    g.computeBoundingSphere();
    const mat = water ? this.waterMaterial : this.material;
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = true;
    if (water) mesh.renderOrder = 1;
    this.scene.add(mesh);
    map.set(key, { mesh, geometry: g });
  }

  setCameraFromPlayer(player) {
    this.camera.position.set(player.x, player.y + 1.6, player.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(player.pitch, player.yaw, 0);
  }

  raycastBlock(maxDist = 6) {
    if (!this.world) return null;
    const origin = this._tmpOrigin.copy(this.camera.position);
    const dir = this._tmpDir;
    this.camera.getWorldDirection(dir);
    return raycastVoxel(this.world, origin, dir, maxDist);
  }

  raycastMob(maxDist = 6) {
    const origin = this._tmpOrigin.copy(this.camera.position);
    const dir = this._tmpDir;
    this.camera.getWorldDirection(dir);
    let best = null, bestT = maxDist;
    for (const [id, ent] of this.mobs) {
      const t = raySphere(origin, dir, ent.aimPoint(), 0.7);
      if (t !== null && t < bestT) { bestT = t; best = id; }
    }
    return best ? { id: best, distance: bestT } : null;
  }

  raycastPlayer(myId, maxDist = 6) {
    const origin = this._tmpOrigin.copy(this.camera.position);
    const dir = this._tmpDir;
    this.camera.getWorldDirection(dir);
    let best = null, bestT = maxDist;
    for (const [id, ent] of this.players) {
      if (id === myId) continue;
      const t = raySphere(origin, dir, ent.aimPoint(), 0.7);
      if (t !== null && t < bestT) { bestT = t; best = id; }
    }
    return best ? { id: best, distance: bestT } : null;
  }

  // Show a single-face amber overlay on the targeted face.
  // `face` is the outward-pointing normal {x,y,z} that the camera is looking at;
  // we pass it through from the voxel raycast (`hitFace`).
  setHighlight(block, face) {
    if (!block) { this.highlight.visible = false; return; }
    const hl = this.highlight;
    hl.visible = true;
    // Default: orient toward +Y if no face info (e.g. when targeting a far block
    // edge-on); we still want a sensible plane orientation.
    const f = face || { x: 0, y: 1, z: 0 };
    // Center of the face = block center + 0.5 along the face normal, nudged a
    // hair outward so the plane never z-fights with the block surface.
    const eps = 0.01;
    hl.position.set(
      block.x + 0.5 + (f.x * (0.5 + eps)),
      block.y + 0.5 + (f.y * (0.5 + eps)),
      block.z + 0.5 + (f.z * (0.5 + eps)),
    );
    // Plane is XY by default; rotate so its normal matches `f`.
    if (f.y === 1)       hl.rotation.set(-Math.PI / 2, 0, 0);
    else if (f.y === -1) hl.rotation.set( Math.PI / 2, 0, 0);
    else if (f.x === 1)  hl.rotation.set(0,  Math.PI / 2, 0);
    else if (f.x === -1) hl.rotation.set(0, -Math.PI / 2, 0);
    else if (f.z === 1)  hl.rotation.set(0, 0, 0);
    else if (f.z === -1) hl.rotation.set(0, Math.PI, 0);
  }

  addPlayer(p, isLocal = false) {
    if (isLocal) return;
    if (this.players.has(p.id)) return;
    const ent = buildHumanoid({
      skin: 0xf2c79b, shirt: 0x3a73c6, pants: 0x2b3344, hair: 0x3a2618,
    });
    ent.group.position.set(p.x, p.y, p.z);
    this.scene.add(ent.group);
    this.players.set(p.id, ent);
  }
  updatePlayer(p) {
    const ent = this.players.get(p.id);
    if (!ent) return;
    ent.group.position.set(p.x, p.y, p.z);
    ent.group.rotation.y = p.yaw || 0;
    ent.group.visible = p.alive !== false;
  }
  removePlayer(id) {
    const ent = this.players.get(id);
    if (!ent) return;
    this.scene.remove(ent.group);
    this.players.delete(id);
  }

  addMob(m) {
    if (this.mobs.has(m.id)) return;
    const ent = buildHumanoid({
      skin: 0x6a9a55, shirt: 0x3f5a35, pants: 0x2c3a25, hair: 0x222018, mob: true,
    });
    ent.group.position.set(m.x, m.y, m.z);
    this.scene.add(ent.group);
    this.mobs.set(m.id, ent);
  }
  updateMob(m) {
    const ent = this.mobs.get(m.id);
    if (!ent) return;
    ent.group.position.set(m.x, m.y, m.z);
    if (typeof m.yaw === 'number') ent.group.rotation.y = m.yaw;
  }
  removeMob(id) {
    const ent = this.mobs.get(id);
    if (!ent) return;
    this.scene.remove(ent.group);
    this.mobs.delete(id);
  }

  render() {
    this.flushDirty(2);
    const t = performance.now() * 0.005;
    for (const ent of this.players.values()) ent.idle(t);
    for (const ent of this.mobs.values()) ent.idle(t);
    this.renderer.render(this.scene, this.camera);
  }
}

// Small "humanoid": head, torso, two arms, two legs. Returns { group, aimPoint, idle }.
function buildHumanoid({ skin, shirt, pants, hair, mob = false }) {
  const group = new THREE.Group();

  const mat = (hex) => new THREE.MeshLambertMaterial({ color: hex });
  const skinMat  = mat(skin);
  const shirtMat = mat(shirt);
  const pantsMat = mat(pants);
  const hairMat  = mat(hair);
  const eyeMat   = mob
    ? new THREE.MeshBasicMaterial({ color: 0xff3333 })
    : new THREE.MeshBasicMaterial({ color: 0x111111 });

  // Leg geometry with pivot at the top so a forward swing looks natural.
  const legGeo = new THREE.BoxGeometry(0.28, 0.9, 0.32);
  legGeo.translate(0, -0.45, 0);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.16, 0.9, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legL, legR);

  // Torso.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.9, 0.42), shirtMat);
  torso.position.set(0, 1.35, 0);
  group.add(torso);

  // Head with hair cap.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
  head.position.set(0, 2.05, 0);
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.52), hairMat);
  cap.position.set(0, 2.3, 0);
  group.add(cap);

  // Eyes (basic material so mob eyes stay vivid).
  const eyeGeo = new THREE.BoxGeometry(0.07, 0.07, 0.04);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.1, 2.07, 0.255);
  eyeR.position.set( 0.1, 2.07, 0.255);
  group.add(eyeL, eyeR);

  // Arms with pivot at shoulder.
  const armGeo = new THREE.BoxGeometry(0.24, 0.86, 0.28);
  armGeo.translate(0, -0.43, 0);
  const armL = new THREE.Mesh(armGeo, mob ? skinMat : shirtMat);
  armL.position.set(-0.48, 1.78, 0);
  const armR = armL.clone();
  armR.position.x = 0.48;
  group.add(armL, armR);

  function aimPoint() {
    return new THREE.Vector3(
      group.position.x,
      group.position.y + 1.7,
      group.position.z,
    );
  }

  function idle(t) {
    const s = Math.sin(t);
    if (mob) {
      armL.rotation.x = 1.3 + s * 0.15;
      armR.rotation.x = 1.3 - s * 0.15;
    } else {
      armL.rotation.x = s * 0.25;
      armR.rotation.x = -s * 0.25;
    }
    legL.rotation.x = -s * 0.15;
    legR.rotation.x =  s * 0.15;
  }

  return { group, aimPoint, idle };
}

// DDA voxel raycast.
function raycastVoxel(world, origin, dir, maxDist) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  const stepX = dir.x > 0 ? 1 : (dir.x < 0 ? -1 : 0);
  const stepY = dir.y > 0 ? 1 : (dir.y < 0 ? -1 : 0);
  const stepZ = dir.z > 0 ? 1 : (dir.z < 0 ? -1 : 0);
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;
  let tMaxX = stepX > 0 ? ((x + 1) - origin.x) / dir.x : (stepX < 0 ? (x - origin.x) / dir.x : Infinity);
  let tMaxY = stepY > 0 ? ((y + 1) - origin.y) / dir.y : (stepY < 0 ? (y - origin.y) / dir.y : Infinity);
  let tMaxZ = stepZ > 0 ? ((z + 1) - origin.z) / dir.z : (stepZ < 0 ? (z - origin.z) / dir.z : Infinity);
  let lastFace = null;
  let t = 0;
  for (let i = 0; i < 256; i++) {
    if (world.inBounds(x, y, z)) {
      const b = world.getBlock(x, y, z);
      if (b !== BLOCK.AIR && b !== BLOCK.WATER) {
        return {
          hitBlock: { x, y, z },
          hitFace: lastFace,
          distance: t,
          block: b,
        };
      }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX;
      lastFace = { x: -stepX, y: 0, z: 0 };
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY;
      lastFace = { x: 0, y: -stepY, z: 0 };
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
      lastFace = { x: 0, y: 0, z: -stepZ };
    }
    if (t > maxDist) return null;
  }
  return null;
}

function raySphere(origin, dir, center, radius) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox*ox + oy*oy + oz*oz - radius*radius;
  const disc = b*b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0) return null;
  return t;
}
