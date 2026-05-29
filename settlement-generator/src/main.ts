import type { GenerationParameters } from './core/types';
import { defaultParameters, SIZE_DIMENSIONS } from './core/parameters';
import { generateSettlement } from './generation/pipeline';
import { SettlementRenderer } from './rendering/renderer';
import { buildControls } from './ui/controls';
import { buildLayersPanel } from './ui/layers-panel';
import { exportPNG } from './export/png';
import { exportSVG } from './export/svg';
import { exportGeoJSON } from './export/geojson';

class App {
  private renderer: SettlementRenderer;
  private params: GenerationParameters;
  private controlsApi!: ReturnType<typeof buildControls>;
  private layersApi!: ReturnType<typeof buildLayersPanel>;
  private regenerateTimer = 0;

  constructor() {
    const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
    this.renderer = new SettlementRenderer(canvas);
    this.params = defaultParameters();

    this.setupUI();
    this.setupResize(canvas);
    this.generate();
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

    this.renderer.setSettlement(settlement);
    this.layersApi.update(this.renderer.getLayers());
  }
}

new App();
