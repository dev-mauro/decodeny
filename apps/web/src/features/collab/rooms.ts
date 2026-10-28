import { readCloudConfig } from '../cloud/cloud-config';
import type { RoomSignaling } from './room-signaling';

/** Salas con código (ADR-0014): disponibles si la nube está configurada. */
const config = readCloudConfig();

export const roomsAvailable = config !== null;

let rooms: Promise<RoomSignaling> | null = null;

/** El adaptador de Firestore (con escuchas) se descarga recién al colaborar. */
export function loadRooms(): Promise<RoomSignaling> {
  if (!config) return Promise.reject(new Error('rooms-unavailable'));
  rooms ??= import('../cloud/firebase/rooms').then((m) => m.createFirestoreRooms(config));
  return rooms;
}
