import { Delaunay } from 'd3-delaunay';
import type { GenerationParameters, Patch, Point } from '../../core/types';
import { SeededRNG } from '../../core/rng';
import { distance, polygonCentroid } from '../../core/geometry';

// Patch count by settlement size
const N_PATCHES: Record<string, number> = {
  hamlet: 15,
  village: 30,
  town: 60,
  city: 100,
  metropolis: 180,
};

export interface PatchResult {
  patches: Patch[];
  innerPatches: Patch[];
  citadel: Patch | null;
  plaza: Patch | null;
  center: Point;
  scale: number;
}

export function buildPatches(params: GenerationParameters, rng: SeededRNG): PatchResult {
  const { width, height } = params;
  const center: Point = { x: width / 2, y: height / 2 };
  const nPatches = N_PATCHES[params.size] ?? 60;

  // Scale factor: calibrates spiral so the nPatches-th point lands at cityRadius.
  // Spiral avg radius at index i ≈ S*(10 + i*2.5), so for index=nPatches:
  //   S*(10 + nPatches*2.5) = cityRadius  →  S = cityRadius / (10 + nPatches*2.5)
  const cityRadius = Math.min(width, height) * 0.38;
  const S = cityRadius / (10 + nPatches * 2.5);

  // ── Step 1: Archimedean spiral seed points ──
  const sa = rng.range(0, Math.PI * 2);
  const spiralPts: Point[] = [{ x: center.x, y: center.y }];

  const totalSpiralPts = nPatches * 8;
  for (let i = 1; i < totalSpiralPts; i++) {
    const a = sa + Math.sqrt(i) * 5;
    const r = 10 * S + i * (2 * S + rng.range(0, S));
    spiralPts.push({
      x: center.x + Math.cos(a) * r,
      y: center.y + Math.sin(a) * r,
    });
  }

  // ── Step 2: Voronoi via d3-delaunay ──
  const buildVoronoi = (pts: Point[]) => {
    const flat = Float64Array.from(pts.flatMap(p => [p.x, p.y]));
    const delaunay = new Delaunay(flat);
    return delaunay.voronoi([0, 0, width, height]);
  };

  let voronoi = buildVoronoi(spiralPts);

  // Extract shared-reference polygon vertices from Voronoi
  // We build a vertex pool so adjacent cells share the same Point objects
  const extractPatches = (): Patch[] => {
    const vertexPool = new Map<string, Point>();

    const getVertex = (x: number, y: number): Point => {
      const key = `${Math.round(x * 10)},${Math.round(y * 10)}`;
      let v = vertexPool.get(key);
      if (!v) {
        v = { x, y };
        vertexPool.set(key, v);
      }
      return v;
    };

    const result: Patch[] = [];
    for (let i = 0; i < spiralPts.length; i++) {
      const cell = voronoi.cellPolygon(i);
      if (!cell) continue;
      // d3-delaunay closes the polygon (first === last), drop the duplicate
      const rawPts = cell.slice(0, -1) as [number, number][];
      const shape = rawPts.map(([x, y]) => getVertex(x, y));
      result.push({
        id: i,
        shape,
        site: { x: spiralPts[i].x, y: spiralPts[i].y },
        withinCity: false,
        withinWalls: false,
        wardType: null,
        geometry: [],
      });
    }
    return result;
  };

  let patches = extractPatches();

  // ── Step 3: Partial Lloyd relaxation ──
  // Relax cells 0, 1, 2 and cell nPatches (3 iterations)
  const relaxIndices = [0, 1, 2, nPatches].filter(i => i < patches.length);

  for (let iter = 0; iter < 3; iter++) {
    for (const idx of relaxIndices) {
      const cell = voronoi.cellPolygon(idx);
      if (!cell) continue;
      const rawPts = cell.slice(0, -1).map(([x, y]: [number, number]) => ({ x, y }));
      const centroid = polygonCentroid({ points: rawPts });
      spiralPts[idx].x = centroid.x;
      spiralPts[idx].y = centroid.y;
    }
    voronoi = buildVoronoi(spiralPts);
  }

  // Re-extract patches after relaxation (shared vertices must be rebuilt)
  patches = extractPatches();

  // ── Step 4: Sort by distance, select inner patches ──
  const sorted = [...patches].sort(
    (a, b) => distance(a.site, center) - distance(b.site, center),
  );

  const innerPatches = sorted.slice(0, nPatches);
  for (const p of innerPatches) p.withinCity = true;

  const citadel = params.hasCastle && sorted.length > nPatches ? sorted[nPatches] : null;
  if (citadel) citadel.withinCity = true;

  // Plaza = innermost patch (closest to center)
  const plaza = innerPatches[0] ?? null;

  // ── Step 5: Junction optimization ──
  // Merge vertices that are < 8*S apart — mutate shared Point objects in place
  const threshold = 8 * S;
  const allCityPatches = citadel ? [...innerPatches, citadel] : innerPatches;

  for (const patch of allCityPatches) {
    const shape = patch.shape;
    for (let vi = 0; vi < shape.length; vi++) {
      const v0 = shape[vi];
      const v1 = shape[(vi + 1) % shape.length];
      if (distance(v0, v1) >= threshold) continue;

      // Merge v1 into v0: update all patches that reference v1
      const mx = (v0.x + v1.x) / 2;
      const my = (v0.y + v1.y) / 2;
      v0.x = mx;
      v0.y = my;

      for (const other of patches) {
        for (let k = 0; k < other.shape.length; k++) {
          if (other.shape[k] === v1) other.shape[k] = v0;
        }
      }
    }
  }

  // Remove consecutive duplicate vertices introduced by merging
  for (const patch of patches) {
    patch.shape = deduplicateVertices(patch.shape);
  }

  return { patches, innerPatches, citadel, plaza, center, scale: S };
}

function deduplicateVertices(shape: Point[]): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < shape.length; i++) {
    const curr = shape[i];
    const next = shape[(i + 1) % shape.length];
    if (curr !== next) result.push(curr);
  }
  return result;
}
