import type { Point, Polygon, BoundingBox } from './types';

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function midpoint(a: Point, b: Point): Point {
  return lerp(a, b, 0.5);
}

export function angle(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function rotatePoint(p: Point, center: Point, radians: number): Point {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function polygonArea(poly: Polygon): number {
  const pts = poly.points;
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return Math.abs(area / 2);
}

export function polygonCentroid(poly: Polygon): Point {
  const pts = poly.points;
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const cross = pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    cx += (pts[j].x + pts[i].x) * cross;
    cy += (pts[j].y + pts[i].y) * cross;
    a += cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-10) {
    const sum = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / pts.length, y: sum.y / pts.length };
  }
  cx /= (6 * a);
  cy /= (6 * a);
  return { x: cx, y: cy };
}

export function polygonBounds(poly: Polygon): BoundingBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function pointInPolygon(point: Point, poly: Polygon): boolean {
  const pts = poly.points;
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

export function insetPolygon(poly: Polygon, amount: number): Polygon {
  const pts = poly.points;
  if (pts.length < 3) return poly;

  const centroid = polygonCentroid(poly);
  const inset: Point[] = [];

  for (const p of pts) {
    const dx = p.x - centroid.x;
    const dy = p.y - centroid.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < amount) continue;
    const scale = (d - amount) / d;
    inset.push({
      x: centroid.x + dx * scale,
      y: centroid.y + dy * scale,
    });
  }

  return { points: inset.length >= 3 ? inset : pts };
}

export function pathLength(path: Point[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += distance(path[i - 1], path[i]);
  }
  return len;
}

export function smoothPath(path: Point[], iterations: number = 2): Point[] {
  let current = path;
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: Point[] = [current[0]];
    for (let i = 1; i < current.length - 1; i++) {
      smoothed.push({
        x: current[i - 1].x * 0.25 + current[i].x * 0.5 + current[i + 1].x * 0.25,
        y: current[i - 1].y * 0.25 + current[i].y * 0.5 + current[i + 1].y * 0.25,
      });
    }
    smoothed.push(current[current.length - 1]);
    current = smoothed;
  }
  return current;
}

// Returns the intersection point and parametric t along segment [a1,a2], or null if none.
export function segmentIntersection(
  a1: Point, a2: Point,
  b1: Point, b2: Point,
): { point: Point; t: number } | null {
  const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null;
  const dx3 = b1.x - a1.x, dy3 = b1.y - a1.y;
  const t = (dx3 * dy2 - dy3 * dx2) / denom;
  const u = (dx3 * dy1 - dy3 * dx1) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { point: { x: a1.x + t * dx1, y: a1.y + t * dy1 }, t };
}

// ── Watabou geometry primitives ─────────────────────────────────────────────

export function isConvex(pts: Point[]): boolean {
  const n = pts.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const c = pts[(i + 2) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-10) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// In-place 3-point weighted smoothing. If closed=false (default), endpoints are fixed.
export function smoothVertexEq(pts: Point[], factor: number, closed = false): void {
  const n = pts.length;
  if (n < 3) return;
  const ox = pts.map(p => p.x);
  const oy = pts.map(p => p.y);
  const denom = factor + 2;
  const start = closed ? 0 : 1;
  const end = closed ? n : n - 1;
  for (let i = start; i < end; i++) {
    const prev = (i + n - 1) % n;
    const next = (i + 1) % n;
    pts[i].x = (ox[prev] + factor * ox[i] + ox[next]) / denom;
    pts[i].y = (oy[prev] + factor * oy[i] + oy[next]) / denom;
  }
}

// Bisect a polygon along an infinite line through p1→p2. Returns [left, right]
// sub-polygons (left = positive side of p1→p2). If gap > 0, each half's cut
// edge is shortened by gap/2 on each end, creating an alley gap between halves.
export function polygonCut(
  pts: Point[],
  p1: Point,
  p2: Point,
  gap: number,
): [Point[], Point[]] | null {
  const n = pts.length;
  if (n < 3) return null;

  const cdx = p2.x - p1.x;
  const cdy = p2.y - p1.y;
  const sideOf = (p: Point) => cdx * (p.y - p1.y) - cdy * (p.x - p1.x);
  const sides = pts.map(sideOf);

  const left: Point[] = [];
  const right: Point[] = [];
  const cutInLeft: Point[] = [];
  const cutInRight: Point[] = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const sa = sides[i];
    const sb = sides[j];

    if (sa >= 0) left.push({ x: pts[i].x, y: pts[i].y });
    else right.push({ x: pts[i].x, y: pts[i].y });

    const diff = sa - sb;
    if (Math.abs(diff) > 1e-10 && ((sa < 0) !== (sb < 0))) {
      const t = sa / diff;
      const cx = pts[i].x + t * (pts[j].x - pts[i].x);
      const cy = pts[i].y + t * (pts[j].y - pts[i].y);
      const cutL: Point = { x: cx, y: cy };
      const cutR: Point = { x: cx, y: cy };
      left.push(cutL);
      right.push(cutR);
      cutInLeft.push(cutL);
      cutInRight.push(cutR);
    }
  }

  if (left.length < 3 || right.length < 3 || cutInLeft.length < 2) return null;

  if (gap > 0) {
    applyCutGap(left, cutInLeft, gap / 2);
    applyCutGap(right, cutInRight, gap / 2);
  }

  return [left, right];
}

