import {
  DeductionLine,
  Expense,
  ExpenseRepeat,
  ForecastEvent,
  ForecastRow,
  NetPayBreakdown,
  PaydayMetrics,
  PaycheckConfig,
  TaxWithheldLine,
} from '../types';
import { addDays, addMonths, addYears, parseISODate, toISODate } from './date';

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeGrossPayFromHourly(
  payFrequency: PaycheckConfig['payFrequency'],
  hourlyRate: number | null,
  hoursPerWeek: number | null,
): number {
  if (!Number.isFinite(hourlyRate) || !Number.isFinite(hoursPerWeek) || (hourlyRate ?? 0) <= 0 || (hoursPerWeek ?? 0) <= 0) {
    return Number.NaN;
  }

  const weeklyGross = (hourlyRate ?? 0) * (hoursPerWeek ?? 0);
  switch (payFrequency) {
    case 'weekly':
      return roundToCents(weeklyGross);
    case 'biweekly':
      return roundToCents(weeklyGross * 2);
    case 'semimonthly':
      return roundToCents((weeklyGross * 52) / 24);
    case 'monthly':
      return roundToCents((weeklyGross * 52) / 12);
    default:
      return roundToCents(weeklyGross);
  }
}

function sumDeductionLines(lines: DeductionLine[], grossPay: number): number {
  return lines.reduce((sum, line) => {
    if (!Number.isFinite(line.value) || line.value < 0) {
      return sum;
    }

    if (line.type === 'percentOfGross') {
      return sum + (line.value / 100) * grossPay;
    }

    return sum + line.value;
  }, 0);
}

function sumTaxWithheldLines(lines: TaxWithheldLine[], grossPay: number): number {
  return lines.reduce((sum, line) => {
    if (!Number.isFinite(line.value) || line.value < 0) {
      return sum;
    }
    if (line.type === 'percentOfGross') {
      return sum + (line.value / 100) * grossPay;
    }
    return sum + line.value;
  }, 0);
}

export function computeNetPayBreakdown(config: PaycheckConfig): NetPayBreakdown {
  if (config.paycheckInputMode === 'net') {
    const netPay = roundToCents(config.netPayAmount ?? Number.NaN);
    return {
      grossPay: 0,
      pretaxTotal: 0,
      taxesTotal: 0,
      posttaxTotal: 0,
      loanRepaymentAmount: 0,
      totalWithheldDeducted: 0,
      netPay,
    };
  }

  const grossPay =
    config.grossInputMode === 'hourly'
      ? computeGrossPayFromHourly(config.payFrequency, config.hourlyRate, config.hoursPerWeek)
      : (config.grossPayAmount ?? Number.NaN);
  if (!Number.isFinite(grossPay) || grossPay <= 0) {
    return {
      grossPay,
      pretaxTotal: Number.NaN,
      taxesTotal: Number.NaN,
      posttaxTotal: Number.NaN,
      loanRepaymentAmount: Number.NaN,
      totalWithheldDeducted: Number.NaN,
      netPay: Number.NaN,
    };
  }

  const pretaxTotal = sumDeductionLines(config.pretaxDeductions, grossPay);
  const taxesTotal = sumTaxWithheldLines(config.taxesWithheld, grossPay);
  const posttaxTotal = sumDeductionLines(config.posttaxDeductions, grossPay);
  const loanRepaymentAmount = Number.isFinite(config.loanRepaymentAmount)
    ? Math.max(0, config.loanRepaymentAmount)
    : Number.NaN;

  const totalWithheldDeducted = pretaxTotal + taxesTotal + posttaxTotal + loanRepaymentAmount;
  const netPay = grossPay - totalWithheldDeducted;

  return {
    grossPay: roundToCents(grossPay),
    pretaxTotal: roundToCents(pretaxTotal),
    taxesTotal: roundToCents(taxesTotal),
    posttaxTotal: roundToCents(posttaxTotal),
    loanRepaymentAmount: roundToCents(loanRepaymentAmount),
    totalWithheldDeducted: roundToCents(totalWithheldDeducted),
    netPay: roundToCents(netPay),
  };
}

export function computeNetPay(config: PaycheckConfig): number {
  return computeNetPayBreakdown(config).netPay;
}

function addSemimonthly(date: Date): Date {
  const day = date.getDate();
  if (day <= 1) {
    return new Date(date.getFullYear(), date.getMonth(), 15);
  }
  if (day <= 15) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  }
  return new Date(date.getFullYear(), date.getMonth() + 1, 15);
}

function advanceIncomeDate(date: Date, frequency: PaycheckConfig['payFrequency']): Date {
  switch (frequency) {
    case 'weekly':
      return addDays(date, 7);
    case 'biweekly':
      return addDays(date, 14);
    case 'monthly':
      return addMonths(date, 1);
    case 'semimonthly':
      return addSemimonthly(date);
    default:
      return addDays(date, 7);
  }
}

export function generateIncomeEvents(
  config: PaycheckConfig,
  horizonStart: Date,
  horizonEnd: Date,
): ForecastEvent[] {
  const events: ForecastEvent[] = [];
  if (!config.nextPayDate) {
    return events;
  }

  const netPayAmount = computeNetPay(config);
  if (!Number.isFinite(netPayAmount)) {
    return events;
  }

  let cursor = parseISODate(config.nextPayDate);
  if (!isValidDate(cursor)) {
    return events;
  }

  for (let i = 0; i < 5000; i += 1) {
    if (cursor > horizonEnd) {
      break;
    }
    if (cursor >= horizonStart) {
      events.push({
        id: `income-${toISODate(cursor)}-${i}`,
        date: toISODate(cursor),
        type: 'income',
        item: 'Paycheck',
        category: 'income',
        amount: netPayAmount,
      });
    }
    cursor = advanceIncomeDate(cursor, config.payFrequency);
  }

  return events;
}

