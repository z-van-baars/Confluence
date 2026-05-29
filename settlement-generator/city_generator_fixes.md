# City Generator — Diagnostic & Fix Guide

This document identifies specific problems in the current output compared to Watabou's Medieval Fantasy City Generator and provides targeted fixes. Work through these in priority order — each one materially improves the output.

---

## Priority 1: Remove Ward Background Fills (BIGGEST visual impact)

**Problem:** Each ward patch is rendered with a colored background fill, making the Voronoi cell boundaries glaringly obvious. The output looks like a colored patchwork quilt rather than a continuous urban fabric.

**How Watabou works:** Ward patches are never drawn as filled polygons. Only individual *building footprint* polygons are rendered (with fill + optional stroke). The "background" is simply the page/canvas color showing through the gaps between buildings. Streets and alleys are negative space — they're the gaps left by the per-edge inset, not explicitly drawn shapes.

**Fix:**
1. Stop rendering any fill for the ward/patch polygon itself.
2. Render only the building polygons returned by `createAlleys()` / `createOrthoBuilding()`.
3. If you want per-ward color variation, tint the *building fills* by ward type — not the patch background.
4. The canvas/page background should be a single uniform parchment color.

**Verification:** After this fix, you should NOT be able to see where one ward ends and another begins unless the building density or style changes.

---

## Priority 2: Buildings Are Too Large — Fix Coordinate Scale

**Problem:** Buildings are 3–5× too large compared to Watabou's output. In Watabou, the interior is packed with tiny buildings — many are just a few pixels wide at normal zoom. The current output has larger, more uniform buildings with visible gaps.

**Diagnostic steps:**
1. Print the average area of your Voronoi patches (the raw ward polygons before inset).
2. Print the `minSq` value being passed to `createAlleys()`.
3. Print the area of a typical leaf-node building polygon after subdivision.

**Expected relationships in Watabou's coordinate space:**
- A typical ward patch area: ~2000–8000 sq units
- CraftsmenWard `minSq`: 10–90 (i.e., buildings can be as small as 10 sq units)
- Slum `minSq`: 10–40
- A typical building area: 15–200 sq units
- Ratio of building area to patch area: roughly 1:40 to 1:200

**If your patches are much larger** (e.g., area ~50,000), you need to either:
- Scale `minSq` proportionally (multiply by `yourPatchArea / watabouPatchArea`), OR
- Normalize your coordinate system so patch areas match Watabou's range

**Also check the sizeChaos threshold formula:**
```
threshold = minSq * 2^(4 * sizeChaos * (rand() - 0.5))
```
This must use `pow(2, ...)`, not a linear scale. With `sizeChaos=0.6`:
- Minimum threshold: `minSq * 0.24` (buildings can be 4× smaller than minSq)
- Maximum threshold: `minSq * 4.6` (some areas stop subdividing early)

This huge variance is what creates the natural mix of tiny and medium buildings.

**Also check the recursion continuation condition:**
```
doSplit = half.area > minSq / (rand() * rand())
```
Since `rand() * rand()` is heavily biased toward 0 (median ≈ 0.25, often < 0.1), this means `minSq / (rand()*rand())` is usually MUCH larger than `minSq`. So large polygons almost *always* keep splitting. If you've simplified this to `half.area > minSq`, you're terminating recursion way too early.

---

## Priority 3: Street Widths — Scale Inset Distances

**Problem:** The gaps between wards are too wide and too uniform, reading as "borders" rather than streets.

**Diagnostic:** Print the inset distances being applied and compare to the patch dimensions. In Watabou's coordinate system:
- `MAIN_STREET = 2.0` → each side insets by 1.0
- `REGULAR_STREET = 1.0` → each side insets by 0.5
- `ALLEY = 0.6` → each side insets by 0.3

For a ward polygon with a typical edge length of ~50–80 units, these insets are small (1–2% of the edge length). If your edge lengths are 500–800, those same absolute inset values would be negligible, or if you scaled them up to "look right," they'd be too wide.

