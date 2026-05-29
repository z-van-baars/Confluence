import type { GenerationParameters, DebugBlockData } from './core/types';
import { defaultParameters, SIZE_DIMENSIONS } from './core/parameters';
import { generateSettlement } from './generation/pipeline';
import { SettlementRenderer } from './rendering/renderer';
import { buildControls } from './ui/controls';
import { buildLayersPanel } from './ui/layers-panel';
import { exportPNG } from './export/png';
import { exportSVG } from './export/svg';
import { exportGeoJSON } from './export/geojson';

// ── Debug block overlay ──────────────────────────────────────────────────────

const DEBUG_SIZE = 560;

function createDebugPanel(): { panel: HTMLDivElement; canvas: HTMLCanvasElement } {
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', top: '8px', right: '8px', zIndex: '9999',
    background: 'rgba(10,10,15,0.93)', border: '1px solid #444',
    borderRadius: '6px', padding: '8px', display: 'none',
    fontFamily: 'monospace', fontSize: '11px', color: '#ccc',
    boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
  });
  panel.innerHTML = `<div style="margin-bottom:4px;color:#888">Debug: <b style="color:#fff">D</b> to close &nbsp;|&nbsp; <b style="color:#fff">N</b> = street network view</div>`;

  const canvas = document.createElement('canvas');
  canvas.width = DEBUG_SIZE;
  canvas.height = DEBUG_SIZE;
  Object.assign(canvas.style, { display: 'block', borderRadius: '3px' });
  panel.appendChild(canvas);
  document.body.appendChild(panel);
  return { panel, canvas };
}

