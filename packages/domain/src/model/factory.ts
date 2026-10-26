import { createId, type IdFactory } from '../ids';
import { CURRENT_SCHEMA_VERSION } from './schema';
import type { Level, Project } from './types';

export const DEFAULT_WALL_HEIGHT = 2400;
export const DEFAULT_WALL_THICKNESS = 150;

export interface NewProjectOptions {
  readonly name: string;
  readonly levelName: string;
  readonly generator: string;
  readonly ids?: IdFactory;
  readonly now?: Date;
}

export function createEmptyLevel(name: string, ids: IdFactory = createId, elevation = 0): Level {
  return {
    id: ids('lvl'),
    name,
    elevation,
    nodes: [],
    walls: [],
    openings: [],
    rooms: [],
    items: [],
  };
}

export function createEmptyProject(options: NewProjectOptions): Project {
  const ids = options.ids ?? createId;
  const timestamp = (options.now ?? new Date()).toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      id: ids('proj'),
      name: options.name,
      createdAt: timestamp,
      updatedAt: timestamp,
      generator: options.generator,
    },
    settings: {
      defaultWallHeight: DEFAULT_WALL_HEIGHT,
      defaultWallThickness: DEFAULT_WALL_THICKNESS,
    },
    levels: [createEmptyLevel(options.levelName, ids)],
    materials: [],
    assets: [],
  };
}
