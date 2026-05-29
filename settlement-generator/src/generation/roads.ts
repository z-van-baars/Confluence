import type { GenerationParameters, LayoutData, Road, RoadType, Point, Wall } from '../core/types';
import { SeededRNG } from '../core/rng';
import { distance, smoothPath, pathLength, pointInPolygon, segmentIntersection } from '../core/geometry';

export function generateRoads(
  layout: LayoutData,
  params: GenerationParameters,
  rng: SeededRNG,
  walls: Wall[] = [],
): Road[] {
  let seq = 0;
  const nextId = () => `road-${seq++}`;

  const baseRoads = voronoiRoads(layout, params, rng, nextId);

  if (!params.hasWalls || walls.length === 0) return baseRoads;

  return clipToWalls(baseRoads, walls, nextId);
}

// ── Voronoi-based roads ─────────────────────────────────────────────────────

function voronoiRoads(
  layout: LayoutData,
  params: GenerationParameters,
  rng: SeededRNG,
  nextId: () => string,
): Road[] {
  const { edges, center, radius } = layout;
  const roads: Road[] = [];
  const sorted = [...edges].sort((a, b) => b.importance - a.importance);
  const keepCount = Math.floor(sorted.length * (0.4 + params.roadDensity * 0.5));

  for (let i = 0; i < sorted.length; i++) {
    const edge = sorted[i];
    if (i >= keepCount && rng.chance(0.7)) continue;

    const mid: Point = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
    const type = classifyRoad(edge.importance, distance(mid, center) / radius);

    let path: Point[] = [edge.a, edge.b];
    if (params.organicness > 0.3 && type !== 'highway') {
      path = addCurvature(path, params.organicness, rng);
    }

    roads.push({ id: nextId(), path, width: roadWidth(type), type });
  }

  return roads;
}

// ── Wall clipping ───────────────────────────────────────────────────────────

function clipToWalls(
  roads: Road[],
  walls: Wall[],
  nextId: () => string,
): Road[] {
  const sortedWalls = [...walls].sort((a, b) => a.layer - b.layer);
  const outerWall = sortedWalls[sortedWalls.length - 1];
  const outerPoly = { points: outerWall.path.slice(0, -1) };

  const result: Road[] = [];

  for (const road of roads) {
    for (const piece of splitAtWalls(road.path, sortedWalls)) {
      if (piece.path.length < 2 || pathLength(piece.path) < 5) continue;

      const mid = piece.path[Math.floor(piece.path.length / 2)];
      const insideOuter = pointInPolygon(mid, outerPoly);

      // Keep if inside the outermost wall, or if it exited through a gate
      // (piece.fromGate = true means the piece starts at a gate crossing)
      if (!insideOuter && !piece.fromGate) continue;

      result.push({ ...road, id: nextId(), path: piece.path });
    }
  }

  return result;
}

interface RoadPiece {
  path: Point[];
  fromGate: boolean; // true when this piece starts at a gate crossing
}

function splitAtWalls(path: Point[], walls: Wall[]): RoadPiece[] {
  const pieces: RoadPiece[] = [];
  let current: Point[] = [path[0]];
  // Tracks whether the next piece to be opened started at a gate crossing
  let nextFromGate = false;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];

    const crossings: { t: number; point: Point; isGate: boolean }[] = [];

    for (const wall of walls) {
      for (let j = 0; j < wall.path.length - 1; j++) {
        const hit = segmentIntersection(a, b, wall.path[j], wall.path[j + 1]);
        if (!hit || hit.t < 0.01 || hit.t > 0.99) continue;

        const isGate = wall.gates.some(g => distance(hit.point, g.position) < g.width + 12);
        crossings.push({ t: hit.t, point: hit.point, isGate });
      }
    }

    crossings.sort((x, y) => x.t - y.t);
    const unique = crossings.filter((c, idx) => idx === 0 || c.t - crossings[idx - 1].t > 0.02);

    for (const crossing of unique) {
      // Always split at every wall crossing — gate or not
      current.push(crossing.point);
      if (current.length >= 2) {
        pieces.push({ path: current, fromGate: nextFromGate });
      }
      nextFromGate = crossing.isGate;
      current = [crossing.point];
    }

    current.push(b);
  }

  if (current.length >= 2) pieces.push({ path: current, fromGate: nextFromGate });
  return pieces;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function classifyRoad(importance: number, normalizedDist: number): RoadType {
  if (importance > 0.85 && normalizedDist < 0.3) return 'highway';
  if (importance > 0.6) return 'main';
  if (importance > 0.35) return 'secondary';
  if (normalizedDist > 0.7) return 'path';
  return 'alley';
}

function roadWidth(type: RoadType): number {
  switch (type) {
    case 'highway': return 8;
    case 'main': return 5;
    case 'secondary': return 3.5;
    case 'alley': return 2;
    case 'path': return 1.5;
  }
}

function addCurvature(path: Point[], organicness: number, rng: SeededRNG): Point[] {
  if (path.length < 2) return path;
  const subdivided: Point[] = [path[0]];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const subs = Math.max(1, Math.floor(distance(a, b) / 20));
    for (let j = 1; j <= subs; j++) {
      const t = j / subs;
      subdivided.push({
        x: a.x + (b.x - a.x) * t + rng.gaussian(0, organicness * 3),
        y: a.y + (b.y - a.y) * t + rng.gaussian(0, organicness * 3),
      });
    }
  }
  return smoothPath(subdivided, 2);
}
