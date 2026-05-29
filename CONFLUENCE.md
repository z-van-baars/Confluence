# Confluence — Settlement Generator

**Confluence** is a procedural medieval/fantasy settlement generator that produces patch-based town maps with wards, roads, walls, buildings, and vegetation. It renders to an interactive HTML5 canvas via a Vite + TypeScript stack.

Confluence is the first completed sub-module of a larger **Map Project** — a fantasy world-map tool in the spirit of Google Earth applied to an invented world. The settlement generator was built first as the most self-contained piece. The parent `Map Project/` directory is a placeholder name for that broader effort.

---

## Running Locally

```
cd settlement-generator
npm install
npm run dev        # Vite dev server at http://localhost:3000
npm run build      # Production build → dist/
```

---

## Architecture

Generation runs in two layers. The **Watabou engine** (`src/generation/watabou/`) handles all town structure and building geometry. The **legacy adapters** in `pipeline.ts` map the engine output into the `Settlement` type that the renderer and UI expect.

```
generateSettlement(params)
  │
  ├─ terrain.ts            → TerrainData  (elevation/moisture, water features, coastline)
  │
  ├─ buildTownModel()      → TownModel    (the Watabou engine — see below)
  │    ├─ buildPatches     → Patch[]      (d3-delaunay Voronoi, spiral site placement)
  │    ├─ buildWalls       → CurtainWall  (outer wall + castle wall, towers, gates)
  │    ├─ buildTopology    → Graph        (patch-vertex graph for A* routing)
  │    ├─ buildStreets     → Artery[]     (gate→plaza A* streets + outward roads)
  │    ├─ createWards      → (mutates Patch.wardType)
  │    └─ buildGeometry    → (mutates Patch.geometry with building footprints)
  │
  ├─ pipeline adapters     → Road[], Wall[], District[], Building[]
  │    (map TownModel fields to Settlement types for the renderer)
  │
  ├─ landmarks.ts          → Landmark[]
  └─ vegetation.ts         → VegetationCluster[]
```

All types live in `src/core/types.ts`. The core generation data structure is `Patch` (not `VoronoiCell`) — each patch is a Voronoi polygon with a ward type and a list of building footprint polygons.

---

## Key Files

| File | Role |
|------|------|
| `src/generation/pipeline.ts` | Entry point; calls Watabou engine + terrain/landmarks/vegetation, assembles `Settlement` |
| `src/generation/watabou/index.ts` | Orchestrates `buildTownModel` — calls each watabou sub-stage in order |
| `src/generation/watabou/buildPatches.ts` | d3-delaunay Voronoi; spiral site placement; `scale` factor derived here |
| `src/generation/watabou/buildWalls.ts` | Outer curtain wall + castle wall shape, towers, gate positions |
| `src/generation/watabou/topology.ts` | Patch-vertex graph (`Graph`) + A* implementation used by `buildStreets` |
| `src/generation/watabou/buildStreets.ts` | Routes arteries (gate→plaza) and outward roads via A* on the topology graph |
| `src/generation/watabou/createWards.ts` | Assigns `WardType` to each patch; weighted random pool with manual overrides for castle/market/gate |
| `src/generation/watabou/buildGeometry.ts` | `getCityBlock()` + `createAlleys()` — the core building subdivision algorithm |
| `src/generation/terrain.ts` | Elevation/moisture grid, water features, coastline generation |
| `src/generation/landmarks.ts` | Named points of interest; uses legacy `LayoutData` adapter |
| `src/generation/vegetation.ts` | Tree clusters; uses legacy `LayoutData` adapter |
| `src/rendering/renderer.ts` | Canvas 2D renderer with pan/zoom; double-buffered; draws all layers |
| `src/rendering/styles.ts` | `PARCHMENT_STYLE` — all fill/stroke colors |
| `src/rendering/layers.ts` | Layer visibility stack (buildings, roads, grid, heatmaps…) |
| `src/core/geometry.ts` | Pure math: `polygonCut`, `polygonShrink`, `polygonBuffer`, `subdividePolygon`, etc. |
| `src/core/types.ts` | All shared interfaces (`Settlement`, `TownModel`, `Patch`, `Building`, `Road`, …) |
| `src/core/rng.ts` | `SeededRNG` — deterministic PRNG used throughout |
| `src/core/parameters.ts` | `GenerationParameters` defaults and UI controls |
| `src/ui/` | Controls panel, layer panel, editor wiring |

---

## Watabou Engine — Building Generation

The building system lives entirely in `buildGeometry.ts`. Two functions do all the work:

**`getCityBlock(patch, arteryEdges, wallShapeSet, plazaEdges, S)`**
Insets the patch polygon away from its adjacent streets. Edges on arteries or walls get a large setback (`MAIN_STREET_HALF * S`); interior edges get a smaller one. Uses `polygonShrink` for convex patches and `polygonBuffer` (with ear-clipping) for concave ones. Returns the inset polygon or `null` if it collapses.

