import type { RoadType, DistrictType, BuildingType, VegetationType } from '../core/types';

export interface MapStyle {
  name: string;
  background: string;
  terrainEdge: string;
  water: string;
  waterStroke: string;
  coastFill: string;
  road: Record<RoadType, { fill: string; stroke: string; width: number }>;
  district: Record<DistrictType, { fill: string; stroke: string }>;
  building: {
    fill: string;
    stroke: string;
    shadow: string;
    roofFill: string;
    special: Partial<Record<BuildingType, { fill: string; stroke: string }>>;
  };
  wall: { fill: string; stroke: string; gate: string; tower: string };
  vegetation: Record<VegetationType, { fill: string; stroke: string }>;
  landmark: { fill: string; stroke: string; text: string };
  text: { font: string; color: string; shadow: string };
}

export const PARCHMENT_STYLE: MapStyle = {
  name: 'Parchment',
  background: '#f4e8c1',
  terrainEdge: '#d8ccaa',
  water: '#8cb4d2',
  waterStroke: '#6a96b4',
  coastFill: '#d4c8a0',

  road: {
    highway: { fill: '#c8b88a', stroke: '#a09070', width: 3 },
    main: { fill: '#d4c49a', stroke: '#b0a080', width: 2.5 },
    secondary: { fill: '#ddd0a8', stroke: '#c0b090', width: 2 },
    alley: { fill: '#e0d4b0', stroke: '#c8bca0', width: 1.5 },
    path: { fill: 'transparent', stroke: '#c8bca0', width: 1 },
  },

  district: {
    castle: { fill: '#e8dcc0', stroke: '#b0a080' },
    noble: { fill: '#ede2c8', stroke: '#c0b098' },
    temple: { fill: '#e8ddd0', stroke: '#b8a898' },
    market: { fill: '#eedcb8', stroke: '#c0a888' },
    residential: { fill: '#f0e4c8', stroke: '#c8b8a0' },
    poor: { fill: '#e0d4b8', stroke: '#b8a890' },
    craftsmen: { fill: '#e8d8b8', stroke: '#c0a890' },
    warehouse: { fill: '#ddd0b0', stroke: '#b0a088' },
    military: { fill: '#e0d0b0', stroke: '#b0a088' },
    garden: { fill: '#dde8c8', stroke: '#a8b898' },
    farmland: { fill: '#e8ecd0', stroke: '#b8bca8' },
  },

  building: {
    fill: '#d4b896',
    stroke: '#8a7060',
    shadow: 'rgba(80, 60, 40, 0.15)',
    roofFill: '#c0a080',
    special: {
      castle_keep: { fill: '#b8a080', stroke: '#706050' },
      castle_tower: { fill: '#c0a888', stroke: '#706050' },
      temple: { fill: '#d0c0a8', stroke: '#807060' },
      church: { fill: '#d0c0a8', stroke: '#807060' },
      tavern: { fill: '#c8a878', stroke: '#806848' },
      inn: { fill: '#c8a878', stroke: '#806848' },
      mansion: { fill: '#d8c8a8', stroke: '#887868' },
      hovel: { fill: '#b8a888', stroke: '#888070' },
    },
  },

  wall: {
    fill: '#a89880',
    stroke: '#706050',
    gate: '#8a7a68',
    tower: '#988878',
  },

  vegetation: {
    deciduous: { fill: '#8ab868', stroke: '#608840' },
    conifer: { fill: '#688848', stroke: '#486828' },
    palm: { fill: '#90c070', stroke: '#609040' },
    bush: { fill: '#a0c880', stroke: '#78a058' },
    hedge: { fill: '#78a858', stroke: '#588838' },
  },

  landmark: {
    fill: '#b09878',
    stroke: '#706050',
    text: '#504030',
  },

  text: {
    font: '12px "Segoe UI", system-ui, sans-serif',
    color: '#504030',
    shadow: 'rgba(244, 232, 193, 0.8)',
  },
};

export const DARK_STYLE: MapStyle = {
  name: 'Dark',
  background: '#1a1a2e',
  terrainEdge: '#12122a',
  water: '#2a4a6a',
  waterStroke: '#3a5a7a',
  coastFill: '#222240',

  road: {
    highway: { fill: '#4a4a5e', stroke: '#5a5a70', width: 3 },
    main: { fill: '#3a3a50', stroke: '#4a4a60', width: 2.5 },
    secondary: { fill: '#333348', stroke: '#404058', width: 2 },
    alley: { fill: '#2e2e42', stroke: '#3a3a50', width: 1.5 },
    path: { fill: 'transparent', stroke: '#3a3a50', width: 1 },
  },

  district: {
    castle: { fill: '#2a2a44', stroke: '#4a4a60' },
    noble: { fill: '#282842', stroke: '#484860' },
    temple: { fill: '#2a2a48', stroke: '#4a4a64' },
    market: { fill: '#2e2e44', stroke: '#4e4e60' },
    residential: { fill: '#262640', stroke: '#46465c' },
    poor: { fill: '#22223a', stroke: '#424258' },
    craftsmen: { fill: '#28283e', stroke: '#48485a' },
    warehouse: { fill: '#24243c', stroke: '#444458' },
    military: { fill: '#24243c', stroke: '#444458' },
    garden: { fill: '#223028', stroke: '#3a4a40' },
    farmland: { fill: '#262e28', stroke: '#3e4640' },
  },

  building: {
    fill: '#3a3a58',
    stroke: '#6a6a88',
    shadow: 'rgba(0, 0, 0, 0.3)',
    roofFill: '#4a4a68',
    special: {
      castle_keep: { fill: '#4a4a68', stroke: '#7a7a98' },
      temple: { fill: '#3a3a60', stroke: '#6a6a90' },
      tavern: { fill: '#4a3a30', stroke: '#7a6a58' },
    },
  },

  wall: {
    fill: '#5a5a78',
    stroke: '#8a8aa8',
    gate: '#6a6a88',
    tower: '#5a5a78',
  },

  vegetation: {
    deciduous: { fill: '#2a5a30', stroke: '#1a4a20' },
    conifer: { fill: '#1a4a28', stroke: '#103a18' },
    palm: { fill: '#306830', stroke: '#205020' },
    bush: { fill: '#305828', stroke: '#204818' },
    hedge: { fill: '#284a20', stroke: '#183a10' },
  },

  landmark: {
    fill: '#5a5a78',
    stroke: '#8a8aa8',
    text: '#b0b0c8',
  },

  text: {
    font: '12px "Segoe UI", system-ui, sans-serif',
    color: '#b0b0c8',
    shadow: 'rgba(0, 0, 0, 0.5)',
  },
};

export const STYLES: Record<string, MapStyle> = {
  parchment: PARCHMENT_STYLE,
  dark: DARK_STYLE,
};
