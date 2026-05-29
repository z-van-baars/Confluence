import type {
  GenerationParameters, LayoutData, District, VegetationCluster,
  TreeInstance, VegetationType, Point,
} from '../core/types';
import { SeededRNG } from '../core/rng';
import { distance, pointInPolygon, polygonCentroid } from '../core/geometry';

export function generateVegetation(
  layout: LayoutData,
  districts: District[],
  params: GenerationParameters,
  rng: SeededRNG,
): VegetationCluster[] {
  const clusters: VegetationCluster[] = [];
  let clusterId = 0;

  for (const district of districts) {
    const vegChance = vegetationChance(district.type) * params.vegetationDensity;
    if (vegChance <= 0) continue;

    for (const cellId of district.cellIds) {
      const cell = layout.cells.find(c => c.id === cellId);
      if (!cell) continue;
      if (!rng.chance(vegChance)) continue;

      const center = polygonCentroid(cell.polygon);
      const radius = 10 + rng.range(5, 30) * params.vegetationDensity;
      const density = 0.3 + rng.range(0, 0.5);
      const type = pickVegetationType(district.type, rng);
      const trees = generateTrees(center, radius, density, type, cell.polygon, rng);

      if (trees.length > 0) {
        clusters.push({
          id: `veg-${clusterId++}`,
          position: center,
          radius,
          density,
          type,
          trees,
        });
      }
    }
  }

  const outerTreeCount = Math.floor(15 * params.vegetationDensity);
  for (let i = 0; i < outerTreeCount; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const r = layout.radius * rng.range(0.7, 1.3);
    const center: Point = {
      x: layout.center.x + Math.cos(angle) * r,
      y: layout.center.y + Math.sin(angle) * r,
    };

    if (center.x < 0 || center.x > params.width || center.y < 0 || center.y > params.height) continue;

    const radius = 15 + rng.range(5, 40);
    const type = rng.pick<VegetationType>(['deciduous', 'deciduous', 'conifer', 'bush']);
    const trees = generateTreesSimple(center, radius, 0.5, type, rng);

    clusters.push({
      id: `veg-${clusterId++}`,
      position: center,
      radius,
      density: 0.5,
      type,
      trees,
    });
  }

  return clusters;
}

function vegetationChance(districtType: string): number {
  const chances: Record<string, number> = {
    garden: 0.9,
    farmland: 0.4,
    noble: 0.5,
    temple: 0.4,
    residential: 0.15,
    poor: 0.05,
    craftsmen: 0.05,
    market: 0.02,
    castle: 0.2,
    warehouse: 0.02,
    military: 0.1,
  };
  return chances[districtType] ?? 0.1;
}

function pickVegetationType(districtType: string, rng: SeededRNG): VegetationType {
  if (districtType === 'garden' || districtType === 'noble') {
    return rng.pick<VegetationType>(['deciduous', 'hedge', 'bush']);
  }
  if (districtType === 'farmland') {
    return rng.pick<VegetationType>(['deciduous', 'bush']);
  }
  return rng.pick<VegetationType>(['deciduous', 'conifer', 'bush']);
}

function generateTrees(
  center: Point,
  radius: number,
  density: number,
  type: VegetationType,
  cellPoly: { points: Point[] },
  rng: SeededRNG,
): TreeInstance[] {
  const trees: TreeInstance[] = [];
  const count = Math.floor(density * radius * 0.5);

  for (let i = 0; i < count; i++) {
    const p = rng.pointInCircle(center, radius);
    if (!pointInPolygon(p, cellPoly)) continue;

    trees.push({
      position: p,
      size: 2 + rng.range(1, 5),
      type,
    });
  }

  return trees;
}

function generateTreesSimple(
  center: Point,
  radius: number,
  density: number,
  type: VegetationType,
  rng: SeededRNG,
): TreeInstance[] {
  const trees: TreeInstance[] = [];
  const count = Math.floor(density * radius * 0.4);

  for (let i = 0; i < count; i++) {
    const p = rng.pointInCircle(center, radius);
    trees.push({
      position: p,
      size: 3 + rng.range(1, 6),
      type,
    });
  }

  return trees;
}
