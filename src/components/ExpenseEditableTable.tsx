import { Dispatch, MouseEvent, SetStateAction, useMemo, useState } from 'react';
import { CATEGORY_OPTIONS, EXPENSE_REPEAT_OPTIONS } from '../lib/constants';
import { ExpenseDraft } from '../lib/expenseEditing';
import { formatCurrency, formatDate, formatTitleLabel } from '../lib/format';
import { Category, Expense } from '../types';

interface ExpenseEditableTableProps {
  expenses: Expense[];
  editingExpenseId: string | null;
  editingExpenseDraft: ExpenseDraft | null;
  setEditingExpenseDraft: Dispatch<SetStateAction<ExpenseDraft | null>>;
  onStartEdit: (expense: Expense) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onUpdateCategory: (id: string, category: Category) => void;
  emptyMessage: string;
  formatDueDate?: (date: string) => string;
  sortable?: boolean;
}

type SortKey = 'name' | 'amount' | 'firstDueDate' | 'repeat' | 'category';
type SortDirection = 'asc' | 'desc';

export default function ExpenseEditableTable({
  expenses,
  editingExpenseId,
  editingExpenseDraft,
  setEditingExpenseDraft,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onUpdateCategory,
  emptyMessage,
  formatDueDate = (date) => formatDate(date),
  sortable = false,
}: ExpenseEditableTableProps) {
  const toAmountOrZero = (value: string): number => Number(value) || 0;
  const toRepeatCountOrUndefined = (value: string): number | undefined =>
    value ? Math.max(1, Math.floor(Number(value))) : undefined;
  const [openMenuExpenseId, setOpenMenuExpenseId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('firstDueDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleMenuToggle = (event: MouseEvent, expenseId: string) => {
    event.stopPropagation();
    setOpenMenuExpenseId((prev) => (prev === expenseId ? null : expenseId));
  };

  const handleSort = (key: SortKey) => {
    if (!sortable) {
      return;
    }
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const sortedExpenses = useMemo(() => {
    if (!sortable) {
      return expenses;
    }

    const direction = sortDirection === 'asc' ? 1 : -1;
    const sorted = [...expenses].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * direction;
        case 'amount':
          return (a.amount - b.amount) * direction;
        case 'firstDueDate':
          return a.firstDueDate.localeCompare(b.firstDueDate) * direction;
        case 'repeat':
          return a.repeat.localeCompare(b.repeat) * direction;
        case 'category':
          return a.category.localeCompare(b.category) * direction;
        default:
          return 0;
      }
    });
    return sorted;
  }, [expenses, sortable, sortDirection, sortKey]);

  const sortIndicator = (key: SortKey) => {
    if (!sortable || sortKey !== key) {
      return '';
    }
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>
              {sortable ? (
                <button type="button" className="th-sort-btn" onClick={() => handleSort('firstDueDate')}>
                  Due Date{sortIndicator('firstDueDate')}
                </button>
              ) : (
                'Due Date'
              )}
            </th>
            <th>
              {sortable ? (
                <button type="button" className="th-sort-btn" onClick={() => handleSort('name')}>
                  Name{sortIndicator('name')}
                </button>
              ) : (
                'Name'
              )}
            </th>
            <th>
              {sortable ? (
                <button type="button" className="th-sort-btn" onClick={() => handleSort('amount')}>
                  Amount{sortIndicator('amount')}
                </button>
              ) : (
                'Amount'
              )}
            </th>
            <th>
              {sortable ? (
                <button type="button" className="th-sort-btn" onClick={() => handleSort('repeat')}>
                  Repeat{sortIndicator('repeat')}
                </button>
              ) : (
                'Repeat'
              )}
            </th>
            <th>Repeat Count</th>
            <th>
              {sortable ? (
                <button type="button" className="th-sort-btn" onClick={() => handleSort('category')}>
                  Category{sortIndicator('category')}
                </button>
              ) : (
                'Category'
              )}
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {expenses.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                {emptyMessage}
              </td>
            </tr>
          )}
          {sortedExpenses.map((expense) => (
            <tr key={expense.id}>
              <td>
                {editingExpenseId === expense.id && editingExpenseDraft ? (
                  editingExpenseDraft.variableDatesEnabled ? (
                    `${editingExpenseDraft.variableDueDates?.length ?? 0} variable dates`
                  ) : (
                    <input
                      type="date"
                      value={editingExpenseDraft.firstDueDate}
                      onChange={(event) =>
                        setEditingExpenseDraft((prev) =>
                          prev ? { ...prev, firstDueDate: event.target.value } : prev,
                        )
                      }
                    />
                  )
                ) : (
                  expense.variableDatesEnabled
                    ? `${expense.variableDueDates?.length ?? 0} variable dates`
                    : formatDueDate(expense.firstDueDate)
                )}
              </td>
              <td>
                {editingExpenseId === expense.id && editingExpenseDraft ? (
                  <input
                    value={editingExpenseDraft.name}
                    onChange={(event) =>
                      setEditingExpenseDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                    }
                  />
                ) : (
                  expense.name
                )}
              </td>
              <td>
                {editingExpenseId === expense.id && editingExpenseDraft ? (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingExpenseDraft.amount}
                    onChange={(event) =>
                      setEditingExpenseDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              amount: toAmountOrZero(event.target.value),
                            }
                          : prev,
                      )
                    }
                  />
                ) : (
                  formatCurrency(expense.amount)
                )}
              </td>
              <td>
                {editingExpenseId === expense.id && editingExpenseDraft ? (
                  <select
                    value={editingExpenseDraft.repeat}
                    disabled={Boolean(editingExpenseDraft.variableDatesEnabled)}
                    onChange={(event) =>
                      setEditingExpenseDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              repeat: event.target.value as Expense['repeat'],
                              repeatCount: event.target.value === 'none' ? undefined : prev.repeatCount,
                            }
                          : prev,
                      )
                    }
                  >
                    {EXPENSE_REPEAT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {formatTitleLabel(option)}
                      </option>
                    ))}
                  </select>
                ) : (
                  expense.variableDatesEnabled ? 'Variable' : formatTitleLabel(expense.repeat)
                )}
              </td>
              <td>
                {editingExpenseId === expense.id && editingExpenseDraft ? (
                  <input
                    type="number"
                    min="1"
                    step="1"
                    disabled={editingExpenseDraft.repeat === 'none' || Boolean(editingExpenseDraft.variableDatesEnabled)}
                    value={editingExpenseDraft.repeatCount ?? ''}
                    placeholder="Ongoing"
                    onChange={(event) =>
                      setEditingExpenseDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              repeatCount: toRepeatCountOrUndefined(event.target.value),
                            }
                          : prev,
                      )
                    }
                  />
                ) : expense.repeat === 'none' ? (
                  '1'
                ) : expense.variableDatesEnabled ? (
                  expense.variableDueDates?.length ?? 0
                ) : (
                  expense.repeatCount ?? 'Ongoing'
                )}
              </td>
              <td>
                {editingExpenseId === expense.id && editingExpenseDraft ? (
                  <select
                    value={editingExpenseDraft.category}
                    onChange={(event) =>
                      setEditingExpenseDraft((prev) =>
                        prev ? { ...prev, category: event.target.value as Expense['category'] } : prev,
                      )
                    }
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {formatTitleLabel(option)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={expense.category}
                    onChange={(event) => onUpdateCategory(expense.id, event.target.value as Category)}
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {formatTitleLabel(option)}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td className="menu-cell">
                <div className="row-actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      onDelete(expense.id);
                      setOpenMenuExpenseId(null);
                    }}
                  >
                    Delete
                  </button>
                  <div className="row-menu">
                    <button
                      type="button"
                      className="secondary row-menu-trigger"
                      aria-label="Expense actions"
                      title="Expense actions"
                      onClick={(event) => handleMenuToggle(event, expense.id)}
                    >
                      ⋯
                    </button>
                    {openMenuExpenseId === expense.id && (
                      <div className="row-menu-list">
                        {editingExpenseId === expense.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                onSaveEdit();
                                setOpenMenuExpenseId(null);
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                onCancelEdit();
                                setOpenMenuExpenseId(null);
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              onStartEdit(expense);
                              setOpenMenuExpenseId(null);
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
