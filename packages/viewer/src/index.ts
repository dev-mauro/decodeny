export { DecodenyViewer, type DecodenyViewerProps } from './DecodenyViewer';
export type { ViewerCameraApi } from './scene/EditCamera';
export type { ViewerApi } from './scene/ViewerApiBridge';
export {
  sameSelection,
  type InteractionState,
  type ItemDragEvent,
  type OpeningDragEvent,
  type AreaSelectEvent,
  type PlacementEvent,
  type SelectOptions,
  type RoomDragEvent,
  type ViewerPlacement,
  type ViewerSelection,
} from './selection';
export { planToWorld, planDirToWorld, type Vec3Tuple } from './coords';
export { buildWallMesh, WALL_SLOTS, type WallCut, type WallSlot } from './builders/wall-mesh';
export { buildSurfaceMesh, type SurfaceFacing } from './builders/surface-mesh';
export { MeshBuilder, type MeshData, type PlaneFrame } from './builders/mesh-data';
export { toBufferGeometry } from './builders/to-buffer-geometry';
export { navigationModes } from './navigation/registry';
export type {
  BuiltInNavigationMode,
  NavigationModeDefinition,
  NavigationModeId,
  NavigationModeProps,
} from './navigation/types';
export { DEFAULT_PERSON, capsuleDimensions, type PersonProfile } from './navigation/person-profile';
export {
  DEFAULT_KEYMAP,
  intentFromKeys,
  horizontalDirection,
  type Keymap,
  type MovementIntent,
} from './navigation/input';
export {
  paintMaterial,
  patternPainters,
  type PatternImage,
  type PatternPainter,
} from './materials/patterns';
export type { LightingMode } from './scene/SceneEnvironment';
export {
  kelvinToColor,
  lampLights,
  lightBudget,
  MAX_LAMP_LIGHTS,
  MAX_SHADOW_LAMPS,
} from './scene/lamp-lights';
export { itemGroupOf, type ItemGroup } from './scene/item-groups';
export { measureDistance, type MeasurePoint } from './scene/measure';
export { PlanView, type NodeDragEvent, type PlanTool, type PlanViewProps } from './plan/PlanView';
