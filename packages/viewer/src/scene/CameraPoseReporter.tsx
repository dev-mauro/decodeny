import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Euler } from 'three';
import { samePose, type ViewerCameraPose } from './peers';

/** Intervalo mínimo entre poses informadas (~12 por segundo). */
const MIN_INTERVAL_MS = 80;

const euler = new Euler(0, 0, 0, 'YXZ');

/**
 * Informa la pose de la cámara cuando cambia, a lo sumo ~12 veces por segundo. La última pose de
 * un movimiento siempre se informa (aunque llegue antes del intervalo).
 */
export function CameraPoseReporter({
  onPose,
}: {
  readonly onPose: (pose: ViewerCameraPose) => void;
}) {
  const last = useRef<{ pose: ViewerCameraPose; at: number } | null>(null);
  const trailing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onPoseRef = useRef(onPose);
  useEffect(() => {
    onPoseRef.current = onPose;
  }, [onPose]);
  useEffect(() => () => clearTimeout(trailing.current), []);

  useFrame(({ camera }) => {
    euler.setFromQuaternion(camera.quaternion);
    const pose: ViewerCameraPose = {
      position: [camera.position.x, camera.position.y, camera.position.z],
      yaw: euler.y,
      pitch: euler.x,
    };
    if (last.current && samePose(last.current.pose, pose)) return;
    const now = performance.now();
    const report = () => {
      last.current = { pose, at: performance.now() };
      onPoseRef.current(pose);
    };
    clearTimeout(trailing.current);
    const wait = last.current ? MIN_INTERVAL_MS - (now - last.current.at) : 0;
    if (wait <= 0) report();
    else trailing.current = setTimeout(report, wait);
  });
  return null;
}
