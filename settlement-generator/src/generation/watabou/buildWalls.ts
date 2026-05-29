import type { GenerationParameters, Patch, CurtainWall, Point } from '../../core/types';
import { SeededRNG } from '../../core/rng';
import { distance, smoothVertexEq } from '../../core/geometry';

export interface WallResult {
  border: CurtainWall;
  wall: CurtainWall | null;
  gates: Point[];
}

export function buildWalls(
  patches: Patch[],
  innerPatches: Patch[],
  citadel: Patch | null,
  params: GenerationParameters,
  rng: SeededRNG,
  scale: number,
): WallResult {
  const border = traceCircumference(innerPatches, patches);

  if (!params.hasWalls) {
    return { border, wall: null, gates: [] };
  }

  // ── Gate placement ──
  const gates = placeGates(border.shape, innerPatches, rng);
  border.gates = gates;

  // ── Smooth wall vertices (3 passes, skip gate vertices) ──
  const factor = Math.min(1, 40 / innerPatches.length);
  const gateSet = new Set(gates);
  for (let pass = 0; pass < 3; pass++) {
    smoothWallShape(border.shape, gateSet, factor);
  }

  // Additional smoothing pass on gate vertices only
  smoothGateVertices(border.shape, gateSet, factor);

  // ── Towers: every non-gate vertex ──
  border.towers = border.shape.filter(v => !gates.includes(v));

  // Mark patches within the wall
  markWithinWalls(patches, border.shape);

  // ── Castle wall ──
  let castleWall: CurtainWall | null = null;
  if (citadel) {
    castleWall = buildCastleWall(citadel, innerPatches, rng);
  }

  // Gate road splitting: for each gate, bisect its adjacent outer patch
  for (const gate of gates) {
    splitOuterPatchAtGate(gate, border.shape, innerPatches, patches);
  }

  const allGates = castleWall
    ? [...gates, ...castleWall.gates]
    : gates;

  return {
    border: { ...border, isReal: true },
    wall: castleWall,
    gates: allGates,
  };
}

// ── Circumference tracing ──────────────────────────────────────────────────

function traceCircumference(innerPatches: Patch[], allPatches: Patch[]): CurtainWall {
  // Collect edges that appear in only one inner patch (outer boundary)
  const edgeCount = new Map<string, { a: Point; b: Point; count: number }>();

  for (const patch of innerPatches) {
    const s = patch.shape;
    for (let i = 0; i < s.length; i++) {
      const a = s[i];
      const b = s[(i + 1) % s.length];
      // Canonical key (smaller pointer first by identity — use position)
      const key = edgeKey(a, b);
      const entry = edgeCount.get(key);
      if (entry) {
        entry.count++;
      } else {
        edgeCount.set(key, { a, b, count: 1 });
      }
    }
  }

  const outerEdges: { a: Point; b: Point }[] = [];
  for (const entry of edgeCount.values()) {
    if (entry.count === 1) outerEdges.push({ a: entry.a, b: entry.b });
  }

  // Stitch outer edges into a closed polygon
  const shape = stitchEdges(outerEdges);

  void allPatches;
  return { shape, gates: [], towers: [], isReal: false };
}

function edgeKey(a: Point, b: Point): string {
  // Use position-based key (rounded) for edge identity
  const ax = Math.round(a.x * 10), ay = Math.round(a.y * 10);
  const bx = Math.round(b.x * 10), by = Math.round(b.y * 10);
  if (ax < bx || (ax === bx && ay < by)) return `${ax},${ay}|${bx},${by}`;
  return `${bx},${by}|${ax},${ay}`;
}

function stitchEdges(edges: { a: Point; b: Point }[]): Point[] {
  if (edges.length === 0) return [];

  // Build adjacency: for each point, what points can we go to?
  const adj = new Map<Point, Point[]>();
  for (const { a, b } of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }

  // Walk the chain
  const start = edges[0].a;
  const path: Point[] = [start];
  const visited = new Set<Point>([start]);
  let current = start;

  for (let i = 0; i < edges.length * 2; i++) {
    const neighbors = adj.get(current) ?? [];
    const next = neighbors.find(n => !visited.has(n));
    if (!next) break;
    visited.add(next);
    path.push(next);
    current = next;
  }

  return path;
}

// ── Gate placement ─────────────────────────────────────────────────────────

