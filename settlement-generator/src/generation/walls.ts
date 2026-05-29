import type { GenerationParameters, LayoutData, LayoutEdge, Wall, Gate, WallTower, Point } from '../core/types';
import { SeededRNG } from '../core/rng';
import { smoothPath, segmentIntersection, distance } from '../core/geometry';

export function generateWalls(
  layout: LayoutData,
  params: GenerationParameters,
  rng: SeededRNG,
): Wall[] {
  if (!params.hasWalls) return [];

  const walls: Wall[] = [];
  const layerCount = Math.min(params.wallLayers, 3);

  for (let layer = 0; layer < layerCount; layer++) {
    const radiusFactor = layer === 0
      ? 0.55 + layer * 0.2
      : 0.55 + layer * 0.25;
    const wallRadius = layout.radius * radiusFactor;

    const wall = generateWallRing(layout, wallRadius, layer, params, rng);
    walls.push(wall);
  }

  return walls;
}

function generateWallRing(
  layout: LayoutData,
  radius: number,
  layer: number,
  _params: GenerationParameters,
  rng: SeededRNG,
): Wall {
  const { center } = layout;
  const segments = 24 + rng.int(0, 12);
  const path: Point[] = [];

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const r = radius * (1 + rng.range(-0.08, 0.08));
    path.push({
      x: center.x + Math.cos(angle) * r,
      y: center.y + Math.sin(angle) * r,
    });
  }

  path[path.length - 1] = { ...path[0] };

  const smoothed = smoothPath(path, 1);

  const gateCount = layer === 0 ? rng.int(2, 4) : rng.int(1, 3);
  const gates = generateGatesFromEdges(smoothed, layout.edges, gateCount, rng);

  const towerSpacing = 40 + rng.int(0, 20);
  const towers = generateTowers(smoothed, towerSpacing, gates, rng);

  return {
    id: `wall-${layer}`,
    path: smoothed,
    thickness: 4 - layer,
    gates,
    towers,
    layer,
  };
}

// Gates are placed where the most important Voronoi edges cross the wall.
// This ensures every gate has a natural road connection on both sides.
function generateGatesFromEdges(
  wallPath: Point[],
  layoutEdges: LayoutEdge[],
  count: number,
  rng: SeededRNG,
): Gate[] {
  // Estimate wall perimeter for minimum gate spacing
  let perimeter = 0;
  for (let i = 0; i < wallPath.length - 1; i++) {
    perimeter += distance(wallPath[i], wallPath[i + 1]);
  }
  const minSpacing = perimeter / (count * 2.5);

  // Find every Voronoi edge that crosses the wall path
  const candidates: { position: Point; direction: number; importance: number }[] = [];

  for (const edge of layoutEdges) {
    for (let i = 0; i < wallPath.length - 1; i++) {
      const hit = segmentIntersection(edge.a, edge.b, wallPath[i], wallPath[i + 1]);
      if (!hit) continue;

      const wx = wallPath[i + 1].x - wallPath[i].x;
      const wy = wallPath[i + 1].y - wallPath[i].y;
      candidates.push({
        position: hit.point,
        direction: Math.atan2(wy, wx) + Math.PI / 2,
        importance: edge.importance,
      });
    }
  }

  // Most important crossings first; enforce minimum spacing so gates spread around the wall
  candidates.sort((a, b) => b.importance - a.importance);

  const selected: typeof candidates = [];
  for (const c of candidates) {
    if (selected.length >= count) break;
    const tooClose = selected.some(s => distance(s.position, c.position) < minSpacing);
    if (!tooClose) selected.push(c);
  }

  // Fallback: evenly-spaced positions for any remaining gate slots
  if (selected.length < count) {
    const spacing = Math.floor(wallPath.length / count);
    for (let i = selected.length; i < count; i++) {
      const idx = (spacing * i) % (wallPath.length - 1);
      const pos = wallPath[idx];
      const next = wallPath[(idx + 1) % (wallPath.length - 1)];
      selected.push({
        position: pos,
        direction: Math.atan2(next.y - pos.y, next.x - pos.x) + Math.PI / 2,
        importance: 0,
      });
    }
  }

  return selected.map((s, i) => ({
    id: `gate-${i}`,
    position: s.position,
    direction: s.direction,
    width: 8 + rng.range(0, 4),
    type: i === 0 ? 'main' : rng.chance(0.3) ? 'postern' : 'main',
  }));
}

function generateTowers(
  wallPath: Point[],
  spacing: number,
  gates: Gate[],
  rng: SeededRNG,
): WallTower[] {
  const towers: WallTower[] = [];
  let distAccum = 0;
  let towerId = 0;

  for (let i = 1; i < wallPath.length; i++) {
    const dx = wallPath[i].x - wallPath[i - 1].x;
    const dy = wallPath[i].y - wallPath[i - 1].y;
    distAccum += Math.sqrt(dx * dx + dy * dy);

    if (distAccum >= spacing) {
      distAccum = 0;

      const nearGate = gates.some(g => {
        const gd = Math.sqrt(
          (g.position.x - wallPath[i].x) ** 2 +
          (g.position.y - wallPath[i].y) ** 2,
        );
        return gd < spacing * 0.4;
      });

      if (nearGate) continue;

      towers.push({
        id: `tower-${towerId++}`,
        position: wallPath[i],
        radius: 4 + rng.range(0, 3),
        shape: rng.pick(['round', 'round', 'square', 'octagonal']),
      });
    }
  }

  for (const gate of gates) {
    const offset = gate.width / 2 + 3;
    const dir = gate.direction - Math.PI / 2;
    towers.push({
      id: `tower-gate-${towerId++}`,
      position: {
        x: gate.position.x + Math.cos(dir) * offset,
        y: gate.position.y + Math.sin(dir) * offset,
      },
      radius: 5,
      shape: 'round',
    });
    towers.push({
      id: `tower-gate-${towerId++}`,
      position: {
        x: gate.position.x - Math.cos(dir) * offset,
        y: gate.position.y - Math.sin(dir) * offset,
      },
      radius: 5,
      shape: 'round',
    });
  }

  return towers;
}
