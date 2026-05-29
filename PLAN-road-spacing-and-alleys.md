# Work Plan: Road Spacing + Landlocked Parcel Resolution

---

## ⚠️ BLOCKING: Road Spacing Not Working Consistently

**Status:** The per-edge cell setback (`shrinkCellFromRoads` in `parcels.ts`) is unreliable.
Buildings are still overlapping or inconsistently respecting roads.

**Root cause:** The `edgeKey()` function uses `Math.round()` on vertex coordinates to build
a string lookup key. The `LayoutEdge.a/b` vertices come from `findSharedEdge()`, which takes
coordinates from `cellI`'s polygon. The matching cell `cellJ`'s polygon may have slightly
different float64 values for the same shared vertex (within the 1px threshold used in
`findSharedEdge`). This means the key for a cell polygon edge might not match the key stored
from the LayoutEdge — lookups silently fall back to the 1.5px default for all edges.

**Fix:** Replace the vertex-key lookup with **midpoint-based spatial matching**.

```
// Instead of:
edgeKey(pts[i], pts[j])  →  looks up map built from LayoutEdge.a/b

// Do:
midpoint(pts[i], pts[j])  →  find nearest LayoutEdge by midpoint distance (threshold ~5px)
```

Implementation steps:
1. Build a `LayoutEdge[]` sorted array with precomputed midpoints (one-time pass)
2. For each cell polygon edge, compute its midpoint and find the closest LayoutEdge midpoint
   within a 5px radius using a simple linear scan (cell counts are small, ~6 edges × ~200 cells)
3. If a match is found, use `importanceToHalfWidth(edge.importance, normalizedDist)` for setback
4. If no match within threshold, use 1.0px (outer boundary — no adjacent road possible)

This avoids any float-matching entirely. The midpoint of a Voronoi edge is a unique geometric
point that both the LayoutEdge and the cell polygon edge share, and midpoint distance matching
at 5px is robust against any float noise.

**No pipeline changes needed** — `layout` (which contains `layout.edges`) is already in scope
in `generateParcels`.

---

## Plan: Landlocked Parcel Resolution (Alleyways)

### Problem

`subdividePolygon` recursively bisects each Voronoi cell along the perpendicular to the longest
edge. Interior bisections produce sub-polygons that share no face with the outer cell boundary —
they are completely surrounded by other sub-polygons. These parcels have no road frontage and no
logical access. In dense urban blocks this is common (every bisection creates one interior piece).

### Goal

Give every parcel at least one logical access path to the road network, modeled as narrow alley
segments. Alleys should look organic and medieval, not grid-like. They do not need to be wide
enough to drive through — just enough to walk through.

---

### Approach: Post-Parcel Alley Injection

Run after `generateParcels`, before `placeBuildings`. New stage in the pipeline:

```
const alleys = generateAlleys(parcels, roads, layout, rng);
roads = [...roads, ...alleys];  // alleys are just narrow Road objects
```

Or add to the existing `generateRoads` call as a second pass (cleaner: keep it separate).

#### Step 1 — Detect Landlocked Parcels

For each parcel, check if any of its vertices are within `ROAD_PROXIMITY_THRESHOLD` (~6px) of
any road segment. Parcels with no vertex within that distance are "landlocked."

```typescript
function isLandlocked(parcel: Parcel, roads: Road[]): boolean {
  for (const pt of parcel.polygon.points) {
    for (const road of roads) {
      for (let i = 0; i < road.path.length - 1; i++) {
        if (pointToSegmentDist(pt, road.path[i], road.path[i+1]) < ROAD_PROXIMITY_THRESHOLD)
          return false;
      }
    }
  }
  return true;
}
```

#### Step 2 — Find the Access Target

For each landlocked parcel, find the nearest point on the nearest road segment to the parcel
centroid. That becomes the alley's destination endpoint.

```typescript
function nearestRoadPoint(centroid: Point, roads: Road[]): Point | null
```

#### Step 3 — Trace the Alley Path

The alley runs from parcel centroid → nearest road point, but should not cut through buildings
arbitrarily. Trace through the parcel graph (shared parcel vertices) as a waypoint route.

**Simplified version (good enough for now):** Direct line from centroid to nearest road point.
Alleys are narrow (width 1.5px) and render below buildings (order 4), so visual clipping through
building footprints is acceptable at this stage — the "cut-through" read still works.

**Future improvement:** Route via parcel shared vertices using A* or BFS on the parcel adjacency
graph, so alleys follow the property lines rather than cutting through building footprints.

#### Step 4 — Inject as Road Objects

```typescript
roads.push({
  id: `alley-${id++}`,
  path: [centroid, nearestRoadPt],
  width: 1.5,
  type: 'alley',
});
```

These automatically render via the existing road layer (type 'alley' is already in the type
system and the renderer handles it).

#### Step 5 — Optional: Suppress Buildings on Alley-Adjacent Parcels

Later refinement: mark parcels that an alley passes through and reduce building placement
probability on them, or set back the building footprint on the alley-facing edge. Not needed
for a first pass.

---

### Implementation Checklist

**Phase 0 — Fix road spacing first (BLOCKING)**
- [ ] Replace `edgeKey` vertex matching with midpoint spatial matching in `parcels.ts`
- [ ] Verify roads are visibly clearing buildings in browser before continuing

**Phase 1 — Alley injection (basic)**
- [ ] Add `generateAlleys(parcels, roads, layout, rng): Road[]` in new file `src/generation/alleys.ts`
- [ ] Add `isLandlocked(parcel, roads): boolean` helper
- [ ] Add `nearestRoadPoint(centroid, roads): Point | null` helper
- [ ] Wire into `pipeline.ts`: call after `generateParcels`, merge alleys into roads before `placeBuildings`
- [ ] Verify alleys appear in browser

**Phase 2 — Alley quality (visual polish)**
- [ ] Add slight organic curvature to alley paths (reuse `addCurvature` from `roads.ts`)
- [ ] Suppress or reduce building placement on parcels that alleys cross
- [ ] Tune `ROAD_PROXIMITY_THRESHOLD` per district type (denser districts need tighter threshold)

**Phase 3 — Graph routing (future, deferred)**
- [ ] Build parcel adjacency graph (shared edge detection)
- [ ] Route alleys along property lines via BFS rather than straight lines

---

### Files to Modify

| File | Change |
|------|--------|
| `src/generation/parcels.ts` | Fix road spacing (midpoint matching) |
| `src/generation/alleys.ts` | New file — alley injection logic |
| `src/generation/pipeline.ts` | Wire alleys stage between roads and buildings |
| `CONFLUENCE.md` | Update Open TODOs once implemented |
