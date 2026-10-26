import type { Project } from '@decodeny/domain';
import { GAP, ProjectBuilder } from './project-builder';
import { buildSampleProject } from './sample-project';

/** Baño típico: ducha en una esquina, inodoro y vanitorio, con ventana chica. */
function bathroom(
  b: ProjectBuilder,
  room: string,
  origin: { x: number; y: number },
  w: number,
  d: number,
) {
  b.finish(room, 'floor', 'floor.ceramic@1', { tileWidth: 300, tileHeight: 300 });
  b.finish(room, 'walls', 'wall.tile@1');
  b.furnish('bath.shower@1', { x: origin.x + w - 450, y: origin.y + d - 450 }, 0);
  b.furnish('bath.toilet@1', { x: origin.x + w - 250, y: origin.y + 500 }, 270);
  b.furnish('bath.vanity@1', { x: origin.x + 450, y: origin.y + 250 }, 180, { width: 700 });
  b.furnish(
    'light.ceiling@1',
    { x: origin.x + w / 2, y: origin.y + d / 2 },
    0,
    { diameter: 300 },
    false,
  );
}

/** Estudio: un ambiente con cocina integrada y baño (≈ 30 m² útiles). */
function buildStudio(): Project {
  const b = new ProjectBuilder('Estudio');
  const main = b.rect('Living-dormitorio', { x: 0, y: 0 }, 6000, 4200);
  const bath = b.rect('Baño', { x: 6000 + GAP, y: 0 }, 1800, 2200);
  b.opening(main, 0, 900, 'door.single@1', { width: 900, openAngle: 0 });
  b.opening(main, 3, 2100, 'window.floor@1', { width: 2400, panes: 2 });
  b.doorBetween(main, bath, 'door.single@1', { width: 700, openAngle: 75 });
  b.opening(bath, 1, 1100, 'window.casement@1', { width: 600, height: 600, sill: 1500, leaves: 1 });

  b.finish(main, 'walls', 'wall.paint-matte@1', { tint: '#efe8dc' });
  b.furnish('furniture.bed@1', { x: 1000, y: 3250 }, 0, { width: 1400, depth: 1900 });
  b.furnish('furniture.sofa@1', { x: 3500, y: 450 }, 180, { width: 1600, seats: 2 });
  b.furnish('furniture.table-coffee@1', { x: 3500, y: 1450 }, 0, { width: 900, depth: 500 }, false);
  b.furnish('kitchen.counter@1', { x: 4800, y: 3900 }, 0, { width: 2400 });
  b.furnish('furniture.table-round@1', { x: 5000, y: 2200 }, 0, { diameter: 800 }, false);
  b.furnish('light.pendant@1', { x: 5000, y: 2200 }, 0, {}, false);
  b.furnish('light.ceiling@1', { x: 2500, y: 2100 }, 0, {}, false);
  bathroom(b, bath, { x: 6000 + GAP, y: 0 }, 1800, 2200);
  return b.project;
}

/** 1 dormitorio, 1 baño con cocina integrada al living (≈ 40 m² útiles). */
function buildOneBedroom(): Project {
  const b = new ProjectBuilder('Depto. 1D1B');
  const living = b.rect('Living-comedor-cocina', { x: 0, y: 0 }, 6000, 4000);
  const bedroom = b.rect('Dormitorio', { x: 0, y: 4000 + GAP }, 3400, 3200);
  const bath = b.rect('Baño', { x: 3400 + GAP, y: 4000 + GAP }, 2000, 1900);
  b.opening(living, 0, 800, 'door.single@1', { width: 900, openAngle: 0 });
  b.opening(living, 0, 3800, 'window.floor@1', { width: 2400, panes: 2 });
  b.doorBetween(living, bedroom, 'door.single@1', { openAngle: 80 });
  b.doorBetween(living, bath, 'door.single@1', { width: 700, openAngle: 75 });
  b.opening(bedroom, 2, 1700, 'window.sliding@1', { width: 1500 });
  b.opening(bath, 1, 950, 'window.casement@1', { width: 600, height: 600, sill: 1500, leaves: 1 });

  b.finish(living, 'walls', 'wall.paint-matte@1', { tint: '#efe8dc' });
  b.finish(bedroom, 'floor', 'floor.carpet@1', { tint: '#b9ad9c' });
  b.furnish('furniture.sofa@1', { x: 450, y: 1800 }, 90, { width: 2100 });
  b.furnish('furniture.table-coffee@1', { x: 1500, y: 1800 }, 90, {}, false);
  b.furnish('furniture.table-rect@1', { x: 3500, y: 1800 }, 90, { width: 1200, depth: 800 }, false);
  b.furnish('kitchen.counter@1', { x: 5700, y: 1700 }, 270, { width: 3000 });
  b.furnish('kitchen.fridge@1', { x: 5700, y: 3600 }, 270);
  b.furnish('furniture.bed@1', { x: 1700, y: 6400 }, 0, { width: 1400, depth: 1900 });
  b.furnish('furniture.nightstand@1', { x: 700, y: 7150 }, 0);
  b.furnish('furniture.nightstand@1', { x: 2700, y: 7150 }, 0);
  b.furnish('storage.wardrobe@1', { x: 300, y: 5000 }, 90, { width: 1500 });
  b.furnish('light.ceiling@1', { x: 2000, y: 2000 }, 0, {}, false);
  b.furnish('light.ceiling@1', { x: 1700, y: 5750 }, 0, {}, false);
  bathroom(b, bath, { x: 3400 + GAP, y: 4000 + GAP }, 2000, 1900);
  return b.project;
}

