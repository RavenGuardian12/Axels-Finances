import { Expense } from '../types';

export type ExpenseDraft = Omit<Expense, 'id'>;

export function createExpenseDraft(expense: Expense): ExpenseDraft {
  return {
    name: expense.name,
    amount: expense.amount,
    firstDueDate: expense.firstDueDate,
    variableDatesEnabled: expense.variableDatesEnabled,
    variableDueDates: expense.variableDueDates ? [...expense.variableDueDates] : [],
    repeat: expense.repeat,
    repeatCount: expense.repeatCount,
    highlightLastEvent: expense.highlightLastEvent ?? true,
    category: expense.category,
    notes: expense.notes,
  };
}

export function validateExpenseDraft(draft: ExpenseDraft): string | null {
  if (!draft.name.trim()) {
    return 'Name is required.';
  }
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
    return 'Amount must be greater than 0.';
  }
  if (!draft.variableDatesEnabled && !draft.firstDueDate) {
    return 'Due date is required.';
  }
  if (draft.variableDatesEnabled) {
    if (!Array.isArray(draft.variableDueDates) || draft.variableDueDates.length === 0) {
      return 'Variable due dates are required.';
    }
    if (draft.variableDueDates.some((date) => !date)) {
      return 'Each variable due date is required.';
    }
  }
  if (
    !draft.variableDatesEnabled &&
    draft.repeat !== 'none' &&
    draft.repeatCount !== undefined &&
    (!Number.isInteger(draft.repeatCount) || draft.repeatCount <= 0)
  ) {
    return 'Repeat count must be a whole number greater than 0.';
  }

  return null;
}

export function normalizeExpenseDraft(draft: ExpenseDraft): ExpenseDraft {
  const variableDueDates =
    draft.variableDatesEnabled && Array.isArray(draft.variableDueDates)
      ? [...draft.variableDueDates].sort((a, b) => a.localeCompare(b))
      : [];

  return {
    ...draft,
    name: draft.name.trim(),
    firstDueDate: draft.variableDatesEnabled ? variableDueDates[0] : draft.firstDueDate,
    variableDatesEnabled: Boolean(draft.variableDatesEnabled),
    variableDueDates,
    repeat: draft.variableDatesEnabled ? 'none' : draft.repeat,
    repeatCount: draft.variableDatesEnabled || draft.repeat === 'none' ? undefined : draft.repeatCount,
    highlightLastEvent: draft.highlightLastEvent ?? true,
  };
}
