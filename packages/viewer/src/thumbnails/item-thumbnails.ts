import {
  buildItemParts,
  definitionEnvelope,
  resolveParams,
  type AnyItemDefinition,
} from '@decodeny/domain';
import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import { itemMaterial } from '../materials/default-materials';
import { partGeometry } from '../scene/part-geometry';

/**
 * Miniaturas del catálogo generadas desde cada definición (sus piezas con los parámetros por
 * defecto y los materiales de la escena): un mueble nuevo del catálogo tiene miniatura sin
 * trabajo extra. Un único renderer fuera de pantalla las dibuja de a una por cuadro (no traba la
 * interfaz) y quedan en memoria. Sin WebGL se devuelve `null` y la interfaz usa un ícono.
 */

/** Lado de la miniatura en píxeles CSS (se dibuja al doble para pantallas densas). */
export const THUMBNAIL_SIZE = 48;

const cache = new Map<string, Promise<string | null>>();
let renderer: WebGLRenderer | null | undefined;
let queue: Promise<unknown> = Promise.resolve();

function sharedRenderer(): WebGLRenderer | null {
  if (renderer !== undefined) return renderer;
  try {
    const canvas = document.createElement('canvas');
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(2);
    renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
  } catch {
    renderer = null;
  }
  return renderer;
}

const PICTURE = new MeshStandardMaterial({ color: '#d6dde6', roughness: 0.6 });

/** Escena del mueble con su envolvente centrada; devuelve también el radio que la contiene. */
function itemScene(definition: AnyItemDefinition): {
  scene: Scene;
  radius: number;
  height: number;
} {
  const params = resolveParams(definition.params, {});
  const env = definitionEnvelope(definition, params);
  const group = new Group();
  for (const part of buildItemParts(definition, params)) {
    const g = partGeometry(part);
    const geometry: BufferGeometry =
      g.kind === 'box' ? new BoxGeometry(...g.args) : new CylinderGeometry(...g.args);
    const material =
      part.slot === 'picture' ? PICTURE : itemMaterial(part.slot, 'normal', part.color);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...g.position);
    if (g.kind === 'box') mesh.rotation.set(g.pitch, g.rotationY, 0, 'YXZ');
    else mesh.scale.z = g.scaleZ;
    group.add(mesh);
  }
  const scene = new Scene();
  scene.add(group);
  scene.add(new AmbientLight('#ffffff', 1.6));
  const sun = new DirectionalLight('#ffffff', 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const radius = Math.hypot(env.width, env.height, env.depth) / 2000;
  return { scene, radius, height: env.height / 1000 };
}

function dispose(scene: Scene): void {
  scene.traverse((object) => {
    if (object instanceof Mesh) (object.geometry as BufferGeometry).dispose();
  });
}

function render(definition: AnyItemDefinition): string | null {
  const gl = sharedRenderer();
  if (!gl) return null;
  const { scene, radius, height } = itemScene(definition);
  try {
    // Vista de tres cuartos desde adelante (+z), a la derecha y arriba, que encuadra el mueble.
    const camera = new PerspectiveCamera(30, 1, 0.01, 100);
    const distance = radius / Math.sin((15 * Math.PI) / 180);
    camera.position.set(distance * 0.55, height / 2 + distance * 0.45, distance * 0.7);
    camera.lookAt(0, height / 2, 0);
    gl.render(scene, camera);
    return gl.domElement.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    dispose(scene);
  }
}

const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

/** Miniatura (data URL) de una definición del catálogo; `null` si no se puede dibujar. */
export function itemThumbnail(definition: AnyItemDefinition): Promise<string | null> {
  let pending = cache.get(definition.id);
  if (!pending) {
    if (typeof document === 'undefined') return Promise.resolve(null);
    pending = queue.then(nextFrame).then(() => render(definition));
    queue = pending;
    cache.set(definition.id, pending);
  }
  return pending;
}
