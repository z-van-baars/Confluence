import type { GenerationParameters, Patch, Artery, CurtainWall, Point } from '../../core/types';
import { SeededRNG } from '../../core/rng';
import {
  polygonArea,
  polygonCut,
  polygonShrink,
  polygonBuffer,
  isConvex,
} from '../../core/geometry';

// Street width constants in Watabou model units (unscaled).
// Each side is inset by half the street width.
const MAIN_STREET_HALF = 1.0;
const REGULAR_STREET_HALF = 0.5;
const ALLEY_HALF = 0.3;

// Polsby–Popper compactness threshold: rejects thin slivers and acute triangles.
// Square ≈ 0.79, equilateral triangle ≈ 0.60, thin slivers approach 0.
const MIN_BUILDING_COMPACTNESS = 0.18;

// Ward-specific createAlleys parameters. minSq is in Watabou model units² (unscaled).
interface WardParams {
  minSq: number;
  gridChaos: number;
  sizeChaos: number;
  emptyProb: number;
}

const WARD_PARAMS_BASE: Record<string, WardParams> = {
  craftsmen:      { minSq: 50,  gridChaos: 0.6, sizeChaos: 0.6, emptyProb: 0.04 },
  slum:           { minSq: 20,  gridChaos: 0.8, sizeChaos: 0.8, emptyProb: 0.03 },
  merchant:       { minSq: 80,  gridChaos: 0.6, sizeChaos: 0.7, emptyProb: 0.15 },
  patriciate:     { minSq: 80,  gridChaos: 0.5, sizeChaos: 0.7, emptyProb: 0.15 },
  gate:           { minSq: 35,  gridChaos: 0.6, sizeChaos: 0.7, emptyProb: 0.04 },
  administration: { minSq: 70,  gridChaos: 0.4, sizeChaos: 0.5, emptyProb: 0.10 },
  cathedral:      { minSq: 120, gridChaos: 0.3, sizeChaos: 0.4, emptyProb: 0.20 },
  military:       { minSq: 70,  gridChaos: 0.3, sizeChaos: 0.4, emptyProb: 0.05 },
  park:           { minSq: 35,  gridChaos: 0.5, sizeChaos: 0.5, emptyProb: 0.60 },
  farm:           { minSq: 9999,gridChaos: 0.5, sizeChaos: 0.5, emptyProb: 0.00 },
  generic:        { minSq: 40,  gridChaos: 0.7, sizeChaos: 0.6, emptyProb: 0.05 },
};

