import type { GenerationParameters, Settlement, VoronoiCell } from '../core/types';
import { SeededRNG } from '../core/rng';
import { generateTerrain } from './terrain';
import { generateLayout } from './layout';
import { assignDistricts } from './districts';
import { generateRoads } from './roads';
import { generateParcels } from './parcels';
import { placeBuildings } from './buildings';
import { generateWalls } from './walls';
import { placeLandmarks } from './landmarks';
import { generateVegetation } from './vegetation';

export function generateSettlement(params: GenerationParameters): Settlement {
  const rng = new SeededRNG(params.seed);

  const terrain = generateTerrain(params, rng.fork());
  const layout = generateLayout(params, terrain, rng.fork());
  const districts = assignDistricts(layout, params, rng.fork());
  const walls = generateWalls(layout, params, rng.fork());
  const roads = generateRoads(layout, params, rng.fork(), walls);
  const parcels = generateParcels(layout, districts, params, rng.fork());
  const buildings = placeBuildings(parcels, districts, roads, walls, layout, params, rng.fork());
  const landmarks = placeLandmarks(layout, districts, roads, params, rng.fork());
  const vegetation = generateVegetation(layout, districts, params, rng.fork());

  const name = generateName(rng);

  return {
    seed: params.seed,
    name,
    parameters: params,
    bounds: { x: 0, y: 0, width: params.width, height: params.height },
    terrain,
    layout,
    roads,
    districts,
    parcels,
    buildings,
    walls,
    landmarks,
    vegetation,
    decorations: [],
    dataLayers: buildDataLayers(districts, layout),
    vertexDensity: buildVertexDensityMap(layout.cells),
  };
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

// Average density of all non-boundary cells that share each polygon vertex.
// Key format: "Math.round(x),Math.round(y)"
function buildVertexDensityMap(cells: VoronoiCell[]): Record<string, number> {
  const accum = new Map<string, { sum: number; count: number }>();
  for (const cell of cells) {
    if (cell.isBoundary) continue;
    for (const p of cell.polygon.points) {
      const key = `${Math.round(p.x)},${Math.round(p.y)}`;
      const e = accum.get(key) ?? { sum: 0, count: 0 };
      e.sum += cell.density;
      e.count += 1;
      accum.set(key, e);
    }
  }
  const result: Record<string, number> = {};
  for (const [key, e] of accum) result[key] = e.sum / e.count;
  return result;
}

function buildDataLayers(
  districts: Settlement['districts'],
  layout: Settlement['layout'],
) {
  const densityLayer = {
    id: 'density',
    name: 'Building Density',
    type: 'heatmap' as const,
    visible: false,
    data: layout.cells
      .filter(c => !c.isBoundary)
      .map(cell => ({
        position: cell.site,
        value: cell.density,
      })),
  };

  const wealthLayer = {
    id: 'wealth',
    name: 'Wealth Distribution',
    type: 'heatmap' as const,
    visible: false,
    data: layout.cells
      .filter(c => !c.isBoundary)
      .map(cell => ({
        position: cell.site,
        value: cell.wealth,
      })),
  };

  return [densityLayer, wealthLayer];
}
