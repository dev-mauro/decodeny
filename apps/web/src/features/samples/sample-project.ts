import type { Project } from '@decodeny/domain';
import { GAP, ProjectBuilder } from './project-builder';

/** Departamento de ejemplo (2 dormitorios, 1 baño) construido con los mismos comandos que la UI. */
export function buildSampleProject(): Project {
  const b = new ProjectBuilder('Depto. ejemplo 2D1B');

  const living = b.path('Living-comedor', { x: 0, y: 0 }, [
    { length: 6200, turn: 90 },
    { length: 2400, turn: 90 },
    { length: 2600, turn: -90 },
    { length: 1600, turn: 90 },
    { length: 3600, turn: 90 },
    { length: 4000, turn: 90 },
  ]);
  const kitchen = b.rect('Cocina', { x: 6200 + GAP, y: 0 }, 2400, 2400);
  const master = b.rect('Dormitorio principal', { x: 0, y: 4000 + GAP }, 3600, 3200);
  const bedroom = b.rect('Dormitorio 2', { x: 3600 + GAP, y: 2400 + GAP }, 2900, 3000);
  const bath = b.rect('Baño', { x: 6500 + 2 * GAP, y: 2400 + GAP }, 1800, 2200);

  // Puertas interiores (abren hacia el recinto de destino) y acceso.
  b.doorBetween(living, kitchen, 'door.passage@1');
  b.doorBetween(living, master, 'door.single@1', { openAngle: 80 });
  b.doorBetween(living, bedroom, 'door.single@1', { openAngle: 80 });
  b.doorBetween(bedroom, bath, 'door.single@1', { width: 700, openAngle: 75 });
  b.opening(living, 0, 1050, 'door.single@1', { width: 900, openAngle: 0 });
  // Ventanas exteriores.
  b.opening(living, 0, 4000, 'window.floor@1', { width: 2400, panes: 3 });
  b.opening(kitchen, 1, 1200, 'window.sliding@1', { width: 1200 });
  b.opening(master, 2, 1800, 'window.sliding@1', { width: 1600 });
  b.opening(bedroom, 2, 1450, 'window.casement@1', { width: 1000 });
  b.opening(bath, 1, 1100, 'window.casement@1', { width: 600, height: 600, sill: 1500, leaves: 1 });

  // Terminaciones.
  b.finish(living, 'walls', 'wall.paint-matte@1', { tint: '#efe8dc' });
  b.finish(kitchen, 'floor', 'floor.porcelain@1', { tint: '#e6e2da' });
  b.finish(kitchen, 'walls', 'wall.subway@1');
  b.finish(bath, 'floor', 'floor.ceramic@1', { tileWidth: 300, tileHeight: 300 });
  b.finish(bath, 'walls', 'wall.tile@1', { tint: '#e9f0f3' });
  b.finish(master, 'floor', 'floor.herringbone@1', { rotation: 45 });
  b.finish(master, 'walls', 'wall.paint-matte@1', { tint: '#dfe8d8' });
  b.finish(bedroom, 'floor', 'floor.carpet@1', { tint: '#b9ad9c' });
  b.finish(bedroom, 'walls', 'wall.wallpaper-stripes@1');

  // Living-comedor.
  b.furnish('furniture.sofa@1', { x: 500, y: 2000 }, 90, { width: 2100, seats: 3 });
  b.furnish('furniture.table-coffee@1', { x: 1600, y: 2000 }, 90, {}, false);
  b.furnish('furniture.table-rect@1', { x: 4700, y: 1200 }, 0, { width: 1600, depth: 900 }, false);
  for (const x of [4300, 5100]) {
    // Junto a la mesa (no bajo ella: los avisos comparan cajas envolventes).
    b.furnish('furniture.chair-dining@1', { x, y: 1200 + 450 + 270 }, 0, {}, false);
    b.furnish('furniture.chair-dining@1', { x, y: 1200 - 450 - 270 }, 180, {}, false);
  }
  // Cocina.
  b.furnish('kitchen.counter@1', { x: 7550, y: 2150 }, 0);
  b.furnish('kitchen.fridge@1', { x: 6700, y: 400 }, 90);
  // Dormitorio principal.
  b.furnish('furniture.bed@1', { x: 1000, y: 5750 }, 90, { width: 1400, depth: 1900 });
  b.furnish('furniture.nightstand@1', { x: 250, y: 6700 }, 90);
  b.furnish('furniture.nightstand@1', { x: 250, y: 4800 }, 90);
  b.furnish('storage.wardrobe@1', { x: 3250, y: 6450 }, 270);
  // Dormitorio 2.
  b.furnish('furniture.bed@1', { x: 6150, y: 3450 }, 180, { width: 900, depth: 1900 });
  b.furnish('furniture.desk@1', { x: 5200, y: 5250 }, 0, { width: 1000, depth: 500 });
  b.furnish('furniture.chair-office@1', { x: 5200, y: 4700 }, 180, {}, false);
  // Baño.
  b.furnish('bath.shower@1', { x: 8150, y: 4250 }, 0);
  b.furnish('bath.toilet@1', { x: 8250, y: 3050 }, 270);
  b.furnish('bath.vanity@1', { x: 7250, y: 2800 }, 180);

  // Iluminación y decoración.
  b.furnish('decor.rug@1', { x: 1600, y: 2000 }, 90, { width: 2000, depth: 1400 }, false);
  b.furnish('decor.curtain@1', { x: 4000, y: 300 }, 0, { width: 3000, height: 2300 });
  b.furnish('decor.plant@1', { x: 300, y: 3700 }, 0, { diameter: 450, height: 1300 }, false);
  b.furnish('light.floor@1', { x: 300, y: 650 }, 0, {}, false);
  b.furnish('light.pendant@1', { x: 4700, y: 1200 }, 0, { diameter: 400, height: 700 }, false);
  b.furnish('light.ceiling@1', { x: 1600, y: 2000 }, 0, {}, false);
  b.furnish('light.recessed@1', { x: 7000, y: 1300 }, 0, {}, false);
  b.furnish('light.recessed@1', { x: 8100, y: 1300 }, 0, {}, false);
  b.furnish('light.ceiling@1', { x: 1800, y: 5750 }, 0, {}, false);
  b.furnish('light.table@1', { x: 200, y: 6700 }, 90, {}, false);
  b.furnish('light.table@1', { x: 200, y: 4800 }, 90, {}, false);
  b.furnish('light.ceiling@1', { x: 5200, y: 4050 }, 0, {}, false);
  b.furnish('light.ceiling@1', { x: 7700, y: 3650 }, 0, { diameter: 300 }, false);
  b.furnish('decor.mirror@1', { x: 7200, y: 2700 }, 180, { width: 700, height: 800 });
  return b.project;
}
