// Authoritative game state: players, mobs, world deltas, shop, persistence.
import {
  BLOCK, BLOCK_TOOL, BLOCK_DROP, SELL_PRICE, UPGRADE_COST, TOOL_DAMAGE,
  PLAYER_MAX_HP, REACH, SERVER_TICK_HZ, MOB_RESPAWN_TIME, TOOL_TIER_NAMES,
  WORLD_SIZE_X, WORLD_SIZE_Z,
} from './constants.js';
import { World } from './world.js';
import { Mob, findCaveSpawn } from './mob.js';
import { loadGame, makeThrottledSave } from './persistence.js';

const TICK_DT = 1 / SERVER_TICK_HZ;
const MAX_MOBS = 8;

function defaultInv() {
  return { coal: 0, iron: 0, gold: 0, diamond: 0, dirt: 0, sand: 0, stone: 0, wood: 0 };
}

export class Game {
  constructor(seed = Date.now() >>> 0) {
    this.world = new World(seed);
    this.players = new Map(); // id -> player state
    this.mobs = new Map();    // id -> Mob
    this.playerByName = new Map();
    this.tickTimer = null;
    this.io = null;
    this.lastTick = Date.now();
    this.mobRespawnAt = 0;

    this.scheduleSave = makeThrottledSave(5000);
    this._tryLoad();
  }

  _tryLoad() {
    const data = loadGame();
    if (!data) return;
    if (data.world && this.world.loadFromSerialized(data.world)) {
      console.log('[game] loaded world from save');
    }
    if (data.savedPlayers && typeof data.savedPlayers === 'object') {
      this.savedPlayers = data.savedPlayers;
    } else {
      this.savedPlayers = {};
    }
  }

  attach(io) {
    this.io = io;
    io.on('connection', (socket) => this._onConnection(socket));
    this.tickTimer = setInterval(() => this._tick(), Math.floor(1000 / SERVER_TICK_HZ));
  }