**Fix:**
1. Ensure inset values are proportional to your coordinate system.
2. Confirm that non-street edges (interior ward-to-ward boundaries that don't lie on an artery) get the SMALLER `REGULAR_STREET/2 = 0.5` inset, NOT the `MAIN_STREET/2 = 1.0` inset.
3. Only edges that are identified as lying along a street artery (from the A* paths) or bordering the plaza should get the wider inset.

**How to check if an edge is "on a street":** For each edge (v0, v1) of a patch, check if both v0 and v1 appear as consecutive vertices in any artery polyline. This is a vertex-identity check (same object/index), not a proximity check.

---

## Priority 4: Wall Smoothing

**Problem:** The city wall is visibly polygonal with sharp angles at each Voronoi vertex. Watabou's walls are smooth, flowing curves.

**How Watabou smooths walls:**
```
factor = min(1.0, 40.0 / nPatches)

for each non-reserved, non-gate vertex v on the wall:
    prev = neighbor before v on wall polygon
    next = neighbor after v on wall polygon
    v.x = v.x + (avg(prev.x, next.x) - v.x) * factor
    v.y = v.y + (avg(prev.y, next.y) - v.y) * factor
```

**Key details:**
- "Reserved" vertices are those on the outer edge of the map (touching countryside). They don't get smoothed.
- Gate vertices get *additional* smoothing after gate selection.
- This is applied to the shared `Point` objects, so the ward patches deform with the wall.
- For small cities (~12 patches), `factor ≈ 1.0` means vertices move ALL the way to the average — very strong smoothing.
- Consider running 2–3 passes of smoothing for a more organic result.

**Also:** After smoothing, the wall should be rendered as a thick line (stroke-width ~2–3 in screen units) with small squares or circles at tower positions (every non-gate wall vertex).

---

## Priority 5: City Shape Too Round

**Problem:** The city outline is close to a perfect circle. Watabou cities have irregular, asymmetric outlines with concavities and protrusions.

**Check these in order:**

**A. Lloyd relaxation scope:** The spec says only relax cells at indices 0, 1, 2, and `nPatches` (the citadel cell). That's 3–4 cells out of potentially 15+. If you're relaxing ALL cells, the Voronoi becomes regular and round. Fix: only relax those specific cells, 3 iterations each.

**B. Spiral seeding:** The angle formula is `sa + sqrt(i) * 5`. The `sqrt` is critical — it makes early points closely spaced in angle (creating the dense center) while outer points spread more evenly. If you're using `i * 5` instead of `sqrt(i) * 5`, the distribution will be wrong.

**C. Number of seed points:** The spec seeds `nPatches * 8` points but only the first `nPatches` cells (sorted by distance from origin) become the city. The extra outer cells create the irregular boundary. If you're not generating enough excess cells, the boundary will be too clean.

**D. Patch selection:** After Voronoi construction, cells are sorted by distance of their seed point from origin. The closest `nPatches` are the city. The boundary's irregularity comes from the fact that the Voronoi cells of these closest seeds don't form a neat circle — some reach further than others.

---

## Priority 6: Outskirts Density Falloff

**Problem:** Buildings outside the walls transition too abruptly from dense to none.

**How `filterOutskirts()` works:**
For each building polygon in an outskirt ward:
1. Compute its distance from the nearest road-adjacent edge of the patch
2. Normalize that distance by the maximum possible distance within the patch
3. Weight by a barycentric density value (1.0 = fully surrounded by city, 0.0 = rural fringe)
4. Keep the building only if `rand() * 1.5 < normalizedDist / densityWeight`

Buildings close to roads and close to the city edge survive. Buildings deep in the outskirt patch far from roads get culled. This creates the natural thinning-out effect.

**Simpler approximation if full implementation is complex:**
For each building in an outskirt ward, compute distance from the city wall boundary. Keep probability = `1.0 - (distance / maxDistance)^0.5`. This creates a gradient from dense (near wall) to sparse (far away).

---

## Priority 7: Rendering Style

**Current issues with visual rendering:**

1. **Building strokes:** In Watabou's default style, buildings have a thin dark stroke (~0.5px) and a warm fill. No glow, no shadow, no color per ward.

2. **Wall rendering:** The wall should be a thick dark polyline (not a filled polygon). Tower positions are small filled squares/circles at each non-gate wall vertex. Gates are indicated by a gap in the wall line with small flanking marks.

3. **Streets are not drawn.** They are purely negative space between buildings. If you're drawing explicit street polygons or lines, remove them.

4. **Background:** A single flat parchment color (#f5f0e6 or similar). No per-ward background fills.

5. **District labels:** In Watabou, district names are rendered as curved text along the main street axes within each ward. This is a polish feature — skip it for now.

---

## Questions for the Agent to Investigate

Please inspect the codebase and report back on:

1. **Coordinate scale:** What is the typical area of a ward polygon? What are the min/max edge lengths? This determines whether `minSq` values from the spec make sense or need scaling.

2. **What is being rendered?** List every type of shape being drawn to the canvas/SVG. Are ward background polygons being drawn? Are street lines being drawn explicitly?

3. **createAlleys recursion:** What is the actual recursion termination condition? Is `minSq / (rand() * rand())` implemented correctly? What is the deepest recursion depth observed for a typical ward?

4. **Wall smoothing:** How many smoothing passes are applied? What is the smoothing factor? Are shared vertex references maintained so patch shapes update when wall vertices move?

5. **Lloyd relaxation:** Which cells are being relaxed? All of them, or only the first 3 + citadel?

6. **Edge classification for inset:** How does the code decide whether a patch edge is "on a street" vs. an interior boundary? Is it checking against the artery polylines?

7. **Building count:** How many total building polygons does a typical generation produce? Watabou typically generates 500–2000+ for a medium city. If yours is under 200, subdivision is terminating too early.