function applyCutGap(pts: Point[], cutPts: Point[], d: number): void {
  for (const cp of cutPts) {
    const idx = pts.indexOf(cp);
    if (idx < 0) continue;
    const n = pts.length;
    const prev = pts[(idx + n - 1) % n];
    const next = pts[(idx + 1) % n];
    const prevIsCut = cutPts.includes(prev);
    const neighbor = prevIsCut ? next : prev;
    const dx = neighbor.x - cp.x;
    const dy = neighbor.y - cp.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > d * 2) {
      cp.x += (dx / len) * d;
      cp.y += (dy / len) * d;
    }
  }
}

// Per-edge inset for convex polygons. depths[i] is the inset for the edge
// from pts[i] to pts[(i+1)%n]. Returns null if degenerate.
export function polygonShrink(pts: Point[], depths: number[]): Point[] | null {
  const n = pts.length;
  if (n < 3 || depths.length !== n) return null;

  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;

  // Compute offset lines: each edge moved inward by depths[i]
  const oe: { ax: number; ay: number; bx: number; by: number }[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-10) return null;
    let nx = dy / len;
    let ny = -dx / len;
    // Flip normal to point inward (toward centroid)
    const mx = (pts[i].x + pts[j].x) / 2;
    const my = (pts[i].y + pts[j].y) / 2;
    if (nx * (cx - mx) + ny * (cy - my) < 0) { nx = -nx; ny = -ny; }
    const d = depths[i];
    oe.push({
      ax: pts[i].x + nx * d, ay: pts[i].y + ny * d,
      bx: pts[j].x + nx * d, by: pts[j].y + ny * d,
    });
  }

  // New vertices = pairwise intersections of adjacent offset lines
  const result: Point[] = [];
  for (let k = 0; k < n; k++) {
    const prev = (k + n - 1) % n;
    const p = lineLineIntersect2(
      oe[prev].ax, oe[prev].ay, oe[prev].bx, oe[prev].by,
      oe[k].ax, oe[k].ay, oe[k].bx, oe[k].by,
    );
    if (!p) {
      result.push({ x: (oe[prev].bx + oe[k].ax) / 2, y: (oe[prev].by + oe[k].ay) / 2 });
    } else {
      result.push(p);
    }
  }

  return result.length >= 3 ? result : null;
}

// Per-edge inset for concave polygons. Same as shrink but resolves
// self-intersections by clipping out "ear" regions.
export function polygonBuffer(pts: Point[], depths: number[]): Point[] | null {
  const shrunk = polygonShrink(pts, depths);
  if (!shrunk) return null;
  const cleaned = removeEars(shrunk);
  return cleaned.length >= 3 ? cleaned : null;
}

function removeEars(pts: Point[]): Point[] {
  let current = pts;
  for (let iter = 0; iter < 8; iter++) {
    const n = current.length;
    if (n < 3) break;
    let found = false;
    for (let i = 0; i < n && !found; i++) {
      const ni = (i + 1) % n;
      for (let j = i + 2; j < n && !found; j++) {
        const nj = (j + 1) % n;
        if (j === n - 1 && i === 0) continue;
        const hit = segmentIntersection(current[i], current[ni], current[j], current[nj]);
        if (hit) {
          const next: Point[] = [];
          for (let k = 0; k <= i; k++) next.push(current[k]);
          next.push(hit.point);
          for (let k = nj; k < n; k++) next.push(current[k]);
          if (next.length >= 3) { current = next; found = true; }
        }
      }
    }
    if (!found) break;
  }
  return current;
}

// Shorten the edge at edgeIdx by moving each endpoint d units toward
// its outer neighbor. Returns a new Point[] (does not mutate).
export function polygonPeel(pts: Point[], edgeIdx: number, d: number): Point[] {
  const n = pts.length;
  const result = pts.map(p => ({ x: p.x, y: p.y }));
  const si = edgeIdx;
  const ei = (edgeIdx + 1) % n;
  const pi = (si + n - 1) % n;
  const ni = (ei + 1) % n;

  const moveBy = (target: Point, toward: Point, dist: number) => {
    const dx = toward.x - target.x;
    const dy = toward.y - target.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > dist * 2) {
      target.x += (dx / len) * dist;
      target.y += (dy / len) * dist;
    }
  };

  moveBy(result[si], result[pi], d);
  moveBy(result[ei], result[ni], d);
  return result;
}

