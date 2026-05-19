// Entry point.
import { Net } from './network.js';
import { Renderer } from './renderer.js';
import { Controls } from './controls.js';
import { LocalPlayer } from './player.js';
import { ClientWorld } from './world.js';
import { UI } from './ui.js';
import { BLOCK, REACH, PLACEABLE_RESOURCES } from './constants.js';

const canvas = document.getElementById('game');
const stick = document.getElementById('stick');
const knob = document.getElementById('stickKnob');
const btnJump = document.getElementById('btnJump');
const btnDig = document.getElementById('btnDig');
const btnPlace = document.getElementById('btnPlace');
const btnInv = document.getElementById('btnInv');
const btnShop = document.getElementById('btnShop');
const btnSwap = document.getElementById('btnSwap');
const btnChat = document.getElementById('btnChat');
const startBtn = document.getElementById('startBtn');
const nameInput = document.getElementById('nameInput');
const loading = document.getElementById('loading');
const hud = document.getElementById('hud');
const touch = document.getElementById('touch');

const state = {
  myId: null,
  myName: null,
  world: null,
  player: new LocalPlayer(),
  weapon: 'pickaxe', // current weapon for attack & dig action
  currentPlaceRes: 'dirt',
  inv: {},
  coins: 0,
  tools: { shovel: 0, pickaxe: 0 },
  hp: 20,
  alive: true,
  digTimer: 0,
  digTarget: null, // {x,y,z}
};

const ui = new UI();
const net = new Net();
const renderer = new Renderer(canvas);
const controls = new Controls({ canvas, stick, knob, btnJump, btnDig, btnPlace });

btnInv.addEventListener('click', () => ui.showInventory(state.inv, (res) => { state.currentPlaceRes = res; }));
btnShop.addEventListener('click', () => ui.showShop(state, sellResource, upgradeTool));
btnSwap.addEventListener('click', () => {
  state.weapon = state.weapon === 'pickaxe' ? 'shovel' : 'pickaxe';
  updateHud();
});
btnChat.addEventListener('click', () => ui.toggleChat());
document.getElementById('respawnBtn').addEventListener('click', () => {
  net.emit('respawn');
  ui.hideDeath();
});
document.getElementById('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = document.getElementById('chatInput').value;
  if (v.trim()) net.emit('chat', { text: v });
  document.getElementById('chatInput').value = '';
});

startBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Игрок';
  net.emit('hello', { name });
  loading.classList.add('hidden');
  hud.classList.remove('hidden');
  touch.classList.remove('hidden');
  document.getElementById('crosshair').classList.remove('hidden');
});

function sellResource(res, count) {
  net.emit('sell', { resource: res, count });
}
function upgradeTool(kind) {
  net.emit('upgrade', { kind });
}

function updateHud() {
  ui.setHud({
    hp: state.hp,
    coins: state.coins,
    toolKind: state.weapon,
    toolTier: state.tools[state.weapon],
    depth: Math.max(0, Math.floor(28 - state.player.y)),
  });
}

// --- Net handlers ---
net.on('init', (msg) => {
  state.myId = msg.you.id;
  state.myName = msg.you.name;
  state.world = ClientWorld.fromInit(msg.world);
  // Spawn position from world.
  const spawn = msg.world.spawn;
  state.player.setPosition(spawn.x, spawn.y, spawn.z);
  applyPrivate(msg.state);
  renderer.setWorld(state.world);
  for (const p of msg.players) {
    if (p.id !== state.myId) renderer.addPlayer(p);
  }
  for (const m of msg.mobs) renderer.addMob(m);
  updateHud();
});

