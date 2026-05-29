import type { Settlement, Point, RenderLayer, Building } from '../core/types';
import type { MapStyle } from './styles';
import { PARCHMENT_STYLE } from './styles';
import { DEFAULT_RENDER_LAYERS, getVisibleLayers } from './layers';
import { polygonCentroid } from '../core/geometry';

export class SettlementRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private buffer: HTMLCanvasElement;
  private bufferCtx: CanvasRenderingContext2D;
  private bufferDirty = true;
  private rafPending = false;
  private style: MapStyle = PARCHMENT_STYLE;
  private layers: RenderLayer[] = [...DEFAULT_RENDER_LAYERS];
  private settlement: Settlement | null = null;
  private diagnosticMode: 'none' | 'street-network' = 'none';

  private panX = 0;
  private panY = 0;
  private zoom = 1;
  private isDragging = false;
  private lastMouse = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context');
    this.ctx = ctx;

    this.buffer = document.createElement('canvas');
    const bctx = this.buffer.getContext('2d');
    if (!bctx) throw new Error('Failed to get buffer context');
    this.bufferCtx = bctx;

    this.setupInteraction();
  }

  toggleStreetNetwork(): void {
    this.diagnosticMode = this.diagnosticMode === 'street-network' ? 'none' : 'street-network';
    this.bufferDirty = true;
    this.scheduleRender();
  }

  setStyle(style: MapStyle): void {
    this.style = style;
    this.bufferDirty = true;
    this.scheduleRender();
  }

  setLayers(layers: RenderLayer[]): void {
    this.layers = layers;
    this.bufferDirty = true;
    this.scheduleRender();
  }

  getLayers(): RenderLayer[] {
    return this.layers;
  }

  setSettlement(settlement: Settlement): void {
    this.settlement = settlement;
    this.bufferDirty = true;
    this.fitToView();
    this.scheduleRender();
  }

  getSettlement(): Settlement | null {
    return this.settlement;
  }

  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scheduleRender();
  }

  fitToView(): void {
    if (!this.settlement) return;
    const { width, height } = this.settlement.bounds;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const padding = 40;
    this.zoom = Math.min((cw - padding * 2) / width, (ch - padding * 2) / height);
    this.panX = (cw - width * this.zoom) / 2;
    this.panY = (ch - height * this.zoom) / 2;
  }

  private scheduleRender(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.draw();
    });
  }

  private draw(): void {
    const ctx = this.ctx;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = this.style.background;
    ctx.fillRect(0, 0, cw, ch);

    if (!this.settlement) return;

    if (this.bufferDirty) {
      this.renderToBuffer();
      this.bufferDirty = false;
    }

    ctx.drawImage(
      this.buffer,
      0, 0, this.buffer.width, this.buffer.height,
      this.panX, this.panY,
      this.settlement.bounds.width * this.zoom,
      this.settlement.bounds.height * this.zoom,
    );
  }

  private renderToBuffer(): void {
    if (!this.settlement) return;
    const { width, height } = this.settlement.bounds;
    const scale = 2;
    this.buffer.width = width * scale;
    this.buffer.height = height * scale;

    const savedCtx = this.ctx;
    this.ctx = this.bufferCtx;

    this.ctx.clearRect(0, 0, this.buffer.width, this.buffer.height);
    this.ctx.save();
    this.ctx.scale(scale, scale);

    if (this.diagnosticMode === 'street-network') {
      this.renderStreetNetworkDiag();
    } else {
      this.ctx.fillStyle = this.style.background;
      this.ctx.fillRect(0, 0, width, height);

      const visible = getVisibleLayers(this.layers);
      for (const layer of visible) {
        this.ctx.globalAlpha = layer.opacity;
        this.renderLayer(layer.id);
      }
      this.ctx.globalAlpha = 1;
    }

    this.ctx.restore();
    this.ctx = savedCtx;
  }

  private renderStreetNetworkDiag(): void {
    const s = this.settlement!;
    const model = s.model;
    if (!model) return;

    const ctx = this.ctx;
    const { width, height } = s.bounds;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Inner patch boundaries (thin gray)
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 0.8;
    ctx.lineJoin = 'round';
    for (const patch of model.innerPatches) {
      const pts = patch.shape;
      if (pts.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.stroke();
    }

    // Outer wall (thick black)
    if (model.border.isReal && model.border.shape.length >= 3) {
      const shape = model.border.shape;
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(shape[0].x, shape[0].y);
      for (let i = 1; i < shape.length; i++) ctx.lineTo(shape[i].x, shape[i].y);
      ctx.closePath();
      ctx.stroke();
    }

    // Arteries (thick red)
    ctx.strokeStyle = '#dd2222';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const artery of model.arteries) {
      this.strokePath(artery.path);
    }

    // Gates (red dots)
    ctx.fillStyle = '#dd2222';
    for (const gate of model.gates) {
      ctx.beginPath();
      ctx.arc(gate.x, gate.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderLayer(layerId: string): void {
    switch (layerId) {
      case 'terrain': this.renderTerrain(); break;
      case 'water': this.renderWater(); break;
      case 'districts': this.renderDistricts(); break;
      case 'parcels': this.renderParcels(); break;
      case 'roads': this.renderRoads(); break;
      case 'walls': this.renderWalls(); break;
      case 'buildings': this.renderBuildings(); break;
      case 'vegetation': this.renderVegetation(); break;
      case 'landmarks': this.renderLandmarks(); break;
      case 'labels': this.renderLabels(); break;
      case 'nodes': this.renderNodes(); break;
      case 'grid': this.renderGrid(); break;
      case 'data-density': this.renderHeatmap('density'); break;
      case 'data-wealth': this.renderHeatmap('wealth'); break;
    }
  }

  private renderTerrain(): void {
    const s = this.settlement!;
    const ctx = this.ctx;
    const { center, radius } = s.layout;

    const gradient = ctx.createRadialGradient(
      center.x, center.y, 0,
      center.x, center.y, radius * 1.4,
    );
    gradient.addColorStop(0, this.style.background);
    gradient.addColorStop(0.5, this.style.background);
    gradient.addColorStop(1, this.style.terrainEdge);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, s.bounds.width, s.bounds.height);

    if (s.terrain.coastline && s.terrain.coastline.length > 0) {
      ctx.fillStyle = this.style.coastFill;
      ctx.fillRect(0, 0, s.bounds.width, s.bounds.height);

      ctx.fillStyle = this.style.background;
      ctx.beginPath();
      const coast = s.terrain.coastline;
      ctx.moveTo(coast[0].x, coast[0].y);
      for (let i = 1; i < coast.length; i++) {
        ctx.lineTo(coast[i].x, coast[i].y);
      }

      switch (s.parameters.coastDirection) {
        case 'north':
          ctx.lineTo(s.bounds.width, s.bounds.height);
          ctx.lineTo(0, s.bounds.height);
          break;
        case 'south':
          ctx.lineTo(s.bounds.width, 0);
          ctx.lineTo(0, 0);
          break;
        case 'east':
          ctx.lineTo(0, s.bounds.height);
          ctx.lineTo(0, 0);
          break;
        case 'west':
          ctx.lineTo(s.bounds.width, 0);
          ctx.lineTo(s.bounds.width, s.bounds.height);
          break;
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  private renderWater(): void {
    const s = this.settlement!;
    const ctx = this.ctx;

    for (const water of s.terrain.water) {
      if (water.type === 'river' && water.path) {
        ctx.strokeStyle = this.style.water;
        ctx.lineWidth = water.width ?? 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(water.path[0].x, water.path[0].y);
        for (let i = 1; i < water.path.length; i++) {
          ctx.lineTo(water.path[i].x, water.path[i].y);
        }
        ctx.stroke();

        ctx.strokeStyle = this.style.waterStroke;
        ctx.lineWidth = (water.width ?? 10) + 2;
        ctx.globalCompositeOperation = 'destination-over';
        ctx.beginPath();
        ctx.moveTo(water.path[0].x, water.path[0].y);
        for (let i = 1; i < water.path.length; i++) {
          ctx.lineTo(water.path[i].x, water.path[i].y);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  private renderDistricts(): void {
    const s = this.settlement!;
    const ctx = this.ctx;

    for (const district of s.districts) {
      // Only fill countryside districts — city ward fills bleed through building
      // gaps and create visible ward-boundary lines (Fix 2).
      // Exception: market/plaza cells get a distinctly lighter cream so open space reads clearly.
      const isOutside = district.type === 'farmland' || district.type === 'garden';
      const isPlaza = district.type === 'market';
      const colors = this.style.district[district.type];
      if (!colors) continue;

      for (const cellId of district.cellIds) {
        const cell = s.layout.cells.find(c => c.id === cellId);
        if (!cell || cell.isBoundary) continue;

        let districtFill: string;
        if (isOutside) districtFill = colors.fill;
        else if (isPlaza) districtFill = lightenHex(this.style.background, 22);
        else districtFill = this.style.background;
        ctx.fillStyle = districtFill;
        ctx.beginPath();
        const pts = cell.polygon.points;
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private renderRoads(): void {
    const s = this.settlement!;
    const ctx = this.ctx;

    const sorted = [...s.roads].sort((a, b) => {
      const order: Record<string, number> = { path: 0, alley: 1, secondary: 2, main: 3, highway: 4 };
      return (order[a.type] ?? 0) - (order[b.type] ?? 0);
    });

    for (const road of sorted) {
      const style = this.style.road[road.type];
      if (!style) continue;

      if (road.type !== 'path') {
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = style.width + 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        this.strokePath(road.path);
      }

      ctx.strokeStyle = style.fill || style.stroke;
      ctx.lineWidth = style.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (road.type === 'path') {
        ctx.setLineDash([4, 4]);
      }
      this.strokePath(road.path);
      ctx.setLineDash([]);
    }
  }

  private renderWalls(): void {
    const s = this.settlement!;
    const ctx = this.ctx;

    for (const wall of s.walls) {
      // Build gate vertex set using reference equality (Points are shared objects).
      const gatePoints = new Set(wall.gates.map(g => g.position));

      // Draw wall as polyline segments, breaking at gate vertices so gaps appear.
      const strokeWallSegments = (lineWidth: number, strokeStyle: string) => {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        let seg: Point[] = [];
        const flush = () => {
          if (seg.length >= 2) this.strokePath(seg);
          seg = [];
        };
        for (const v of wall.path) {
          if (gatePoints.has(v)) {
            seg.push(v); // close incoming edge up to gate vertex
            flush();     // outgoing edge from gate is suppressed
          } else {
            seg.push(v);
          }
        }
        flush();
      };

      strokeWallSegments(wall.thickness + 2, this.style.wall.stroke);
      strokeWallSegments(wall.thickness, this.style.wall.fill);

      for (const tower of wall.towers) {
        ctx.fillStyle = this.style.wall.tower;
        ctx.strokeStyle = this.style.wall.stroke;
        ctx.lineWidth = 1;

        if (tower.shape === 'round' || tower.shape === 'octagonal') {
          ctx.beginPath();
          ctx.arc(tower.position.x, tower.position.y, tower.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(
            tower.position.x - tower.radius,
            tower.position.y - tower.radius,
            tower.radius * 2,
            tower.radius * 2,
          );
          ctx.strokeRect(
            tower.position.x - tower.radius,
            tower.position.y - tower.radius,
            tower.radius * 2,
            tower.radius * 2,
          );
        }
      }

      for (const gate of wall.gates) {
        // Draw gate as a small opening indicator: two perpendicular stubs
        const pos = gate.position;
        ctx.strokeStyle = this.style.wall.gate;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(gate.direction);
        const stubLen = 8;
        ctx.beginPath();
        ctx.moveTo(-gate.width / 2 - stubLen, 0);
        ctx.lineTo(-gate.width / 2, 0);
        ctx.moveTo(gate.width / 2, 0);
        ctx.lineTo(gate.width / 2 + stubLen, 0);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private renderBuildings(): void {
    const s = this.settlement!;

    for (const building of s.buildings) {
      this.renderBuilding(building);
    }
  }

  private renderBuilding(building: Building): void {
    const ctx = this.ctx;
    const pts = building.footprint.points;
    if (pts.length < 3) return;

    const special = this.style.building.special[building.type];
    let fill = special?.fill ?? this.style.building.fill;
    const stroke = special?.stroke ?? this.style.building.stroke;

    // Per-building deterministic fill variation (Fix 10): lighter = courtyard or stone
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const hash = Math.abs(Math.sin(cx * 17.317 + cy * 41.739));
    if (hash < 0.08) fill = lightenHex(fill, 28);
    else if (hash < 0.20) fill = lightenHex(fill, 10);

    const center = polygonCentroid(building.footprint);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(building.rotation);
    ctx.translate(-center.x, -center.y);

    ctx.fillStyle = this.style.building.shadow;
    ctx.beginPath();
    ctx.moveTo(pts[0].x + 2, pts[0].y + 2);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + 2, pts[i].y + 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private renderVegetation(): void {
    const s = this.settlement!;

    for (const cluster of s.vegetation) {
      for (const tree of cluster.trees) {
        this.renderTree(tree.position, tree.size, tree.type);
      }
    }
  }

  private renderTree(pos: Point, size: number, type: string): void {
    const ctx = this.ctx;
    const colors = this.style.vegetation[type as keyof typeof this.style.vegetation]
      ?? this.style.vegetation.deciduous;

    if (type === 'conifer') {
      ctx.fillStyle = colors.fill;
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - size * 1.5);
      ctx.lineTo(pos.x + size, pos.y + size * 0.5);
      ctx.lineTo(pos.x - size, pos.y + size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (type === 'bush' || type === 'hedge') {
      ctx.fillStyle = colors.fill;
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = colors.stroke;
      ctx.fillRect(pos.x - 0.5, pos.y, 1, size * 0.5);

      ctx.fillStyle = colors.fill;
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - size * 0.3, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private renderLandmarks(): void {
    const s = this.settlement!;
    const ctx = this.ctx;

    for (const landmark of s.landmarks) {
      ctx.fillStyle = this.style.landmark.fill;
      ctx.strokeStyle = this.style.landmark.stroke;
      ctx.lineWidth = 1;

      switch (landmark.type) {
        case 'fountain':
        case 'well':
          ctx.beginPath();
          ctx.arc(landmark.position.x, landmark.position.y, landmark.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (landmark.type === 'fountain') {
            ctx.beginPath();
            ctx.arc(landmark.position.x, landmark.position.y, landmark.radius * 0.5, 0, Math.PI * 2);
            ctx.strokeStyle = this.style.water;
            ctx.stroke();
          }
          break;

        case 'market_square':
        case 'castle':
        case 'cathedral':
          // Ward buildings already render; only the text label below is shown.
          break;

        default:
          ctx.beginPath();
          ctx.arc(landmark.position.x, landmark.position.y, landmark.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
      }

      if (landmark.name) {
        ctx.font = this.style.text.font;
        ctx.fillStyle = this.style.landmark.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        ctx.strokeStyle = this.style.text.shadow;
        ctx.lineWidth = 3;
        ctx.strokeText(landmark.name, landmark.position.x, landmark.position.y + landmark.radius + 4);
        ctx.fillText(landmark.name, landmark.position.x, landmark.position.y + landmark.radius + 4);
      }
    }
  }

  private renderLabels(): void {
    const s = this.settlement!;
    const ctx = this.ctx;

    ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = this.style.text.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = this.style.text.shadow;
    ctx.lineWidth = 4;
    ctx.strokeText(s.name, s.layout.center.x, s.layout.center.y - s.layout.radius - 20);
    ctx.fillText(s.name, s.layout.center.x, s.layout.center.y - s.layout.radius - 20);
  }

  private renderParcels(): void {
    const s = this.settlement!;
    const ctx = this.ctx;

    for (const parcel of s.parcels) {
      const pts = parcel.polygon.points;
      if (pts.length < 3) continue;

      ctx.strokeStyle = 'rgba(0, 180, 180, 0.6)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 200, 200, 0.08)';
      ctx.fill();
    }
  }

  private renderNodes(): void {
    const s = this.settlement!;
    const ctx = this.ctx;

    for (const cell of s.layout.cells) {
      if (cell.isBoundary) {
        ctx.fillStyle = 'rgba(255, 80, 80, 0.5)';
        ctx.beginPath();
        ctx.arc(cell.site.x, cell.site.y, 3, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      const densityHue = 120 * cell.density;
      ctx.fillStyle = `hsla(${densityHue}, 80%, 50%, 0.8)`;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 0.8;

      const r = 3 + cell.density * 5;
      ctx.beginPath();
      ctx.arc(cell.site.x, cell.site.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(cell.density.toFixed(2), cell.site.x, cell.site.y + r + 2);
    }
  }

  private renderGrid(): void {
    const s = this.settlement!;
    const ctx = this.ctx;

    for (const cell of s.layout.cells) {
      const pts = cell.polygon.points;
      if (pts.length < 3) continue;

      ctx.strokeStyle = cell.isBoundary
        ? 'rgba(255, 80, 80, 0.3)'
        : 'rgba(60, 60, 120, 0.5)';
      ctx.lineWidth = cell.isBoundary ? 0.5 : 1;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  private renderHeatmap(layerId: string): void {
    const s = this.settlement!;
    const ctx = this.ctx;
    const dataLayer = s.dataLayers.find(l => l.id === layerId);
    if (!dataLayer) return;

    const activeCells = s.layout.cells.filter(c => !c.isBoundary);

    for (let i = 0; i < dataLayer.data.length; i++) {
      const dp = dataLayer.data[i];
      const cell = activeCells[i];
      if (!cell) continue;

      let hue: number, saturation: number;
      if (layerId === 'wealth') {
        hue = 50 - dp.value * 20;
        saturation = 50 + dp.value * 40;
      } else {
        hue = 240 - dp.value * 240;
        saturation = 60 + dp.value * 30;
      }
      const lightness = 20 + dp.value * 35;
      const alpha = 0.08 + dp.value * 0.55;
      ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;

      const pts = cell.polygon.points;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  private strokePath(path: Point[]): void {
    if (path.length < 2) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();
  }

  private setupInteraction(): void {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.panX += dx;
      this.panY += dy;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.scheduleRender();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.canvas.style.cursor = 'grab';
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const wx = (mx - this.panX) / this.zoom;
      const wy = (my - this.panY) / this.zoom;

      this.zoom *= zoomFactor;
      this.zoom = Math.max(0.1, Math.min(10, this.zoom));

      this.panX = mx - wx * this.zoom;
      this.panY = my - wy * this.zoom;

      this.scheduleRender();
    }, { passive: false });
  }
}

// Lighten a #rrggbb hex color by `amount` per channel (clamped to 255).
function lightenHex(hex: string, amount: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
