import { addMonths, toISODate } from './date';
import { Expense, ForecastEvent, ForecastRow } from '../types';

export type MonthBand = 'a' | 'b';

export interface MonthlyBalanceSummary {
  openingBalance: number;
  endingBalance: number;
  spent: number;
}

export interface MonthlyCategorySlice {
  category: string;
  amount: number;
}

export interface MonthlyCategoryChartData {
  key: string;
  label: string;
  slices: MonthlyCategorySlice[];
}

export interface BandedForecastRow {
  row: ForecastRow;
  monthKey: string;
  monthLabel: string;
  monthSummary?: MonthlyBalanceSummary;
  monthSpent: number;
  spentTrendClass: string;
  spentTrendEmoji: string;
  isMonthStart: boolean;
  isLastPayment: boolean;
  isLastExpenseOfMonth: boolean;
  monthBandClass: string;
}

function toMonthKey(date: string): string {
  return date.slice(0, 7);
}

function formatMonthLabel(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function createFiniteExpenseIdSet(expenses: Expense[], forecastRows: ForecastRow[]): Set<string> {
  const hasAnyExplicitHighlightEnabled = expenses.some((expense) => expense.highlightLastEvent === true);
  const highlightEnabledIds = new Set(
    expenses
      .filter((expense) => (hasAnyExplicitHighlightEnabled ? expense.highlightLastEvent === true : true))
      .map((expense) => expense.id),
  );

  const occurrenceCountBySourceId = new Map<string, number>();
  forecastRows.forEach((row) => {
    if (row.type !== 'expense' || !row.sourceId) {
      return;
    }
    occurrenceCountBySourceId.set(row.sourceId, (occurrenceCountBySourceId.get(row.sourceId) ?? 0) + 1);
  });

  return new Set(
    Array.from(occurrenceCountBySourceId.entries())
      .filter(([sourceId, count]) => highlightEnabledIds.has(sourceId) && count > 1)
      .map(([sourceId]) => sourceId),
  );
}

export function createLastExpenseDateBySourceMap(forecastRows: ForecastRow[]): Map<string, string> {
  const map = new Map<string, string>();
  forecastRows.forEach((row) => {
    if (row.type !== 'expense' || !row.sourceId) {
      return;
    }
    const previous = map.get(row.sourceId);
    if (!previous || row.date > previous) {
      map.set(row.sourceId, row.date);
    }
  });
  return map;
}

export function createLastExpenseRowIdByMonthMap(forecastRows: ForecastRow[]): Map<string, string> {
  const map = new Map<string, string>();
  forecastRows.forEach((row) => {
    if (row.type === 'expense') {
      map.set(toMonthKey(row.date), row.id);
    }
  });
  return map;
}

export function createMonthlyBalanceByKey(
  forecastRows: ForecastRow[],
  startingBalance: number,
): Map<string, MonthlyBalanceSummary> {
  const map = new Map<string, MonthlyBalanceSummary>();
  let previousRunningBalance = startingBalance;

  forecastRows.forEach((row) => {
    const monthKey = toMonthKey(row.date);
    const summary = map.get(monthKey);

    if (!summary) {
      map.set(monthKey, {
        openingBalance: previousRunningBalance,
        endingBalance: row.runningBalance,
        spent: row.type === 'expense' ? row.amount : 0,
      });
    } else {
      summary.endingBalance = row.runningBalance;
      if (row.type === 'expense') {
        summary.spent += row.amount;
      }
    }

    previousRunningBalance = row.runningBalance;
  });

  return map;
}

interface BuildBandedRowsParams {
  rows: ForecastRow[];
  monthlyBalanceByKey: Map<string, MonthlyBalanceSummary>;
  finiteExpenseIds: Set<string>;
  lastExpenseDateBySource: Map<string, string>;
  lastExpenseRowIdByMonth: Map<string, string>;
}

export function buildBandedRows({
  rows,
  monthlyBalanceByKey,
  finiteExpenseIds,
  lastExpenseDateBySource,
  lastExpenseRowIdByMonth,
}: BuildBandedRowsParams): BandedForecastRow[] {
  let previousMonth = '';
  let previousMonthSpent: number | null = null;
  let monthBand: MonthBand = 'a';

  return rows.map((row) => {
    const monthKey = toMonthKey(row.date);
    const isMonthStart = monthKey !== previousMonth;
    const monthSummary = monthlyBalanceByKey.get(monthKey);
    const monthSpent = monthSummary?.spent ?? 0;

    let spentTrendClass = '';
    let spentTrendEmoji = '';
    if (isMonthStart && previousMonthSpent !== null) {
      if (monthSpent < previousMonthSpent) {
        spentTrendClass = 'month-spent-better';
        spentTrendEmoji = '👍';
      } else if (monthSpent > previousMonthSpent) {
        spentTrendClass = 'month-spent-worse';
        spentTrendEmoji = '😏';
      } else {
        spentTrendClass = 'month-spent-equal';
        spentTrendEmoji = '🟰';
      }
    }

    if (isMonthStart && previousMonth !== '') {
      monthBand = monthBand === 'a' ? 'b' : 'a';
    }
    if (isMonthStart) {
      previousMonthSpent = monthSpent;
    }
    previousMonth = monthKey;

    const sourceId = row.sourceId;
    return {
      row,
      monthKey,
      monthLabel: formatMonthLabel(monthKey),
      monthSummary,
      monthSpent,
      spentTrendClass,
      spentTrendEmoji,
      isMonthStart,
      isLastPayment:
        row.type === 'expense' &&
        Boolean(sourceId) &&
        finiteExpenseIds.has(sourceId ?? '') &&
        lastExpenseDateBySource.get(sourceId ?? '') === row.date,
      isLastExpenseOfMonth: row.type === 'expense' && lastExpenseRowIdByMonth.get(monthKey) === row.id,
      monthBandClass: monthBand === 'a' ? 'month-band-a' : 'month-band-b',
    };
  });
}

export function buildMonthlyCategorySlices(
  expenseEvents: ForecastEvent[],
  horizonStart: Date,
): MonthlyCategoryChartData[] {
  const monthKeys = Array.from({ length: 12 }, (_, index) => {
    const monthDate = addMonths(horizonStart, index);
    return {
      key: toISODate(monthDate).slice(0, 7),
      label: monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  });

  const spendByMonthCategory = new Map<string, Map<string, number>>();
  expenseEvents.forEach((event) => {
    const monthKey = toMonthKey(event.date);
    const categoryMap = spendByMonthCategory.get(monthKey) ?? new Map<string, number>();
    categoryMap.set(event.category, (categoryMap.get(event.category) ?? 0) + event.amount);
    spendByMonthCategory.set(monthKey, categoryMap);
  });

  return monthKeys.map((month) => {
    const categoryMap = spendByMonthCategory.get(month.key) ?? new Map<string, number>();
    const slices = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    return { ...month, slices };
  });
}