export function generateBonusEvents(
  config: PaycheckConfig,
  incomeEvents: ForecastEvent[],
): ForecastEvent[] {
  const events: ForecastEvent[] = [];
  const bonusAmount = config.monthlyBonusAmount || 0;
  if (!(bonusAmount > 0)) {
    return events;
  }

  const lastPaycheckByMonth = new Map<string, string>();
  incomeEvents.forEach((incomeEvent) => {
    const monthKey = incomeEvent.date.slice(0, 7);
    const previous = lastPaycheckByMonth.get(monthKey);
    if (!previous || incomeEvent.date > previous) {
      lastPaycheckByMonth.set(monthKey, incomeEvent.date);
    }
  });

  Array.from(lastPaycheckByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([monthKey, date]) => {
      events.push({
        id: `bonus-${monthKey}`,
        date,
        type: 'income',
        item: 'Monthly Bonus',
        category: 'income',
        amount: bonusAmount,
      });
    });

  return events;
}

function advanceExpenseDate(date: Date, repeat: ExpenseRepeat): Date {
  switch (repeat) {
    case 'none':
      return addYears(date, 1000);
    case 'weekly':
      return addDays(date, 7);
    case 'biweekly':
      return addDays(date, 14);
    case 'monthly':
      return addMonths(date, 1);
    case 'yearly':
      return addYears(date, 1);
    default:
      return addYears(date, 1000);
  }
}

export function generateExpenseEvents(
  expenses: Expense[],
  horizonStart: Date,
  horizonEnd: Date,
): ForecastEvent[] {
  const events: ForecastEvent[] = [];

  expenses.forEach((expense) => {
    if (expense.variableDatesEnabled && Array.isArray(expense.variableDueDates) && expense.variableDueDates.length > 0) {
      const dueDates = [...expense.variableDueDates].sort((a, b) => a.localeCompare(b));
      dueDates.forEach((date, index) => {
        const due = parseISODate(date);
        if (!isValidDate(due) || due < horizonStart || due > horizonEnd) {
          return;
        }
        events.push({
          id: `expense-${expense.id}-${date}-variable-${index}`,
          date,
          type: 'expense',
          item: expense.name,
          category: expense.category,
          amount: expense.amount,
          sourceId: expense.id,
        });
      });
      return;
    }

    let cursor = parseISODate(expense.firstDueDate);
    const maxOccurrences =
      expense.repeat === 'none'
        ? 1
        : Number.isFinite(expense.repeatCount) && (expense.repeatCount ?? 0) > 0
          ? Math.floor(expense.repeatCount ?? 0)
          : Number.POSITIVE_INFINITY;
    let occurrenceIndex = 0;

    for (let i = 0; i < 5000; i += 1) {
      if (occurrenceIndex >= maxOccurrences) {
        break;
      }

      if (cursor > horizonEnd) {
        break;
      }

      if (cursor >= horizonStart) {
        events.push({
          id: `expense-${expense.id}-${toISODate(cursor)}-${i}`,
          date: toISODate(cursor),
          type: 'expense',
          item: expense.name,
          category: expense.category,
          amount: expense.amount,
          sourceId: expense.id,
        });
      }

      if (expense.repeat === 'none') {
        break;
      }

      occurrenceIndex += 1;
      cursor = advanceExpenseDate(cursor, expense.repeat);
    }
  });

  return events;
}

function compareEvents(a: ForecastEvent, b: ForecastEvent): number {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date);
  }
  if (a.type !== b.type) {
    return a.type === 'income' ? -1 : 1;
  }
  if (a.type === 'expense' && b.type === 'expense' && a.category !== b.category) {
    return a.category.localeCompare(b.category);
  }
  return a.item.localeCompare(b.item);
}

export function buildForecast(events: ForecastEvent[], startingBalance: number): ForecastRow[] {
  const sorted = [...events].sort(compareEvents);
  let runningBalance = startingBalance;

  return sorted.map((event) => {
    runningBalance += event.type === 'income' ? event.amount : -event.amount;
    return {
      ...event,
      runningBalance,
    };
  });
}

export function computeNextPaydayMetrics(
  forecastRows: ForecastRow[],
  nextPaydayDate: string,
  minimumBuffer: number,
  startingBalance: number,
): PaydayMetrics {
  const rowsUntilPayday = forecastRows.filter((row) => row.date <= nextPaydayDate);
  const balanceOnNextPayday = rowsUntilPayday.length
    ? rowsUntilPayday[rowsUntilPayday.length - 1].runningBalance
    : startingBalance;

  const rowsBeforePaydayIncome = forecastRows.filter((row) => row.date < nextPaydayDate);
  const lowestBalanceBeforeNextPayday = rowsBeforePaydayIncome.reduce(
    (min, row) => Math.min(min, row.runningBalance),
    startingBalance,
  );

  return {
    nextPaydayDate,
    balanceOnNextPayday,
    lowestBalanceBeforeNextPayday,
    safeToSpendUntilNextPayday: lowestBalanceBeforeNextPayday - minimumBuffer,
  };
}
