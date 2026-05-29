import type { Patch, Artery, Point } from '../../core/types';
import { distance, smoothVertexEq } from '../../core/geometry';
import type { Graph } from './topology';
import { aStar } from './topology';

export function buildStreets(
  innerPatches: Patch[],
  graph: Graph,
  plaza: Patch | null,
  center: Point,
  gates: Point[],
): { arteries: Artery[]; streets: Artery[]; roads: Artery[] } {
  const streets: Artery[] = [];
  const roads: Artery[] = [];
  let seq = 0;

  // ── Inner streets: each gate → plaza (or center) ──
  const plazaTarget = plazaCornerClosestTo(plaza, gates[0] ?? center);

  for (const gate of gates) {
    const target = plaza ? plazaCornerClosestTo(plaza, gate) : center;
    const path = aStar(gate, target, graph, true);
    if (path && path.length >= 2) {
      streets.push({ id: `street-${seq++}`, path, isStreet: true });
    }
  }

  // ── Outer roads: each gate → outward farthest node ──
  // Gates are inner vertices (shared with inner patches), so we pass gateSet
  // to allow them as traversal nodes even in the outer (useInner=false) A* pass.
  const gateSet = new Set(gates);
  for (const gate of gates) {
    const gateNode = graph.nodes.get(gate);
    if (!gateNode) continue;

    // Direction: normalize from center through gate
    const dx = gate.x - center.x;
    const dy = gate.y - center.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len;
    const ny = dy / len;

    // Target: outer node farthest in gate's outward direction
    let bestNode: Point | null = null;
    let bestScore = -Infinity;
    for (const node of graph.outerNodes) {
      const px = node.point.x - gate.x;
      const py = node.point.y - gate.y;
      const dot = px * nx + py * ny;
      if (dot > bestScore) { bestScore = dot; bestNode = node.point; }
    }

    if (bestNode) {
      const path = aStar(gate, bestNode, graph, false, gateSet);
      if (path && path.length >= 2) {
        roads.push({ id: `road-${seq++}`, path, isStreet: false });
      }
    }
  }

  // ── Deduplication ──
  const allPaths = [...streets, ...roads];
  const dedupedStreets = deduplicate(streets, plaza);
  const dedupedRoads = deduplicate(roads, null);

  void allPaths; // suppress unused warning

  // ── Smooth each artery ──
  for (const artery of [...dedupedStreets, ...dedupedRoads]) {
    if (artery.path.length >= 3) {
      smoothVertexEq(artery.path, 3);
    }
  }

  void plazaTarget; // used above

  const arteries = [...dedupedStreets, ...dedupedRoads];
  return { arteries, streets: dedupedStreets, roads: dedupedRoads };
}

function plazaCornerClosestTo(plaza: Patch | null, from: Point): Point {
  if (!plaza || plaza.shape.length === 0) return from;
  let closest = plaza.shape[0];
  let minDist = distance(from, closest);
  for (const v of plaza.shape) {
    const d = distance(from, v);
    if (d < minDist) { minDist = d; closest = v; }
  }
  return closest;
}

// Remove duplicate directed segments and stitch remaining into polylines
function deduplicate(arteries: Artery[], plaza: Patch | null): Artery[] {
  const plazaEdges = new Set<string>();
  if (plaza) {
    const s = plaza.shape;
    for (let i = 0; i < s.length; i++) {
      plazaEdges.add(segKey(s[i], s[(i + 1) % s.length]));
      plazaEdges.add(segKey(s[(i + 1) % s.length], s[i]));
    }
  }

  // Collect all directed segments, dedup by identity
  const seen = new Set<string>();
  const segments: { a: Point; b: Point }[] = [];

  for (const artery of arteries) {
    const path = artery.path;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const key = segKey(a, b);
      const revKey = segKey(b, a);
      if (seen.has(key) || seen.has(revKey)) continue;
      if (plazaEdges.has(key)) continue;
      seen.add(key);
      segments.push({ a, b });
    }
  }

  // Stitch segments into polylines
  return stitchSegments(segments, arteries[0]?.isStreet ?? true);
}

function stitchSegments(segments: { a: Point; b: Point }[], isStreet: boolean): Artery[] {
  if (segments.length === 0) return [];

  // Build adjacency
  const next = new Map<Point, Point>();
  const prev = new Map<Point, Point>();
  for (const { a, b } of segments) {
    next.set(a, b);
    prev.set(b, a);
  }

  // Find segment starts (no predecessor)
  const starts = segments
    .map(s => s.a)
    .filter(p => !prev.has(p));

  const used = new Set<Point>();
  const arteries: Artery[] = [];
  let seq = 0;

  const walkFrom = (start: Point): Point[] => {
    const path: Point[] = [start];
    let curr = start;
    while (true) {
      const n = next.get(curr);
      if (!n || used.has(n)) break;
      path.push(n);
      curr = n;
    }
    return path;
  };

  for (const start of starts) {
    if (used.has(start)) continue;
    const path = walkFrom(start);
    if (path.length >= 2) {
      for (const p of path) used.add(p);
      arteries.push({ id: `artery-${seq++}`, path, isStreet });
    }
  }

  return arteries;
}

function segKey(a: Point, b: Point): string {
  return `${Math.round(a.x * 10)},${Math.round(a.y * 10)}>${Math.round(b.x * 10)},${Math.round(b.y * 10)}`;
}
