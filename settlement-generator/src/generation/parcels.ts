import type { GenerationParameters, LayoutData, District, Parcel, Polygon, Point } from '../core/types';
import { SeededRNG } from '../core/rng';
import { polygonArea, polygonCentroid, subdividePolygon } from '../core/geometry';

interface DistrictSubdivideParams {
  minAreaBase: number;
  gridChaos: number;
  sizeChaos: number;
  emptyProb: number;
}

const DISTRICT_PARAMS: Record<string, DistrictSubdivideParams> = {
  castle:      { minAreaBase: 600,  gridChaos: 0.4, sizeChaos: 0.5, emptyProb: 0.10 },
  noble:       { minAreaBase: 500,  gridChaos: 0.4, sizeChaos: 0.5, emptyProb: 0.10 },
  temple:      { minAreaBase: 500,  gridChaos: 0.4, sizeChaos: 0.5, emptyProb: 0.08 },
  market:      { minAreaBase: 200,  gridChaos: 0.6, sizeChaos: 0.7, emptyProb: 0.15 },
  residential: { minAreaBase: 150,  gridChaos: 0.6, sizeChaos: 0.6, emptyProb: 0.04 },
  poor:        { minAreaBase: 80,   gridChaos: 0.8, sizeChaos: 0.8, emptyProb: 0.03 },
  craftsmen:   { minAreaBase: 150,  gridChaos: 0.6, sizeChaos: 0.6, emptyProb: 0.04 },
  warehouse:   { minAreaBase: 350,  gridChaos: 0.5, sizeChaos: 0.6, emptyProb: 0.04 },
  military:    { minAreaBase: 400,  gridChaos: 0.4, sizeChaos: 0.5, emptyProb: 0.05 },
  garden:      { minAreaBase: 300,  gridChaos: 0.4, sizeChaos: 0.4, emptyProb: 0.20 },
  farmland:    { minAreaBase: 1200, gridChaos: 0.3, sizeChaos: 0.3, emptyProb: 0.00 },
};

export function generateParcels(
  layout: LayoutData,
  districts: District[],
  params: GenerationParameters,
  rng: SeededRNG,
): Parcel[] {
  const parcels: Parcel[] = [];
  let idSeq = 0;

  const cellToDistrict = new Map<number, District>();
  for (const d of districts) {
    for (const cid of d.cellIds) cellToDistrict.set(cid, d);
  }

  const edgeSetbackMap = buildEdgeSetbackMap(layout);

  for (const cell of layout.cells) {
    if (cell.isBoundary) continue;
    const district = cellToDistrict.get(cell.id);
    if (!district) continue;

    // Farmland: one parcel per cell, no subdivision.
    if (district.type === 'farmland') {
      parcels.push({
        id: `parcel-${idSeq++}`,
        polygon: cell.polygon,
        districtId: district.id,
        cellId: cell.id,
        area: cell.area,
      });
      continue;
    }

    const cellPoly = shrinkCellFromRoads(cell.polygon, edgeSetbackMap);

    const dp = DISTRICT_PARAMS[district.type] ?? DISTRICT_PARAMS['craftsmen'];
    const minArea = dp.minAreaBase * (1.4 - params.density * 0.8);

    const subPolygons = subdividePolygon(
      cellPoly, minArea, rng.next.bind(rng),
      dp.gridChaos, dp.sizeChaos, dp.emptyProb,
    );

    for (const poly of subPolygons) {
      const area = polygonArea(poly);
      if (area < 20) continue;
      parcels.push({
        id: `parcel-${idSeq++}`,
        polygon: poly,
        districtId: district.id,
        cellId: cell.id,
        area,
      });
    }
  }

  return parcels;
}

// ── Road setback ─────────────────────────────────────────────────────────────
//
// Each Voronoi edge carries an importance value (0–1, higher = closer to
// center = more important road). We mirror the classifyRoad logic from
// roads.ts to estimate road type, then set back each cell face by half the
// road width so the road gap appears between adjacent building blocks.
// Non-road edges get a 1px floor — just enough for a visible property line.

