import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { joystickVector, type VirtualInput } from './virtual-input';

/** Textos de los controles (el visor no traduce: los da la aplicación). */
export interface TouchControlsLabels {
  readonly joystick: string;
  readonly look: string;
  readonly up: string;
  readonly down: string;
}

interface TouchControlsProps {
  readonly input: VirtualInput;
  /** Vuelo libre: agrega subir y bajar. */
  readonly flying: boolean;
  readonly labels: TouchControlsLabels;
}

const RADIUS = 52;

/**
 * Controles táctiles del recorrido y el vuelo: un joystick abajo a la izquierda para moverse
 * (al borde: correr) y arrastrar en el resto de la vista para mirar. Cada dedo se sigue por su
 * id, así se camina y se mira a la vez.
 */
export function TouchControls({ input, flying, labels }: TouchControlsProps) {
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const looks = useRef(new Map<number, { x: number; y: number }>());
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const baseRef = useRef<HTMLDivElement>(null);

  const releaseStick = () => {
    stick.current = null;
    input.move.x = 0;
    input.move.y = 0;
    input.run = false;
    setKnob(null);
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const base = baseRef.current?.getBoundingClientRect();
    const center = base ? { x: base.left + base.width / 2, y: base.top + base.height / 2 } : null;
    // Un dedo cerca del joystick lo toma; cualquier otro dedo mira.
    if (
      center &&
      !stick.current &&
      Math.hypot(e.clientX - center.x, e.clientY - center.y) <= RADIUS * 1.6
    ) {
      stick.current = { id: e.pointerId, ...center };
      move(e);
    } else {
      looks.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (s?.id === e.pointerId) {
      const v = joystickVector(e.clientX - s.x, e.clientY - s.y, RADIUS);
      input.move.x = v.x;
      input.move.y = v.y;
      input.run = v.run;
      setKnob(v.knob);
      return;
    }
    const last = looks.current.get(e.pointerId);
    if (!last) return;
    input.look.dx += e.clientX - last.x;
    input.look.dy += e.clientY - last.y;
    looks.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stick.current?.id === e.pointerId) releaseStick();
    looks.current.delete(e.pointerId);
  };

  const hold = (value: number) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.stopPropagation();
      input.up = value;
    },
    onPointerUp: () => {
      input.up = 0;
    },
    onPointerLeave: () => {
      input.up = 0;
    },
    onPointerCancel: () => {
      input.up = 0;
    },
  });

  return (
    <div
      aria-label={labels.look}
      data-testid="touch-controls"
      onPointerDown={onDown}
      onPointerMove={move}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{ position: 'absolute', inset: 0, touchAction: 'none', userSelect: 'none' }}
    >
      <div
        ref={baseRef}
        role="img"
        aria-label={labels.joystick}
        data-testid="touch-joystick"
        style={{
          position: 'absolute',
          left: 24,
          bottom: 24,
          width: RADIUS * 2,
          height: RADIUS * 2,
          borderRadius: '50%',
          background: 'rgba(15, 23, 42, 0.25)',
          border: '2px solid rgba(255, 255, 255, 0.6)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: RADIUS - 22 + (knob?.x ?? 0),
            top: RADIUS - 22 + (knob?.y ?? 0),
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.85)',
            boxShadow: '0 1px 4px rgba(15, 23, 42, 0.4)',
          }}
        />
      </div>
      {flying && (
        <div
          style={{
            position: 'absolute',
            right: 24,
            bottom: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {[
            { value: 1, label: labels.up, glyph: '▲', id: 'up' },
            { value: -1, label: labels.down, glyph: '▼', id: 'down' },
          ].map((b) => (
            <button
              key={b.id}
              type="button"
              aria-label={b.label}
              data-testid={`touch-${b.id}`}
              {...hold(b.value)}
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                border: '2px solid rgba(255, 255, 255, 0.6)',
                background: 'rgba(15, 23, 42, 0.35)',
                color: 'white',
                fontSize: 18,
                touchAction: 'none',
              }}
            >
              {b.glyph}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