/** 2 dormitorios en suite (≈ 55 m² útiles). */
function buildTwoBedroomTwoBath(): Project {
  const b = new ProjectBuilder('Depto. 2D2B');
  const living = b.rect('Living-comedor', { x: 0, y: 0 }, 5600, 4000);
  const kitchen = b.rect('Cocina', { x: 5600 + GAP, y: 0 }, 2800, 2600);
  const master = b.rect('Dormitorio principal', { x: 0, y: 4000 + GAP }, 3400, 3200);
  const suite = b.rect('Baño en suite', { x: 3400 + GAP, y: 4000 + GAP }, 1900, 1800);
  const bedroom = b.rect('Dormitorio 2', { x: 5600 + GAP, y: 2600 + GAP }, 2800, 3000);
  const bath2 = b.rect('Baño 2', { x: 5600 + GAP, y: 5600 + 2 * GAP }, 1800, 1700);

  b.opening(living, 0, 900, 'door.single@1', { width: 900, openAngle: 0 });
  b.opening(living, 0, 3600, 'window.floor@1', { width: 2400, panes: 3 });
  b.doorBetween(living, kitchen, 'door.passage@1');
  b.doorBetween(living, master, 'door.single@1', { openAngle: 80 });
  b.doorBetween(living, bedroom, 'door.single@1', { openAngle: 80 });
  b.doorBetween(master, suite, 'door.single@1', { width: 700, openAngle: 75 });
  b.doorBetween(bedroom, bath2, 'door.single@1', { width: 700, openAngle: 75 });
  b.opening(kitchen, 1, 1300, 'window.sliding@1', { width: 1200 });
  b.opening(master, 2, 1700, 'window.sliding@1', { width: 1600 });
  b.opening(bedroom, 1, 1500, 'window.casement@1', { width: 1000 });

  b.finish(living, 'walls', 'wall.paint-matte@1', { tint: '#efe8dc' });
  b.finish(kitchen, 'floor', 'floor.porcelain@1');
  b.finish(kitchen, 'walls', 'wall.subway@1');
  b.finish(master, 'floor', 'floor.herringbone@1', { rotation: 45 });
  b.furnish('furniture.sofa@1', { x: 450, y: 2000 }, 90, { width: 2100 });
  b.furnish('furniture.table-coffee@1', { x: 1500, y: 2000 }, 90, {}, false);
  b.furnish('furniture.table-rect@1', { x: 4000, y: 1500 }, 0, { width: 1400, depth: 850 }, false);
  b.furnish('kitchen.counter@1', { x: 7050, y: 2300 }, 0, { width: 2800 });
  b.furnish('kitchen.fridge@1', { x: 8250, y: 400 }, 270);
  b.furnish('furniture.bed@1', { x: 1700, y: 6400 }, 0, { width: 1600, depth: 2000 });
  b.furnish('furniture.nightstand@1', { x: 550, y: 7150 }, 0);
  b.furnish('furniture.nightstand@1', { x: 2850, y: 7150 }, 0);
  b.furnish('furniture.bed@1', { x: 7600, y: 4300 }, 270, { width: 1050, depth: 1900 });
  b.furnish('furniture.desk@1', { x: 6400, y: 5300 }, 0, { width: 1000, depth: 500 });
  b.furnish('light.ceiling@1', { x: 1800, y: 2000 }, 0, {}, false);
  b.furnish('light.pendant@1', { x: 4000, y: 1500 }, 0, {}, false);
  b.furnish('light.ceiling@1', { x: 1700, y: 5750 }, 0, {}, false);
  b.furnish('light.ceiling@1', { x: 7150, y: 4250 }, 0, {}, false);
  bathroom(b, suite, { x: 3400 + GAP, y: 4000 + GAP }, 1900, 1800);
  bathroom(b, bath2, { x: 5600 + GAP, y: 5600 + 2 * GAP }, 1800, 1700);
  return b.project;
}

export interface ProjectTemplate {
  readonly id: 'sample' | 'studio' | '1d1b' | '2d2b';
  readonly build: () => Project;
}

/** Plantillas de inicio, de la más chica a la más grande. */
export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  { id: 'studio', build: buildStudio },
  { id: '1d1b', build: buildOneBedroom },
  { id: 'sample', build: buildSampleProject },
  { id: '2d2b', build: buildTwoBedroomTwoBath },
];
