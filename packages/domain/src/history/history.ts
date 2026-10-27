import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import type { Command, CommandContext } from '../commands/command';
import type { Project } from '../model/types';

enablePatches();

export type { Patch };

export interface HistoryEntry {
  readonly type: string;
  readonly patches: readonly Patch[];
  readonly inverse: readonly Patch[];
  /** Entradas consecutivas con la misma clave (p. ej. arrastrar un slider) se fusionan. */
  readonly coalesceKey?: string;
  readonly at: number;
}

export interface HistoryState {
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
}

export const EMPTY_HISTORY: HistoryState = { past: [], future: [] };
export const HISTORY_LIMIT = 200;
export const COALESCE_WINDOW_MS = 1000;

export interface ExecutionResult<Result> {
  readonly project: Project;
  readonly patches: Patch[];
  readonly inverse: Patch[];
  readonly result: Result;
}

/** Ejecuta un comando de forma inmutable. Si el comando lanza, el documento no cambia. */
export function executeCommand<Args, Result>(
  project: Project,
  command: Command<Args, Result>,
  args: Args,
  ctx: CommandContext,
): ExecutionResult<Result> {
  let result!: Result;
  const [next, patches, inverse] = produceWithPatches(project, (draft) => {
    result = command.run(draft, args, ctx);
  });
  return { project: next, patches, inverse, result };
}

/** Aplica parches (p. ej. recibidos de otro participante) de forma inmutable. */
export function applyProjectPatches(project: Project, patches: readonly Patch[]): Project {
  return patches.length === 0 ? project : applyPatches(project, patches as Patch[]);
}

export function recordEntry(
  history: HistoryState,
  entry: HistoryEntry,
  limit = HISTORY_LIMIT,
): HistoryState {
  if (entry.patches.length === 0) return history;
  const last = history.past[history.past.length - 1];
  const coalesce =
    last !== undefined &&
    entry.coalesceKey !== undefined &&
    last.coalesceKey === entry.coalesceKey &&
    entry.at - last.at <= COALESCE_WINDOW_MS;
  const past = coalesce
    ? [
        ...history.past.slice(0, -1),
        {
          ...entry,
          patches: [...last.patches, ...entry.patches],
          inverse: [...entry.inverse, ...last.inverse],
        },
      ]
    : [...history.past, entry];
  return { past: past.slice(-limit), future: [] };
}

export interface TimeTravelResult {
  readonly project: Project;
  readonly history: HistoryState;
}

export function undo(project: Project, history: HistoryState): TimeTravelResult | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return {
    project: applyPatches(project, entry.inverse as Patch[]),
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
  };
}

export function redo(project: Project, history: HistoryState): TimeTravelResult | null {
  const entry = history.future[0];
  if (!entry) return null;
  return {
    project: applyPatches(project, entry.patches as Patch[]),
    history: { past: [...history.past, entry], future: history.future.slice(1) },
  };
}
