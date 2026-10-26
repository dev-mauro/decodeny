import {
  choiceParam,
  colorParam,
  defineMaterial,
  lengthParam,
  Registry,
  type LocalizedText,
  type MaterialCategory,
  type MaterialDefinition,
  type SurfaceKind,
} from '@decodeny/domain';

/**
 * Catálogo de materiales. Cada material describe un **patrón** que el visor dibuja a escala
 * real (ver `packages/viewer/src/materials/patterns.ts`); agregar uno = una definición aquí.
 */

const mm = (def: number, min: number, max: number, es: string, en: string) =>
  lengthParam({ default: def, min, max, step: 5, label: { es, en } });

const grout = (def: string, es = 'Color de fragüe', en = 'Grout color') =>
  colorParam({ default: def, label: { es, en } });

const groutWidth = (def: number) => mm(def, 0, 30, 'Ancho de fragüe', 'Grout width');

const layout = choiceParam({
  default: 'stack',
  label: { es: 'Disposición', en: 'Layout' },
  options: [
    { value: 'stack', label: { es: 'Alineada', en: 'Stacked' } },
    { value: 'brick', label: { es: 'Trabada', en: 'Running bond' } },
  ],
});

const PAINT_SWATCHES = [
  '#f4f1ea',
  '#ffffff',
  '#e8e2d6',
  '#d9d4cc',
  '#c9d6e3',
  '#dfe8d8',
  '#f2dfc9',
  '#b9c4cc',
  '#7d8a96',
  '#3f4a54',
];
const WOOD_SWATCHES = ['#c49a6c', '#a87b51', '#8a5a3b', '#5e3b26', '#b6aa9c', '#8f8a84'];

function material(
  id: string,
  name: LocalizedText,
  category: MaterialCategory,
  surfaces: readonly SurfaceKind[],
  rest: Omit<MaterialDefinition, 'id' | 'name' | 'category' | 'surfaces'>,
): MaterialDefinition {
  return defineMaterial({ id, name, category, surfaces, ...rest });
}

