import { serializeProject } from '@decodeny/domain';
import { GENERATOR } from '@/config';
import { database, STORES } from '@/shared/lib/db';
import { i18next } from '@/i18n';
import { notify } from '@/state/notifications-store';
import { useProjectStore } from '@/state/project-store';

const STORE = STORES.autosave;
const KEY = 'current';
const DEBOUNCE_MS = 600;

/** Último proyecto guardado automáticamente (JSON serializado), o `null`. */
export async function loadAutosave(): Promise<string | null> {
  try {
    const value: unknown = await (await database()).get(STORE, KEY);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

async function saveAutosave(text: string): Promise<void> {
  await (await database()).put(STORE, text, KEY);
}

/** Guarda el proyecto en IndexedDB tras cada cambio (con debounce). Devuelve la desuscripción. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let warned = false;
  const unsubscribe = useProjectStore.subscribe((state, previous) => {
    if (state.project === previous.project) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      saveAutosave(serializeProject(state.project, { generator: GENERATOR })).catch(() => {
        if (!warned) notify('error', i18next.t('io.autosaveFailed'));
        warned = true;
      });
    }, DEBOUNCE_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
