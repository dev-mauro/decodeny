import type { ViewerSelection } from '@decodeny/viewer';

// Comparación local (no `sameSelection` del visor): el estado no carga Three.js en runtime.
const sameSelection = (a: ViewerSelection, b: ViewerSelection) =>
  a.kind === b.kind && a.id === b.id;

/**
 * Selección de la interfaz: una entidad **principal** (la que muestra el inspector y da
 * contexto) y un **grupo** de otras seleccionadas con ella. Admiten selección múltiple los muebles
 * y los recintos (cada grupo de una sola clase); lo decide `nextSelection`.
 */
export interface SelectionState {
  readonly selection: ViewerSelection | null;
  readonly selectionGroup: readonly ViewerSelection[];
}

export const EMPTY_SELECTION: SelectionState = { selection: null, selectionGroup: [] };

/** Entidades que admiten selección múltiple. */
const multiSelectable = (target: ViewerSelection | null): target is ViewerSelection =>
  target?.kind === 'item' || target?.kind === 'room';

/** Todas las entidades seleccionadas, la principal primero. */
export function selectedTargets(state: SelectionState): ViewerSelection[] {
  return state.selection ? [state.selection, ...state.selectionGroup] : [...state.selectionGroup];
}

/** Muebles seleccionados en el orden en que se eligieron (la principal, al final). */
function inOrder(state: SelectionState): ViewerSelection[] {
  const list = state.selection
    ? [...state.selectionGroup, state.selection]
    : [...state.selectionGroup];
  return list.filter(multiSelectable);
}

function fromList(list: readonly ViewerSelection[]): SelectionState {
  if (list.length === 0) return EMPTY_SELECTION;
  // La última agregada pasa a ser la principal.
  return { selection: list[list.length - 1]!, selectionGroup: list.slice(0, -1) };
}

/**
 * Selección resultante de un clic. Sin `additive` reemplaza la selección; con `additive`
 * (Shift, Ctrl o Cmd) suma o quita el mueble, y la última sumada queda como principal. Sumar
 * algo que no admite selección múltiple lo selecciona solo.
 */
export function nextSelection(
  state: SelectionState,
  target: ViewerSelection | null,
  additive = false,
): SelectionState {
  if (!additive || !multiSelectable(target)) {
    return target ? { selection: target, selectionGroup: [] } : EMPTY_SELECTION;
  }
  // Un grupo es de una sola clase: sumar un recinto a muebles (o al revés) empieza otro.
  const current = inOrder(state).filter((t) => t.kind === target.kind);
  if (current.some((t) => sameSelection(t, target))) {
    const rest = current.filter((t) => !sameSelection(t, target));
    // Al quitar la principal, la principal pasa a ser la última que queda.
    return fromList(rest);
  }
  return fromList([...current, target]);
}

/** Selecciona varias entidades (recuadro, «seleccionar todo»); `additive` las suma. */
export function selectMany(
  state: SelectionState,
  targets: readonly ViewerSelection[],
  additive = false,
): SelectionState {
  const base = additive ? inOrder(state) : [];
  const added = targets.filter((t) => !base.some((b) => sameSelection(b, t)));
  return fromList([...base, ...added]);
}

/** Quita de la selección lo que ya no existe (eliminar, deshacer, abrir otro archivo). */
export function pruneSelection(
  state: SelectionState,
  exists: (target: ViewerSelection) => boolean,
): SelectionState {
  const selection = state.selection && exists(state.selection) ? state.selection : null;
  const group = state.selectionGroup.filter(exists);
  if (selection === state.selection && group.length === state.selectionGroup.length) return state;
  return selection ? { selection, selectionGroup: group } : fromList(group);
}
