import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { EMULATOR_PORTS, type CloudConfig } from '../cloud-config';
import { randomRoomCode, type RoomSignaling } from '../../collab/room-signaling';
import { ensureIdentity, firebaseApp } from './app';

/**
 * Salas de colaboración sobre Firestore (ADR-0014). Usa el SDK completo (no *lite*) por las
 * escuchas en tiempo real: el anfitrión ve llegar las solicitudes y el invitado la respuesta.
 * Se carga solo al colaborar, en su propio chunk.
 *
 *   rooms/{code}                hostUid, hostName, createdAt, expiresAt
 *   rooms/{code}/requests/{id}  guestUid, name, offer, answer?, createdAt
 */

/** Una sala vence a las 12 h (la limpieza diaria la borra). */
const ROOM_TTL_MS = 12 * 3600_000;
const MAX_CODE_TRIES = 5;

export function createFirestoreRooms(config: CloudConfig): RoomSignaling {
  const { app, auth } = firebaseApp(config);
  const db = getFirestore(app);
  if (config.emulatorHost) {
    connectFirestoreEmulator(db, config.emulatorHost, EMULATOR_PORTS.firestore);
  }
  const room = (code: string) => doc(db, 'rooms', code);
  const requests = (code: string) => collection(db, 'rooms', code, 'requests');

  return {
    async openRoom(hostName) {
      const me = await ensureIdentity(auth);
      for (let i = 0; i < MAX_CODE_TRIES; i++) {
        const code = randomRoomCode();
        if ((await getDoc(room(code))).exists()) continue;
        await setDoc(room(code), {
          hostUid: me.uid,
          hostName: hostName.slice(0, 40),
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + ROOM_TTL_MS),
        });
        return code;
      }
      throw new Error('room-code-exhausted');
    },

    onRequest(code, listener) {
      return onSnapshot(requests(code), (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type !== 'added') continue;
          const data = change.doc.data();
          if (typeof data.offer !== 'string' || typeof data.answer === 'string') continue;
          listener({ id: change.doc.id, name: String(data.name), offer: data.offer });
        }
      });
    },

    async answer(code, requestId, sdp) {
      await updateDoc(doc(requests(code), requestId), { answer: sdp });
    },

    async removeRequest(code, requestId) {
      await deleteDoc(doc(requests(code), requestId));
    },

    async closeRoom(code) {
      await deleteDoc(room(code));
    },

    async findRoom(code) {
      await ensureIdentity(auth);
      const snap = await getDoc(room(code));
      if (!snap.exists()) return null;
      const expiresAt = snap.get('expiresAt') as Timestamp | undefined;
      if (expiresAt && expiresAt.toMillis() < Date.now()) return null;
      return { hostName: String(snap.get('hostName')) };
    },

    async request(code, name, offer) {
      const me = await ensureIdentity(auth);
      const ref = doc(requests(code));
      await setDoc(ref, {
        guestUid: me.uid,
        name: name.slice(0, 40),
        offer,
        createdAt: serverTimestamp(),
      });
      let unsubscribe: () => void = () => undefined;
      const answer = new Promise<string>((resolve, reject) => {
        unsubscribe = onSnapshot(
          ref,
          (snap) => {
            const value: unknown = snap.get('answer');
            if (typeof value !== 'string') return;
            unsubscribe();
            resolve(value);
          },
          reject,
        );
      });
      return {
        requestId: ref.id,
        answer,
        cancel: () => {
          unsubscribe();
          void deleteDoc(ref).catch(() => undefined);
        },
      };
    },
  };
}
