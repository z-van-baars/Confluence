import type { TerrainData, GenerationParameters, WaterFeature, Point } from '../core/types';
import { SeededRNG } from '../core/rng';

export function generateTerrain(params: GenerationParameters, rng: SeededRNG): TerrainData {
  const { width, height } = params;
  const elevation = new Float32Array(width * height);
  const moisture = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const nx = x / width;
      const ny = y / height;
      elevation[idx] = sampleElevation(nx, ny, params, rng);
      moisture[idx] = 0.5 + (rng.next() - 0.5) * 0.2;
    }
  }

  const water: WaterFeature[] = [];

  if (params.hasRiver) {
    water.push(generateRiver(params, rng));
  }

  const coastline = params.coastDirection !== 'none'
    ? generateCoastline(params, rng)
    : undefined;

  return { width, height, elevation, moisture, water, coastline };
}

function sampleElevation(
  nx: number, ny: number,
  params: GenerationParameters,
  _rng: SeededRNG,
): number {
  const cx = 0.5, cy = 0.5;
  const dist = Math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2);
  let e = 0.5 - dist * 0.3;
  e += Math.sin(nx * 12) * Math.cos(ny * 12) * params.hilliness * 0.1;
  e += Math.sin(nx * 25 + ny * 17) * params.hilliness * 0.05;
  return Math.max(0, Math.min(1, e));
}

function generateRiver(params: GenerationParameters, rng: SeededRNG): WaterFeature {
  const { width, height } = params;
  const path: Point[] = [];
  const startSide = rng.int(0, 3);

  let x: number, y: number;
  switch (startSide) {
    case 0: x = rng.range(width * 0.3, width * 0.7); y = 0; break;
    case 1: x = width; y = rng.range(height * 0.3, height * 0.7); break;
    case 2: x = rng.range(width * 0.3, width * 0.7); y = height; break;
    default: x = 0; y = rng.range(height * 0.3, height * 0.7); break;
  }

  path.push({ x, y });

  const steps = 20;
  const targetX = startSide === 1 ? 0 : startSide === 3 ? width : rng.range(width * 0.3, width * 0.7);
  const targetY = startSide === 0 ? height : startSide === 2 ? 0 : rng.range(height * 0.3, height * 0.7);

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const baseX = x + (targetX - x) * t;
    const baseY = y + (targetY - y) * t;
    path.push({
      x: baseX + rng.gaussian(0, width * 0.03),
      y: baseY + rng.gaussian(0, height * 0.03),
    });
  }

  return {
    id: 'river-main',
    type: 'river',
    path,
    width: 8 + params.riverWidth * 20,
  };
}

function generateCoastline(params: GenerationParameters, rng: SeededRNG): Point[] {
  const { width, height, coastDirection } = params;
  const points: Point[] = [];
  const steps = 30;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wobble = rng.gaussian(0, 15);

    switch (coastDirection) {
      case 'north':
        points.push({ x: t * width, y: height * 0.15 + wobble });
        break;
      case 'south':
        points.push({ x: t * width, y: height * 0.85 + wobble });
        break;
      case 'east':
        points.push({ x: width * 0.85 + wobble, y: t * height });
        break;
      case 'west':
        points.push({ x: width * 0.15 + wobble, y: t * height });
        break;
    }
  }

  return points;
}