  shutdown() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this._persistNow();
  }

  _persistNow() {
    this.scheduleSave(() => this._snapshot());
  }

  _snapshot() {
    const saved = this.savedPlayers || {};
    // Update saved entries from live ones (keyed by name).
    for (const p of this.players.values()) {
      saved[p.name] = {
        coins: p.coins,
        inv: p.inv,
        tools: p.tools,
        hp: p.hp,
      };
    }
    return {
      world: this.world.serialize(),
      savedPlayers: saved,
    };
  }

  _onConnection(socket) {
    socket.on('hello', (msg) => {
      const name = (msg && typeof msg.name === 'string' ? msg.name : 'Игрок')
        .replace(/[^\p{L}\p{N}_\- ]/gu, '').slice(0, 20) || 'Игрок';
      // Avoid name collision: append number if needed.
      let finalName = name;
      let i = 2;
      while (this.playerByName.has(finalName)) {
        finalName = `${name}${i++}`;
      }
      const saved = (this.savedPlayers && this.savedPlayers[finalName]) || null;
      const spawn = this.world.spawnPos;
      const player = {
        id: socket.id,
        socket,
        name: finalName,
        x: spawn.x, y: spawn.y, z: spawn.z,
        yaw: 0, pitch: 0,
        vx: 0, vy: 0, vz: 0,
        hp: saved ? saved.hp ?? PLAYER_MAX_HP : PLAYER_MAX_HP,
        coins: saved ? saved.coins ?? 0 : 0,
        inv: saved ? Object.assign(defaultInv(), saved.inv || {}) : defaultInv(),
        tools: saved ? Object.assign({ shovel: 0, pickaxe: 0 }, saved.tools || {}) : { shovel: 0, pickaxe: 0 },
        alive: true,
        lastInputAt: Date.now(),
        attackCooldown: 0,
      };
      this.players.set(socket.id, player);
      this.playerByName.set(finalName, socket.id);

      socket.emit('init', {
        you: { id: socket.id, name: finalName },
        world: this.world.serialize(),
        players: this._allPlayersPublic(),
        mobs: [...this.mobs.values()].map((m) => m.serialize()),
        state: this._playerPrivate(player),
      });
      socket.broadcast.emit('playerJoin', this._publicPlayer(player));
      this._persistNow();
    });

    socket.on('input', (msg) => this._onInput(socket, msg));
    socket.on('dig', (msg) => this._onDig(socket, msg));
    socket.on('place', (msg) => this._onPlace(socket, msg));
    socket.on('attackMob', (msg) => this._onAttackMob(socket, msg));
    socket.on('attackPlayer', (msg) => this._onAttackPlayer(socket, msg));
    socket.on('sell', (msg) => this._onSell(socket, msg));
    socket.on('upgrade', (msg) => this._onUpgrade(socket, msg));
    socket.on('respawn', () => this._onRespawn(socket));
    socket.on('chat', (msg) => this._onChat(socket, msg));

    socket.on('disconnect', () => {
      const p = this.players.get(socket.id);
      if (!p) return;
      this.players.delete(socket.id);
      this.playerByName.delete(p.name);
      this.io.emit('playerLeave', { id: socket.id });
      this._persistNow();
    });
  }

  _allPlayersPublic() {
    const arr = [];
    for (const p of this.players.values()) arr.push(this._publicPlayer(p));
    return arr;
  }

  _publicPlayer(p) {
    return { id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, alive: p.alive };
  }

  _playerPrivate(p) {
    return { coins: p.coins, inv: p.inv, tools: p.tools, hp: p.hp, alive: p.alive };
  }

  _onInput(socket, msg) {
    const p = this.players.get(socket.id);
    if (!p || !msg) return;
    if (typeof msg.x === 'number' && Number.isFinite(msg.x)) p.x = msg.x;
    if (typeof msg.y === 'number' && Number.isFinite(msg.y)) p.y = msg.y;
    if (typeof msg.z === 'number' && Number.isFinite(msg.z)) p.z = msg.z;
    if (typeof msg.yaw === 'number' && Number.isFinite(msg.yaw)) p.yaw = msg.yaw;
    if (typeof msg.pitch === 'number' && Number.isFinite(msg.pitch)) p.pitch = msg.pitch;
    p.lastInputAt = Date.now();
  }

  _onDig(socket, msg) {
    const p = this.players.get(socket.id);
    if (!p || !p.alive || !msg) return;
    const x = msg.x | 0, y = msg.y | 0, z = msg.z | 0;
    if (!this.world.inBounds(x, y, z)) return;
    // Reach check.
    const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
    if (Math.hypot(p.x - cx, p.y - cy, p.z - cz) > REACH + 1) return;

    const b = this.world.getBlock(x, y, z);
    if (b === BLOCK.AIR || b === BLOCK.WATER || b === BLOCK.BEDROCK || b === BLOCK.SHOP) return;

    const req = BLOCK_TOOL[b];
    if (!req) return;
    if (req.kind === 0) {
      if (p.tools.shovel < req.tier) return socket.emit('flash', { msg: 'Нужна лопата получше' });
    } else if (req.kind === 1) {
      if (p.tools.pickaxe < req.tier) return socket.emit('flash', { msg: `Нужна ${TOOL_TIER_NAMES[req.tier].toLowerCase()} кирка` });
    }

    if (!this.world.setBlock(x, y, z, BLOCK.AIR)) return;
    this.io.emit('block', { x, y, z, type: BLOCK.AIR });

    const drop = BLOCK_DROP[b];
    if (drop) {
      p.inv[drop.resource] = (p.inv[drop.resource] || 0) + drop.count;
      socket.emit('inv', this._playerPrivate(p));
    }
    this._persistNow();
  }

  _onPlace(socket, msg) {
    const p = this.players.get(socket.id);
    if (!p || !p.alive || !msg) return;
    const x = msg.x | 0, y = msg.y | 0, z = msg.z | 0;
    if (!this.world.inBounds(x, y, z)) return;
    const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
    if (Math.hypot(p.x - cx, p.y - cy, p.z - cz) > REACH + 1) return;
    if (this.world.getBlock(x, y, z) !== BLOCK.AIR) return;
    // Don't allow placing inside a player
    for (const op of this.players.values()) {
      if (Math.floor(op.x) === x && Math.floor(op.z) === z &&
          (Math.floor(op.y) === y || Math.floor(op.y + 1) === y)) return;
    }
    // Only allow placing blocks the player has in inventory.
    const res = msg.resource;
    const placeable = { dirt: BLOCK.DIRT, stone: BLOCK.STONE, sand: BLOCK.SAND, wood: BLOCK.WOOD };
    const type = placeable[res];
    if (!type || (p.inv[res] || 0) <= 0) return;
    p.inv[res]--;
    this.world.setBlock(x, y, z, type);
    this.io.emit('block', { x, y, z, type });
    socket.emit('inv', this._playerPrivate(p));
    this._persistNow();
  }

  _onAttackMob(socket, msg) {
    const p = this.players.get(socket.id);
    if (!p || !p.alive || !msg) return;
    const mob = this.mobs.get(msg.id | 0);
    if (!mob || !mob.alive) return;
    const d = Math.hypot(p.x - mob.x, p.y - mob.y, p.z - mob.z);
    if (d > REACH + 1) return;
    if (p.attackCooldown > Date.now()) return;
    p.attackCooldown = Date.now() + 350;
    const kind = (msg.weapon === 'shovel') ? 0 : 1;
    const tier = kind === 0 ? p.tools.shovel : p.tools.pickaxe;
    const dmg = TOOL_DAMAGE[kind][Math.max(0, Math.min(4, tier))];
    const killed = mob.takeDamage(dmg);
    this.io.emit('mobHit', { id: mob.id, hp: Math.max(0, mob.hp) });
    if (killed) {
      const drop = mob.randomCoinDrop();
      p.coins += drop;
      this.mobs.delete(mob.id);
      this.io.emit('mobDespawn', { id: mob.id });
      socket.emit('flash', { msg: `Монстр убит. +${drop} монет` });
      socket.emit('inv', this._playerPrivate(p));
      this._persistNow();
    }
  }

  _onAttackPlayer(socket, msg) {
    const a = this.players.get(socket.id);
    if (!a || !a.alive || !msg) return;
    const target = this.players.get(msg.id);
    if (!target || !target.alive || target.id === a.id) return;
    const d = Math.hypot(a.x - target.x, a.y - target.y, a.z - target.z);
    if (d > REACH + 1) return;
    if (a.attackCooldown > Date.now()) return;
    a.attackCooldown = Date.now() + 400;
    const kind = (msg.weapon === 'shovel') ? 0 : 1;
    const tier = kind === 0 ? a.tools.shovel : a.tools.pickaxe;
    const dmg = TOOL_DAMAGE[kind][Math.max(0, Math.min(4, tier))];
    target.hp = Math.max(0, target.hp - dmg);
    this.io.emit('playerHit', { id: target.id, by: a.id, hp: target.hp });
    if (target.hp <= 0) {
      target.alive = false;
      // PvP kill: attacker gets half the victim's coins.
      const reward = Math.floor(target.coins / 2);
      target.coins -= reward;
      a.coins += reward;
      this.io.emit('playerDied', { id: target.id, by: a.id });
      target.socket.emit('flash', { msg: `Тебя убил ${a.name}. -${reward} монет` });
      socket.emit('flash', { msg: `Убил ${target.name}. +${reward} монет` });
      socket.emit('inv', this._playerPrivate(a));
      target.socket.emit('inv', this._playerPrivate(target));
      this._persistNow();
    }
  }

  _onSell(socket, msg) {
    const p = this.players.get(socket.id);
    if (!p || !msg) return;
    if (!this._nearShop(p)) return socket.emit('flash', { msg: 'Подойди к торговцу' });
    const res = msg.resource;
    if (!(res in SELL_PRICE)) return;
    const count = Math.max(1, Math.min(99999, msg.count | 0 || 1));
    const have = p.inv[res] || 0;
    const n = Math.min(have, count);
    if (n <= 0) return;
    p.inv[res] = have - n;
    p.coins += SELL_PRICE[res] * n;
    socket.emit('inv', this._playerPrivate(p));
    socket.emit('flash', { msg: `Продал ${n} ${res} → +${SELL_PRICE[res] * n}` });
    this._persistNow();
  }

  _onUpgrade(socket, msg) {
    const p = this.players.get(socket.id);
    if (!p || !msg) return;
    if (!this._nearShop(p)) return socket.emit('flash', { msg: 'Подойди к торговцу' });
    const kind = msg.kind === 'shovel' ? 'shovel' : 'pickaxe';
    const kIdx = kind === 'shovel' ? 0 : 1;
    const tier = p.tools[kind];
    if (tier >= 4) return socket.emit('flash', { msg: 'Максимальный уровень' });
    const cost = UPGRADE_COST[kIdx][tier];
    if (p.coins < cost) return socket.emit('flash', { msg: 'Не хватает монет' });
    p.coins -= cost;
    p.tools[kind] = tier + 1;
    socket.emit('inv', this._playerPrivate(p));
    socket.emit('flash', { msg: `${kind === 'shovel' ? 'Лопата' : 'Кирка'} → ${TOOL_TIER_NAMES[tier + 1]}` });
    this._persistNow();
  }

  _onRespawn(socket) {
    const p = this.players.get(socket.id);
    if (!p) return;
    p.hp = PLAYER_MAX_HP;
    p.alive = true;
    const s = this.world.spawnPos;
    p.x = s.x; p.y = s.y; p.z = s.z;
    socket.emit('inv', this._playerPrivate(p));
    this.io.emit('playerRespawn', { id: p.id, x: p.x, y: p.y, z: p.z, hp: p.hp });
  }

  _onChat(socket, msg) {
    const p = this.players.get(socket.id);
    if (!p || !msg || typeof msg.text !== 'string') return;
    const text = msg.text.slice(0, 200);
    if (!text.trim()) return;
    this.io.emit('chat', { from: p.name, text });
  }

  _nearShop(p) {
    const s = this.world.shopPos;
    return Math.hypot(p.x - (s.x + 0.5), p.y - s.y, p.z - (s.z + 0.5)) <= 3.5;
  }

  _tick() {
    const now = Date.now();
    const dt = Math.max(0.001, Math.min(0.5, (now - this.lastTick) / 1000));
    this.lastTick = now;

    // Update mobs.
    for (const m of this.mobs.values()) {
      m.tick(dt, this.world, this.players);
    }

    // Spawn mobs occasionally.
    if (this.mobs.size < MAX_MOBS && now >= this.mobRespawnAt) {
      const spawn = findCaveSpawn(this.world, this.players);
      if (spawn) {
        const m = new Mob(spawn.x, spawn.y, spawn.z);
        this.mobs.set(m.id, m);
        this.io.emit('mobSpawn', m.serialize());
      }
      this.mobRespawnAt = now + (MOB_RESPAWN_TIME * 1000) * 0.5;
    }

    // Broadcast moving entities.
    const movingPlayers = [...this.players.values()].map((p) => ({
      id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, hp: p.hp, alive: p.alive,
    }));
    const movingMobs = [...this.mobs.values()].map((m) => ({
      id: m.id, x: m.x, y: m.y, z: m.z, hp: m.hp,
    }));
    this.io.emit('tick', { players: movingPlayers, mobs: movingMobs });
  }
}
