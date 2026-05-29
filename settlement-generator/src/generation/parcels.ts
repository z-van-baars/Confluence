import type { GenerationParameters, LayoutData, District, Parcel } from '../core/types';
import { SeededRNG } from '../core/rng';
import { polygonArea, subdividePolygon } from '../core/geometry';

// TODO: Differentiate min areas per district type once basic residential fill
// is dialed in. For now, all non-farmland districts use the same threshold to
// get maximum uniform density for baseline evaluation.
// Reference thresholds when revisiting:
//   castle/warehouse: ~800-900  (large footprints)
//   noble/temple:     ~600-700  (medium-large)
//   craftsmen/military: ~300-500
//   market/residential/garden: ~200-350
//   poor:             ~150-200  (small hovels, max density)
const DISTRICT_MIN_AREA: Record<string, number> = {
  castle:      150,
  noble:       150,
  temple:      150,
  market:      150,
  residential: 150,
  poor:        150,
  craftsmen:   150,
  warehouse:   150,
  military:    150,
  garden:      150,
  farmland:    1200,
};

export function generateParcels(
  layout: LayoutData,
  districts: District[],
  params: GenerationParameters,
  rng: SeededRNG,
): Parcel[] {
  const parcels: Parcel[] = [];
  let idSeq = 0;

  const cellToDistrict = new Map<number, District>();
  for (const d of districts) {
    for (const cid of d.cellIds) cellToDistrict.set(cid, d);
  }

  for (const cell of layout.cells) {
    if (cell.isBoundary) continue;
    const district = cellToDistrict.get(cell.id);
    if (!district) continue;

    // Farmland: one parcel per cell, no subdivision.
    if (district.type === 'farmland') {
      parcels.push({
        id: `parcel-${idSeq++}`,
        polygon: cell.polygon,
        districtId: district.id,
        cellId: cell.id,
        area: cell.area,
      });
      continue;
    }

    const baseMinArea = DISTRICT_MIN_AREA[district.type] ?? 380;
    // Higher density → smaller parcels (lower min area threshold).
    const minArea = baseMinArea * (1.4 - params.density * 0.8);

    const subPolygons = subdividePolygon(cell.polygon, minArea);

    for (const poly of subPolygons) {
      const area = polygonArea(poly);
      if (area < 20) continue;
      parcels.push({
        id: `parcel-${idSeq++}`,
        polygon: poly,
        districtId: district.id,
        cellId: cell.id,
        area,
      });
    }
  }

  return parcels;
}
