import { describe, expect, it } from 'vitest';
import { approachPose, nearestAngle, samePose, type ViewerCameraPose } from './peers';

const pose = (x: number, yaw: number): ViewerCameraPose => ({
  position: [x, 1.6, 0],
  yaw,
  pitch: 0,
});

describe('poses de los participantes', () => {
  it('interpola por el camino corto del ángulo', () => {
    expect(nearestAngle(3, -3)).toBeCloseTo(-3 + Math.PI * 2);
    expect(nearestAngle(0, 0.5)).toBeCloseTo(0.5);
    const mid = approachPose(pose(0, 3), pose(10, -3), 1 / 12);
    expect(mid.position[0]).toBeGreaterThan(0);
    expect(mid.position[0]).toBeLessThan(10);
    // De 3 rad hacia −3 rad (≈ 3,28): sube, no baja dando la vuelta.
    expect(mid.yaw).toBeGreaterThan(3);
  });

  it('llega a la pose sin depender de los cuadros por segundo', () => {
    let a = pose(0, 0);
    let b = pose(0, 0);
    for (let i = 0; i < 60; i++) a = approachPose(a, pose(4, 1), 1 / 60);
    for (let i = 0; i < 30; i++) b = approachPose(b, pose(4, 1), 1 / 30);
    expect(a.position[0]).toBeCloseTo(b.position[0], 3);
    expect(samePose(approachPose(a, pose(4, 1), 2), pose(4, 1))).toBe(true);
    expect(samePose(pose(0, 0), pose(0, Math.PI * 2))).toBe(true);
  });
});
