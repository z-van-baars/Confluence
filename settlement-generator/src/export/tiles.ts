import type { Settlement } from '../core/types';

export interface TileExportOptions {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  format: 'png' | 'webp';
}

const DEFAULT_OPTIONS: TileExportOptions = {
  tileSize: 256,
  minZoom: 0,
  maxZoom: 4,
  format: 'png',
};

export function calculateTileGrid(
  settlement: Settlement,
  zoom: number,
  tileSize: number = 256,
): { cols: number; rows: number; scale: number } {
  const tilesPerSide = Math.pow(2, zoom);
  const mapSize = tileSize * tilesPerSide;
  const scale = mapSize / Math.max(settlement.bounds.width, settlement.bounds.height);
  return { cols: tilesPerSide, rows: tilesPerSide, scale };
}

export async function exportTiles(
  settlement: Settlement,
  renderToCanvas: (canvas: HTMLCanvasElement, offsetX: number, offsetY: number, scale: number) => void,
  options: Partial<TileExportOptions> = {},
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  console.log(`Tile export requested for "${settlement.name}" (zoom ${opts.minZoom}-${opts.maxZoom})`);
  console.log('Full tile export requires a backend or service worker — generating preview at zoom 0');

  const canvas = document.createElement('canvas');
  canvas.width = opts.tileSize;
  canvas.height = opts.tileSize;

  const { scale } = calculateTileGrid(settlement, 0, opts.tileSize);
  renderToCanvas(canvas, 0, 0, scale);

  const link = document.createElement('a');
  link.download = `${settlement.name}-tile-0-0-0.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
