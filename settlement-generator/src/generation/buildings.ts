import type {
  GenerationParameters, Parcel, District, Building, BuildingType,
  Road, Wall, Point, LayoutData,
} from '../core/types';
import { SeededRNG } from '../core/rng';
import { polygonCentroid, polygonBounds, polygonArea, distance, angle } from '../core/geometry';

export function placeBuildings(
  parcels: Parcel[],
  districts: District[],
  roads: Road[],
  walls: Wall[],
  layout: LayoutData,
  params: GenerationParameters,
  rng: SeededRNG,
): Building[] {
  const buildings: Building[] = [];
  let buildingId = 0;

  const districtMap = new Map<string, District>();
  for (const d of districts) districtMap.set(d.id, d);

  const gatePositions = walls.flatMap(w => w.gates.map(g => g.position));
  const { wallRadius, center } = layout;

  for (const parcel of parcels) {
    const district = districtMap.get(parcel.districtId);
    if (!district) continue;

    const parcelCenter = polygonCentroid(parcel.polygon);
    const distToCenter = distance(parcelCenter, center);

    const isOutsideWall = params.hasWalls && distToCenter > wallRadius;

    if (isOutsideWall) {
      const distBeyondWall = distToCenter - wallRadius;
      const maxExtra = layout.radius - wallRadius;
      const normalizedBeyond = maxExtra > 0 ? distBeyondWall / maxExtra : 1;

      const nearestGateDist = gatePositions.length > 0
        ? Math.min(...gatePositions.map(g => distance(parcelCenter, g)))
        : Infinity;
      const gateProximity = Math.max(0, 1 - nearestGateDist / (wallRadius * 0.35));

      const outsideChance = gateProximity * 0.65 + Math.max(0, (1 - normalizedBeyond) * 0.1);
      if (!rng.chance(outsideChance)) continue;
    }

    let placementChance: number;
    if (district.type === 'farmland') {
      placementChance = 0.03 + rng.range(0, 0.02);
    } else if (district.type === 'garden') {
      placementChance = 0.06 + rng.range(0, 0.04);
    } else {
      const base = district.density + 0.2;
      placementChance = Math.min(0.98, base * (0.6 + params.density * 0.6));
    }
    if (!rng.chance(placementChance)) continue;

    const b = createBuilding(parcel, district, roads, `bldg-${buildingId++}`, rng);
    if (!b) continue;

    if (tooCloseToWall(b.footprint.points, walls)) continue;

    buildings.push(b);
  }

  // Courtyard deletion pass — selectively remove buildings to create
  // courtyards and open spaces. Rare in the core, more common on outskirts.
  const parcelMap = new Map<string, Parcel>();
  for (const p of parcels) parcelMap.set(p.id, p);

  const surviving: Building[] = [];
  for (const b of buildings) {
    const bCenter = polygonCentroid(b.footprint);
    const distToCenter = distance(bCenter, center);
    const normalizedDist = wallRadius > 0 ? distToCenter / wallRadius : distToCenter / layout.radius;

    let deletionChance: number;
    if (normalizedDist < 0.3) deletionChance = 0.02;
    else if (normalizedDist < 0.6) deletionChance = 0.04;
    else if (normalizedDist < 1.0) deletionChance = 0.10;
    else deletionChance = 0.20;

    const parcel = parcelMap.get(b.parcelId);
    const dist = parcel ? districtMap.get(parcel.districtId) : undefined;
    if (dist?.type === 'castle') deletionChance *= 0.3;

    if (!rng.chance(deletionChance)) {
      surviving.push(b);
    }
  }

  return surviving;
}

function tooCloseToWall(points: Point[], walls: Wall[]): boolean {
  for (const wall of walls) {
    for (const pt of points) {
      for (let i = 0; i < wall.path.length - 1; i++) {
        const a = wall.path[i];
        const b = wall.path[i + 1];
        if (pointToSegmentDist(pt, a, b) < wall.thickness + 3) return true;
      }
    }
  }
  return false;
}

function pointToSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const ex = p.x - projX;
  const ey = p.y - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

function createBuilding(
  parcel: Parcel,
  district: District,
  roads: Road[],
  id: string,
  rng: SeededRNG,
): Building | null {
  const shape = parcel.polygon;
  if (shape.points.length < 3) return null;

  const bounds = polygonBounds(shape);
  if (bounds.width < 3 || bounds.height < 3) return null;
  if (polygonArea(shape) < 10) return null;

  const center = polygonCentroid(parcel.polygon);
  const nearestRoad = findNearestRoadPoint(center, roads);
  const facing = nearestRoad ? angle(center, nearestRoad) : rng.range(0, Math.PI * 2);
  const type = pickBuildingType(district, rng);

  return {
    id,
    footprint: shape,
    type,
    stories: pickStories(type, district, rng),
    parcelId: parcel.id,
    rotation: 0,
    frontFacing: facing,
  };
}

function findNearestRoadPoint(point: Point, roads: Road[]): Point | null {
  let nearest: Point | null = null;
  let minDist = Infinity;

  for (const road of roads) {
    for (const rp of road.path) {
      const d = distance(point, rp);
      if (d < minDist) {
        minDist = d;
        nearest = rp;
      }
    }
  }

  return nearest;
}

function pickBuildingType(district: District, rng: SeededRNG): BuildingType {
  const typeWeights: Record<string, [BuildingType, number][]> = {
    castle: [['castle_keep', 0.3], ['castle_tower', 0.3], ['barracks', 0.2], ['stable', 0.2]],
    noble: [['mansion', 0.6], ['house', 0.3], ['stable', 0.1]],
    temple: [['temple', 0.4], ['church', 0.3], ['house', 0.2], ['guild_hall', 0.1]],
    market: [['shop', 0.4], ['tavern', 0.2], ['inn', 0.15], ['warehouse', 0.15], ['bakery', 0.1]],
    residential: [['house', 0.7], ['shop', 0.15], ['workshop', 0.1], ['stable', 0.05]],
    poor: [['hovel', 0.6], ['house', 0.25], ['workshop', 0.1], ['tannery', 0.05]],
    craftsmen: [['workshop', 0.35], ['blacksmith', 0.2], ['house', 0.2], ['warehouse', 0.15], ['mill', 0.1]],
    warehouse: [['warehouse', 0.5], ['workshop', 0.2], ['stable', 0.2], ['house', 0.1]],
    military: [['barracks', 0.4], ['stable', 0.2], ['warehouse', 0.2], ['house', 0.2]],
    garden: [['house', 0.8], ['stable', 0.2]],
    farmland: [['house', 0.5], ['stable', 0.3], ['mill', 0.2]],
  };

  const weights = typeWeights[district.type] ?? [['house', 1]];
  const roll = rng.next();
  let cumulative = 0;

  for (const [type, weight] of weights) {
    cumulative += weight;
    if (roll <= cumulative) return type;
  }

  return weights[weights.length - 1][0];
}

function pickStories(type: BuildingType, district: District, rng: SeededRNG): number {
  const baseStories: Record<BuildingType, number> = {
    house: 1, mansion: 2, hovel: 1, shop: 1, tavern: 2, inn: 2,
    temple: 1, church: 1, castle_keep: 3, castle_tower: 4, barracks: 2,
    warehouse: 1, workshop: 1, stable: 1, mill: 2, bakery: 1,
    blacksmith: 1, tannery: 1, guild_hall: 2, town_hall: 2,
  };

  const base = baseStories[type] ?? 1;
  const wealthBonus = district.wealth > 0.6 ? rng.int(0, 1) : 0;
  return base + wealthBonus;
}