net.on('playerJoin', (p) => {
  if (p.id !== state.myId) renderer.addPlayer(p);
  ui.appendChatMessage(`${p.name} вошёл в игру`);
});
net.on('playerLeave', ({ id }) => {
  renderer.removePlayer(id);
});
net.on('tick', ({ players, mobs }) => {
  for (const p of players) {
    if (p.id === state.myId) {
      // Trust server for HP / alive.
      if (typeof p.hp === 'number') state.hp = p.hp;
      state.alive = p.alive !== false;
      state.player.alive = state.alive;
      updateHud();
      if (!state.alive) ui.showDeath();
      continue;
    }
    renderer.updatePlayer(p);
  }
  for (const m of mobs) renderer.updateMob(m);
});
net.on('block', ({ x, y, z, type }) => {
  if (!state.world) return;
  if (state.world.setBlock(x, y, z, type)) {
    renderer.markDirtyForBlock(x, y, z);
  }
});
net.on('mobSpawn', (m) => renderer.addMob(m));
net.on('mobDespawn', ({ id }) => renderer.removeMob(id));
net.on('mobHit', () => {/* could flash mob */});
net.on('inv', applyPrivate);
net.on('flash', ({ msg }) => ui.flash(msg));
net.on('playerHit', ({ id, hp }) => {
  if (id === state.myId) { state.hp = hp; updateHud(); }
});
net.on('playerDied', ({ id }) => {
  if (id === state.myId) { state.alive = false; state.player.alive = false; ui.showDeath(); }
});
net.on('playerRespawn', ({ id, x, y, z, hp }) => {
  if (id === state.myId) {
    state.alive = true;
    state.player.alive = true;
    state.player.setPosition(x, y, z);
    state.hp = hp;
    updateHud();
    ui.hideDeath();
  }
});
net.on('chat', ({ from, text }) => {
  ui.appendChatMessage(`${from}: ${text}`);
});

function applyPrivate(p) {
  if (!p) return;
  if (p.coins !== undefined) state.coins = p.coins;
  if (p.inv) state.inv = p.inv;
  if (p.tools) state.tools = Object.assign(state.tools, p.tools);
  if (p.hp !== undefined) state.hp = p.hp;
  if (p.alive !== undefined) {
    state.alive = p.alive;
    state.player.alive = p.alive;
  }
  updateHud();
}

// --- Main loop ---
let lastFrame = performance.now();
let lastSent = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (state.world && state.alive) {
    const input = controls.read();
    state.player.applyInput(input, dt, state.world);
    if (input.swap) {
      state.weapon = state.weapon === 'pickaxe' ? 'shovel' : 'pickaxe';
      updateHud();
    }
    if (input.respawn) {
      // R = open chat / no-op when alive; nothing to do.
    }

    // Camera follow.
    renderer.setCameraFromPlayer({ x: state.player.x, y: state.player.y, z: state.player.z, yaw: state.player.yaw, pitch: state.player.pitch });

    // Highlight target block.
    const hit = renderer.raycastBlock(REACH);
    renderer.setHighlight(hit ? hit.hitBlock : null, hit ? hit.hitFace : null);

    // Dig logic: while held, accumulate timer.
    if (input.digHeld && hit) {
      const k = `${hit.hitBlock.x},${hit.hitBlock.y},${hit.hitBlock.z}`;
      if (state.digTarget !== k) {
        state.digTarget = k;
        state.digTimer = 0;
      }
      state.digTimer += dt;
      // Fast-enough digging: instant for now (server validates). Send once per ~0.4s.
      if (state.digTimer > 0.25) {
        net.emit('dig', { x: hit.hitBlock.x, y: hit.hitBlock.y, z: hit.hitBlock.z });
        state.digTimer = 0;
      }
    } else {
      state.digTarget = null;
      state.digTimer = 0;
      // Quick tap (single press) — also dig once.
      if (input.dig && hit) {
        net.emit('dig', { x: hit.hitBlock.x, y: hit.hitBlock.y, z: hit.hitBlock.z });
        // Also try attack mobs / players if no block right in front.
      }
    }

    // Place block.
    if (input.place && hit && hit.hitFace) {
      const px = hit.hitBlock.x + hit.hitFace.x;
      const py = hit.hitBlock.y + hit.hitFace.y;
      const pz = hit.hitBlock.z + hit.hitFace.z;
      if (PLACEABLE_RESOURCES.includes(state.currentPlaceRes) && (state.inv[state.currentPlaceRes] || 0) > 0) {
        net.emit('place', { x: px, y: py, z: pz, resource: state.currentPlaceRes });
      } else {
        ui.flash('Выбери ресурс в инвентаре');
      }
    }

    // Attack: if dig tap and no block hit, look for mob or player.
    if (input.dig && !hit) {
      const mob = renderer.raycastMob(REACH);
      if (mob) {
        net.emit('attackMob', { id: mob.id, weapon: state.weapon });
      } else {
        const pl = renderer.raycastPlayer(state.myId, REACH);
        if (pl) net.emit('attackPlayer', { id: pl.id, weapon: state.weapon });
      }
    }

    // Periodic position broadcast.
    if (now - lastSent > 100) {
      net.emit('input', {
        x: state.player.x, y: state.player.y, z: state.player.z,
        yaw: state.player.yaw, pitch: state.player.pitch,
      });
      lastSent = now;
    }
  }

  renderer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
