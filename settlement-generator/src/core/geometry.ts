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

export function subdividePolygon(
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
  if (left.length >= 3) results.push(...subdividePolygon({ points: left }, minArea));
  if (right.length >= 3) results.push(...subdividePolygon({ points: right }, minArea));
  return results.length > 0 ? results : [poly];
}
