import type { Settlement } from '../core/types';

export function exportSVG(settlement: Settlement): void {
  const { width, height } = settlement.bounds;
  const parts: string[] = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);
  parts.push(`<rect width="${width}" height="${height}" fill="#f4e8c1"/>`);

  parts.push('<g id="roads">');
  for (const road of settlement.roads) {
    const d = road.path.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}" stroke="#b0a080" stroke-width="${road.width}" fill="none" stroke-linecap="round"/>`);
  }
  parts.push('</g>');

  parts.push('<g id="buildings">');
  for (const building of settlement.buildings) {
    const pts = building.footprint.points;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
    parts.push(`<path d="${d}" fill="#d4b896" stroke="#8a7060" stroke-width="0.8"/>`);
  }
  parts.push('</g>');

  parts.push('<g id="walls">');
  for (const wall of settlement.walls) {
    const d = wall.path.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}" stroke="#706050" stroke-width="${wall.thickness}" fill="none"/>`);
    for (const tower of wall.towers) {
      parts.push(`<circle cx="${tower.position.x.toFixed(1)}" cy="${tower.position.y.toFixed(1)}" r="${tower.radius}" fill="#988878" stroke="#706050"/>`);
    }
  }
  parts.push('</g>');

  parts.push('</svg>');

  const blob = new Blob([parts.join('\n')], { type: 'image/svg+xml' });
  const link = document.createElement('a');
  link.download = `${settlement.name}-${settlement.seed}.svg`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
