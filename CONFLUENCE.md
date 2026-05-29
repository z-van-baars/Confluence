# Confluence — Settlement Generator

**Confluence** is a procedural medieval/fantasy settlement generator that produces Voronoi-based town maps with districts, roads, walls, buildings, and vegetation. It renders to an interactive HTML5 canvas via a Vite + TypeScript stack.

Confluence is the first completed sub-module of a larger **Map Project** — a fantasy world-map tool in the spirit of Google Earth applied to an invented world. The settlement generator was built first as the most self-contained piece. The parent `Map Project/` directory is a placeholder name for that broader effort.

---

## Running Locally

```
cd settlement-generator
npm install
npm run dev        # Vite dev server at http://localhost:3001
npm run build      # Production build → dist/
```

---

## Architecture

Generation runs as a sequential pipeline. Each stage hands its output to the next. All stages use a seeded RNG so maps are reproducible.

```
generateSettlement(params, seed)
  │
  ├─ terrain.ts       → TerrainData (elevation/moisture grid, water features)
  ├─ layout.ts        → LayoutData  (Voronoi cells + edges, wall radius)
  ├─ districts.ts     → District[]  (assign cell groups to district types)
  ├─ roads.ts         → Road[]      (Voronoi-edge roads; no radial highways)
  ├─ walls.ts         → Wall[]      (curtain wall + towers + gates)
  ├─ parcels.ts       → Parcel[]    (subdivide cells into building lots)
  ├─ buildings.ts     → Building[]  (place + type buildings on parcels)
  ├─ landmarks.ts     → Landmark[]  (named points of interest)
  └─ vegetation.ts    → VegetationCluster[]
```

All types live in `src/core/types.ts`.

---

## Key Files

| File | Role |
|------|------|
| `src/generation/pipeline.ts` | Entry point; calls every stage, assembles `Settlement` |
| `src/generation/layout.ts` | d3-delaunay Voronoi, wall radius, cell adjacency |
| `src/generation/districts.ts` | Assigns `DistrictType` to cell groups (castle, market, poor, etc.) |
| `src/generation/parcels.ts` | Subdivides each cell into `Parcel` polygons via `subdividePolygon` |
| `src/generation/buildings.ts` | Creates `Building` on each parcel; density/wall proximity checks |
| `src/rendering/renderer.ts` | Canvas 2D renderer with pan/zoom; draws all layers |
| `src/rendering/styles.ts` | `PARCHMENT_STYLE` — all fill/stroke colors |
| `src/rendering/layers.ts` | Layer visibility stack (buildings, roads, grid, heatmaps…) |
| `src/core/geometry.ts` | Pure math: `subdividePolygon`, `insetPolygon`, `polygonCentroid`, etc. |
| `src/core/types.ts` | All shared interfaces (`Settlement`, `District`, `Building`, `Road`, …) |
| `src/core/rng.ts` | `SeededRNG` — deterministic PRNG used throughout |
| `src/core/parameters.ts` | `GenerationParameters` defaults and UI controls |
| `src/ui/` | Controls panel, layer panel, editor wiring |

---

## Parcel System

**Current method** (`parcels.ts`): recursive bisection via `geometry.ts#subdividePolygon`. Each Voronoi cell is split along the perpendicular of its longest edge until sub-polygons fall below `DISTRICT_MIN_AREA`. This produces irregular but clean building blocks.

**Known issue**: Interior parcels (completely surrounded by other parcels, no road frontage) exist and currently have no access. The plan is a post-pass that injects narrow alley segments connecting landlocked parcel centroids to the nearest road.

**Per-district min areas**: Currently all set to `150px²` for uniform maximum density during baseline development. See the TODO block in `parcels.ts` for the reference values to restore when differentiating districts.

---

## District Types

`castle` · `noble` · `temple` · `market` · `residential` · `poor` · `craftsmen` · `warehouse` · `military` · `garden` · `farmland`

Farmland cells are not subdivided — they get one parcel per cell.

---

## Building Rendering

Buildings render edge-to-edge (no inset gap). Each building footprint is the raw parcel polygon. A `0.8px` stroke outline and a `+2px` shadow offset provide visual depth without artificial spacing.

Building type (and therefore color, via `PARCHMENT_STYLE.building.special`) is determined by district type weights in `buildings.ts#pickBuildingType`.

---

## Open TODOs

- [ ] **Alleyway / landlocked parcel access** — detect parcels with no road frontage; inject a narrow `RoadType = 'alley'` segment to nearest road
- [ ] **Per-district parcel sizing** — restore differentiated `DISTRICT_MIN_AREA` values once residential baseline is stable (see `parcels.ts` TODO block)
- [ ] **`vertexDensity` utilization** — `settlement.vertexDensity` is computed in `pipeline.ts` (keyed by `"x,y"`) and available for wiring into building depth, courtyard probability, or stat overlays
