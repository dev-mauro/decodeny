import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { startAutosave, loadAutosave } from './features/io/autosave';
import { restoreProject } from './features/io/project-actions';
import { registerServiceWorker } from './features/pwa/register-sw';
import './i18n';
import './styles.css';

async function boot(): Promise<void> {
  // Restaurar antes de montar evita un parpadeo con el proyecto vacío.
  restoreProject(await loadAutosave());
  startAutosave();
  registerServiceWorker();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
