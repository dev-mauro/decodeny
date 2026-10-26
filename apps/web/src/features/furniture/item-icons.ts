import type { AnyItemDefinition, ItemCategory } from '@decodeny/domain';
import {
  Archive,
  Blinds,
  Flower2,
  Frame,
  Lamp,
  LampCeiling,
  LampFloor,
  LampWallUp,
  RectangleHorizontal,
  Sprout,
  Armchair,
  Bath,
  BedDouble,
  CookingPot,
  LampDesk,
  Library,
  Refrigerator,
  ShowerHead,
  Sofa,
  Table,
  Toilet,
  type LucideIcon,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<ItemCategory, LucideIcon> = {
  sofa: Sofa,
  table: Table,
  chair: Armchair,
  bed: BedDouble,
  desk: LampDesk,
  storage: Archive,
  kitchen: CookingPot,
  bath: Bath,
  lighting: Lamp,
  decor: Sprout,
};

const ITEM_ICONS: Partial<Record<string, LucideIcon>> = {
  'bath.toilet@1': Toilet,
  'bath.shower@1': ShowerHead,
  'kitchen.fridge@1': Refrigerator,
  'storage.shelf@1': Library,
  'light.recessed@1': LampCeiling,
  'light.ceiling@1': LampCeiling,
  'light.pendant@1': LampCeiling,
  'light.wall@1': LampWallUp,
  'light.floor@1': LampFloor,
  'decor.mirror@1': Frame,
  'decor.plant@1': Flower2,
  'decor.rug@1': RectangleHorizontal,
  'decor.curtain@1': Blinds,
};

export const itemIcon = (def: AnyItemDefinition): LucideIcon =>
  ITEM_ICONS[def.id] ?? CATEGORY_ICONS[def.category];