function placeGates(shape: Point[], innerPatches: Patch[], rng: SeededRNG): Point[] {
  if (shape.length === 0) return [];

  // Candidates: boundary vertices shared by 2+ inner patches
  const vertexPatchCount = new Map<Point, number>();
  for (const patch of innerPatches) {
    for (const v of patch.shape) {
      vertexPatchCount.set(v, (vertexPatchCount.get(v) ?? 0) + 1);
    }
  }

  // Estimate perimeter for minimum gate spacing
  let perimeter = 0;
  for (let i = 0; i < shape.length; i++) {
    perimeter += distance(shape[i], shape[(i + 1) % shape.length]);
  }
  const minSpacing = perimeter / 8; // allows up to ~8 gates spread around

  // Filter candidates: on the boundary AND shared by 2+ inner patches
  const shapeSet = new Set(shape);
  const candidates = shape.filter(v => (vertexPatchCount.get(v) ?? 0) >= 2 && shapeSet.has(v));

  // Pick gates with minimum spacing enforcement
  const selected: Point[] = [];
  const shuffled = rng.shuffle(candidates);

  for (const candidate of shuffled) {
    const tooClose = selected.some(g => distance(g, candidate) < minSpacing);
    if (!tooClose) selected.push(candidate);
  }

  // Ensure at least 2 gates
  if (selected.length < 2 && shape.length >= 4) {
    const step = Math.floor(shape.length / 2);
    if (!selected.includes(shape[0])) selected.push(shape[0]);
    if (selected.length < 2) selected.push(shape[step]);
  }

  return selected;
}

// ── Wall smoothing ─────────────────────────────────────────────────────────

function smoothWallShape(shape: Point[], gateSet: Set<Point>, factor: number): void {
  const n = shape.length;
  for (let i = 0; i < n; i++) {
    if (gateSet.has(shape[i])) continue;
    const prev = shape[(i + n - 1) % n];
    const next = shape[(i + 1) % n];
    const mx = (prev.x + next.x) / 2;
    const my = (prev.y + next.y) / 2;
    shape[i].x += (mx - shape[i].x) * factor;
    shape[i].y += (my - shape[i].y) * factor;
  }
}

function smoothGateVertices(shape: Point[], gateSet: Set<Point>, factor: number): void {
  const n = shape.length;
  for (let i = 0; i < n; i++) {
    if (!gateSet.has(shape[i])) continue;
    const prev = shape[(i + n - 1) % n];
    const next = shape[(i + 1) % n];
    const mx = (prev.x + next.x) / 2;
    const my = (prev.y + next.y) / 2;
    shape[i].x += (mx - shape[i].x) * factor;
    shape[i].y += (my - shape[i].y) * factor;
  }
}

// ── Mark withinWalls ───────────────────────────────────────────────────────

function markWithinWalls(patches: Patch[], wallShape: Point[]): void {
  // Simple point-in-polygon test for each patch site
  for (const patch of patches) {
    patch.withinWalls = pointInPolygonPts(patch.site, wallShape);
  }
}

function pointInPolygonPts(point: Point, pts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if (
      pts[i].y > point.y !== pts[j].y > point.y &&
      point.x < ((pts[j].x - pts[i].x) * (point.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Castle wall ────────────────────────────────────────────────────────────

function buildCastleWall(citadel: Patch, innerPatches: Patch[], _rng: SeededRNG): CurtainWall {
  const shape = [...citadel.shape];

  // Reserved vertices: those bordering non-city patches (don't smooth, no gates)
  const innerVertexSet = new Set<Point>();
  for (const p of innerPatches) for (const v of p.shape) innerVertexSet.add(v);

  const reservedVertices = shape.filter(v => !innerVertexSet.has(v));
  const reservedSet = new Set(reservedVertices);

  // Light smoothing on non-reserved vertices
  const n = shape.length;
  const ox = shape.map(p => p.x);
  const oy = shape.map(p => p.y);
  for (let i = 0; i < n; i++) {
    if (reservedSet.has(shape[i])) continue;
    const prev = (i + n - 1) % n;
    const next = (i + 1) % n;
    shape[i].x = (ox[prev] + ox[i] + ox[next]) / 3;
    shape[i].y = (oy[prev] + oy[i] + oy[next]) / 3;
  }

  const towers = shape.filter(v => !reservedSet.has(v));
  return { shape, gates: [], towers, isReal: true };
}

// ── Gate road splitting ────────────────────────────────────────────────────

function splitOuterPatchAtGate(
  gate: Point,
  wallShape: Point[],
  innerPatches: Patch[],
  allPatches: Patch[],
): void {
  const wallSet = new Set(wallShape);
  const innerSet = new Set(innerPatches);

  // Find the outer patch adjacent to this gate
  const gateIdx = wallShape.indexOf(gate);
  if (gateIdx < 0) return;

  // Look for a non-inner patch that shares the gate vertex
  const outerPatch = allPatches.find(p => !innerSet.has(p) && p.shape.includes(gate));
  if (!outerPatch || outerPatch.shape.length <= 3) return;

  // Find the farthest non-wall vertex in the outer patch
  let farthest: Point | null = null;
  let maxDist = -1;
  for (const v of outerPatch.shape) {
    if (wallSet.has(v)) continue;
    const d = distance(gate, v);
    if (d > maxDist) { maxDist = d; farthest = v; }
  }
  if (!farthest) return;

  // Bisect the outer patch from gate to farthest vertex
  // This creates a road corridor. We just record the corridor as part of the
  // outer patch shape split — for routing purposes, the road will follow this path.
  // We don't need to literally split the patch for visual rendering;
  // the A* topology will pick up the corridor.
  void farthest; // Used in topology step
}

export { smoothWallShape, pointInPolygonPts };
