import { Delaunay } from 'd3-delaunay';
import type { GenerationParameters, LayoutData, VoronoiCell, LayoutEdge, Point, TerrainData } from '../core/types';
import { SeededRNG } from '../core/rng';
import { distance, polygonArea } from '../core/geometry';
import { POPULATION_RANGES } from '../core/parameters';

interface RingConfig {
  count: number;
  radiusFactor: number;
  jitter: number;
}

const SIZE_RINGS: Record<string, RingConfig[]> = {
  hamlet: [
    { count: 5, radiusFactor: 0.2, jitter: 0.3 },
    { count: 8, radiusFactor: 0.45, jitter: 0.4 },
  ],
  village: [
    { count: 6, radiusFactor: 0.15, jitter: 0.2 },
    { count: 10, radiusFactor: 0.35, jitter: 0.3 },
    { count: 14, radiusFactor: 0.6, jitter: 0.35 },
  ],
  town: [
    { count: 8, radiusFactor: 0.1, jitter: 0.15 },
    { count: 14, radiusFactor: 0.25, jitter: 0.25 },
    { count: 20, radiusFactor: 0.45, jitter: 0.3 },
    { count: 16, radiusFactor: 0.7, jitter: 0.35 },
  ],
  city: [
    { count: 10, radiusFactor: 0.08, jitter: 0.1 },
    { count: 16, radiusFactor: 0.18, jitter: 0.2 },
    { count: 24, radiusFactor: 0.32, jitter: 0.25 },
    { count: 30, radiusFactor: 0.5, jitter: 0.3 },
    { count: 24, radiusFactor: 0.7, jitter: 0.35 },
  ],
  metropolis: [
    { count: 12, radiusFactor: 0.06, jitter: 0.08 },
    { count: 20, radiusFactor: 0.14, jitter: 0.15 },
    { count: 28, radiusFactor: 0.24, jitter: 0.2 },
    { count: 36, radiusFactor: 0.36, jitter: 0.25 },
    { count: 40, radiusFactor: 0.5, jitter: 0.28 },
    { count: 32, radiusFactor: 0.68, jitter: 0.32 },
    { count: 24, radiusFactor: 0.85, jitter: 0.35 },
  ],
};

export function generateLayout(
  params: GenerationParameters,
  terrain: TerrainData,
  rng: SeededRNG,
): LayoutData {
  const { width, height } = params;
  const center: Point = { x: width / 2, y: height / 2 };

  if (params.coastDirection === 'north') center.y = height * 0.58;
  else if (params.coastDirection === 'south') center.y = height * 0.42;
  else if (params.coastDirection === 'east') center.x = width * 0.42;
  else if (params.coastDirection === 'west') center.x = width * 0.58;

  const baseRadius = Math.min(width, height) * 0.4;
  const wallRadius = params.hasWalls ? baseRadius * 0.55 : baseRadius * 0.8;

  const { settlement: settlementPoints, boundaryStart } =
    generateSeedPoints(center, baseRadius, params, terrain, rng);

  const flat = settlementPoints.flatMap(p => [p.x, p.y]);
  const delaunay = new Delaunay(Float64Array.from(flat));
  const voronoi = delaunay.voronoi([0, 0, width, height]);

  const cells: VoronoiCell[] = [];
  for (let i = 0; i < settlementPoints.length; i++) {
    const cellPoly = voronoi.cellPolygon(i);
    if (!cellPoly) continue;

    const points = cellPoly.map(([x, y]: [number, number]) => ({ x, y }));
    const polygon = { points };

    const neighbors: number[] = [];
    for (const n of voronoi.neighbors(i)) {
      neighbors.push(n);
    }

    const dist = distance(settlementPoints[i], center);
    const isBoundary = i >= boundaryStart;

    const baseDensity = isBoundary ? 0 : densityFalloff(dist, wallRadius, baseRadius);
    const baseWealth = isBoundary ? 0 : wealthFalloff(dist, wallRadius);

    cells.push({
      id: i,
      site: settlementPoints[i],
      polygon,
      neighbors,
      distanceToCenter: dist,
      area: polygonArea(polygon),
      density: baseDensity,
      wealth: baseWealth,
      districtType: null,
      isBoundary,
    });
  }

  const edges = extractEdges(voronoi, settlementPoints, center, baseRadius);

  return { seedPoints: settlementPoints, cells, edges, center, radius: baseRadius, wallRadius };
}

function densityFalloff(dist: number, wallRadius: number, layoutRadius: number): number {
  if (dist < wallRadius * 0.3) return 0.9;
  if (dist < wallRadius * 0.7) return 0.8 - (dist / wallRadius) * 0.3;
  if (dist < wallRadius) return 0.5 - ((dist - wallRadius * 0.7) / (wallRadius * 0.3)) * 0.3;
  const beyond = (dist - wallRadius) / (layoutRadius - wallRadius);
  return Math.max(0, 0.15 - beyond * 0.15);
}

function wealthFalloff(dist: number, wallRadius: number): number {
  if (dist < wallRadius * 0.3) return 0.85;
  if (dist < wallRadius) return 0.7 - (dist / wallRadius) * 0.4;
  return 0.1;
}

interface SeedPointResult {
  settlement: Point[];
  boundaryStart: number;
}

