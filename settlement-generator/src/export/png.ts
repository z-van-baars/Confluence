import type { Settlement } from '../core/types';

export function exportPNG(
  settlement: Settlement,
  canvas: HTMLCanvasElement,
  scale: number = 2,
): void {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = settlement.bounds.width * scale;
  exportCanvas.height = settlement.bounds.height * scale;

  const ctx = exportCanvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);
  ctx.drawImage(canvas, 0, 0);

  const link = document.createElement('a');
  link.download = `${settlement.name}-${settlement.seed}.png`;
  link.href = exportCanvas.toDataURL('image/png');
  link.click();
}
