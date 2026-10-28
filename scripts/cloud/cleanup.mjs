/* eslint-disable no-console -- script de CLI: su salida es el informe del job. */
// Limpieza de la nube (ADR-0012): borra las maquetas compartidas sin visitas en los últimos
// `MAX_IDLE_DAYS` días, después los assets que ya ninguna maqueta usa y las salas de colaboración
// vencidas (ADR-0014). Lo ejecuta la GitHub
// Action `cleanup.yml` con una cuenta de servicio (Admin SDK: no pasa por las reglas).
//
//   FIREBASE_SERVICE_ACCOUNT='{…json…}' node scripts/cloud/cleanup.mjs [--dry-run]
//   (contra el emulador: FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 GCLOUD_PROJECT=demo-decodeny)
import { pathToFileURL } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const DAY_MS = 86_400_000;

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {{ now?: number, maxIdleDays?: number, assetGraceMs?: number, dryRun?: boolean,
 *   log?: (line: string) => void }} [options]
 */
export async function cleanup(db, options = {}) {
  const {
    now = Date.now(),
    maxIdleDays = 30,
    // Un asset recién subido puede no estar referenciado todavía (su maqueta se guarda después).
    assetGraceMs = DAY_MS,
    dryRun = false,
    log = console.log,
  } = options;

  const cutoff = Timestamp.fromMillis(now - maxIdleDays * DAY_MS);
  const stale = await db.collection('houses').where('lastVisitAt', '<', cutoff).get();
  log(`Maquetas sin visitas desde ${cutoff.toDate().toISOString()}: ${stale.size}`);
  if (!dryRun && stale.size > 0) {
    const writer = db.bulkWriter();
    for (const doc of stale.docs) void writer.delete(doc.ref);
    await writer.close();
  }
  const removed = new Set(stale.docs.map((d) => d.id));

  // Marcar y barrer: lo que usan las maquetas que quedan.
  const used = new Set();
  for (const doc of (await db.collection('houses').select('assets').get()).docs) {
    if (removed.has(doc.id)) continue;
    for (const id of doc.get('assets') ?? []) used.add(id);
  }
  let orphans = 0;
  // `listDocuments` incluye las fichas que aún no existen pero tienen trozos (subidas a medias).
  for (const ref of await db.collection('assets').listDocuments()) {
    if (used.has(ref.id)) continue;
    const meta = await ref.get();
    const chunks = meta.exists ? null : await ref.collection('chunks').limit(1).get();
    const touched = meta.exists
      ? (meta.get('createdAt')?.toMillis?.() ?? 0)
      : (chunks?.docs[0]?.updateTime.toMillis() ?? 0);
    if (now - touched < assetGraceMs) continue;
    orphans += 1;
    if (!dryRun) await db.recursiveDelete(ref);
  }
  log(`Assets sin uso: ${orphans}`);

  // Salas vencidas (con sus solicitudes); también las que el anfitrión cerró y dejaron solicitudes.
  let rooms = 0;
  for (const ref of await db.collection('rooms').listDocuments()) {
    const room = await ref.get();
    const expiresAt = room.exists ? (room.get('expiresAt')?.toMillis?.() ?? 0) : 0;
    if (room.exists && expiresAt > now) continue;
    rooms += 1;
    if (!dryRun) await db.recursiveDelete(ref);
  }
  log(`Salas vencidas: ${rooms}`);
  log(dryRun ? 'Simulación: no se borró nada.' : 'Listo.');
  return { houses: stale.size, assets: orphans, rooms };
}

function connect() {
  const account = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-decodeny' });
  } else if (account) {
    initializeApp({ credential: cert(JSON.parse(account)) });
  } else {
    throw new Error('Falta FIREBASE_SERVICE_ACCOUNT (JSON de la cuenta de servicio).');
  }
  return getFirestore();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  cleanup(connect(), { dryRun }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