function buildEdgeSetbackMap(layout: LayoutData): Map<string, number> {
  const map = new Map<string, number>();
  const { center, radius } = layout;

  for (const edge of layout.edges) {
    const mx = (edge.a.x + edge.b.x) / 2;
    const my = (edge.a.y + edge.b.y) / 2;
    const ndist = Math.sqrt((mx - center.x) ** 2 + (my - center.y) ** 2) / radius;
    const setback = importanceToHalfWidth(edge.importance, ndist);

    const k1 = edgeKey(edge.a, edge.b);
    const k2 = edgeKey(edge.b, edge.a);
    if ((map.get(k1) ?? 0) < setback) map.set(k1, setback);
    if ((map.get(k2) ?? 0) < setback) map.set(k2, setback);
  }

  return map;
}

// Returns the per-side setback in world-space pixels, matching road.width / 2
// for each road tier plus a small visual margin.
function importanceToHalfWidth(importance: number, normalizedDist: number): number {
  if (importance > 0.85 && normalizedDist < 0.3) return 5; // highway  (8px / 2 + 1)
  if (importance > 0.6) return 3.5;                         // main     (5px / 2 + 1)
  if (importance > 0.35) return 2.5;                        // secondary(3.5px / 2 + 0.75)
  return 1.5;                                               // alley / path / no road
}

function edgeKey(a: Point, b: Point): string {
  return `${Math.round(a.x)},${Math.round(a.y)}-${Math.round(b.x)},${Math.round(b.y)}`;
}

function shrinkCellFromRoads(poly: Polygon, edgeSetbackMap: Map<string, number>): Polygon {
  const pts = poly.points;
  const n = pts.length;

  const depths: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const setback = edgeSetbackMap.get(edgeKey(pts[i], pts[j]))
      ?? edgeSetbackMap.get(edgeKey(pts[j], pts[i]))
      ?? 1.0; // minimal gap for outer boundary faces with no paired road
    depths.push(setback);
  }

  const shrunken = perEdgeInset(poly, depths);
  // Fall back to raw polygon if the inset collapsed or shrunk to < 10% of original area.
  if (!shrunken || polygonArea(shrunken) < polygonArea(poly) * 0.1) return poly;
  return shrunken;
}

// Offset each edge of `poly` inward by the corresponding depth in `depths`,
// then compute the inner polygon as pairwise intersections of adjacent offset
// edges. This preserves the exact shape of each face rather than doing a
// uniform centroid-pull.
function perEdgeInset(poly: Polygon, depths: number[]): Polygon | null {
  const pts = poly.points;
  const n = pts.length;
  if (depths.length !== n) return null;

  const centroid = polygonCentroid(poly);

  const oe: { a: Point; b: Point }[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j].x - pts[i].x;
    const dy = pts[j].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-10) return null;

    // Unit normal — flip to point toward centroid (inward).
    let nx = dy / len, ny = -dx / len;
    const mx = (pts[i].x + pts[j].x) / 2;
    const my = (pts[i].y + pts[j].y) / 2;
    if (nx * (centroid.x - mx) + ny * (centroid.y - my) < 0) { nx = -nx; ny = -ny; }

    const d = depths[i];
    oe.push({
      a: { x: pts[i].x + nx * d, y: pts[i].y + ny * d },
      b: { x: pts[j].x + nx * d, y: pts[j].y + ny * d },
    });
  }

  const inner: Point[] = [];
  for (let k = 0; k < n; k++) {
    const prev = (k + n - 1) % n;
    const pt = lineLineIntersect(oe[prev].a, oe[prev].b, oe[k].a, oe[k].b);
    inner.push(pt ?? { x: (oe[prev].b.x + oe[k].a.x) / 2, y: (oe[prev].b.y + oe[k].a.y) / 2 });
  }

  return { points: inner };
}

function lineLineIntersect(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const d = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(d) < 1e-10) return null;
  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / d;
  return { x: a1.x + t * dx1, y: a1.y + t * dy1 };
}
