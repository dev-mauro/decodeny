/* eslint-disable no-console -- script de CLI: su salida es el informe. */
// Presupuesto de tamaño del build de producción (gzip). Falla si un chunk crece por sobre su
// límite: así un aumento de peso es una decisión explícita (subir el límite en este archivo).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = join(import.meta.dirname, '..', 'apps', 'web', 'dist', 'assets');

/** Límites en kB gzip por prefijo de chunk. */
const BUDGETS = {
  index: 220, // aplicación (UI, dominio, catálogo)
  three: 220, // Three.js
  r3f: 180, // React Three Fiber + drei
  PersonMode: 900, // recorrido: Rapier (WASM) se carga solo al entrar
};

let failed = false;
for (const file of readdirSync(DIST).filter((f) => f.endsWith('.js'))) {
  const prefix = Object.keys(BUDGETS).find((p) => file.startsWith(`${p}-`));
  if (!prefix) continue;
  const kb = gzipSync(readFileSync(join(DIST, file))).length / 1024;
  const limit = BUDGETS[prefix];
  const ok = kb <= limit;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'} ${file.padEnd(36)} ${kb.toFixed(1).padStart(7)} kB / ${limit} kB`);
}
if (failed) {
  console.error('\nUn chunk supera su presupuesto de tamaño (scripts/check-bundle-size.mjs).');
  process.exit(1);
}
