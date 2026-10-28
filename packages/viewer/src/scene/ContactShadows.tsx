import { itemEnvelope } from '@decodeny/catalog';
import { mmToMeters, type Item } from '@decodeny/domain';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  Color,
  type InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { planToWorld } from '../coords';

/**
 * Sombra de contacto barata: bajo cada mueble de piso, un cuadrado con un degradado (oscuro en
 * el centro, transparente en el borde) lo "apoya" en el piso. Todos en una sola malla instanciada
 * (un draw call), sin postproceso ni mapas de sombra: no cuesta nada al moverse.
 */

/** Cuánto se extiende la mancha más allá de la huella del mueble. */
const SPREAD = 1.25;
/** Sobre el piso y las alfombras más comunes (mm). */
const LIFT_MM = 3;

let shared: { geometry: PlaneGeometry; material: MeshBasicMaterial } | null = null;

function contactAssets() {
  if (shared) return shared;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    map: texture,
    color: new Color('#000000'),
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    toneMapped: false,
  });
  material.name = 'decodeny:contact-shadow';
  shared = { geometry, material };
  return shared;
}

const dummy = new Object3D();

/** `base`: altura de apoyo del mueble sobre el nivel (mm), como en `ItemView`. */
export function ContactShadows({
  items,
}: {
  readonly items: readonly { readonly item: Item; readonly base: number }[];
}) {
  const { geometry, material } = useMemo(() => contactAssets(), []);
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    items.forEach(({ item, base }, i) => {
      const env = itemEnvelope(item);
      dummy.position.set(...planToWorld(item.position, base + LIFT_MM));
      dummy.rotation.set(0, (item.rotation * Math.PI) / 180, 0);
      dummy.scale.set(mmToMeters(env.width) * SPREAD, 1, mmToMeters(env.depth) * SPREAD);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, Math.max(1, items.length)]}
      // No se selecciona ni detiene clics: es solo apariencia.
      raycast={() => null}
      renderOrder={1}
      frustumCulled={false}
    />
  );
}