function isInWater(
  p: Point,
  params: GenerationParameters,
  terrain: TerrainData,
): boolean {
  if (params.coastDirection !== 'none' && terrain.coastline && terrain.coastline.length > 1) {
    const coast = terrain.coastline;
    let coastY: number | undefined;
    let coastX: number | undefined;

    if (params.coastDirection === 'north' || params.coastDirection === 'south') {
      for (let i = 0; i < coast.length - 1; i++) {
        if ((coast[i].x <= p.x && coast[i + 1].x >= p.x) ||
            (coast[i].x >= p.x && coast[i + 1].x <= p.x)) {
          const t = (p.x - coast[i].x) / (coast[i + 1].x - coast[i].x);
          coastY = coast[i].y + t * (coast[i + 1].y - coast[i].y);
          break;
        }
      }
      if (coastY !== undefined) {
        if (params.coastDirection === 'north' && p.y < coastY) return true;
        if (params.coastDirection === 'south' && p.y > coastY) return true;
      }
    } else {
      for (let i = 0; i < coast.length - 1; i++) {
        if ((coast[i].y <= p.y && coast[i + 1].y >= p.y) ||
            (coast[i].y >= p.y && coast[i + 1].y <= p.y)) {
          const t = (p.y - coast[i].y) / (coast[i + 1].y - coast[i].y);
          coastX = coast[i].x + t * (coast[i + 1].x - coast[i].x);
          break;
        }
      }
      if (coastX !== undefined) {
        if (params.coastDirection === 'east' && p.x > coastX) return true;
        if (params.coastDirection === 'west' && p.x < coastX) return true;
      }
    }
  }

  for (const w of terrain.water) {
    if (w.type === 'river' && w.path) {
      const riverW = (w.width ?? 10) * 0.6;
      for (const rp of w.path) {
        if (distance(p, rp) < riverW) return true;
      }
    }
  }

  return false;
}

function generateSeedPoints(
  center: Point,
  baseRadius: number,
  params: GenerationParameters,
  terrain: TerrainData,
  rng: SeededRNG,
): SeedPointResult {
  const popRange = POPULATION_RANGES[params.size];
  const popMid = (popRange[0] + popRange[1]) / 2;
  const popFactor = Math.min(2.0, Math.max(0.4, 0.6 + (params.population / popMid) * 0.4));

  const points: Point[] = [center];
  const rings = SIZE_RINGS[params.size] ?? SIZE_RINGS.town;
  const organicness = params.organicness;

  for (const ring of rings) {
    const scaledCount = Math.max(3, Math.round(ring.count * popFactor));
    for (let i = 0; i < scaledCount; i++) {
      const baseAngle = (i / scaledCount) * Math.PI * 2;
      const angle = baseAngle + rng.range(-0.4, 0.4) * organicness;
      const r = baseRadius * ring.radiusFactor * (1 + rng.range(-ring.jitter, ring.jitter) * organicness);

      const p = {
        x: center.x + Math.cos(angle) * r,
        y: center.y + Math.sin(angle) * r,
      };

      if (!isInWater(p, params, terrain)) {
        points.push(p);
      }
    }
  }

  const scatterCount = Math.floor(points.length * 0.2 * organicness);
  for (let i = 0; i < scatterCount; i++) {
    const p = rng.pointInCircle(center, baseRadius * 0.9);
    if (!isInWater(p, params, terrain)) {
      points.push(p);
    }
  }

  const boundaryStart = points.length;

  const boundaryCount = 32;
  const boundaryRadius = baseRadius * 1.15;
  for (let i = 0; i < boundaryCount; i++) {
    const angle = (i / boundaryCount) * Math.PI * 2;
    const r = boundaryRadius + rng.range(-5, 5);
    points.push({
      x: center.x + Math.cos(angle) * r,
      y: center.y + Math.sin(angle) * r,
    });
  }

  return { settlement: points, boundaryStart };
}

function extractEdges(
  voronoi: ReturnType<typeof Delaunay.prototype.voronoi>,
  points: Point[],
  center: Point,
  radius: number,
): LayoutEdge[] {
  const edges: LayoutEdge[] = [];
  const seen = new Set<string>();
  let edgeId = 0;

  for (let i = 0; i < points.length; i++) {
    for (const j of voronoi.neighbors(i)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const cellI = voronoi.cellPolygon(i);
      const cellJ = voronoi.cellPolygon(j);
      if (!cellI || !cellJ) continue;

      const shared = findSharedEdge(cellI, cellJ);
      if (!shared) continue;

      const edgeMid = {
        x: (shared.a.x + shared.b.x) / 2,
        y: (shared.a.y + shared.b.y) / 2,
      };
      const distToCenter = distance(edgeMid, center);
      const importance = Math.max(0, 1 - distToCenter / radius);

      edges.push({
        id: edgeId++,
        a: shared.a,
        b: shared.b,
        leftCell: i,
        rightCell: j,
        importance,
      });
    }
  }

  return edges;
}

function findSharedEdge(
  cellA: [number, number][],
  cellB: [number, number][],
): { a: Point; b: Point } | null {
  const threshold = 1;
  const shared: Point[] = [];

  for (const [ax, ay] of cellA) {
    for (const [bx, by] of cellB) {
      if (Math.abs(ax - bx) < threshold && Math.abs(ay - by) < threshold) {
        shared.push({ x: ax, y: ay });
      }
    }
  }

  if (shared.length >= 2) {
    return { a: shared[0], b: shared[shared.length - 1] };
  }
  return null;
}
