import { bounds, distance, formatLength, lerp, type Vec2 } from '@decodeny/domain';
import { useTranslation } from 'react-i18next';
import type { PathAnalysis } from './path-model';

const SIZE = 260;
const PADDING = 28;

/** Vista previa en planta del recorrido por tramos (norte hacia arriba). */
export function PathPreview({ analysis }: { readonly analysis: PathAnalysis }) {
  const { t, i18n } = useTranslation();
  const { points, closed } = analysis.traced;
  if (points.length < 2) {
    return <div className="aspect-square w-full rounded-xl bg-slate-50" />;
  }
  const b = bounds(points);
  const span = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, 1);
  const k = (SIZE - 2 * PADDING) / span;
  const offsetX = (SIZE - (b.max.x - b.min.x) * k) / 2;
  const offsetY = (SIZE - (b.max.y - b.min.y) * k) / 2;
  const toSvg = (p: Vec2) => ({
    x: offsetX + (p.x - b.min.x) * k,
    y: SIZE - offsetY - (p.y - b.min.y) * k,
  });
  const svgPoints = points.map(toSvg);
  const edges = points.map((a, i) => {
    const next = points[(i + 1) % points.length]!;
    return { a, b: next, closing: i === points.length - 1 };
  });
  const invalid = !analysis.valid;
  const stroke = invalid ? '#dc2626' : '#2563eb';

  return (
    <svg
      role="img"
      aria-label={t('create.preview')}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="aspect-square w-full rounded-xl border border-slate-200 bg-slate-50"
    >
      <polygon
        points={svgPoints.map((p) => `${p.x},${p.y}`).join(' ')}
        fill={invalid ? '#fee2e2' : '#dbeafe'}
        fillOpacity={0.7}
        stroke="none"
      />
      {edges.map(({ a, b: c, closing }, i) => {
        const pa = toSvg(a);
        const pc = toSvg(c);
        const mid = toSvg(lerp(a, c, 0.5));
        const implicit = closing && !closed;
        return (
          <g key={i}>
            <line
              x1={pa.x}
              y1={pa.y}
              x2={pc.x}
              y2={pc.y}
              stroke={implicit ? '#f59e0b' : stroke}
              strokeWidth={2}
              strokeDasharray={implicit ? '5 4' : undefined}
            />
            <text
              x={mid.x}
              y={mid.y}
              dy={-4}
              textAnchor="middle"
              className="fill-slate-600 text-[9px] font-medium"
            >
              {formatLength(distance(a, c), i18n.language)}
            </text>
          </g>
        );
      })}
      <circle cx={svgPoints[0]!.x} cy={svgPoints[0]!.y} r={4.5} fill="#16a34a" />
    </svg>
  );
}
