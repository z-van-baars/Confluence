import type { GenerationParameters, TownModel } from '../../core/types';
import { SeededRNG } from '../../core/rng';
import { buildPatches } from './buildPatches';
import { buildWalls } from './buildWalls';
import { buildTopology } from './topology';
import { buildStreets } from './buildStreets';
import { createWards } from './createWards';
import { buildGeometry } from './buildGeometry';

export function buildTownModel(params: GenerationParameters, rng: SeededRNG): TownModel {
  const { patches, innerPatches, citadel, plaza, center, scale } =
    buildPatches(params, rng.fork());

  const { border, wall, gates } =
    buildWalls(patches, innerPatches, citadel, params, rng.fork(), scale);

  const castleWall = wall; // castle wall, if hasCastle
  const topology = buildTopology(patches, border, castleWall, gates);

  const { arteries, streets, roads } =
    buildStreets(innerPatches, topology, plaza, center, gates);

  createWards(patches, innerPatches, citadel, plaza, gates, params, rng.fork());

  const debugBlock = buildGeometry(patches, arteries, border.isReal ? border : null, plaza ?? null, params, rng.fork(), scale) ?? undefined;

  return {
    patches,
    innerPatches,
    citadel: citadel ?? null,
    plaza: plaza ?? null,
    center,
    border,
    wall: castleWall,
    gates,
    arteries,
    streets,
    roads,
    scale,
    debugBlock,
  };
}
