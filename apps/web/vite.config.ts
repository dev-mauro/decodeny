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
      const urls = ['/index.html', ...files.map((f) => `/${f}`)];
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
    // Three.js es grande por naturaleza; la división fina de bundles llega en I8.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
