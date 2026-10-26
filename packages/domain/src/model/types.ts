import type { z } from 'zod';
import type {
  AssetSchema,
  ItemSchema,
  LevelSchema,
  MaterialSchema,
  NodeSchema,
  OpeningSchema,
  ParamsSchema,
  ProjectMetaSchema,
  ProjectSchema,
  ProjectSettingsSchema,
  RoomSchema,
  WallFinishSchema,
  WallSchema,
} from './schema';

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type Level = z.infer<typeof LevelSchema>;
export type PlanNode = z.infer<typeof NodeSchema>;
export type Wall = z.infer<typeof WallSchema>;
export type WallFinish = z.infer<typeof WallFinishSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type MaterialInstance = z.infer<typeof MaterialSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Params = z.infer<typeof ParamsSchema>;
