// ── Geometry Primitives ──

export interface Point {
  x: number;
  y: number;
}

export interface Edge {
  a: Point;
  b: Point;
}

export interface Polygon {
  points: Point[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Terrain ──

export interface TerrainData {
  width: number;
  height: number;
  elevation: Float32Array;
  moisture: Float32Array;
  water: WaterFeature[];
  coastline?: Point[];
}

export interface WaterFeature {
  id: string;
  type: 'river' | 'lake' | 'sea' | 'pond' | 'canal';
  path?: Point[];
  polygon?: Polygon;
  width?: number;
}

// ── Layout (Voronoi structure) ──

export interface LayoutData {
  seedPoints: Point[];
  cells: VoronoiCell[];
  edges: LayoutEdge[];
  center: Point;
  radius: number;
  wallRadius: number;
}

export interface VoronoiCell {
  id: number;
  site: Point;
  polygon: Polygon;
  neighbors: number[];
  distanceToCenter: number;
  area: number;
  density: number;
  wealth: number;
  districtType: DistrictType | null;
  isBoundary: boolean;
}

export interface LayoutEdge {
  id: number;
  a: Point;
  b: Point;
  leftCell: number;
  rightCell: number;
  importance: number;
}

// ── Roads ──

export type RoadType = 'highway' | 'main' | 'secondary' | 'alley' | 'path';

export interface Road {
  id: string;
  path: Point[];
  width: number;
  type: RoadType;
  name?: string;
}

// ── Districts ──

export type DistrictType =
  | 'castle' | 'noble' | 'temple' | 'market' | 'residential'
  | 'poor' | 'craftsmen' | 'warehouse' | 'military' | 'garden'
  | 'farmland';

export interface District {
  id: string;
  cellIds: number[];
  type: DistrictType;
  density: number;
  wealth: number;
}

// ── Parcels ──

export interface Parcel {
  id: string;
  polygon: Polygon;
  districtId: string;
  cellId: number;
  area: number;
  building?: Building;
}

// ── Buildings ──

export type BuildingType =
  | 'house' | 'mansion' | 'hovel' | 'shop' | 'tavern' | 'inn'
  | 'temple' | 'church' | 'castle_keep' | 'castle_tower' | 'barracks'
  | 'warehouse' | 'workshop' | 'stable' | 'mill' | 'bakery'
  | 'blacksmith' | 'tannery' | 'guild_hall' | 'town_hall';

export interface Building {
  id: string;
  footprint: Polygon;
  type: BuildingType;
  stories: number;
  parcelId: string;
  rotation: number;
  frontFacing: number;
}

// ── Walls ──

export interface Wall {
  id: string;
  path: Point[];
  thickness: number;
  gates: Gate[];
  towers: WallTower[];
  layer: number;
}

export interface Gate {
  id: string;
  position: Point;
  direction: number;
  width: number;
  type: 'main' | 'postern' | 'water';
}

export interface WallTower {
  id: string;
  position: Point;
  radius: number;
  shape: 'round' | 'square' | 'octagonal';
}

// ── Landmarks ──

export type LandmarkType =
  | 'fountain' | 'well' | 'market_square' | 'statue' | 'monument'
  | 'gallows' | 'stocks' | 'cross' | 'obelisk' | 'clock_tower'
  | 'bridge' | 'castle' | 'cathedral';

export interface Landmark {
  id: string;
  position: Point;
  type: LandmarkType;
  radius: number;
  name?: string;
}

// ── Vegetation ──

export type VegetationType = 'deciduous' | 'conifer' | 'palm' | 'bush' | 'hedge';

export interface VegetationCluster {
  id: string;
  position: Point;
  radius: number;
  density: number;
  type: VegetationType;
  trees: TreeInstance[];
}

export interface TreeInstance {
  position: Point;
  size: number;
  type: VegetationType;
}

// ── Decorations ──

export type DecorationItem =
  | 'market_stall' | 'cart' | 'barrel' | 'crate' | 'hay_bale'
  | 'bench' | 'lamp_post' | 'signpost' | 'hitching_post' | 'trough';

export interface Decoration {
  id: string;
  position: Point;
  type: DecorationItem;
  rotation: number;
}

// ── Data Layers ──

export type DataLayerType = 'heatmap' | 'overlay' | 'markers';

export interface DataLayer {
  id: string;
  name: string;
  type: DataLayerType;
  visible: boolean;
  data: DataPoint[];
}

export interface DataPoint {
  position: Point;
  value: number;
  label?: string;
}

// ── Render Layers ──

export interface RenderLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  order: number;
}

// ── Generation Parameters ──

export type SettlementSize = 'hamlet' | 'village' | 'town' | 'city' | 'metropolis';
export type SettlementStyle = 'medieval' | 'fantasy' | 'roman' | 'oriental';
export type CoastDirection = 'north' | 'south' | 'east' | 'west' | 'none';

export interface GenerationParameters {
  seed: number;
  width: number;
  height: number;

  size: SettlementSize;
  population: number;
  style: SettlementStyle;

  hasRiver: boolean;
  riverWidth: number;
  coastDirection: CoastDirection;
  hilliness: number;

  organicness: number;
  density: number;
  hasWalls: boolean;
  wallLayers: number;

  hasCastle: boolean;
  hasTemple: boolean;
  hasMarket: boolean;
  hasPort: boolean;

  roadDensity: number;
  vegetationDensity: number;
}

// ── Watabou Model Types ──

export type WardType =
  | 'castle' | 'market' | 'merchant' | 'craftsmen' | 'slum'
  | 'gate' | 'patriciate' | 'military' | 'park' | 'cathedral'
  | 'administration' | 'farm' | 'generic';

export interface Patch {
  id: number;
  shape: Point[];        // shared-ref vertices (mutable)
  site: Point;
  withinCity: boolean;
  withinWalls: boolean;
  wardType: WardType | null;
  geometry: Point[][];   // building footprints from createAlleys
}

export interface Artery {
  id: string;
  path: Point[];
  isStreet: boolean;     // true = inner gate→plaza, false = outer road
}

export interface CurtainWall {
  shape: Point[];
  gates: Point[];
  towers: Point[];
  isReal: boolean;
}

export interface DebugCutLine {
  p1: Point;
  p2: Point;
}

export interface DebugBlockData {
  rawShape: Point[];
  cityBlock: Point[] | null;
  cutLines: DebugCutLine[];
  buildings: Point[][];
  rawArea: number;
  blockArea: number | null;
  blockVertexCount: number | null;
  blockIsConvex: boolean | null;
  buildingCount: number;
  buildingAreaMin: number;
  buildingAreaMax: number;
  buildingAreaMean: number;
}

export interface TownModel {
  patches: Patch[];
  innerPatches: Patch[];
  citadel: Patch | null;
  plaza: Patch | null;
  center: Point;
  border: CurtainWall;
  wall: CurtainWall | null;
  gates: Point[];
  arteries: Artery[];
  streets: Artery[];
  roads: Artery[];
  scale: number;
  debugBlock?: DebugBlockData;
}

// ── The Settlement ──

export interface Settlement {
  seed: number;
  name: string;
  parameters: GenerationParameters;
  bounds: BoundingBox;
  terrain: TerrainData;
  layout: LayoutData;
  roads: Road[];
  districts: District[];
  parcels: Parcel[];
  buildings: Building[];
  walls: Wall[];
  landmarks: Landmark[];
  vegetation: VegetationCluster[];
  decorations: Decoration[];
  dataLayers: DataLayer[];
  vertexDensity: Record<string, number>;
  model?: TownModel;
}
