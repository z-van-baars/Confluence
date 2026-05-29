import type {
  GenerationParameters, Settlement, TownModel,
  Building, BuildingType, Road, Wall, Gate, WallTower, District, DistrictType,
} from '../core/types';
import { SeededRNG } from '../core/rng';
import { polygonCentroid } from '../core/geometry';
import { generateTerrain } from './terrain';
import { placeLandmarks } from './landmarks';
import { generateVegetation } from './vegetation';
import { buildTownModel } from './watabou/index';

export function generateSettlement(params: GenerationParameters): Settlement {
  const rng = new SeededRNG(params.seed);

  const terrain = generateTerrain(params, rng.fork());
  let model;
  try {
    model = buildTownModel(params, rng.fork());
  } catch (err) {
    console.error('[Confluence] buildTownModel failed:', err);
    throw err;
  }
  console.log(`[Confluence] model: ${model.innerPatches.length} inner patches, ${model.arteries.length} arteries, ${model.gates.length} gates, ${model.patches.filter(p => p.geometry.length > 0).length} patches with geometry`);

  // ── Map TownModel → Settlement fields ──
  const roads = modelToRoads(model);
  const walls = modelToWalls(model);
  const districts = modelToDistricts(model);
  const buildings = modelToBuildings(model);

  // Layout adapter: give renderer access to patch shapes via legacy VoronoiCell interface
  const layout = modelToLayout(model, params);

  const name = generateName(rng);

  // Landmarks and vegetation still use the legacy layout/districts API
  const legacyDistricts = districts;
  const landmarks = placeLandmarks(layout, legacyDistricts, roads, params, rng.fork());
  const vegetation = generateVegetation(layout, legacyDistricts, params, rng.fork());

  return {
    seed: params.seed,
    name,
    parameters: params,
    bounds: { x: 0, y: 0, width: params.width, height: params.height },
    terrain,
    layout,
    roads,
    districts,
    parcels: [],
    buildings,
    walls,
    landmarks,
    vegetation,
    decorations: [],
    dataLayers: [],
    vertexDensity: {},
    model,
  };
}

// ── Adapters ────────────────────────────────────────────────────────────────

function modelToRoads(model: TownModel): Road[] {
  let seq = 0;
  return model.arteries.map(a => ({
    id: `road-${seq++}`,
    path: a.path,
    width: 5,
    type: 'main' as Road['type'],
  }));
}

function modelToWalls(model: TownModel): Wall[] {
  const walls: Wall[] = [];

  if (model.border.isReal && model.border.shape.length >= 3) {
    walls.push({
      id: 'wall-outer',
      path: [...model.border.shape, model.border.shape[0]],
      thickness: 4,
      layer: 0,
      gates: model.border.gates.map((g, i) => {
        const shape = model.border.shape;
        const n = shape.length;
        const gIdx = shape.indexOf(g);
        let direction = 0;
        if (gIdx >= 0) {
          const prev = shape[(gIdx - 1 + n) % n];
          const next = shape[(gIdx + 1) % n];
          const dx = next.x - prev.x;
          const dy = next.y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0) {
            // perpendicular to wall tangent = direction through the gate opening
            direction = Math.atan2(dx, -dy);
          }
        }
        return {
          id: `gate-${i}`,
          position: g,
          direction,
          width: 16,
          type: 'main' as Gate['type'],
        };
      }),
      towers: model.border.towers.map((t, i) => ({
        id: `tower-${i}`,
        position: t,
        radius: 5,
        shape: 'round' as WallTower['shape'],
      })),
    });
  }

  if (model.wall && model.wall.shape.length >= 3) {
    walls.push({
      id: 'wall-castle',
      path: [...model.wall.shape, model.wall.shape[0]],
      thickness: 3,
      layer: 1,
      gates: [],
      towers: model.wall.towers.map((t, i) => ({
        id: `castle-tower-${i}`,
        position: t,
        radius: 4,
        shape: 'square' as WallTower['shape'],
      })),
    });
  }

  return walls;
}

function modelToDistricts(model: TownModel): District[] {
  const districtMap = new Map<string, number[]>();
  for (const patch of model.patches) {
    const type = wardToDistrict(patch.wardType);
    const key = type;
    if (!districtMap.has(key)) districtMap.set(key, []);
    districtMap.get(key)!.push(patch.id);
  }

  return Array.from(districtMap.entries()).map(([type, cellIds], i) => ({
    id: `district-${i}`,
    cellIds,
    type: type as DistrictType,
    density: districtDensity(type as DistrictType),
    wealth: districtWealth(type as DistrictType),
  }));
}

