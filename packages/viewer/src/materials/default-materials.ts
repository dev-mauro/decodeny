import { Color, DoubleSide, MeshStandardMaterial, type Material } from 'three';
import type { InteractionState } from '../selection';

/**
 * Materiales por defecto mientras no existan materiales de catálogo (I5). Se comparten
 * entre mallas (una instancia por rol y estado) para minimizar cambios de estado en GPU.
 */
export type SurfaceRole = 'wallSide' | 'wallTop' | 'floor' | 'ceiling' | 'threshold';

const PALETTE: Record<SurfaceRole, Record<InteractionState, string>> = {
  wallSide: { normal: '#f3f0ea', hover: '#e6edf9', selected: '#c9dcff' },
  // La cara superior se pinta oscura, como el "corte" de un plano de arquitectura.
  wallTop: { normal: '#4b5058', hover: '#3b5b8f', selected: '#2563eb' },
  floor: { normal: '#d9c9ad', hover: '#e2d5bf', selected: '#c3d7fb' },
  ceiling: { normal: '#fbfaf8', hover: '#fbfaf8', selected: '#fbfaf8' },
  threshold: { normal: '#c9b79a', hover: '#c9b79a', selected: '#c9b79a' },
};

const cache = new Map<string, Material>();

function cached(key: string, create: () => Material): Material {
  let material = cache.get(key);
  if (!material) {
    material = create();
    material.name = `decodeny:${key}`;
    cache.set(key, material);
  }
  return material;
}

export function surfaceMaterial(role: SurfaceRole, state: InteractionState): Material {
  return cached(
    `${role}:${state}`,
    () => new MeshStandardMaterial({ color: PALETTE[role][state], roughness: 0.92, metalness: 0 }),
  );
}

/** Slots de material de puertas y ventanas (ver definiciones del catálogo). */
const OPENING_PALETTE: Record<string, { color: string; roughness: number; metalness: number }> = {
  frame: { color: '#f4f4f2', roughness: 0.6, metalness: 0 },
  sash: { color: '#f4f4f2', roughness: 0.6, metalness: 0 },
  trim: { color: '#f4f4f2', roughness: 0.7, metalness: 0 },
  leaf: { color: '#c9a77c', roughness: 0.7, metalness: 0 },
  handle: { color: '#a3a9af', roughness: 0.3, metalness: 0.85 },
  rail: { color: '#a8aeb4', roughness: 0.35, metalness: 0.7 },
};
const OPENING_TINT: Record<InteractionState, string | null> = {
  normal: null,
  hover: '#dbe7fb',
  selected: '#93b9f8',
};

export function openingMaterial(slot: string, state: InteractionState): Material {
  if (slot === 'glass') {
    return cached(
      `opening:glass:${state}`,
      () =>
        new MeshStandardMaterial({
          color: state === 'normal' ? '#cfe3f1' : '#a9c8f5',
          roughness: 0.05,
          metalness: 0.1,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          side: DoubleSide,
        }),
    );
  }
  const base = OPENING_PALETTE[slot] ?? OPENING_PALETTE.frame!;
  return cached(
    `opening:${slot}:${state}`,
    () =>
      new MeshStandardMaterial({
        color: OPENING_TINT[state] ?? base.color,
        roughness: base.roughness,
        metalness: base.metalness,
      }),
  );
}

/** Slots de material de muebles (I5 permitirá asignar materiales de catálogo a cada uno). */
const ITEM_PALETTE: Record<string, { color: string; roughness: number; metalness: number }> = {
  wood: { color: '#b98d62', roughness: 0.7, metalness: 0 },
  lacquer: { color: '#f2f0ec', roughness: 0.45, metalness: 0 },
  fabric: { color: '#8e959e', roughness: 0.95, metalness: 0 },
  cushion: { color: '#a3aab3', roughness: 0.95, metalness: 0 },
  mattress: { color: '#f4f1ea', roughness: 0.9, metalness: 0 },
  linen: { color: '#c9d6e3', roughness: 0.95, metalness: 0 },
  pillow: { color: '#fbfaf7', roughness: 0.95, metalness: 0 },
  ceramic: { color: '#fbfbfb', roughness: 0.15, metalness: 0 },
  stone: { color: '#d8d4cc', roughness: 0.35, metalness: 0 },
  // Metales reales: el mapa de entorno (SceneEnvironment) les da reflejos.
  metal: { color: '#a3a9af', roughness: 0.35, metalness: 0.8 },
  chrome: { color: '#e0e3e6', roughness: 0.12, metalness: 1 },
  steel: { color: '#dfe2e5', roughness: 0.3, metalness: 0.6 },
  basin: { color: '#e4e7eb', roughness: 0.2, metalness: 0 },
  black: { color: '#2b2e33', roughness: 0.6, metalness: 0.2 },
  dark: { color: '#3a3d42', roughness: 0.8, metalness: 0 },
  water: { color: '#a8d1e7', roughness: 0.05, metalness: 0 },
  trim: { color: '#f2f2f0', roughness: 0.5, metalness: 0 },
  shade: { color: '#f1e9db', roughness: 0.9, metalness: 0 },
  bulb: { color: '#f7f3ea', roughness: 0.3, metalness: 0 },
  frame: { color: '#3a3330', roughness: 0.6, metalness: 0 },
  mirror: { color: '#ffffff', roughness: 0.02, metalness: 1 },
  leaf: { color: '#4f7a45', roughness: 0.85, metalness: 0 },
  rug: { color: '#b9a58c', roughness: 1, metalness: 0 },
  unknown: { color: '#c4b5fd', roughness: 0.8, metalness: 0 },
};
/** Cuánto se mezcla el color del mueble con el azul de selección (conserva el contraste). */
const ITEM_TINT: Record<InteractionState, number> = { normal: 0, hover: 0.25, selected: 0.5 };
const HIGHLIGHT = new Color('#3b82f6');

/**
 * Material de una pieza de mueble. `color` reemplaza el del slot (alfombras, cortinas…);
 * `lit` hace brillar bombillas y pantallas de luminarias encendidas.
 */
export function itemMaterial(
  slot: string,
  state: InteractionState,
  color?: string,
  lit = false,
): Material {
  if (slot === 'glass') return openingMaterial('glass', state);
  const base = ITEM_PALETTE[slot] ?? ITEM_PALETTE.unknown!;
  const glow = lit && (slot === 'bulb' || slot === 'shade');
  return cached(
    `item:${slot}:${state}:${color ?? ''}:${glow ? 'lit' : ''}`,
    () =>
      new MeshStandardMaterial({
        color: new Color(color ?? base.color).lerp(HIGHLIGHT, ITEM_TINT[state]),
        roughness: base.roughness,
        metalness: base.metalness,
        ...(glow
          ? { emissive: new Color('#ffd9a0'), emissiveIntensity: slot === 'bulb' ? 2.2 : 0.45 }
          : {}),
      }),
  );
}
