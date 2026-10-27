/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

/**
 * Genera `sw.js` (aplicación sin conexión) con la lista de archivos del build para precargarlos.
 * La versión de la caché es un hash de esa lista: cada build distinto reemplaza la anterior.
 * Las rutas son relativas al service worker, así funciona en cualquier `base` (p. ej. GitHub Pages).
 */
function serviceWorker(): Plugin {
  const template = new URL('./sw/service-worker.js', import.meta.url);
  const publicDir = new URL('./public/', import.meta.url);
  return {
    name: 'decodeny-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = [
        ...Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html'),
        ...readdirSync(publicDir),
      ].sort();
      const urls = ['index.html', ...files];
      const version = createHash('sha256').update(urls.join('|')).digest('hex').slice(0, 12);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: readFileSync(template, 'utf-8')
          .replace('__VERSION__', version)
          .replace('__PRECACHE__', JSON.stringify(urls)),
      });
    },
  };
}

export default defineConfig({
  // Ruta donde se publica la app: `/` en local; GitHub Pages usa `--base /<repo>/` (`build:pages`).
  base: '/',
  plugins: [react(), tailwindcss(), serviceWorker()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Three.js y Rapier son grandes por naturaleza; ambos se cargan bajo demanda.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Por ruta de módulo (no por paquete): la forma de objeto arrastra también las
        // dependencias (React terminaba en el chunk de r3f y obligaba a cargar todo al inicio).
        // Rapier (física del recorrido) queda fuera: va en el chunk del modo persona.
        manualChunks(id) {
          const path = id.replace(/\\/g, '/');
          // El helper de precarga de Vite (lo usa todo `import()`) tampoco debe caer en r3f.
          if (path.includes('vite/preload-helper')) return 'vendor';
          if (!path.includes('/node_modules/')) return undefined;
          // Lo que comparten la app y r3f (React, sus helpers) va aparte; si no, Rollup lo ubica
          // en r3f y la carga inicial terminaría trayendo también r3f y Three.js.
          if (
            /\/node_modules\/(react|react-dom|scheduler|zustand|use-sync-external-store|@babel\/runtime)\//.test(
              path,
            )
          ) {
            return 'vendor';
          }
          if (path.includes('/node_modules/three/')) return 'three';
          if (
            /\/node_modules\/(@react-three\/(fiber|drei)|three-stdlib|camera-controls)\//.test(path)
          ) {
            return 'r3f';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
