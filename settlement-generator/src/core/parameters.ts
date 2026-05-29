import type { GenerationParameters, SettlementSize } from './types';

export const SIZE_DIMENSIONS: Record<SettlementSize, number> = {
  hamlet: 600,
  village: 800,
  town: 1000,
  city: 1400,
  metropolis: 1800,
};

export const POPULATION_RANGES: Record<SettlementSize, [number, number]> = {
  hamlet: [20, 100],
  village: [100, 500],
  town: [500, 5000],
  city: [5000, 25000],
  metropolis: [25000, 100000],
};

export function defaultParameters(): GenerationParameters {
  const size: SettlementSize = 'town';
  const dim = SIZE_DIMENSIONS[size];
  return {
    seed: Math.floor(Math.random() * 2147483647),
    width: dim,
    height: dim,

    size,
    population: 2000,
    style: 'medieval',

    hasRiver: false,
    riverWidth: 0.4,
    coastDirection: 'none',
    hilliness: 0.3,

    organicness: 0.7,
    density: 0.5,
    hasWalls: true,
    wallLayers: 1,

    hasCastle: true,
    hasTemple: true,
    hasMarket: true,
    hasPort: false,

    roadDensity: 0.6,
    vegetationDensity: 0.4,
  };
}

export function populationForSize(size: SettlementSize, t: number = 0.5): number {
  const [min, max] = POPULATION_RANGES[size];
  return Math.round(min + (max - min) * t);
}

export function sizeFromPopulation(pop: number): SettlementSize {
  if (pop < 100) return 'hamlet';
  if (pop < 500) return 'village';
  if (pop < 5000) return 'town';
  if (pop < 25000) return 'city';
  return 'metropolis';
}

export interface ParameterDef {
  key: keyof GenerationParameters;
  label: string;
  section: string;
  type: 'slider' | 'select' | 'checkbox' | 'seed';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

export const PARAMETER_DEFS: ParameterDef[] = [
  { key: 'seed', label: 'Seed', section: 'General', type: 'seed' },
  {
    key: 'size',
    label: 'Size',
    section: 'General',
    type: 'select',
    options: [
      { value: 'hamlet', label: 'Hamlet' },
      { value: 'village', label: 'Village' },
      { value: 'town', label: 'Town' },
      { value: 'city', label: 'City' },
      { value: 'metropolis', label: 'Metropolis' },
    ],
  },
  { key: 'population', label: 'Population', section: 'General', type: 'slider', min: 20, max: 100000, step: 10 },
  {
    key: 'style',
    label: 'Style',
    section: 'General',
    type: 'select',
    options: [
      { value: 'medieval', label: 'Medieval' },
      { value: 'fantasy', label: 'Fantasy' },
      { value: 'roman', label: 'Roman' },
      { value: 'oriental', label: 'Oriental' },
    ],
  },

  { key: 'organicness', label: 'Organicness', section: 'Layout', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'density', label: 'Density', section: 'Layout', type: 'slider', min: 0.1, max: 1, step: 0.01 },
  { key: 'roadDensity', label: 'Road Density', section: 'Layout', type: 'slider', min: 0.2, max: 1, step: 0.01 },

  { key: 'hasWalls', label: 'Walls', section: 'Features', type: 'checkbox' },
  { key: 'wallLayers', label: 'Wall Layers', section: 'Features', type: 'slider', min: 1, max: 3, step: 1 },
  { key: 'hasCastle', label: 'Castle', section: 'Features', type: 'checkbox' },
  { key: 'hasTemple', label: 'Temple', section: 'Features', type: 'checkbox' },
  { key: 'hasMarket', label: 'Market', section: 'Features', type: 'checkbox' },
  { key: 'hasPort', label: 'Port', section: 'Features', type: 'checkbox' },

  { key: 'hasRiver', label: 'River', section: 'Terrain', type: 'checkbox' },
  { key: 'riverWidth', label: 'River Width', section: 'Terrain', type: 'slider', min: 0.1, max: 1, step: 0.01 },
  {
    key: 'coastDirection',
    label: 'Coast',
    section: 'Terrain',
    type: 'select',
    options: [
      { value: 'none', label: 'None' },
      { value: 'north', label: 'North' },
      { value: 'south', label: 'South' },
      { value: 'east', label: 'East' },
      { value: 'west', label: 'West' },
    ],
  },
  { key: 'hilliness', label: 'Hilliness', section: 'Terrain', type: 'slider', min: 0, max: 1, step: 0.01 },
  { key: 'vegetationDensity', label: 'Vegetation', section: 'Terrain', type: 'slider', min: 0, max: 1, step: 0.01 },
];