function modelToBuildings(model: TownModel): Building[] {
  const buildings: Building[] = [];
  let seq = 0;

  for (const patch of model.patches) {
    if (!patch.geometry.length) continue;
    const type = wardToBuildingType(patch.wardType);

    for (const footprint of patch.geometry) {
      if (footprint.length < 3) continue;
      buildings.push({
        id: `bldg-${seq++}`,
        footprint: { points: footprint },
        type,
        stories: 1,
        parcelId: `patch-${patch.id}`,
        rotation: 0,
        frontFacing: 0,
      });
    }
  }

  return buildings;
}

function modelToLayout(model: TownModel, params: GenerationParameters): Settlement['layout'] {
  // Wrap patches as VoronoiCell[] for backward compat with landmarks/vegetation
  const cells = model.patches.map(p => ({
    id: p.id,
    site: p.site,
    polygon: { points: p.shape },
    neighbors: [],
    distanceToCenter: Math.sqrt(
      (p.site.x - model.center.x) ** 2 + (p.site.y - model.center.y) ** 2,
    ),
    area: 0,
    density: p.withinCity ? 0.5 : 0.05,
    wealth: p.withinCity ? 0.5 : 0.1,
    districtType: wardToDistrict(p.wardType) as any,
    isBoundary: !p.withinCity && p.wardType === 'generic',
  }));

  const radius = Math.min(params.width, params.height) * 0.4;
  return {
    seedPoints: model.patches.map(p => p.site),
    cells,
    edges: [],
    center: model.center,
    radius,
    wallRadius: radius * 0.55,
  };
}

// ── Ward → legacy type mappings ─────────────────────────────────────────────

function wardToDistrict(ward: string | null): DistrictType {
  const map: Record<string, DistrictType> = {
    castle: 'castle',
    market: 'market',
    merchant: 'market',
    craftsmen: 'craftsmen',
    slum: 'poor',
    gate: 'residential',
    patriciate: 'noble',
    military: 'military',
    park: 'garden',
    cathedral: 'temple',
    administration: 'noble',
    farm: 'farmland',
    generic: 'farmland',
  };
  return map[ward ?? 'generic'] ?? 'residential';
}

function wardToBuildingType(ward: string | null): BuildingType {
  const map: Record<string, BuildingType> = {
    castle: 'castle_keep',
    market: 'shop',
    merchant: 'shop',
    craftsmen: 'workshop',
    slum: 'hovel',
    gate: 'house',
    patriciate: 'mansion',
    military: 'barracks',
    park: 'house',
    cathedral: 'temple',
    administration: 'town_hall',
    farm: 'stable',
    generic: 'house',
  };
  return map[ward ?? 'generic'] ?? 'house';
}

function districtDensity(type: DistrictType): number {
  const d: Record<DistrictType, number> = {
    castle: 0.7, noble: 0.5, temple: 0.4, market: 0.8,
    residential: 0.7, poor: 0.9, craftsmen: 0.6, warehouse: 0.4,
    military: 0.5, garden: 0.1, farmland: 0.05,
  };
  return d[type] ?? 0.5;
}

function districtWealth(type: DistrictType): number {
  const w: Record<DistrictType, number> = {
    castle: 0.95, noble: 0.85, temple: 0.7, market: 0.6,
    residential: 0.5, poor: 0.15, craftsmen: 0.45, warehouse: 0.35,
    military: 0.5, garden: 0.6, farmland: 0.2,
  };
  return w[type] ?? 0.5;
}

function generateName(rng: SeededRNG): string {
  const prefixes = [
    'Oak', 'Stone', 'Iron', 'Silver', 'Gold', 'White', 'Black', 'Red',
    'Green', 'High', 'Low', 'North', 'South', 'East', 'West', 'Old',
    'New', 'Bright', 'Dark', 'Grey', 'Ash', 'Elm', 'Thorn', 'Raven',
    'Wolf', 'Bear', 'Stag', 'Hawk', 'Frost', 'Storm', 'Sun', 'Moon',
    'River', 'Lake', 'Hill', 'Dale', 'Glen', 'Marsh', 'Moor', 'Cliff',
  ];
  const suffixes = [
    'wick', 'ford', 'bury', 'ton', 'ham', 'stead', 'worth', 'field',
    'gate', 'bridge', 'haven', 'hold', 'keep', 'wall', 'helm', 'watch',
    'crest', 'moor', 'dale', 'glen', 'wood', 'brook', 'well', 'march',
    'reach', 'fall', 'hollow', 'ridge', 'port', 'mouth',
  ];
  return rng.pick(prefixes) + rng.pick(suffixes);
}

void polygonCentroid; // available for future use
