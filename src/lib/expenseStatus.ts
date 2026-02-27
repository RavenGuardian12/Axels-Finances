import { Expense } from '../types';
import { addDays, addMonths, addYears, parseISODate, startOfDay } from './date';

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

function advanceExpenseDate(date: Date, repeat: Expense['repeat']): Date {
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

function hasUpcomingOccurrence(expense: Expense, fromDate: Date): boolean {
  const from = startOfDay(fromDate);
  if (expense.variableDatesEnabled) {
    return Array.isArray(expense.variableDueDates)
      ? expense.variableDueDates.some((date) => {
          const parsed = parseISODate(date);
          return isValidDate(parsed) && parsed >= from;
        })
      : false;
  }

  let cursor = parseISODate(expense.firstDueDate);
  if (!isValidDate(cursor)) {
    return false;
  }

  if (expense.repeat === 'none') {
    return cursor >= from;
  }

  if (!Number.isFinite(expense.repeatCount) || (expense.repeatCount ?? 0) <= 0) {
    return true;
  }

  const occurrences = Math.max(1, Math.floor(expense.repeatCount ?? 1));
  for (let i = 0; i < occurrences; i += 1) {
    if (cursor >= from) {
      return true;
    }
    cursor = advanceExpenseDate(cursor, expense.repeat);
  }

  return false;
}

export function partitionExpensesByStatus(expenses: Expense[], fromDate: Date): {
  active: Expense[];
  finished: Expense[];
} {
  return expenses.reduce(
    (acc, expense) => {
      if (hasUpcomingOccurrence(expense, fromDate)) {
        acc.active.push(expense);
      } else {
        acc.finished.push(expense);
      }
      return acc;
    },
    { active: [] as Expense[], finished: [] as Expense[] },
  );
}