export const materialCatalog = new Registry<MaterialDefinition>('material').register(
  // --- Pinturas y revestimientos de muro --------------------------------------------------
  material(
    'wall.paint-matte@1',
    { es: 'Pintura mate', en: 'Matte paint' },
    'paint',
    ['wall', 'ceiling'],
    {
      pattern: 'plain',
      params: {},
      color: '#f4f1ea',
      tintable: true,
      swatches: PAINT_SWATCHES,
      roughness: 0.95,
      keywords: ['látex', 'muro', 'pared'],
    },
  ),
  material(
    'wall.paint-satin@1',
    { es: 'Pintura satinada', en: 'Satin paint' },
    'paint',
    ['wall', 'ceiling'],
    {
      pattern: 'plain',
      params: {},
      color: '#f4f1ea',
      tintable: true,
      swatches: PAINT_SWATCHES,
      roughness: 0.55,
      keywords: ['esmalte', 'lavable'],
    },
  ),
  material(
    'wall.wallpaper-stripes@1',
    { es: 'Papel mural a rayas', en: 'Striped wallpaper' },
    'wallpaper',
    ['wall'],
    {
      pattern: 'stripes',
      params: {
        stripe: mm(120, 10, 1000, 'Ancho de franja', 'Stripe width'),
        accent: colorParam({
          default: '#d9cfc0',
          label: { es: 'Color de franja', en: 'Stripe color' },
        }),
      },
      color: '#f3eee6',
      tintable: true,
      swatches: ['#f3eee6', '#e6eef3', '#eef3e6'],
      roughness: 0.85,
    },
  ),
  material(
    'wall.wallpaper-pattern@1',
    { es: 'Papel mural con diseño', en: 'Patterned wallpaper' },
    'wallpaper',
    ['wall'],
    {
      pattern: 'motif',
      params: {
        repeat: mm(250, 30, 1500, 'Tamaño del diseño', 'Pattern size'),
        accent: colorParam({
          default: '#b7a68c',
          label: { es: 'Color del diseño', en: 'Pattern color' },
        }),
      },
      color: '#f1ece3',
      tintable: true,
      roughness: 0.85,
      keywords: ['damasco', 'empapelado'],
    },
  ),
  material(
    'wall.wallpaper-linen@1',
    { es: 'Papel mural texturado', en: 'Textured wallpaper' },
    'wallpaper',
    ['wall'],
    {
      pattern: 'linen',
      params: {},
      color: '#e9e3d8',
      tintable: true,
      swatches: PAINT_SWATCHES,
      roughness: 0.9,
      keywords: ['lino', 'textil'],
    },
  ),
  material(
    'wall.brick@1',
    { es: 'Ladrillo a la vista', en: 'Exposed brick' },
    'masonry',
    ['wall'],
    {
      pattern: 'brick',
      params: {
        length: mm(290, 50, 600, 'Largo del ladrillo', 'Brick length'),
        height: mm(70, 20, 300, 'Alto del ladrillo', 'Brick height'),
        joint: groutWidth(12),
        mortar: grout('#cfc6b8', 'Color de cantería', 'Mortar color'),
      },
      color: '#a65a3f',
      tintable: true,
      swatches: ['#a65a3f', '#8c4a35', '#c07a55', '#d9d2c5', '#6e6a66'],
      roughness: 0.9,
      keywords: ['ladrillo', 'muro'],
    },
  ),
  material('wall.tile@1', { es: 'Cerámica de muro', en: 'Wall tile' }, 'tile', ['wall', 'floor'], {
    pattern: 'tiles',
    params: {
      tileWidth: mm(200, 20, 1500, 'Ancho de palmeta', 'Tile width'),
      tileHeight: mm(200, 20, 1500, 'Alto de palmeta', 'Tile height'),
      joint: groutWidth(2),
      grout: grout('#e5e5e5'),
      layout,
    },
    color: '#f7f7f5',
    tintable: true,
    swatches: ['#f7f7f5', '#dfe9ee', '#e8efe4', '#2f3b45', '#c9b8a0'],
    roughness: 0.2,
    keywords: ['baño', 'cocina', 'azulejo', 'palmeta', 'revestimiento'],
  }),
  material('wall.subway@1', { es: 'Cerámica tipo metro', en: 'Subway tile' }, 'tile', ['wall'], {
    pattern: 'tiles',
    params: {
      tileWidth: mm(150, 20, 600, 'Largo de palmeta', 'Tile length'),
      tileHeight: mm(75, 20, 600, 'Alto de palmeta', 'Tile height'),
      joint: groutWidth(2),
      grout: grout('#d9d9d9'),
      layout: { ...layout, default: 'brick' },
    },
    color: '#fbfbfa',
    tintable: true,
    swatches: ['#fbfbfa', '#1f2a33', '#5c7a6e', '#d7c6ae'],
    roughness: 0.15,
    keywords: ['metro', 'subway', 'cocina', 'baño'],
  }),
  material(
    'wall.concrete@1',
    { es: 'Hormigón a la vista', en: 'Exposed concrete' },
    'stone',
    ['wall', 'ceiling'],
    {
      pattern: 'concrete',
      params: {},
      color: '#b4b1ab',
      tintable: true,
      roughness: 0.85,
      keywords: ['concreto', 'cemento'],
    },
  ),

  // --- Pisos -------------------------------------------------------------------------------
  ...(
    [
      ['floor.oak@1', { es: 'Piso flotante roble', en: 'Oak laminate' }, '#c49a6c'],
      ['floor.walnut@1', { es: 'Piso flotante nogal', en: 'Walnut laminate' }, '#7a5236'],
      ['floor.grey-wood@1', { es: 'Piso flotante gris', en: 'Grey laminate' }, '#a39d96'],
    ] as const
  ).map(([id, name, color]) =>
    material(id, name, 'wood', ['floor'], {
      pattern: 'planks',
      params: {
        plankWidth: mm(190, 40, 600, 'Ancho de tabla', 'Plank width'),
        plankLength: mm(1290, 150, 3000, 'Largo de tabla', 'Plank length'),
      },
      color,
      tintable: true,
      swatches: WOOD_SWATCHES,
      roughness: 0.55,
      keywords: ['laminado', 'madera', 'piso flotante'],
    }),
  ),
  material('floor.parquet@1', { es: 'Parquet', en: 'Parquet' }, 'wood', ['floor'], {
    pattern: 'planks',
    params: {
      plankWidth: mm(70, 30, 200, 'Ancho de tablilla', 'Strip width'),
      plankLength: mm(350, 100, 1200, 'Largo de tablilla', 'Strip length'),
    },
    color: '#b8875a',
    tintable: true,
    swatches: WOOD_SWATCHES,
    roughness: 0.45,
    keywords: ['madera', 'tablillas'],
  }),
  material(
    'floor.herringbone@1',
    { es: 'Parquet en espiga', en: 'Herringbone parquet' },
    'wood',
    ['floor'],
    {
      pattern: 'herringbone',
      params: {
        plankWidth: mm(70, 30, 200, 'Ancho de tablilla', 'Strip width'),
        plankLength: mm(350, 100, 1200, 'Largo de tablilla', 'Strip length'),
      },
      color: '#b8875a',
      tintable: true,
      swatches: WOOD_SWATCHES,
      roughness: 0.45,
      keywords: ['espiga', 'chevron', 'madera'],
    },
  ),
  material(
    'floor.porcelain@1',
    { es: 'Porcelanato', en: 'Porcelain tile' },
    'tile',
    ['floor', 'wall'],
    {
      pattern: 'tiles',
      params: {
        tileWidth: mm(600, 50, 1500, 'Ancho de baldosa', 'Tile width'),
        tileHeight: mm(600, 50, 1500, 'Largo de baldosa', 'Tile length'),
        joint: groutWidth(2),
        grout: grout('#bdb8b0'),
        layout,
      },
      color: '#d8d3cb',
      tintable: true,
      swatches: ['#d8d3cb', '#efece6', '#9e9a94', '#5f5c58', '#c8b59a'],
      roughness: 0.3,
      keywords: ['baldosa', 'gres'],
    },
  ),
  material(
    'floor.ceramic@1',
    { es: 'Cerámica de piso', en: 'Ceramic floor tile' },
    'tile',
    ['floor'],
    {
      pattern: 'tiles',
      params: {
        tileWidth: mm(450, 50, 1200, 'Ancho de baldosa', 'Tile width'),
        tileHeight: mm(450, 50, 1200, 'Largo de baldosa', 'Tile length'),
        joint: groutWidth(4),
        grout: grout('#a9a39a'),
        layout,
      },
      color: '#c9bba6',
      tintable: true,
      swatches: ['#c9bba6', '#e4ddd2', '#a7977f', '#8a7f72'],
      roughness: 0.4,
      keywords: ['baldosa', 'cerámico'],
    },
  ),
  material('floor.carpet@1', { es: 'Alfombra', en: 'Carpet' }, 'textile', ['floor'], {
    pattern: 'carpet',
    params: {},
    color: '#8f8a84',
    tintable: true,
    swatches: ['#8f8a84', '#b9ad9c', '#5b6470', '#6f5b4c', '#cfc8bd'],
    roughness: 1,
    keywords: ['muro a muro', 'textil', 'cubrepiso'],
  }),
  material('floor.vinyl@1', { es: 'Piso vinílico', en: 'Vinyl plank' }, 'vinyl', ['floor'], {
    pattern: 'planks',
    params: {
      plankWidth: mm(180, 40, 600, 'Ancho de tabla', 'Plank width'),
      plankLength: mm(1220, 150, 3000, 'Largo de tabla', 'Plank length'),
    },
    color: '#b79e84',
    tintable: true,
    swatches: WOOD_SWATCHES,
    roughness: 0.7,
    keywords: ['spc', 'lvt', 'vinilo'],
  }),
  material(
    'floor.concrete@1',
    { es: 'Hormigón pulido', en: 'Polished concrete' },
    'stone',
    ['floor'],
    {
      pattern: 'concrete',
      params: {},
      color: '#9f9c97',
      tintable: true,
      roughness: 0.35,
      keywords: ['microcemento', 'concreto', 'cemento'],
    },
  ),

  // --- Cielo -----------------------------------------------------------------------------
  material(
    'ceiling.paint@1',
    { es: 'Pintura de cielo', en: 'Ceiling paint' },
    'paint',
    ['ceiling'],
    {
      pattern: 'plain',
      params: {},
      color: '#fbfaf8',
      tintable: true,
      swatches: PAINT_SWATCHES,
      roughness: 0.97,
    },
  ),
);

/** Terminación de las superficies sin material asignado (lo que se ve por defecto). */
export const DEFAULT_FINISHES: Readonly<Record<SurfaceKind, string>> = {
  wall: 'wall.paint-matte@1',
  floor: 'floor.oak@1',
  ceiling: 'ceiling.paint@1',
};

/** Materiales aplicables a un tipo de superficie. */
export const materialsFor = (surface: SurfaceKind): MaterialDefinition[] =>
  materialCatalog.list().filter((m) => m.surfaces.includes(surface));

/** Reemplazo para materiales desconocidos (archivo más nuevo): pintura con su color. */
export const unknownMaterial = defineMaterial({
  id: 'material.unknown@1',
  name: { es: 'Material desconocido', en: 'Unknown material' },
  category: 'paint',
  surfaces: ['wall', 'floor', 'ceiling'],
  pattern: 'plain',
  params: {},
  color: '#c4b5fd',
  tintable: true,
  roughness: 0.9,
});

export const resolveMaterialDefinition = (def: string): MaterialDefinition =>
  materialCatalog.get(def) ?? unknownMaterial;
