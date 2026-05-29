import type { Settlement } from '../core/types';

interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
}

interface GeoJSONCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export function exportGeoJSON(
  settlement: Settlement,
  originLat: number = 0,
  originLng: number = 0,
  metersPerUnit: number = 1,
): void {
  const features: GeoJSONFeature[] = [];

  const toGeo = (x: number, y: number): [number, number] => {
    const meterX = x * metersPerUnit;
    const meterY = y * metersPerUnit;
    const lng = originLng + (meterX / 111320) / Math.cos(originLat * Math.PI / 180);
    const lat = originLat - meterY / 110540;
    return [lng, lat];
  };

  for (const road of settlement.roads) {
    features.push({
      type: 'Feature',
      properties: { type: 'road', roadType: road.type, width: road.width, name: road.name },
      geometry: {
        type: 'LineString',
        coordinates: road.path.map(p => toGeo(p.x, p.y)),
      },
    });
  }

  for (const building of settlement.buildings) {
    const coords = building.footprint.points.map(p => toGeo(p.x, p.y));
    coords.push(coords[0]);
    features.push({
      type: 'Feature',
      properties: {
        type: 'building', buildingType: building.type,
        stories: building.stories, parcelId: building.parcelId,
      },
      geometry: { type: 'Polygon', coordinates: [coords] },
    });
  }

  for (const wall of settlement.walls) {
    features.push({
      type: 'Feature',
      properties: { type: 'wall', layer: wall.layer, thickness: wall.thickness },
      geometry: {
        type: 'LineString',
        coordinates: wall.path.map(p => toGeo(p.x, p.y)),
      },
    });
  }

  for (const landmark of settlement.landmarks) {
    features.push({
      type: 'Feature',
      properties: { type: 'landmark', landmarkType: landmark.type, name: landmark.name },
      geometry: {
        type: 'Point',
        coordinates: toGeo(landmark.position.x, landmark.position.y),
      },
    });
  }

  const collection: GeoJSONCollection = { type: 'FeatureCollection', features };

  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = `${settlement.name}-${settlement.seed}.geojson`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
