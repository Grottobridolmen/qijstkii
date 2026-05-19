// Shared constants between server and client.
// Mirrored in public/js/constants.js — keep in sync.

export const WORLD_SIZE_X = 64;
export const WORLD_SIZE_Z = 64;
export const WORLD_SIZE_Y = 64; // height
export const SEA_LEVEL = 28;

export const CHUNK_SIZE = 16;

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  COAL: 5,
  IRON: 6,
  GOLD: 7,
  DIAMOND: 8,
  BEDROCK: 9,
  WOOD: 10,
  LEAVES: 11,
  WATER: 12,
  SHOP: 13, // marker block for trader location
};

// What kind of tool is required, and what minimum tier.
// kind: 0 = shovel, 1 = pickaxe, -1 = any (hand)
export const BLOCK_TOOL = {
  [BLOCK.GRASS]: { kind: 0, tier: 0 },
  [BLOCK.DIRT]: { kind: 0, tier: 0 },
  [BLOCK.SAND]: { kind: 0, tier: 0 },
  [BLOCK.STONE]: { kind: 1, tier: 0 },
  [BLOCK.COAL]: { kind: 1, tier: 0 },
  [BLOCK.IRON]: { kind: 1, tier: 1 }, // need stone pickaxe+
  [BLOCK.GOLD]: { kind: 1, tier: 2 }, // need iron pickaxe+
  [BLOCK.DIAMOND]: { kind: 1, tier: 3 }, // need gold pickaxe+
  [BLOCK.WOOD]: { kind: -1, tier: 0 },
  [BLOCK.LEAVES]: { kind: -1, tier: 0 },
  [BLOCK.BEDROCK]: { kind: 1, tier: 99 }, // never
  [BLOCK.SHOP]: { kind: -1, tier: 99 }, // never
};

// Dig time in seconds for the right tool at tier 0; halved per tier above.
export const BLOCK_DIG_TIME = {
  [BLOCK.GRASS]: 0.25,
  [BLOCK.DIRT]: 0.3,
  [BLOCK.SAND]: 0.25,
  [BLOCK.STONE]: 0.9,
  [BLOCK.COAL]: 1.1,
  [BLOCK.IRON]: 1.4,
  [BLOCK.GOLD]: 1.6,
  [BLOCK.DIAMOND]: 2.0,
  [BLOCK.WOOD]: 0.7,
  [BLOCK.LEAVES]: 0.2,
};

// Resource the block yields (if any).
export const BLOCK_DROP = {
  [BLOCK.COAL]: { resource: 'coal', count: 1 },
  [BLOCK.IRON]: { resource: 'iron', count: 1 },
  [BLOCK.GOLD]: { resource: 'gold', count: 1 },
  [BLOCK.DIAMOND]: { resource: 'diamond', count: 1 },
  [BLOCK.DIRT]: { resource: 'dirt', count: 1 },
  [BLOCK.GRASS]: { resource: 'dirt', count: 1 },
  [BLOCK.SAND]: { resource: 'sand', count: 1 },
  [BLOCK.STONE]: { resource: 'stone', count: 1 },
  [BLOCK.WOOD]: { resource: 'wood', count: 1 },
};

export const TOOL_TIER = {
  WOOD: 0,
  STONE: 1,
  IRON: 2,
  GOLD: 3,
  DIAMOND: 4,
};

export const TOOL_TIER_NAMES = ['Деревянная', 'Каменная', 'Железная', 'Золотая', 'Алмазная'];

// Damage dealt per hit by tool kind & tier. Used for both mob combat and PvP.
export const TOOL_DAMAGE = {
  // shovel
  0: [1, 2, 3, 4, 5],
  // pickaxe
  1: [2, 3, 4, 6, 8],
};

// Resource sell prices (per unit), in coins.
export const SELL_PRICE = {
  coal: 2,
  iron: 8,
  gold: 25,
  diamond: 120,
  dirt: 0, // worthless
  sand: 0,
  stone: 1,
  wood: 1,
};

// Upgrade prices: cost to go from tier N to tier N+1, per kind (0=shovel,1=pickaxe).
// Indexed by current tier.
export const UPGRADE_COST = {
  0: [10, 40, 150, 500], // shovel
  1: [15, 60, 220, 700], // pickaxe
};

export const PLAYER_MAX_HP = 20;
export const MOB_MAX_HP = 8;
export const MOB_DAMAGE = 2;
export const MOB_SPEED = 2.2;
export const MOB_DETECT_RADIUS = 12;
export const MOB_RESPAWN_TIME = 30; // seconds
export const MOB_COIN_DROP = [3, 6]; // min, max

export const REACH = 5.0; // max distance for dig/place/attack

// Tick rates
export const SERVER_TICK_HZ = 10;
export const PLAYER_BROADCAST_HZ = 10;
