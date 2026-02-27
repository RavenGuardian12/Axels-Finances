import { FormEvent, useMemo, useState } from 'react';
import CurrencyInput from './CurrencyInput';
import { CATEGORY_OPTIONS, EXPENSE_REPEAT_OPTIONS } from '../lib/constants';
import { formatTitleLabel } from '../lib/format';
import { Category, Expense, ExpenseRepeat } from '../types';

interface ExpenseFormProps {
  initial?: Expense;
  onSubmit: (input: Omit<Expense, 'id'>) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

interface ExpenseFormState {
  name: string;
  amount: number;
  firstDueDate: string;
  variableDatesEnabled: boolean;
  variablePaymentsLeft: number | null;
  variableDueDates: string[];
  repeatCount: number | null;
  highlightLastEvent: boolean;
  repeat: ExpenseRepeat;
  category: Category;
  notes: string;
}

function makeEmptyState(): ExpenseFormState {
  return {
    name: '',
    amount: 0,
    firstDueDate: '',
    variableDatesEnabled: false,
    variablePaymentsLeft: null,
    variableDueDates: [],
    repeatCount: null,
    highlightLastEvent: true,
    repeat: 'monthly',
    category: 'other',
    notes: '',
  };
}

export default function ExpenseForm({ initial, onSubmit, onCancel, submitLabel }: ExpenseFormProps) {
  const initialState = useMemo<ExpenseFormState>(() => {
    if (!initial) {
      return makeEmptyState();
    }

    return {
      name: initial.name,
      amount: initial.amount,
      firstDueDate: initial.firstDueDate,
      variableDatesEnabled: Boolean(initial.variableDatesEnabled),
      variablePaymentsLeft:
        initial.variableDatesEnabled && Array.isArray(initial.variableDueDates)
          ? initial.variableDueDates.length
          : null,
      variableDueDates:
        initial.variableDatesEnabled && Array.isArray(initial.variableDueDates)
          ? [...initial.variableDueDates]
          : [],
      repeatCount:
        Number.isFinite(initial.repeatCount) && (initial.repeatCount ?? 0) > 0
          ? Math.floor(initial.repeatCount ?? 0)
          : null,
      highlightLastEvent: initial.highlightLastEvent ?? true,
      repeat: initial.repeat,
      category: initial.category,
      notes: initial.notes ?? '',
    };
  }, [initial]);

  const [form, setForm] = useState<ExpenseFormState>(initialState);
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const amount = form.amount;

    if (!form.name.trim()) {
      setError('Expense name is required.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be a positive number.');
      return;
    }
    if (form.variableDatesEnabled) {
      if (!Number.isFinite(form.variablePaymentsLeft) || !Number.isInteger(form.variablePaymentsLeft) || (form.variablePaymentsLeft ?? 0) <= 0) {
        setError('How many payments left must be a whole number greater than 0.');
        return;
      }
      if (form.variableDueDates.length !== form.variablePaymentsLeft) {
        setError('Please fill out all variable due date rows.');
        return;
      }
      if (form.variableDueDates.some((date) => !date)) {
        setError('Each variable due date is required.');
        return;
      }
    } else {
      if (!form.firstDueDate) {
        setError('First due date is required.');
        return;
      }
      if (
        form.repeat !== 'none' &&
        form.repeatCount !== null &&
        (!Number.isFinite(form.repeatCount) || !Number.isInteger(form.repeatCount))
      ) {
        setError('Repeat how many times must be a whole number greater than 0.');
        return;
      }
    }

    setError('');
    const trimmedNotes = form.notes.trim();
    const sortedVariableDueDates = [...form.variableDueDates].sort((a, b) => a.localeCompare(b));
    const repeatCount =
      form.repeat !== 'none' && form.repeatCount !== null ? Math.max(1, Math.floor(form.repeatCount)) : undefined;
    onSubmit({
      name: form.name.trim(),
      amount,
      firstDueDate: form.variableDatesEnabled ? sortedVariableDueDates[0] : form.firstDueDate,
      variableDatesEnabled: form.variableDatesEnabled,
      variableDueDates: form.variableDatesEnabled ? sortedVariableDueDates : [],
      highlightLastEvent: form.highlightLastEvent,
      repeat: form.variableDatesEnabled ? 'none' : form.repeat,
      ...(form.variableDatesEnabled ? {} : repeatCount ? { repeatCount } : {}),
      category: form.category,
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    });

    if (!initial) {
      setForm(makeEmptyState());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="panel form-grid">
      <h3>{initial ? 'Edit Expense' : 'Add Expense'}</h3>
      {error && <p className="error">{error}</p>}

      <label>
        Name
        <input
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
      </label>

      <label>
        Amount (USD)
        <CurrencyInput
          value={form.amount}
          onValueChange={(value) => setForm((prev) => ({ ...prev, amount: value ?? 0 }))}
          showEmptyWhenZero
          required
        />
      </label>

      <label>
        First Due Date
        <input
          type="date"
          value={form.firstDueDate}
          onChange={(event) => setForm((prev) => ({ ...prev, firstDueDate: event.target.value }))}
          required={!form.variableDatesEnabled}
          disabled={form.variableDatesEnabled}
        />
      </label>

      <div className="row">
        <label className="inline-checkbox">
          <input
            type="checkbox"
            checked={form.variableDatesEnabled}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                variableDatesEnabled: event.target.checked,
                variablePaymentsLeft: event.target.checked ? prev.variablePaymentsLeft : null,
                variableDueDates: event.target.checked ? prev.variableDueDates : [],
              }))
            }
          />
          Variable dates
        </label>
      </div>

      {form.variableDatesEnabled && (
        <>
          <label>
            How Many Payments Left
            <input
              type="number"
              min="1"
              step="1"
              value={form.variablePaymentsLeft ?? ''}
              onChange={(event) =>
                setForm((prev) => {
                  const nextCount = event.target.value ? Math.max(1, Math.floor(Number(event.target.value))) : null;
                  const nextDates = Array.from({ length: nextCount ?? 0 }, (_, index) => prev.variableDueDates[index] ?? '');
                  return {
                    ...prev,
                    variablePaymentsLeft: nextCount,
                    variableDueDates: nextDates,
                  };
                })
              }
            />
          </label>

          {form.variableDueDates.map((date, index) => (
            <label key={`variable-due-date-${index}`}>
              Variable Due Date #{index + 1}
              <input
                type="date"
                value={date}
                onChange={(event) =>
                  setForm((prev) => {
                    const nextDates = [...prev.variableDueDates];
                    nextDates[index] = event.target.value;
                    return { ...prev, variableDueDates: nextDates };
                  })
                }
              />
            </label>
          ))}
        </>
      )}

      <label>
        Repeat
        <select
          value={form.repeat}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              repeat: event.target.value as ExpenseRepeat,
              repeatCount: event.target.value === 'none' ? null : prev.repeatCount,
            }))
          }
          disabled={form.variableDatesEnabled}
        >
          {EXPENSE_REPEAT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {formatTitleLabel(option)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Repeat How Many Times
        <input
          type="number"
          min="1"
          step="1"
          value={form.repeatCount ?? ''}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              repeatCount: (() => {
                if (!event.target.value) {
                  return null;
                }
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                  return null;
                }
                return Math.floor(parsed);
              })(),
            }))
          }
          disabled={form.repeat === 'none' || form.variableDatesEnabled}
          placeholder="Leave blank for ongoing"
        />
      </label>

      <div className="row">
        <label className="inline-checkbox">
          <input
            type="checkbox"
            checked={form.highlightLastEvent}
            onChange={(event) => setForm((prev) => ({ ...prev, highlightLastEvent: event.target.checked }))}
          />
          Highlight last event
        </label>
      </div>

      <label>
        Category
        <select
          value={form.category}
          onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value as Category }))}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {formatTitleLabel(option)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Notes
        <textarea
          rows={2}
          value={form.notes}
          onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
        />
      </label>

      <div className="row">
        <button type="submit">{submitLabel ?? (initial ? 'Update Expense' : 'Add Expense')}</button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