function renderDebugBlock(canvas: HTMLCanvasElement, d: DebugBlockData): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Compute bounding box of raw shape for scaling
  const allPts = d.rawShape;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of allPts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const pad = 20;
  const scaleX = (DEBUG_SIZE - pad * 2) / (maxX - minX || 1);
  const scaleY = (DEBUG_SIZE - pad * 2) / (maxY - minY || 1);
  const sc = Math.min(scaleX, scaleY);
  const offX = pad + ((DEBUG_SIZE - pad * 2) - (maxX - minX) * sc) / 2 - minX * sc;
  const offY = pad + ((DEBUG_SIZE - pad * 2) - (maxY - minY) * sc) / 2 - minY * sc;
  const tx = (x: number) => offX + x * sc;
  const ty = (y: number) => offY + y * sc;

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Orange fill: buildings
  ctx.fillStyle = 'rgba(255,140,0,0.55)';
  ctx.strokeStyle = 'rgba(255,140,0,0.9)';
  ctx.lineWidth = 0.7;
  for (const b of d.buildings) {
    if (b.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(tx(b[0].x), ty(b[0].y));
    for (let i = 1; i < b.length; i++) ctx.lineTo(tx(b[i].x), ty(b[i].y));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Green lines: cut lines — extended across cell, clipped to city block
  if (d.cityBlock) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tx(d.cityBlock[0].x), ty(d.cityBlock[0].y));
    for (let i = 1; i < d.cityBlock.length; i++) ctx.lineTo(tx(d.cityBlock[i].x), ty(d.cityBlock[i].y));
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = 'rgba(0,230,80,0.75)';
    ctx.lineWidth = 0.8;
    const ext = DEBUG_SIZE * 2;
    for (const cl of d.cutLines) {
      const dx = cl.p2.x - cl.p1.x;
      const dy = cl.p2.y - cl.p1.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / len, ny = dy / len;
      ctx.beginPath();
      ctx.moveTo(tx(cl.p1.x - nx * ext), ty(cl.p1.y - ny * ext));
      ctx.lineTo(tx(cl.p1.x + nx * ext), ty(cl.p1.y + ny * ext));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Blue outline: city block (inset polygon)
  if (d.cityBlock) {
    ctx.strokeStyle = 'rgba(80,160,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx(d.cityBlock[0].x), ty(d.cityBlock[0].y));
    for (let i = 1; i < d.cityBlock.length; i++) ctx.lineTo(tx(d.cityBlock[i].x), ty(d.cityBlock[i].y));
    ctx.closePath();
    ctx.stroke();
  }

  // Red outline: raw cell polygon
  ctx.strokeStyle = 'rgba(255,60,60,0.9)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(tx(d.rawShape[0].x), ty(d.rawShape[0].y));
  for (let i = 1; i < d.rawShape.length; i++) ctx.lineTo(tx(d.rawShape[i].x), ty(d.rawShape[i].y));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  // Legend
  const legend = [
    ['#f03030', '-- raw cell'],
    ['#50a0ff', '─  city block'],
    ['#00e650', '─  cut lines'],
    ['rgba(255,140,0,0.9)', '■  buildings'],
  ];
  ctx.font = '10px monospace';
  legend.forEach(([color, label], i) => {
    ctx.fillStyle = color;
    ctx.fillText(label, 8, DEBUG_SIZE - 8 - (legend.length - 1 - i) * 14);
  });
}

// ── App ───────────────────────────────────────────────────────────────────────

class App {
  private renderer: SettlementRenderer;
  private params: GenerationParameters;
  private controlsApi!: ReturnType<typeof buildControls>;
  private layersApi!: ReturnType<typeof buildLayersPanel>;
  private regenerateTimer = 0;
  private debugPanel: { panel: HTMLDivElement; canvas: HTMLCanvasElement };
  private debugVisible = false;
  private lastDebugData: DebugBlockData | null = null;

  constructor() {
    const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
    this.renderer = new SettlementRenderer(canvas);
    this.params = defaultParameters();
    this.debugPanel = createDebugPanel();

    window.addEventListener('keydown', (e) => {
      if (e.key === 'd' || e.key === 'D') this.toggleDebug();
      if (e.key === 'n' || e.key === 'N') this.renderer.toggleStreetNetwork();
    });

    this.setupUI();
    this.setupResize(canvas);
    this.generate();
  }

  private toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.debugPanel.panel.style.display = this.debugVisible ? 'block' : 'none';
    if (this.debugVisible && this.lastDebugData) {
      renderDebugBlock(this.debugPanel.canvas, this.lastDebugData);
    }
  }

  private setupUI(): void {
    const controlsContainer = document.getElementById('controls')!;
    this.controlsApi = buildControls(controlsContainer, this.params, (params) => {
      if (params.size !== this.params.size) {
        const dim = SIZE_DIMENSIONS[params.size];
        params.width = dim;
        params.height = dim;
      }
      this.params = params;
      this.debouncedGenerate();
    });

    const layersContainer = document.getElementById('layers-panel')!;
    this.layersApi = buildLayersPanel(
      layersContainer,
      this.renderer.getLayers(),
      (layers) => {
        this.renderer.setLayers(layers);
      },
    );

    document.getElementById('btn-generate')!.addEventListener('click', () => {
      this.params.seed = Math.floor(Math.random() * 2147483647);
      this.generate();
      this.controlsApi.update(this.params);
    });

    document.getElementById('btn-export-png')!.addEventListener('click', () => {
      const settlement = this.renderer.getSettlement();
      if (settlement) {
        const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
        exportPNG(settlement, canvas);
      }
    });

    document.getElementById('btn-export-svg')!.addEventListener('click', () => {
      const settlement = this.renderer.getSettlement();
      if (settlement) exportSVG(settlement);
    });

    document.getElementById('btn-export-geojson')!.addEventListener('click', () => {
      const settlement = this.renderer.getSettlement();
      if (settlement) exportGeoJSON(settlement);
    });

    document.getElementById('btn-export-tiles')!.addEventListener('click', () => {
      console.log('Tile export: not yet implemented — requires tile rendering pipeline');
    });
  }

  private setupResize(_canvas: HTMLCanvasElement): void {
    const container = document.getElementById('canvas-container')!;

    const resize = () => {
      this.renderer.resize(container.clientWidth, container.clientHeight);
    };

    resize();
    window.addEventListener('resize', resize);
  }

  private debouncedGenerate(): void {
    clearTimeout(this.regenerateTimer);
    this.regenerateTimer = window.setTimeout(() => {
      this.generate();
      this.controlsApi.update(this.params);
    }, 250);
  }

  private generate(): void {
    const t0 = performance.now();
    const settlement = generateSettlement(this.params);
    const elapsed = (performance.now() - t0).toFixed(1);

    console.log(`Generated "${settlement.name}" in ${elapsed}ms`);
    console.log(`  ${settlement.buildings.length} buildings, ${settlement.roads.length} roads, ${settlement.walls.length} walls`);

    this.lastDebugData = settlement.model?.debugBlock ?? null;
    if (this.debugVisible && this.lastDebugData) {
      renderDebugBlock(this.debugPanel.canvas, this.lastDebugData);
    }

    (window as any).__settlement = settlement;
    this.renderer.setSettlement(settlement);
    this.layersApi.update(this.renderer.getLayers());
  }
}

new App();
