import { DomainError } from '../errors';
import { isSimplePolygon, signedArea } from '../geometry';
import { assertLevelOpenings } from '../model/openings';
import { roomCenterlinePolygon, roomInteriorPolygon, roomSides } from '../model/queries';
import type { Level, Room } from '../model/types';

/** Lado mínimo interior de un recinto (mm): permite tabiques y nichos cortos, p. ej. 20 cm. */
export const MIN_ROOM_SIDE = 50;

export function assertRange(field: string, value: number, min: number, max = Infinity): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new DomainError('out-of-range', `${field} fuera de rango`, {
      field,
      value,
      min,
      max: Number.isFinite(max) ? max : '∞',
    });
  }
}

/** Valida la geometría de todo el nivel tras un cambio: recintos y vanos. */
export function assertLevelGeometry(level: Level): void {
  for (const room of level.rooms) assertRoomGeometry(level, room);
  assertLevelOpenings(level);
}

/** Verifica que el contorno del recinto (eje e interior) siga siendo un polígono válido. */
export function assertRoomGeometry(level: Level, room: Room): void {
  const centerline = roomCenterlinePolygon(level, room);
  const inner = roomInteriorPolygon(level, room);
  // Un recinto más angosto que sus muros tiene el interior "dado vuelta" (orientación opuesta).
  const inverted = Math.sign(signedArea(inner)) !== Math.sign(signedArea(centerline));
  if (!isSimplePolygon(centerline) || !isSimplePolygon(inner) || inverted) {
    throw new DomainError('invalid-geometry', 'El contorno del recinto se cruza o colapsa', {
      room: room.id,
    });
  }
  for (const side of roomSides(level, room)) {
    if (side.length < MIN_ROOM_SIDE) {
      throw new DomainError('too-short', 'Un lado del recinto queda demasiado corto', {
        room: room.id,
        side: side.index,
        min: MIN_ROOM_SIDE,
      });
    }
  }
}
