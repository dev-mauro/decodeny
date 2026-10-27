// Ejecuta un comando con los emuladores de Firestore y Auth levantados y la app configurada para
// usarlos (proyecto demo: nada sale a la red). Lo usan los E2E de la nube:
//
//   node scripts/cloud/with-emulators.mjs pnpm e2e
//
// `FIREBASE_CLI` permite otra CLI (p. ej. `pnpm dlx firebase-tools@13` con un Java anterior a 21).
import { spawnSync } from 'node:child_process';

const command = process.argv.slice(2).join(' ');
if (!command) {
  console.error('Uso: node scripts/cloud/with-emulators.mjs <comando>');
  process.exit(2);
}

const cli = process.env.FIREBASE_CLI ?? 'pnpm exec firebase';
const result = spawnSync(
  `${cli} emulators:exec --config firebase/firebase.json --only firestore,auth --project demo-decodeny "${command}"`,
  {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      // Configuración de la app para los emuladores (valores de un proyecto demo).
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      VITE_FIREBASE_PROJECT_ID: 'demo-decodeny',
      VITE_FIREBASE_APP_ID: '1:000000000000:web:demo',
      VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
      E2E_CLOUD: '1',
    },
  },
);
process.exit(result.status ?? 1);