export function buildGeometry(
  patches: Patch[],
  arteries: Artery[],
  wall: CurtainWall | null,
  plaza: Patch | null,
  _params: GenerationParameters,
  rng: SeededRNG,
  scale: number,
): void {
  const S = scale;
  const S2 = S * S;
  const wallShapeSet = new Set<Point>(wall?.shape ?? []);
  const arteryEdges = buildArteryEdgeSet(arteries);
  const plazaEdges = buildPlazaEdgeSet(plaza);

  // Task 3 diagnostic: log patches that end up with no geometry inside the city
  const _logEmptyPatches = () => {
    for (const patch of patches) {
      if (patch.withinCity && patch.wardType && patch.wardType !== 'market' && patch.wardType !== 'park' && patch.geometry.length === 0) {
        const patchArea = polygonArea({ points: patch.shape });
        const cityBlock = getCityBlock(patch, arteryEdges, wallShapeSet, plazaEdges, S);
        const cityBlockArea = cityBlock ? polygonArea({ points: cityBlock }) : null;
        console.log('[Confluence] Empty inner patch:', {
          wardType: patch.wardType,
          patchArea: Math.round(patchArea),
          cityBlockArea: cityBlockArea !== null ? Math.round(cityBlockArea) : 'null',
          withinWalls: patch.withinWalls,
        });
      }
    }
  };

  for (const patch of patches) {
    if (!patch.withinCity && patch.wardType !== 'gate') continue;
    if (patch.shape.length < 3) continue;

    // Farm: one footprint per patch (the whole shape)
    if (patch.wardType === 'farm') {
      patch.geometry = [patch.shape.map(p => ({ x: p.x, y: p.y }))];
      continue;
    }

    // Market (plaza): open space with a small fountain/statue at center
    if (patch.wardType === 'market') {
      const patchArea = polygonArea({ points: patch.shape });
      const plazaRadius = Math.sqrt(patchArea / Math.PI);
      const featureSize = plazaRadius * (0.08 + rng.next() * 0.07);
      patch.geometry = [makeOctagonPolygon(patch.site, featureSize)];
      continue;
    }

    // Compute the city block (inset polygon)
    const cityBlock = getCityBlock(patch, arteryEdges, wallShapeSet, plazaEdges, S);
    if (!cityBlock || polygonArea({ points: cityBlock }) < S2 * 2) continue;

    // Castle: orthogonal building layout
    if (patch.wardType === 'castle') {
      patch.geometry = createOrthoBuilding(cityBlock, S2 * 60, 0.8, rng);
      continue;
    }

    const base = WARD_PARAMS_BASE[patch.wardType ?? 'generic'] ?? WARD_PARAMS_BASE.generic;
    const wp: WardParams = { ...base, minSq: base.minSq * S2 };

    // Fix 4C: clamp effectiveMinSq so no single block fills the whole city block
    const blockArea = polygonArea({ points: cityBlock });
    const effectiveWp: WardParams = { ...wp, minSq: Math.min(wp.minSq, blockArea * 0.5) };

    const buildings = createAlleys(cityBlock, effectiveWp, rng, S, true, 0);

    // Outside the wall: cull buildings far from roads so they cling organically to streets
    if (!patch.withinWalls) {
      const patchArea = polygonArea({ points: patch.shape });
      const patchRadius = Math.sqrt(patchArea / Math.PI);
      patch.geometry = filterOutskirts(buildings, arteries, patchRadius, rng);
    } else {
      patch.geometry = buildings;
    }
  }

  _logEmptyPatches();
}

// ── getCityBlock ────────────────────────────────────────────────────────────

function buildArteryEdgeSet(arteries: Artery[]): Set<string> {
  const edges = new Set<string>();
  for (const artery of arteries) {
    for (let i = 0; i < artery.path.length - 1; i++) {
      edges.add(edgeKey(artery.path[i], artery.path[i + 1]));
      edges.add(edgeKey(artery.path[i + 1], artery.path[i]));
    }
  }
  return edges;
}

function buildPlazaEdgeSet(plaza: Patch | null): Set<string> {
  const edges = new Set<string>();
  if (!plaza) return edges;
  for (let i = 0; i < plaza.shape.length; i++) {
    const a = plaza.shape[i];
    const b = plaza.shape[(i + 1) % plaza.shape.length];
    edges.add(edgeKey(a, b));
    edges.add(edgeKey(b, a));
  }
  return edges;
}

function edgeKey(a: Point, b: Point): string {
  return `${Math.round(a.x * 10)},${Math.round(a.y * 10)}|${Math.round(b.x * 10)},${Math.round(b.y * 10)}`;
}

function getCityBlock(
  patch: Patch,
  arteryEdges: Set<string>,
  wallShapeSet: Set<Point>,
  plazaEdges: Set<string>,
  S: number,
): Point[] | null {
  const pts = patch.shape;
  const n = pts.length;
  const depths: number[] = [];

  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const onWall = wallShapeSet.has(a) && wallShapeSet.has(b);
    const onArtery = arteryEdges.has(edgeKey(a, b));
    const onPlaza = plazaEdges.has(edgeKey(a, b));

    if (onWall || onArtery || onPlaza) {
      depths.push(MAIN_STREET_HALF * S);
    } else if (patch.withinWalls) {
      depths.push(REGULAR_STREET_HALF * S);
    } else {
      depths.push(ALLEY_HALF * S);
    }
  }

  return isConvex(pts)
    ? polygonShrink(pts, depths)
    : polygonBuffer(pts, depths);
}

