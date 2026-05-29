import type { RenderLayer } from '../core/types';

export const DEFAULT_RENDER_LAYERS: RenderLayer[] = [
  { id: 'terrain', name: 'Terrain', visible: true, opacity: 1, order: 0 },
  { id: 'water', name: 'Water', visible: true, opacity: 1, order: 1 },
  { id: 'districts', name: 'Districts', visible: true, opacity: 0.3, order: 2 },
  { id: 'parcels', name: 'Parcels', visible: false, opacity: 0.7, order: 3 },
  { id: 'roads', name: 'Roads', visible: true, opacity: 1, order: 4 },
  { id: 'walls', name: 'Walls', visible: true, opacity: 1, order: 5 },
  { id: 'buildings', name: 'Buildings', visible: true, opacity: 1, order: 6 },
  { id: 'vegetation', name: 'Vegetation', visible: true, opacity: 1, order: 7 },
  { id: 'landmarks', name: 'Landmarks', visible: true, opacity: 1, order: 8 },
  { id: 'labels', name: 'Labels', visible: true, opacity: 1, order: 9 },
  { id: 'nodes', name: 'Nodes', visible: false, opacity: 0.8, order: 10 },
  { id: 'grid', name: 'Voronoi Grid', visible: false, opacity: 0.7, order: 11 },
  { id: 'data-density', name: 'Density Heatmap', visible: false, opacity: 0.5, order: 12 },
  { id: 'data-wealth', name: 'Wealth Heatmap', visible: false, opacity: 0.5, order: 13 },
];

export function getVisibleLayers(layers: RenderLayer[]): RenderLayer[] {
  return layers
    .filter(l => l.visible)
    .sort((a, b) => a.order - b.order);
}
