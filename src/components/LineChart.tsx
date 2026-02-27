import { memo, useMemo } from 'react';

interface Point {
  label: string;
  value: number;
}

interface LineChartProps {
  points: Point[];
}

function LineChart({ points }: LineChartProps) {
  if (!points.length) {
    return <p className="muted">No events in horizon yet.</p>;
  }

  const width = 760;
  const height = 220;
  const padding = 20;

  const { min, max } = useMemo(
    () => ({
      min: Math.min(...points.map((point) => point.value)),
      max: Math.max(...points.map((point) => point.value)),
    }),
    [points],
  );
  const range = max - min || 1;

  const toX = (index: number) => padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const toY = (value: number) => height - padding - ((value - min) / range) * (height - padding * 2);

  const path = useMemo(
    () =>
      points
        .map(
          (point, index) =>
            `${index === 0 ? 'M' : 'L'} ${toX(index).toFixed(2)} ${toY(point.value).toFixed(2)}`,
        )
        .join(' '),
    [points],
  );

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Running balance forecast chart">
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#ccd5db" />
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#ccd5db"
        />
        <path d={path} fill="none" stroke="#0f766e" strokeWidth="2.5" />
      </svg>
      <div className="chart-labels">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export default memo(LineChart);
