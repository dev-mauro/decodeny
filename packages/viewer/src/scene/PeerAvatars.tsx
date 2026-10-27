import { useFrame, useThree } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  Color,
  LinearFilter,
  SRGBColorSpace,
  type Group,
  type Mesh,
  type Sprite,
} from 'three';
import {
  approachPose,
  samePose,
  type ViewerCameraPose,
  type ViewerPeer,
  type ViewerPeers,
} from './peers';

/** Medidas del cuerpo (m): cabeza a la altura de la cámara, torso debajo. */
const HEAD_RADIUS = 0.13;
const BODY_RADIUS = 0.2;
const NECK = 0.12;
/** Largo del torso cuando flota (edición, vuelo). De pie llega hasta el piso. */
const FLOATING_BODY = 0.7;
const LABEL_HEIGHT = 0.16;

const noRaycast = () => null;

function nameTexture(name: string, color: string): { texture: CanvasTexture; aspect: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = 'bold 40px system-ui, sans-serif';
  const padding = 18;
  let width = 160;
  if (ctx) {
    ctx.font = font;
    width = Math.ceil(ctx.measureText(name).width) + padding * 2;
  }
  canvas.width = width;
  canvas.height = 64;
  if (ctx) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, 64, 32);
    ctx.fill();
    ctx.font = font;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, padding, 34);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  return { texture, aspect: width / 64 };
}

interface AvatarProps {
  readonly peer: ViewerPeer;
  readonly peers: ViewerPeers;
  /** Altura del piso del nivel (m): de pie, el cuerpo llega hasta aquí. */
  readonly floorY: number;
}

const Avatar = memo(function Avatar({ peer, peers, floorY }: AvatarProps) {
  const group = useRef<Group>(null);
  const head = useRef<Group>(null);
  const body = useRef<Mesh>(null);
  const label = useRef<Sprite>(null);
  const shown = useRef<ViewerCameraPose | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const color = useMemo(() => new Color(peer.color), [peer.color]);
  const tag = useMemo(() => nameTexture(peer.name, peer.color), [peer.name, peer.color]);
  useEffect(() => () => tag.texture.dispose(), [tag]);

  useFrame((_, dt) => {
    const target = peers.pose(peer.id);
    const g = group.current;
    if (!target || !g) {
      if (g) g.visible = false;
      return;
    }
    const pose = shown.current ? approachPose(shown.current, target, dt) : target;
    shown.current = pose;
    g.visible = true;
    g.position.set(...pose.position);
    g.rotation.set(0, pose.yaw, 0);
    if (head.current) head.current.rotation.set(pose.pitch, 0, 0);
    // Torso: de pie llega al piso; flotando es más corto. Su centro queda bajo la cabeza.
    const top = pose.position[1] - HEAD_RADIUS - NECK;
    const length = target.standing ? Math.max(0.3, top - floorY) : FLOATING_BODY;
    if (body.current) {
      body.current.scale.set(1, length, 1);
      body.current.position.set(0, -HEAD_RADIUS - NECK - length / 2, 0);
    }
    if (label.current) {
      label.current.position.set(0, HEAD_RADIUS + 0.18, 0);
      label.current.scale.set(LABEL_HEIGHT * tag.aspect, LABEL_HEIGHT, 1);
    }
    // En reposo (edición) solo se redibuja mientras el cuerpo se acerca a la última pose.
    if (!samePose(pose, target)) invalidate();
  });

  return (
    <group ref={group} visible={false} name={`peer:${peer.id}`}>
      <group ref={head}>
        <mesh raycast={noRaycast}>
          <sphereGeometry args={[HEAD_RADIUS, 24, 16]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        {/* Visera: indica hacia dónde mira (−Z local). */}
        <mesh raycast={noRaycast} position={[0, 0.02, -HEAD_RADIUS * 0.85]}>
          <boxGeometry args={[0.16, 0.06, 0.06]} />
          <meshStandardMaterial color="#111827" roughness={0.3} />
        </mesh>
      </group>
      {/* Cilindro de alto 1, escalado al largo del torso. */}
      <mesh ref={body} raycast={noRaycast}>
        <cylinderGeometry args={[BODY_RADIUS, BODY_RADIUS * 0.85, 1, 20]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <sprite ref={label} raycast={noRaycast} renderOrder={10}>
        <spriteMaterial map={tag.texture} depthTest={false} transparent />
      </sprite>
    </group>
  );
});

/** Cuerpos de los demás participantes (solo en 3D). */
export function PeerAvatars({
  peers,
  floorY,
}: {
  readonly peers: ViewerPeers;
  readonly floorY: number;
}) {
  const invalidate = useThree((s) => s.invalidate);
  // Una pose nueva despierta al visor aunque esté en reposo (edición).
  useEffect(() => peers.subscribe(() => invalidate()), [peers, invalidate]);
  return (
    <>
      {peers.list.map((peer) => (
        <Avatar key={peer.id} peer={peer} peers={peers} floorY={floorY} />
      ))}
    </>
  );
}
