// Builds a textured BufferGeometry for a chunk of voxels.
// One geometry per chunk; UVs from an atlas; vertex colors carry directional
// shading + per-vertex ambient occlusion for more "real" looking edges.

import { BLOCK, BLOCK_OPAQUE, CHUNK_SIZE } from './constants.js';

// Each face of a unit cube. Corners are listed in canonical UV order:
//   0 = bottom-left in texture, 1 = top-left, 2 = top-right, 3 = bottom-right.
// `aoNbrs[i]` are the three world-space offsets (relative to the block) for
// vertex `i`: [side1, side2, corner], all on the OUTSIDE of the face.
// NOTE: per-face shading is intentionally NOT baked into vertex colors here —
// Lambert lighting from the scene already shades each face according to its
// normal, and baking a second shade on top led to nearly-pitch-black bottoms
// that looked like "transparent" holes through blocks. Vertex colors carry
// only AO.
const FACES = [
  { // +X
    dir: [1, 0, 0], faceName: 'side',
    corners: [[1,0,1],[1,1,1],[1,1,0],[1,0,0]],
    aoNbrs: [
      [[1,-1, 0],[1, 0, 1],[1,-1, 1]],
      [[1, 1, 0],[1, 0, 1],[1, 1, 1]],
      [[1, 1, 0],[1, 0,-1],[1, 1,-1]],
      [[1,-1, 0],[1, 0,-1],[1,-1,-1]],
    ],
  },
  { // -X
    dir: [-1, 0, 0], faceName: 'side',
    corners: [[0,0,0],[0,1,0],[0,1,1],[0,0,1]],
    aoNbrs: [
      [[-1,-1, 0],[-1, 0,-1],[-1,-1,-1]],
      [[-1, 1, 0],[-1, 0,-1],[-1, 1,-1]],
      [[-1, 1, 0],[-1, 0, 1],[-1, 1, 1]],
      [[-1,-1, 0],[-1, 0, 1],[-1,-1, 1]],
    ],
  },
  { // +Y (top)
    dir: [0, 1, 0], faceName: 'top',
    corners: [[0,1,1],[0,1,0],[1,1,0],[1,1,1]],
    aoNbrs: [
      [[-1, 1, 0],[ 0, 1, 1],[-1, 1, 1]],
      [[-1, 1, 0],[ 0, 1,-1],[-1, 1,-1]],
      [[ 1, 1, 0],[ 0, 1,-1],[ 1, 1,-1]],
      [[ 1, 1, 0],[ 0, 1, 1],[ 1, 1, 1]],
    ],
  },
  { // -Y (bottom)
    dir: [0, -1, 0], faceName: 'bottom',
    corners: [[0,0,0],[0,0,1],[1,0,1],[1,0,0]],
    aoNbrs: [
      [[-1,-1, 0],[ 0,-1,-1],[-1,-1,-1]],
      [[-1,-1, 0],[ 0,-1, 1],[-1,-1, 1]],
      [[ 1,-1, 0],[ 0,-1, 1],[ 1,-1, 1]],
      [[ 1,-1, 0],[ 0,-1,-1],[ 1,-1,-1]],
    ],
  },
  { // +Z
    dir: [0, 0, 1], faceName: 'side',
    corners: [[0,0,1],[0,1,1],[1,1,1],[1,0,1]],
    aoNbrs: [
      [[-1, 0, 1],[ 0,-1, 1],[-1,-1, 1]],
      [[-1, 0, 1],[ 0, 1, 1],[-1, 1, 1]],
      [[ 1, 0, 1],[ 0, 1, 1],[ 1, 1, 1]],
      [[ 1, 0, 1],[ 0,-1, 1],[ 1,-1, 1]],
    ],
  },
  { // -Z
    dir: [0, 0, -1], faceName: 'side',
    corners: [[1,0,0],[1,1,0],[0,1,0],[0,0,0]],
    aoNbrs: [
      [[ 1, 0,-1],[ 0,-1,-1],[ 1,-1,-1]],
      [[ 1, 0,-1],[ 0, 1,-1],[ 1, 1,-1]],
      [[-1, 0,-1],[ 0, 1,-1],[-1, 1,-1]],
      [[-1, 0,-1],[ 0,-1,-1],[-1,-1,-1]],
    ],
  },
];

