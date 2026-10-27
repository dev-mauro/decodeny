import {
  parseProjectFile,
  projectFileName,
  PROJECT_FILE_MIME,
  serializeProject,
  withoutUnusedAssets,
  type Project,
} from '@decodeny/domain';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { assetBlob, ensureAssets, saveAssetBlob } from '@/features/assets/asset-store';
import { GENERATOR } from '@/config';
import { i18next } from '@/i18n';
import { describeLoadError } from '@/shared/lib/errors';
import { notify } from '@/state/notifications-store';
import { newProject, useProjectStore } from '@/state/project-store';
import { useUiStore } from '@/state/ui-store';
import { buildSampleProject } from '../samples/sample-project';
import { PROJECT_TEMPLATES, type ProjectTemplate } from '../samples/templates';
import { useIoStore } from './io-store';

/**
 * Acciones de archivo de alto nivel, invocables desde botones y atajos de teclado.
 * Viven fuera de React para poder usarse en cualquier contexto.
 */

function loadIntoEditor(project: Project): void {
  useProjectStore.getState().replace(project);
  useUiStore.setState({
    selection: null,
    selectionGroup: [],
    levelId: project.levels[0]?.id ?? null,
  });
  void ensureAssets(project.assets.map((a) => a.id));
}

/** Nombre del documento dentro del `.zip` (junto a `assets/…`). */
export const ZIP_PROJECT_ENTRY = 'project.decodeny.json';
const ZIP_MIME = 'application/zip';

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  notify('success', i18next.t('io.exported', { file: fileName }));
}

/**
 * Exporta el proyecto: un `.decodeny.json` o, si tiene imágenes del usuario, un
 * `.decodeny.zip` con el documento y las imágenes en `assets/`.
 */
async function exportProject(): Promise<void> {
  const project = withoutUnusedAssets(useProjectStore.getState().project);
  const text = serializeProject(project, { generator: GENERATOR });
  const jsonName = projectFileName(project.meta.name);
  if (project.assets.length === 0) {
    download(new Blob([text], { type: PROJECT_FILE_MIME }), jsonName);
    return;
  }
  await ensureAssets(project.assets.map((a) => a.id));
  const entries: Zippable = { [ZIP_PROJECT_ENTRY]: strToU8(text) };
  for (const asset of project.assets) {
    const blob = assetBlob(asset.id);
    // Las imágenes ya vienen comprimidas: se guardan sin recomprimir.
    if (blob) entries[asset.path] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  download(new Blob([zipSync(entries)], { type: ZIP_MIME }), jsonName.replace(/\.json$/, '.zip'));
}

export function exportCurrentProject(): void {
  void exportProject();
}

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b;

/** Lee un `.zip` exportado: guarda sus imágenes y devuelve el texto del documento. */
async function readZip(bytes: Uint8Array): Promise<string | null> {
  const files = unzipSync(bytes);
  const entry =
    files[ZIP_PROJECT_ENTRY] ?? Object.entries(files).find(([name]) => name.endsWith('.json'))?.[1];
  if (!entry) return null;
  const text = strFromU8(entry);
  const parsed = parseProjectFile(text);
  if (parsed.ok) {
    for (const asset of parsed.project.assets) {
      const data = files[asset.path];
      if (data) await saveAssetBlob(asset.id, new Blob([data], { type: asset.mime }));
    }
  }
  return text;
}

export function requestOpenFile(): void {
  useIoStore.getState().fileInput?.click();
}

export async function openProjectFile(file: File): Promise<void> {
  let text: string | null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    text = isZip(bytes) ? await readZip(bytes) : new TextDecoder().decode(bytes);
  } catch {
    text = null;
  }
  if (text === null) {
    useIoStore.getState().setImportError({ summary: i18next.t('io.errors.read'), details: [] });
    return;
  }
  const result = parseProjectFile(text);
  if (!result.ok) {
    useIoStore.getState().setImportError(describeLoadError(result.error));
    return;
  }
  loadIntoEditor(result.project);
  notify('success', i18next.t('io.opened', { name: result.project.meta.name }));
  if (result.migratedFrom !== null) notify('info', i18next.t('io.migrated'));
}

export function startNewProject(): void {
  loadIntoEditor(newProject());
}

export function loadSampleProject(): void {
  loadIntoEditor(buildSampleProject());
  notify('success', i18next.t('io.sampleLoaded'));
}

export function loadTemplate(id: ProjectTemplate['id']): void {
  const template = PROJECT_TEMPLATES.find((t) => t.id === id);
  if (!template) return;
  loadIntoEditor(template.build());
  notify('success', i18next.t('io.templateLoaded'));
}

/** Descarga una imagen PNG de lo que muestra la vista (para fichas y publicaciones). */
export async function downloadCapture(capture: () => Promise<Blob | null>): Promise<void> {
  const blob = await capture();
  if (!blob) {
    notify('error', i18next.t('io.captureFailed'));
    return;
  }
  const name = projectFileName(useProjectStore.getState().project.meta.name).replace(
    /\.decodeny\.json$/,
    `-${new Date().toISOString().slice(0, 10)}.png`,
  );
  download(blob, name);
}

/** Restaura el guardado automático; si está dañado, conserva el proyecto vacío y avisa. */
export function restoreProject(text: string | null): void {
  if (text === null) return;
  const result = parseProjectFile(text);
  if (result.ok) loadIntoEditor(result.project);
  else notify('error', i18next.t('io.restoreFailed'));
}
