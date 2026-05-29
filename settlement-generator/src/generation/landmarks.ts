import type { GenerationParameters, LayoutData, District, Road, Landmark, LandmarkType, Point } from '../core/types';
import { SeededRNG } from '../core/rng';
import { polygonCentroid, distance } from '../core/geometry';

export function placeLandmarks(
  layout: LayoutData,
  districts: District[],
  roads: Road[],
  params: GenerationParameters,
  rng: SeededRNG,
): Landmark[] {
  const landmarks: Landmark[] = [];
  let id = 0;

  if (params.hasMarket) {
    const marketDistrict = districts.find(d => d.type === 'market');
    if (marketDistrict) {
      const cell = layout.cells.find(c => marketDistrict.cellIds.includes(c.id));
      if (cell) {
        landmarks.push({
          id: `landmark-${id++}`,
          position: polygonCentroid(cell.polygon),
          type: 'market_square',
          radius: 15 + rng.range(0, 10),
          name: 'Market Square',
        });
      }
    }
  }

  if (params.hasCastle) {
    const castleDistrict = districts.find(d => d.type === 'castle');
    if (castleDistrict) {
      const cell = layout.cells.find(c => castleDistrict.cellIds.includes(c.id));
      if (cell) {
        landmarks.push({
          id: `landmark-${id++}`,
          position: polygonCentroid(cell.polygon),
          type: 'castle',
          radius: 20,
          name: 'Castle',
        });
      }
    }
  }

  if (params.hasTemple) {
    const templeDistrict = districts.find(d => d.type === 'temple');
    if (templeDistrict) {
      const cell = layout.cells.find(c => templeDistrict.cellIds.includes(c.id));
      if (cell) {
        landmarks.push({
          id: `landmark-${id++}`,
          position: polygonCentroid(cell.polygon),
          type: 'cathedral',
          radius: 20,
          name: 'Cathedral',
        });
      }
    }
  }

  const intersections = findRoadIntersections(roads);
  for (const intersection of intersections) {
    if (distance(intersection, layout.center) > layout.radius * 0.5) continue;
    if (!rng.chance(0.25)) continue;

    const type = rng.pick<LandmarkType>(['fountain', 'well', 'statue', 'cross']);
    landmarks.push({
      id: `landmark-${id++}`,
      position: intersection,
      type,
      radius: type === 'fountain' ? 6 : 3,
    });
  }

  for (const district of districts) {
    if (district.type === 'residential' || district.type === 'poor') {
      if (rng.chance(0.4)) {
        const cell = rng.pick(
          layout.cells.filter(c => district.cellIds.includes(c.id)),
        );
        if (cell) {
          landmarks.push({
            id: `landmark-${id++}`,
            position: polygonCentroid(cell.polygon),
            type: 'well',
            radius: 3,
          });
        }
      }
    }
  }

  return landmarks;
}

function findRoadIntersections(roads: Road[]): Point[] {
  const intersections: Point[] = [];
  const gridSize = 15;
  const grid = new Map<string, Point[]>();

  for (const road of roads) {
    for (const point of road.path) {
      const key = `${Math.floor(point.x / gridSize)},${Math.floor(point.y / gridSize)}`;
      const bucket = grid.get(key) ?? [];
      bucket.push(point);
      grid.set(key, bucket);
    }
  }

  for (const [, points] of grid) {
    if (points.length >= 3) {
      const avg: Point = {
        x: points.reduce((s, p) => s + p.x, 0) / points.length,
        y: points.reduce((s, p) => s + p.y, 0) / points.length,
      };
      intersections.push(avg);
    }
  }

  return intersections;
}
