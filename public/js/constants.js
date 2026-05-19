// Client-side mirror of server/constants.js. Keep in sync.
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
  SHOP: 13,
};

// Block colors (top, side, bottom).
export const BLOCK_COLORS = {
  [BLOCK.GRASS]:   { top: 0x4caf50, side: 0x7b5d3b, bottom: 0x6b4d2b },
  [BLOCK.DIRT]:    { top: 0x7b5d3b, side: 0x7b5d3b, bottom: 0x7b5d3b },
  [BLOCK.SAND]:    { top: 0xe6cf90, side: 0xe6cf90, bottom: 0xe6cf90 },
  [BLOCK.STONE]:   { top: 0x888888, side: 0x808080, bottom: 0x707070 },
  [BLOCK.COAL]:    { top: 0x303030, side: 0x303030, bottom: 0x303030 },
  [BLOCK.IRON]:    { top: 0xc8a47c, side: 0xc8a47c, bottom: 0xc8a47c },
  [BLOCK.GOLD]:    { top: 0xe6c34a, side: 0xe6c34a, bottom: 0xe6c34a },
  [BLOCK.DIAMOND]: { top: 0x66e0e6, side: 0x66e0e6, bottom: 0x66e0e6 },
  [BLOCK.BEDROCK]: { top: 0x222222, side: 0x222222, bottom: 0x222222 },
  [BLOCK.WOOD]:    { top: 0x9b6b3f, side: 0x6b4b22, bottom: 0x9b6b3f },
  [BLOCK.LEAVES]:  { top: 0x2e7d32, side: 0x2e7d32, bottom: 0x2e7d32 },
  [BLOCK.WATER]:   { top: 0x2196f3, side: 0x2196f3, bottom: 0x2196f3 },
  [BLOCK.SHOP]:    { top: 0xffcc00, side: 0xffaa00, bottom: 0x885500 },
};

export const BLOCK_TRANSPARENT = new Set([BLOCK.AIR, BLOCK.WATER, BLOCK.LEAVES]);
export const BLOCK_OPAQUE = (b) => b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.LEAVES;

export const TOOL_TIER_NAMES = ['Деревянная', 'Каменная', 'Железная', 'Золотая', 'Алмазная'];

export const SELL_PRICE = {
  coal: 2,
  iron: 8,
  gold: 25,
  diamond: 120,
  dirt: 0,
  sand: 0,
  stone: 1,
  wood: 1,
};

export const UPGRADE_COST = {
  shovel:  [10, 40, 150, 500],
  pickaxe: [15, 60, 220, 700],
};

export const RESOURCE_NAMES = {
  coal: 'Уголь',
  iron: 'Железо',
  gold: 'Золото',
  diamond: 'Алмаз',
  dirt: 'Земля',
  sand: 'Песок',
  stone: 'Камень',
  wood: 'Дерево',
};

export const PLACEABLE_RESOURCES = ['dirt', 'stone', 'sand', 'wood'];

export const REACH = 5.0;
export const PLAYER_MAX_HP = 20;
