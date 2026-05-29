import type { GenerationParameters, LayoutData, District, DistrictType, VoronoiCell } from '../core/types';
import { SeededRNG } from '../core/rng';

export function assignDistricts(
  layout: LayoutData,
  params: GenerationParameters,
  rng: SeededRNG,
): District[] {
  const { cells, wallRadius } = layout;
  const districts: District[] = [];
  const cellAssignments = new Map<number, string>();

  const activeCells = cells.filter(c => !c.isBoundary);

  const centerCell = activeCells.reduce((closest, cell) =>
    cell.distanceToCenter < closest.distanceToCenter ? cell : closest,
  );

  if (params.hasCastle) {
    const d = createDistrict('castle', [centerCell], rng);
    districts.push(d);
    cellAssignments.set(centerCell.id, d.id);
    stampCells([centerCell], 'castle', 0.7, 0.95);
  }

  const sorted = [...activeCells]
    .filter(c => !cellAssignments.has(c.id))
    .sort((a, b) => a.distanceToCenter - b.distanceToCenter);

  const innerCells = sorted.filter(c => c.distanceToCenter < wallRadius * 0.5);
  const midCells = sorted.filter(c =>
    c.distanceToCenter >= wallRadius * 0.5 && c.distanceToCenter < wallRadius,
  );
  const outerCells = sorted.filter(c => c.distanceToCenter >= wallRadius);

  if (params.hasTemple && innerCells.length > 0) {
    const templeCell = rng.pick(innerCells);
    const d = createDistrict('temple', [templeCell], rng);
    districts.push(d);
    cellAssignments.set(templeCell.id, d.id);
    stampCells([templeCell], 'temple', 0.4, 0.7);
  }

  if (params.hasMarket && innerCells.length > 0) {
    const available = innerCells.filter(c => !cellAssignments.has(c.id));
    if (available.length > 0) {
      const marketCell = rng.pick(available);
      const d = createDistrict('market', [marketCell], rng);
      districts.push(d);
      cellAssignments.set(marketCell.id, d.id);
      stampCells([marketCell], 'market', 0.85, 0.6);
    }
  }

  const unassignedInner = innerCells.filter(c => !cellAssignments.has(c.id));
  if (unassignedInner.length > 0) {
    const d = createDistrict('noble', unassignedInner, rng);
    districts.push(d);
    for (const c of unassignedInner) cellAssignments.set(c.id, d.id);
    stampCells(unassignedInner, 'noble', 0.5, 0.85);
  }

  const midTypes: DistrictType[] = ['residential', 'craftsmen', 'warehouse'];
  const midDensities = [0.7, 0.6, 0.4];
  const midWealth = [0.5, 0.45, 0.35];
  const midChunks = chunkCells(midCells.filter(c => !cellAssignments.has(c.id)), midTypes.length);
  for (let i = 0; i < midChunks.length; i++) {
    if (midChunks[i].length === 0) continue;
    const type = midTypes[i % midTypes.length];
    const d = createDistrict(type, midChunks[i], rng);
    districts.push(d);
    for (const c of midChunks[i]) cellAssignments.set(c.id, d.id);
    stampCells(midChunks[i], type, midDensities[i % midTypes.length], midWealth[i % midTypes.length]);
  }

  const outerUnassigned = outerCells.filter(c => !cellAssignments.has(c.id));
  if (outerUnassigned.length > 0) {
    const d = createDistrict('farmland', outerUnassigned, rng);
    districts.push(d);
    for (const c of outerUnassigned) cellAssignments.set(c.id, d.id);
    stampCells(outerUnassigned, 'farmland', 0.03, 0.15);
  }

  const boundaryCells = cells.filter(c => c.isBoundary);
  if (boundaryCells.length > 0) {
    const d = createDistrict('farmland', boundaryCells, rng);
    districts.push(d);
    stampCells(boundaryCells, 'farmland', 0, 0);
  }

  const remaining = cells.filter(c => !cellAssignments.has(c.id) && !c.isBoundary);
  if (remaining.length > 0) {
    const d = createDistrict('farmland', remaining, rng);
    districts.push(d);
    stampCells(remaining, 'farmland', 0.03, 0.15);
  }

  return districts;
}

function stampCells(
  cells: VoronoiCell[],
  type: DistrictType,
  density: number,
  wealth: number,
): void {
  for (const cell of cells) {
    cell.districtType = type;
    cell.density = density;
    cell.wealth = wealth;
  }
}

function createDistrict(type: DistrictType, cells: VoronoiCell[], rng: SeededRNG): District {
  const density = districtDensity(type) + rng.range(-0.1, 0.1);
  const wealth = districtWealth(type) + rng.range(-0.1, 0.1);

  return {
    id: `district-${type}-${rng.int(1000, 9999)}`,
    cellIds: cells.map(c => c.id),
    type,
    density: Math.max(0, Math.min(1, density)),
    wealth: Math.max(0, Math.min(1, wealth)),
  };
}

function districtDensity(type: DistrictType): number {
  const densities: Record<DistrictType, number> = {
    castle: 0.7, noble: 0.5, temple: 0.4, market: 0.8,
    residential: 0.7, poor: 0.9, craftsmen: 0.6, warehouse: 0.4,
    military: 0.5, garden: 0.1, farmland: 0.05,
  };
  return densities[type];
}

function districtWealth(type: DistrictType): number {
  const wealth: Record<DistrictType, number> = {
    castle: 0.95, noble: 0.85, temple: 0.7, market: 0.6,
    residential: 0.5, poor: 0.15, craftsmen: 0.45, warehouse: 0.35,
    military: 0.5, garden: 0.6, farmland: 0.2,
  };
  return wealth[type];
}

function chunkCells(cells: VoronoiCell[], n: number): VoronoiCell[][] {
  if (n <= 0) return [cells];
  const chunks: VoronoiCell[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < cells.length; i++) {
    chunks[i % n].push(cells[i]);
  }
  return chunks;
}
