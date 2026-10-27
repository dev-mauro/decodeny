import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { startMaquetas } from './features/maquetas/maquetas';
import { presentationFromUrl } from './features/presentation/presentation';
import { registerServiceWorker } from './features/pwa/register-sw';
import './i18n';
import './styles.css';

async function boot(): Promise<void> {
  // Abrir la maqueta (la del enlace o la última) antes de montar evita un parpadeo vacío.
  await startMaquetas();
  presentationFromUrl();
  registerServiceWorker();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
