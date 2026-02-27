import { memo, useMemo } from 'react';
import { formatCurrency, formatTitleLabel } from '../lib/format';

interface CategorySlice {
  category: string;
  amount: number;
}

interface CategoryPieChartProps {
  title: string;
  slices: CategorySlice[];
}

const PIE_COLORS = [
  '#0f766e',
  '#ef4444',
  '#f59e0b',
  '#3b82f6',
  '#84cc16',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#22c55e',
  '#6366f1',
  '#8b5cf6',
  '#64748b',
];

const CATEGORY_COLORS: Record<string, string> = {
  rent: '#0f766e',
  utilities: '#3b82f6',
  debt: '#ef4444',
  'phone bill': '#14b8a6',
  'car note': '#f97316',
  'house note': '#8b5cf6',
  subscriptions: '#6366f1',
  food: '#84cc16',
  transport: '#22c55e',
  health: '#ec4899',
  entertainment: '#f59e0b',
  other: '#64748b',
};

function colorForCategory(category: string): string {
  if (CATEGORY_COLORS[category]) {
    return CATEGORY_COLORS[category];
  }

  const hash = category
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return PIE_COLORS[hash % PIE_COLORS.length];
}

function CategoryPieChart({ title, slices }: CategoryPieChartProps) {
  const total = useMemo(
    () => slices.reduce((sum, slice) => sum + slice.amount, 0),
    [slices],
  );

  if (total <= 0) {
    return (
      <article className="panel">
        <h3>{title}</h3>
        <p className="muted">No expenses this month.</p>
      </article>
    );
  }

  const gradientStops = useMemo(() => {
    let currentTurn = 0;
    return slices
      .map((slice) => {
        const portion = slice.amount / total;
        const start = currentTurn;
        const end = currentTurn + portion;
        currentTurn = end;
        const color = colorForCategory(slice.category);
        return `${color} ${(start * 360).toFixed(2)}deg ${(end * 360).toFixed(2)}deg`;
      })
      .join(', ');
  }, [slices, total]);

  return (
    <article className="panel">
      <h3>{title}</h3>
      <div className="pie-layout">
        <div className="pie-chart" style={{ background: `conic-gradient(${gradientStops})` }} aria-label={`${title} category spend pie chart`} />
        <div className="pie-legend">
          <p className="stat">{formatCurrency(total)}</p>
          {slices.map((slice) => (
            <div key={slice.category} className="pie-legend-item">
              <span className="pie-dot" style={{ backgroundColor: colorForCategory(slice.category) }} />
              <span>{formatTitleLabel(slice.category)}</span>
              <span>{formatCurrency(slice.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export default memo(CategoryPieChart);
