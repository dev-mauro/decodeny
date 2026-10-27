import type { Plane } from 'three';

/**
 * Planos del corte de muros. Lo comparten (por referencia) los materiales de la envolvente:
 * muros, pisos, cielos, puertas y ventanas; los muebles no lo usan, así que no se cortan.
 * `SectionClipping` lo llena o lo vacía; Three recompila los materiales al cambiar la cantidad.
 */
export const SECTION_PLANES: Plane[] = [];
