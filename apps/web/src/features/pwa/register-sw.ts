import { i18next } from '@/i18n';
import { notify } from '@/state/notifications-store';

/**
 * Registra el service worker (solo en producción): la aplicación queda disponible sin conexión.
 * Si hay una versión nueva instalada, ofrece actualizar; si no, se usa al volver a abrir.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // Después de `load`, para no competir con la carga inicial (que puede haber terminado ya).
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

function register(): void {
  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          // Con un controlador previo, lo instalado es una actualización (no la primera visita).
          if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
          notify('info', i18next.t('pwa.updateReady'), {
            label: i18next.t('pwa.reload'),
            run: () => {
              navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
              });
              worker.postMessage('skip-waiting');
            },
          });
        });
      });
    })
    .catch((error: unknown) => {
      console.warn('Service worker no registrado', error);
    });
}