// ── createAlleys ────────────────────────────────────────────────────────────

function createAlleys(
  pts: Point[],
  wp: WardParams,
  rng: SeededRNG,
  S: number,
  doSplit: boolean,
  depth: number,
): Point[][] {
  const area = polygonArea({ points: pts });
  if (depth > 20) return area > wp.minSq * 0.5 ? [pts] : [];

  // Sub-fix C: acute or degenerate polygons produce only slivers — treat as single building
  if (pts.length < 4 || hasAcuteAngle(pts, 15)) {
    if (area >= wp.minSq * 0.5 && buildingCompactness(pts) >= MIN_BUILDING_COMPACTNESS) return [pts];
    return [];
  }

  // Threshold with size chaos
  const threshold = wp.minSq * Math.pow(2, 4 * wp.sizeChaos * (rng.next() - 0.5));

  if (area < threshold) {
    if (rng.chance(wp.emptyProb)) return [];
    if (buildingCompactness(pts) < MIN_BUILDING_COMPACTNESS) return [];
    return [pts];
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
  const nxt = pts[(longestIdx + 1) % pts.length];

  // Cut position along longest edge — clamped to middle 60% to prevent degenerate triangles
  const spread = 0.8 * wp.gridChaos;
  const ratio = Math.max(0.2, Math.min(0.8, (1 - spread) / 2 + rng.next() * spread));
  const p1: Point = {
    x: v.x + (nxt.x - v.x) * ratio,
    y: v.y + (nxt.y - v.y) * ratio,
  };

  // Cut direction: perpendicular to edge, with angle jitter
  const edgeDx = nxt.x - v.x;
  const edgeDy = nxt.y - v.y;
  const angleSpread = (Math.PI / 6) * wp.gridChaos * (area > wp.minSq * 4 ? 1 : 0);
  const ang = (rng.next() - 0.5) * angleSpread;
  const cosA = Math.cos(ang), sinA = Math.sin(ang);
  // Perpendicular to (edgeDx,edgeDy) is (-edgeDy,edgeDx); rotate by ang
  const perpX = -edgeDy * cosA - edgeDx * sinA;
  const perpY = -edgeDy * sinA + edgeDx * cosA;
  const p2: Point = { x: p1.x + perpX, y: p1.y + perpY };

  // Alley gap between sub-blocks (scaled by S)
  const alleyGap = doSplit ? ALLEY_HALF * 2 * S : 0;

  const halves = polygonCut(pts, p1, p2, alleyGap);
  if (!halves) return area > wp.minSq * 0.5 ? [pts] : [];

  const results: Point[][] = [];
  for (const half of halves) {
    const halfArea = polygonArea({ points: half });
    const halfThreshold = wp.minSq * Math.pow(2, 4 * wp.sizeChaos * (rng.next() - 0.5));

    if (halfArea < halfThreshold) {
      if (!rng.chance(wp.emptyProb) && buildingCompactness(half) >= MIN_BUILDING_COMPACTNESS) {
        results.push(half);
      }
    } else {
      const nextSplit = halfArea > wp.minSq / (rng.next() * rng.next() + 0.01);
      results.push(...createAlleys(half, wp, rng, S, nextSplit, depth + 1));
    }
  }

  return results;
}

// ── createOrthoBuilding ────────────────────────────────────────────────────

function createOrthoBuilding(
  pts: Point[],
  minBlockSq: number,
  fillProb: number,
  rng: SeededRNG,
): Point[][] {
  // Determine the two orthogonal axes from the longest edge
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
  const nxt = pts[(longestIdx + 1) % pts.length];
  const edgeLen = Math.sqrt(longestLen);
  const c1: Point = { x: (nxt.x - v.x) / edgeLen, y: (nxt.y - v.y) / edgeLen };
  const c2: Point = { x: -c1.y, y: c1.x };

  return sliceOrtho(pts, c1, c2, minBlockSq, fillProb, rng, 0);
}

function sliceOrtho(
  pts: Point[],
  c1: Point,
  c2: Point,
  minBlockSq: number,
  fillProb: number,
  rng: SeededRNG,
  depth: number,
): Point[][] {
  if (depth > 15) return [];
  const area = polygonArea({ points: pts });

  const threshold = minBlockSq * Math.pow(2, (rng.gaussian(0, 1) * 2 - 1));
  if (area < threshold) {
    return rng.chance(fillProb) ? [pts] : [];
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

  const v0 = pts[longestIdx];
  const v1 = pts[(longestIdx + 1) % pts.length];
  const ratio = 0.4 + rng.next() * 0.2;
  const p1: Point = { x: v0.x + (v1.x - v0.x) * ratio, y: v0.y + (v1.y - v0.y) * ratio };

  // Pick the axis most perpendicular to the longest edge
  const edgeDx = v1.x - v0.x, edgeDy = v1.y - v0.y;
  const dot1 = Math.abs(edgeDx * c1.x + edgeDy * c1.y);
  const dot2 = Math.abs(edgeDx * c2.x + edgeDy * c2.y);
  const axis = dot1 < dot2 ? c1 : c2;

  const p2: Point = { x: p1.x + axis.x, y: p1.y + axis.y };
  const halves = polygonCut(pts, p1, p2, 0);
  if (!halves) return rng.chance(fillProb) ? [pts] : [];

  const results: Point[][] = [];
  for (const half of halves) {
    results.push(...sliceOrtho(half, c1, c2, minBlockSq, fillProb, rng, depth + 1));
  }
  return results;
}

// ── filterOutskirts ──────────────────────────────────────────────────────────

// For outside-wall patches: cull buildings whose centroids are far from any
// artery. Probability of keeping decays linearly from 1 (on road) to 0
// (patchRadius * 1.5 away). Produces the "clings to roads" suburban quality.
function filterOutskirts(
  buildings: Point[][],
  arteries: Artery[],
  patchRadius: number,
  rng: SeededRNG,
): Point[][] {
  return buildings.filter(footprint => {
    const n = footprint.length;
    const cx = footprint.reduce((s, p) => s + p.x, 0) / n;
    const cy = footprint.reduce((s, p) => s + p.y, 0) / n;

    let minDist = Infinity;
    for (const artery of arteries) {
      for (let i = 0; i < artery.path.length - 1; i++) {
        const d = pointToSegmentDist(cx, cy, artery.path[i], artery.path[i + 1]);
        if (d < minDist) minDist = d;
      }
    }

    if (!isFinite(minDist)) return false;
    const t = Math.min(1, minDist / (patchRadius * 1.5));
    return rng.next() > t;
  });
}

function pointToSegmentDist(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return Math.sqrt((px - a.x) ** 2 + (py - a.y) ** 2);
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
  return Math.sqrt((px - a.x - t * dx) ** 2 + (py - a.y - t * dy) ** 2);
}

// ── buildingCompactness ───────────────────────────────────────────────────────

function buildingCompactness(pts: Point[]): number {
  const area = polygonArea({ points: pts });
  let perim = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
    perim += Math.sqrt(dx * dx + dy * dy);
  }
  if (perim < 1e-10) return 0;
  return (4 * Math.PI * area) / (perim * perim);
}

// ── hasAcuteAngle ─────────────────────────────────────────────────────────────

function hasAcuteAngle(pts: Point[], thresholdDeg: number): boolean {
  const thresh = thresholdDeg * (Math.PI / 180);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const ax = prev.x - curr.x, ay = prev.y - curr.y;
    const bx = next.x - curr.x, by = next.y - curr.y;
    const lenA = Math.sqrt(ax * ax + ay * ay);
    const lenB = Math.sqrt(bx * bx + by * by);
    if (lenA < 1e-10 || lenB < 1e-10) continue;
    const cosAngle = (ax * bx + ay * by) / (lenA * lenB);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    if (angle < thresh) return true;
  }
  return false;
}

// ── makeOctagonPolygon ────────────────────────────────────────────────────────

function makeOctagonPolygon(center: Point, radius: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 8;
    pts.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  }
  return pts;
}

