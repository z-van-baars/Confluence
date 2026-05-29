import type { GenerationParameters, Patch, WardType, Point } from '../../core/types';
import { SeededRNG } from '../../core/rng';
import { distance, polygonArea, polygonCentroid } from '../../core/geometry';

// Weighted pool of ward types (excluding castle, market, gate — assigned manually)
const WARD_WEIGHTS: [WardType, number][] = [
  ['craftsmen',      18],
  ['merchant',        2],
  ['cathedral',       1],
  ['administration',  1],
  ['slum',            4],
  ['patriciate',      2],
  ['market',          2],
  ['military',        1],
  ['park',            1],
];

export function createWards(
  patches: Patch[],
  innerPatches: Patch[],
  citadel: Patch | null,
  plaza: Patch | null,
  gates: Point[],
  params: GenerationParameters,
  rng: SeededRNG,
): void {
  const assigned = new Set<Patch>();

  // Citadel → castle
  if (citadel) {
    citadel.wardType = 'castle';
    assigned.add(citadel);
  }

  // Plaza → market
  if (plaza && plaza !== citadel) {
    plaza.wardType = 'market';
    assigned.add(plaza);
  }

  // Gate-adjacent inner patches
  const gateSet = new Set(gates);
  const gateProbability = params.hasWalls ? 0.5 : 0.2;
  for (const patch of innerPatches) {
    if (assigned.has(patch)) continue;
    const adjacentToGate = patch.shape.some(v => gateSet.has(v));
    if (adjacentToGate && rng.chance(gateProbability)) {
      patch.wardType = 'gate';
      assigned.add(patch);
    }
  }

  // Build weighted pool
  const pool: WardType[] = [];
  for (const [type, weight] of WARD_WEIGHTS) {
    for (let i = 0; i < weight; i++) pool.push(type);
  }
  const shuffledPool = rng.shuffle(pool);
  let poolIdx = 0;

  // Remaining inner patches — assign from pool with location rating
  const unassigned = innerPatches.filter(p => !assigned.has(p));
  const center = innerPatches.reduce(
    (best, p) => distance(p.site, plaza?.site ?? best.site) < distance(best.site, plaza?.site ?? best.site) ? p : best,
    innerPatches[0],
  );
  const plazaSite = plaza?.site ?? center.site;

  for (const patch of unassigned) {
    if (poolIdx >= shuffledPool.length) {
      patch.wardType = 'slum';
      continue;
    }

    const wardType = shuffledPool[poolIdx++];

    // Location rating overrides for position-sensitive ward types
    if (wardType === 'market') {
      // Market prefers size ≈ plaza size, not adjacent to another market
      const plazaArea = plaza ? polygonArea({ points: plaza.shape }) : 0;
      const patchArea = polygonArea({ points: patch.shape });
      const hasNearbyMarket = innerPatches.some(
        p => p !== patch && p.wardType === 'market' && p.shape.some(v => patch.shape.includes(v)),
      );
      if (hasNearbyMarket || (plazaArea > 0 && Math.abs(patchArea - plazaArea) / plazaArea > 0.8)) {
        patch.wardType = 'slum';
        continue;
      }
    } else if (wardType === 'merchant') {
      // Merchant: prefer patches closest to center/plaza
      const unassignedMerchant = unassigned.filter(p => !assigned.has(p));
      const best = unassignedMerchant.reduce(
        (b, p) => distance(p.site, plazaSite) < distance(b.site, plazaSite) ? p : b,
        patch,
      );
      best.wardType = 'merchant';
      assigned.add(best);
      if (best !== patch) {
        // Re-process current patch next round
        poolIdx--;
      }
      continue;
    } else if (wardType === 'slum') {
      // Slum: prefer patches farthest from center/plaza
      const unassignedSlum = unassigned.filter(p => !assigned.has(p));
      const worst = unassignedSlum.reduce(
        (b, p) => distance(p.site, plazaSite) > distance(b.site, plazaSite) ? p : b,
        patch,
      );
      worst.wardType = 'slum';
      assigned.add(worst);
      if (worst !== patch) poolIdx--;
      continue;
    }

    patch.wardType = wardType;
    assigned.add(patch);
  }

  // Outer patches at each gate → gate ward (some skipped)
  for (const patch of patches) {
    if (assigned.has(patch) || patch.withinCity) continue;
    const nearGate = patch.shape.some(v => gateSet.has(v));
    if (nearGate && rng.chance(0.6)) {
      patch.wardType = 'gate';
      assigned.add(patch);
    }
  }

  // Countryside patches → farm (20% chance if compact enough) or generic
  for (const patch of patches) {
    if (assigned.has(patch)) continue;
    const compact = compactness(patch);
    patch.wardType = compact >= 0.7 && rng.chance(0.2) ? 'farm' : 'generic';
  }
}

// Polsby–Popper compactness: 4π×area/perimeter²  (1 = perfect circle)
function compactness(patch: Patch): number {
  const pts = patch.shape;
  const area = polygonArea({ points: pts });
  let perim = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    perim += Math.sqrt(dx * dx + dy * dy);
  }
  if (perim < 1e-10) return 0;
  return (4 * Math.PI * area) / (perim * perim);
}

void polygonCentroid; // imported for potential future use
