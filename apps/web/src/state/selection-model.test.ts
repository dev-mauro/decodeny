import { describe, expect, it } from 'vitest';
import {
  EMPTY_SELECTION,
  nextSelection,
  pruneSelection,
  selectMany,
  selectedTargets,
} from './selection-model';

const item = (id: string) => ({ kind: 'item', id }) as const;
const room = (id: string) => ({ kind: 'room', id }) as const;

describe('selección', () => {
  it('un clic reemplaza la selección; con Shift suma muebles y el último es el principal', () => {
    let s = nextSelection(EMPTY_SELECTION, item('a'));
    s = nextSelection(s, item('b'), true);
    s = nextSelection(s, item('c'), true);
    expect(s.selection).toEqual(item('c'));
    expect(selectedTargets(s).map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(nextSelection(s, item('d')).selectionGroup).toEqual([]);
  });

  it('Shift sobre un mueble seleccionado lo quita (también si es el principal)', () => {
    let s = selectMany(EMPTY_SELECTION, [item('a'), item('b'), item('c')]);
    s = nextSelection(s, item('a'), true);
    expect(selectedTargets(s).map((t) => t.id)).toEqual(['c', 'b']);
    s = nextSelection(s, item('c'), true);
    expect(s).toEqual({ selection: item('b'), selectionGroup: [] });
    expect(nextSelection(s, item('b'), true)).toEqual(EMPTY_SELECTION);
  });

  it('lo que no admite selección múltiple se selecciona solo', () => {
    const s = selectMany(EMPTY_SELECTION, [item('a'), item('b')]);
    expect(nextSelection(s, room('r'), true)).toEqual({ selection: room('r'), selectionGroup: [] });
    // Sumar un mueble a un recinto seleccionado empieza una selección de muebles.
    expect(nextSelection({ selection: room('r'), selectionGroup: [] }, item('a'), true)).toEqual({
      selection: item('a'),
      selectionGroup: [],
    });
  });

  it('el recuadro suma sin duplicar y quitar lo borrado conserva el resto', () => {
    let s = selectMany(EMPTY_SELECTION, [item('a')]);
    s = selectMany(s, [item('a'), item('b')], true);
    expect(selectedTargets(s).map((t) => t.id)).toEqual(['b', 'a']);
    expect(s.selection).toEqual(item('b'));
    const pruned = pruneSelection(s, (t) => t.id !== 'b');
    expect(pruned).toEqual({ selection: item('a'), selectionGroup: [] });
    expect(pruneSelection(s, () => true)).toBe(s);
  });
});