function lineLineIntersect2(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): Point | null {
  const d1x = bx - ax, d1y = by - ay;
  const d2x = dx - cx, d2y = dy - cy;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / denom;
  return { x: ax + t * d1x, y: ay + t * d1y };
}

const ALLEY_WIDTH = 2.5;

// Watabou-style subdivision: cuts from a point ON the longest edge (not centroid),
// with randomized cut position, angular deviation for large polygons, and optional
// alley gap between sub-blocks. rand must be a seeded function for reproducibility.
export function subdividePolygon(
  poly: Polygon,
  minArea: number,
  rand: () => number,
  gridChaos = 0.5,
  sizeChaos = 0.6,
  emptyProb = 0.04,
  split = true,
): Polygon[] {
  const area = polygonArea(poly);
  const pts = poly.points;

  if (area < minArea * 0.2 || pts.length < 3) {
    return rand() > emptyProb ? [poly] : [];
  }

  // Find longest edge
  let longestLen = 0;
  let longestIdx = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    const len = dx * dx + dy * dy;
    if (len > longestLen) { longestLen = len; longestIdx = i; }
  }

  const v = pts[longestIdx];
  const next = pts[(longestIdx + 1) % pts.length];

  // Cut point on the longest edge — randomized around the midpoint
  const spread = 0.8 * gridChaos;
  const ratio = (1 - spread) / 2 + rand() * spread;
  const cutPoint = lerp(v, next, ratio);

  // Angular deviation — suppressed near minimum size so final buildings are rectangular
  const angleSpread = area > minArea * 4 ? (Math.PI / 6) * gridChaos : 0;
  const angleRad = (rand() - 0.5) * angleSpread;

  // Perpendicular to edge with optional rotation
  const edgeDx = next.x - v.x;
  const edgeDy = next.y - v.y;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const rx = edgeDx * cosA - edgeDy * sinA;
  const ry = edgeDy * cosA + edgeDx * sinA;
  const p2: Point = { x: cutPoint.x - ry, y: cutPoint.y + rx };

  const halves = polygonCut(pts, cutPoint, p2, split ? ALLEY_WIDTH : 0);
  if (!halves) return rand() > emptyProb ? [poly] : [];

  const results: Polygon[] = [];
  for (const half of halves) {
    if (half.length < 3) continue;
    const halfPoly: Polygon = { points: half };
    const halfArea = polygonArea(halfPoly);
    const threshold = minArea * Math.pow(2, 4 * sizeChaos * (rand() - 0.5));

    if (halfArea < threshold) {
      if (rand() > emptyProb) results.push(halfPoly);
    } else {
      const doSplit = halfArea > minArea / (rand() * rand() + 0.001);
      results.push(...subdividePolygon(halfPoly, minArea, rand, gridChaos, sizeChaos, emptyProb, doSplit));
    }
  }

  return results;
}

// Legacy centroid-based bisection kept for comparison.
export function subdividePolygonLegacy(
  poly: Polygon,
  minArea: number,
): Polygon[] {
  const area = polygonArea(poly);
  if (area <= minArea) return [poly];

  const pts = poly.points;
  if (pts.length < 3) return [poly];

  let longestLen = 0;
  let edgeDx = 1, edgeDy = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    const len = dx * dx + dy * dy;
    if (len > longestLen) {
      longestLen = len;
      const l = Math.sqrt(len);
      edgeDx = dx / l;
      edgeDy = dy / l;
    }
  }

  const centroid = polygonCentroid(poly);
  const splitDx = -edgeDy;
  const splitDy = edgeDx;

  const left: Point[] = [];
  const right: Point[] = [];

  for (let i = 0; i < pts.length; i++) {
    const next = pts[(i + 1) % pts.length];
    const currDist = (pts[i].x - centroid.x) * splitDy - (pts[i].y - centroid.y) * splitDx;
    const nextDist = (next.x - centroid.x) * splitDy - (next.y - centroid.y) * splitDx;

    if (currDist >= 0) left.push(pts[i]);
    else right.push(pts[i]);

    if ((currDist >= 0) !== (nextDist >= 0)) {
      const t = currDist / (currDist - nextDist);
      const intersection = lerp(pts[i], next, Math.max(0, Math.min(1, t)));
      left.push(intersection);
      right.push(intersection);
    }
  }

  const results: Polygon[] = [];
  if (left.length >= 3) results.push(...subdividePolygonLegacy({ points: left }, minArea));
  if (right.length >= 3) results.push(...subdividePolygonLegacy({ points: right }, minArea));
  return results.length > 0 ? results : [poly];
}