**`createAlleys(pts, wardParams, rng, S, doSplit, depth)`**
Recursive bisection that produces building footprints (`Point[][]`):
1. Find the longest edge of the polygon
2. Pick a cut point along that edge: `ratio = (1−spread)/2 + rand()*spread` where `spread = 0.8 * gridChaos` — cuts are near the middle but offset, creating strip-like buildings
3. Cut perpendicular to the edge (with slight angular jitter for large polygons, suppressed near minimum size)
4. Apply an alley gap via `polygonCut(..., gap)` when `doSplit = true`
5. Each half is either emitted as a building (if below the size threshold) or recursed into

The threshold uses `sizeChaos` for randomized termination: `threshold = minSq * 2^(4 * sizeChaos * (rand − 0.5))`, so buildings vary naturally in size within a ward. Thin/acute polygons and low-compactness shapes are rejected.

**Ward parameters** (`WARD_PARAMS_BASE`):

| Ward | minSq | gridChaos | sizeChaos | emptyProb |
|------|-------|-----------|-----------|-----------|
| craftsmen | 25 | 0.6 | 0.6 | 0.04 |
| slum | 10 | 0.8 | 0.8 | 0.03 |
| merchant | 40 | 0.6 | 0.7 | 0.15 |
| patriciate | 40 | 0.5 | 0.7 | 0.15 |
| gate | 18 | 0.6 | 0.7 | 0.04 |
| administration | 35 | 0.4 | 0.5 | 0.10 |
| cathedral | 60 | 0.3 | 0.4 | 0.20 |
| military | 35 | 0.3 | 0.4 | 0.05 |
| park | 18 | 0.5 | 0.5 | 0.60 |
| generic | 20 | 0.7 | 0.6 | 0.05 |

`minSq` is in Watabou model units² — multiplied by `scale²` at runtime (scale ≈ 2.375 for a "town", so effective minSq for craftsmen ≈ 141 px²). The effective minSq is also clamped to `blockArea * 0.5` so no single block collapses to one building.

**Scale** is computed in `buildPatches.ts` so that the spiral placement fits the requested canvas size. It's the same scale used throughout the watabou engine.

---

## Ward Types

`castle` · `market` · `craftsmen` · `merchant` · `cathedral` · `administration` · `slum` · `patriciate` · `military` · `park` · `gate` · `farm` · `generic`

`farm` and `generic` patches are outside or at the city fringe. `market` gets a single octagon feature (plaza). `castle` uses `createOrthoBuilding()` — a grid-aligned orthogonal layout instead of `createAlleys`. Outside-wall patches run through `filterOutskirts()` which culls buildings far from roads so they cluster near streets.

---

## Rendering

`renderDistricts()` only fills `farmland` and `garden` cells with their palette colors. City ward cells get `style.background` — the distinct shading within the city comes from per-building-type fill colors in `PARCHMENT_STYLE.building.special`, not from background district polygons.

Building footprints are rendered with a `0.8px` stroke, a `+2px` shadow, and a hash-based per-building tint variation (8% of buildings lighten slightly for stone/courtyard appearance).

---

## Debug Overlay

Press **`D`** to open a floating debug panel showing one interior craftsmen ward (or nearest fallback) with:
- **Red dashed** — raw Voronoi patch polygon
- **Blue** — inset city-block polygon from `getCityBlock()`
- **Green** — every `createAlleys` cut line (clipped to city block)
- **Orange** — final building footprints

Console stats (raw area, block area, building count, min/max/mean building area, cut count) log to the browser console on every generation. Debug data lives at `Settlement.model.debugBlock` (`DebugBlockData` type).

---

## Legacy Files (Not Active)

These files exist in `src/generation/` but are **not called** by the current pipeline. They predate the Watabou engine port and have been superseded:

| File | Superseded by |
|------|---------------|
| `layout.ts` | `watabou/buildPatches.ts` |
| `districts.ts` | `watabou/createWards.ts` |
| `roads.ts` | `watabou/buildStreets.ts` |
| `walls.ts` | `watabou/buildWalls.ts` |
| `buildings.ts` | `watabou/buildGeometry.ts` |
| `parcels.ts` | `watabou/buildGeometry.ts` (`Settlement.parcels` is always `[]`) |

`geometry.ts` also contains `subdividePolygonLegacy` (the old centroid-bisection approach) kept for comparison. It is not called anywhere.

---

## Open TODOs

- [ ] **Zero-area buildings** — some degenerate polygons slip past the `MIN_BUILDING_COMPACTNESS` filter (`buildingAreaMin = 0` in stats). Investigate whether `polygonCut` can return zero-area results on near-collinear inputs
- [ ] **Castle placement** — castle patch reports `withinWalls: false`, meaning it renders outside the outer curtain wall; likely a `buildWalls` topology issue
- [ ] **minSq tuning** — current values halved from original Watabou defaults; craftsmen ratio ≈ 71× (target 50–100×); slum at `minSq: 10` may be too fine at close zoom
- [ ] **`vertexDensity` utilization** — computed in `pipeline.ts` (keyed `"x,y"`) but not wired into anything
- [ ] **Remove dead legacy files** — once confirmed not needed for reference, `layout.ts`, `districts.ts`, `roads.ts`, `walls.ts`, `buildings.ts`, `parcels.ts` can be deleted

## User Note

Please refrain from taking screenshots or using chromium to take screenshots and judge output for yourself, instead defer to the user to do test generations and do visual evaluation.