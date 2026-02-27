import { Dispatch, SetStateAction } from 'react';
import ExpenseEditableTable from '../ExpenseEditableTable';
import ExpenseForm from '../ExpenseForm';
import { ExpenseDraft } from '../../lib/expenseEditing';
import { Expense } from '../../types';

interface ExpenseGroups {
  active: Expense[];
  finished: Expense[];
}

interface ExpensesSectionProps {
  expenseGroups: ExpenseGroups;
  editingExpenseError: string;
  editingExpenseId: string | null;
  editingExpenseDraft: ExpenseDraft | null;
  setEditingExpenseDraft: Dispatch<SetStateAction<ExpenseDraft | null>>;
  onAddExpense: (input: Omit<Expense, 'id'>) => void;
  onStartEdit: (expense: Expense) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onUpdateCategory: (id: string, category: Expense['category']) => void;
}

export default function ExpensesSection({
  expenseGroups,
  editingExpenseError,
  editingExpenseId,
  editingExpenseDraft,
  setEditingExpenseDraft,
  onAddExpense,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onUpdateCategory,
}: ExpensesSectionProps) {
  return (
    <section className="panel span-two">
      <h2>Expenses</h2>
      <ExpenseForm onSubmit={onAddExpense} submitLabel="Add Expense" />
      {editingExpenseError && <p className="error">{editingExpenseError}</p>}
      <ExpenseEditableTable
        expenses={expenseGroups.active}
        editingExpenseId={editingExpenseId}
        editingExpenseDraft={editingExpenseDraft}
        setEditingExpenseDraft={setEditingExpenseDraft}
        onStartEdit={onStartEdit}
        onSaveEdit={onSaveEdit}
        onCancelEdit={onCancelEdit}
        onDelete={onDelete}
        onUpdateCategory={onUpdateCategory}
        emptyMessage="No active expenses."
        sortable
      />

      <h3>Finished!</h3>
      <ExpenseEditableTable
        expenses={expenseGroups.finished}
        editingExpenseId={editingExpenseId}
        editingExpenseDraft={editingExpenseDraft}
        setEditingExpenseDraft={setEditingExpenseDraft}
        onStartEdit={onStartEdit}
        onSaveEdit={onSaveEdit}
        onCancelEdit={onCancelEdit}
        onDelete={onDelete}
        onUpdateCategory={onUpdateCategory}
        emptyMessage="No finished expenses."
      />
    </section>
  );
}