// Classic voxel AO: 0..3, lower = darker corner.
function vertexAO(s1, s2, c) {
  if (s1 && s2) return 0;
  return 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (c ? 1 : 0));
}
// Gentle AO: darken sharp corners but never to the point where they read as
// holes in the block. (We removed baked per-face shading, so the only thing
// this number multiplies is the texture × scene lighting — keep it subtle.)
const AO_FACTORS = [0.78, 0.88, 0.95, 1.0];

function solidAt(world, x, y, z) {
  const b = world.getBlock(x, y, z);
  return b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.LEAVES;
}

// Returns BufferGeometry data: positions, normals, colors, uvs, indices.
// opts.uvFor(blockId, faceName) -> [u0,v0,u1,v1]
// opts.onlyWater: only emit water faces (water is its own translucent pass)
export function meshChunk(world, ox, oy, oz, opts = {}) {
  const onlyWater = !!opts.onlyWater;
  const uvFor = opts.uvFor;
  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  let vert = 0;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const x = ox + lx, y = oy + ly, z = oz + lz;
        const b = world.getBlock(x, y, z);
        if (b === BLOCK.AIR) continue;
        const isWater = b === BLOCK.WATER;
        if (onlyWater !== isWater) continue;

        for (const face of FACES) {
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          const nb = world.getBlock(nx, ny, nz);
          if (isWater) {
            if (nb !== BLOCK.AIR) continue;
          } else {
            if (BLOCK_OPAQUE(nb)) continue;
          }

          const [u0, v0, u1, v1] = uvFor
            ? uvFor(b, face.faceName)
            : [0, 0, 1, 1];

          const aoVals = [1, 1, 1, 1];
          if (!isWater) {
            for (let i = 0; i < 4; i++) {
              const [s1, s2, cc] = face.aoNbrs[i];
              const o1 = solidAt(world, x + s1[0], y + s1[1], z + s1[2]);
              const o2 = solidAt(world, x + s2[0], y + s2[1], z + s2[2]);
              const oc = solidAt(world, x + cc[0], y + cc[1], z + cc[2]);
              aoVals[i] = AO_FACTORS[vertexAO(o1, o2, oc)];
            }
          }

          const uvCorner = [
            [u0, v1], // 0: bottom-left in texture
            [u0, v0], // 1: top-left
            [u1, v0], // 2: top-right
            [u1, v1], // 3: bottom-right
          ];
          for (let i = 0; i < 4; i++) {
            const c = face.corners[i];
            positions.push(x + c[0], y + c[1], z + c[2]);
            normals.push(face.dir[0], face.dir[1], face.dir[2]);
            const k = aoVals[i];
            colors.push(k, k, k);
            uvs.push(uvCorner[i][0], uvCorner[i][1]);
          }

          // Flip diagonal to hide AO seams.
          // Winding is intentionally CCW when viewed from the *outside* of the
          // block (i.e. from the +face.dir side) so default backface culling
          // (THREE.FrontSide) renders the face from the correct side. Earlier
          // revisions used the opposite winding here, which made every block
          // face render the OPPOSITE face of its own cube — invisible from the
          // outside in most cases (saved by adjacent blocks' opposite faces
          // standing in), but it produced sky-coloured "transparent" gaps on
          // exposed faces of leaves / lone blocks where there was nothing on
          // the far side to fill in. The two triangulations below are the same
          // quad, split along different diagonals to hide AO seams.
          const flip = aoVals[0] + aoVals[2] > aoVals[1] + aoVals[3];
          if (flip) {
            indices.push(vert, vert + 2, vert + 1, vert, vert + 3, vert + 2);
          } else {
            indices.push(vert + 1, vert + 3, vert + 2, vert + 1, vert, vert + 3);
          }
          vert += 4;
        }
      }
    }
  }
  return { positions, normals, colors, uvs, indices };
}
