import { itemBase, resolveItemDefinition } from '@decodeny/catalog';
import { itemLocalToPlan, resolveParams, type Level } from '@decodeny/domain';
import { Color } from 'three';
import { planToWorld, type Vec3Tuple } from '../coords';

/** A lo sumo estas luces de luminarias a la vez (cada luz encarece el render de toda la escena). */
export const MAX_LAMP_LIGHTS = 12;
/**
 * De ellas, cuántas proyectan sombra (las más cercanas a la cámara). Cada una renderiza la escena
 * seis veces (mapa cúbico): con el sol, el total queda dentro de 4 luces con sombra.
 */
export const MAX_SHADOW_LAMPS = 3;

/**
 * Escala de exposición: la escena usa unidades relativas (el "sol" vale ~1,8). Un flujo real
 * en lúmenes se pasa a candelas (lm / 4π) y se escala para que una ampolleta de 800 lm ilumine
 * un recinto de forma creíble sin saturar.
 */
const EXPOSURE = 0.012;

/** Color aproximado de un cuerpo negro a `kelvin` (algoritmo de Tanner Helland). */
export function kelvinToColor(kelvin: number): Color {
  const t = Math.min(40_000, Math.max(1000, kelvin)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const clamp = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  return new Color().setRGB(clamp(r), clamp(g), clamp(b));
}

export interface LampLight {
  readonly key: string;
  readonly position: Vec3Tuple;
  readonly intensity: number;
  readonly color: Color;
}

/** Luces de todas las luminarias encendidas de un nivel, en coordenadas de mundo. */
export function lampLights(level: Level): LampLight[] {
  const lights: LampLight[] = [];
  for (const item of level.items) {
    const definition = resolveItemDefinition(item.def);
    if (!definition.emitters) continue;
    const emitters = definition.emitters(resolveParams(definition.params, item.params));
    const base = itemBase(level, item);
    emitters.forEach((e, i) => {
      // Marco del catálogo: z con el frente en +z; en planta el frente mira a −y con rotación 0.
      const p = itemLocalToPlan(item, e.at[0], e.at[2]);
      lights.push({
        key: `${item.id}:${i}`,
        position: planToWorld(p, level.elevation + base + e.at[1]),
        intensity: (e.lumens / (4 * Math.PI)) * EXPOSURE,
        color: kelvinToColor(e.kelvin),
      });
    });
  }
  return lights;
}

export interface BudgetedLight extends LampLight {
  readonly castShadow: boolean;
}

/**
 * Presupuesto de luces: las `maxLights` más cercanas a la cámara se encienden y, de ellas, las
 * `maxShadows` más cercanas proyectan sombra. Mantener la cantidad estable evita que Three
 * recompile los materiales al moverse.
 */
export function lightBudget(
  lights: readonly LampLight[],
  camera: Vec3Tuple,
  maxLights = MAX_LAMP_LIGHTS,
  maxShadows = MAX_SHADOW_LAMPS,
): BudgetedLight[] {
  const distance2 = (p: Vec3Tuple) =>
    (p[0] - camera[0]) ** 2 + (p[1] - camera[1]) ** 2 + (p[2] - camera[2]) ** 2;
  return [...lights]
    .sort((a, b) => distance2(a.position) - distance2(b.position))
    .slice(0, maxLights)
    .map((light, i) => ({ ...light, castShadow: i < maxShadows }));
}
