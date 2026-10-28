/* eslint-disable no-console -- script de CLI: su salida es el informe. */
// Presupuesto de tamaño del build de producción (gzip). Falla si un chunk crece por sobre su
// límite o si la carga inicial (lo que referencia index.html) supera el presupuesto del plan
// (§8.4: JS inicial < 400 kB gzip): así un aumento de peso es una decisión explícita.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = join(import.meta.dirname, '..', 'apps', 'web', 'dist');
const DIST = join(ROOT, 'assets');

/** Límites en kB gzip por prefijo de chunk. */
const BUDGETS = {
  index: 220, // aplicación (UI, dominio, catálogo)
  vendor: 90, // React y lo que comparte con r3f
  canvas: 40, // vista 3D (bajo demanda)
  three: 220, // Three.js (bajo demanda)
  r3f: 100, // React Three Fiber + drei (bajo demanda)
  PersonMode: 900, // recorrido: Rapier (WASM) se carga solo al entrar
  cloud: 60, // Firebase: app + Auth anónima (al compartir, abrir un enlace o colaborar)
  'firebase-backend': 60, // + Firestore lite (guardado de maquetas)
  rooms: 150, // + Firestore con escuchas (salas de colaboración, solo al colaborar)
};

/** JS que el navegador descarga antes de mostrar la app (script + modulepreload). */
const INITIAL_BUDGET = 400;

const gzipKb = (file) => gzipSync(readFileSync(join(DIST, file))).length / 1024;
let failed = false;

for (const file of readdirSync(DIST).filter((f) => f.endsWith('.js'))) {
  // El prefijo más largo que coincida (`firebase-backend` antes que otro más corto).
  const prefix = Object.keys(BUDGETS)
    .sort((x, y) => y.length - x.length)
    .find((p) => file.startsWith(`${p}-`));
  if (!prefix) continue;
  const kb = gzipKb(file);
  const limit = BUDGETS[prefix];
  const ok = kb <= limit;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'} ${file.padEnd(36)} ${kb.toFixed(1).padStart(7)} kB / ${limit} kB`);
}

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="[^"]*\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
const initialKb = initial.reduce((sum, file) => sum + gzipKb(file), 0);
const initialOk = initialKb <= INITIAL_BUDGET;
failed ||= !initialOk;
console.log(
  `${initialOk ? '✓' : '✗'} ${'carga inicial'.padEnd(36)} ${initialKb.toFixed(1).padStart(7)} kB / ${INITIAL_BUDGET} kB  (${initial.join(', ')})`,
);

if (failed) {
  console.error('\nEl build supera su presupuesto de tamaño (scripts/check-bundle-size.mjs).');
  process.exit(1);
}
