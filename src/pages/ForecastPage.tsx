import { Dispatch, Fragment, SetStateAction, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CategoryPieChart from '../components/CategoryPieChart';
import ExpenseEditableTable from '../components/ExpenseEditableTable';
import ExpenseForm from '../components/ExpenseForm';
import LineChart from '../components/LineChart';
import { addMonths, toISODate } from '../lib/date';
import { ExpenseDraft, createExpenseDraft, normalizeExpenseDraft, validateExpenseDraft } from '../lib/expenseEditing';
import { partitionExpensesByStatus } from '../lib/expenseStatus';
import {
  buildForecast,
  computeNetPayBreakdown,
  computeNextPaydayMetrics,
  generateBonusEvents,
  generateExpenseEvents,
  generateIncomeEvents,
} from '../lib/forecast';
import {
  buildBandedRows,
  buildMonthlyCategorySlices,
  createFiniteExpenseIdSet,
  createLastExpenseDateBySourceMap,
  createLastExpenseRowIdByMonthMap,
  createMonthlyBalanceByKey,
} from '../lib/forecastView';
import { formatCurrency, formatDate, formatTitleLabel } from '../lib/format';
import { AppData, Expense, ForecastRow } from '../types';

type FilterMode = 'all' | 'income' | 'expenses';

interface ForecastPageProps {
  data: AppData;
  onChange: Dispatch<SetStateAction<AppData>>;
}

function filterForecastRows(rows: ForecastRow[], mode: FilterMode): ForecastRow[] {
  switch (mode) {
    case 'income':
      return rows.filter((row) => row.type === 'income');
    case 'expenses':
      return rows.filter((row) => row.type === 'expense');
    case 'all':
    default:
      return rows;
  }
}

export default function ForecastPage({ data, onChange }: ForecastPageProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingExpenseDraft, setEditingExpenseDraft] = useState<ExpenseDraft | null>(null);
  const [editingExpenseError, setEditingExpenseError] = useState('');
  const [quickAddMonthKey, setQuickAddMonthKey] = useState<string | null>(null);
  const [openEventMenuRowId, setOpenEventMenuRowId] = useState<string | null>(null);
  const [manualHighlightedEventIds, setManualHighlightedEventIds] = useState<Set<string>>(new Set());
  const [showMonthlyBreakdown, setShowMonthlyBreakdown] = useState(false);
  const isMobile =
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false;
  const tableColumnCount = isMobile ? 4 : 6;

  const today = useMemo(() => new Date(), []);
  const horizonStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()), [today]);
  const horizonEnd = useMemo(() => addMonths(horizonStart, 12), [horizonStart]);

  const paycheckBreakdown = useMemo(
    () => computeNetPayBreakdown(data.paycheckConfig),
    [data.paycheckConfig],
  );

  const incomeEvents = useMemo(
    () => generateIncomeEvents(data.paycheckConfig, horizonStart, horizonEnd),
    [data.paycheckConfig, horizonStart, horizonEnd],
  );

  const expenseEvents = useMemo(
    () => generateExpenseEvents(data.expenses, horizonStart, horizonEnd),
    [data.expenses, horizonStart, horizonEnd],
  );

  const bonusEvents = useMemo(
    () => generateBonusEvents(data.paycheckConfig, incomeEvents),
    [data.paycheckConfig, incomeEvents],
  );

  const forecastRows = useMemo(
    () => buildForecast([...incomeEvents, ...bonusEvents, ...expenseEvents], data.userSettings.startingBalance),
    [incomeEvents, bonusEvents, expenseEvents, data.userSettings.startingBalance],
  );

  const nextPayday = incomeEvents[0]?.date;
  const metrics = useMemo(() => {
    if (!nextPayday) {
      return null;
    }
    return computeNextPaydayMetrics(
      forecastRows,
      nextPayday,
      data.userSettings.minimumBuffer,
      data.userSettings.startingBalance,
    );
  }, [forecastRows, nextPayday, data.userSettings.minimumBuffer, data.userSettings.startingBalance]);

  const filteredRows = useMemo(
    () => filterForecastRows(forecastRows, filterMode),
    [forecastRows, filterMode],
  );

  const finiteExpenseIds = useMemo(
    () => createFiniteExpenseIdSet(data.expenses, forecastRows),
    [data.expenses, forecastRows],
  );
  const lastExpenseDateBySource = useMemo(
    () => createLastExpenseDateBySourceMap(forecastRows),
    [forecastRows],
  );
  const lastExpenseRowIdByMonth = useMemo(
    () => createLastExpenseRowIdByMonthMap(forecastRows),
    [forecastRows],
  );
  const monthlyBalanceByKey = useMemo(
    () => createMonthlyBalanceByKey(forecastRows, data.userSettings.startingBalance),
    [forecastRows, data.userSettings.startingBalance],
  );

  const bandedRows = useMemo(
    () =>
      buildBandedRows({
        rows: filteredRows,
        monthlyBalanceByKey,
        finiteExpenseIds,
        lastExpenseDateBySource,
        lastExpenseRowIdByMonth,
      }),
    [filteredRows, monthlyBalanceByKey, finiteExpenseIds, lastExpenseDateBySource, lastExpenseRowIdByMonth],
  );
  const expenseGroups = useMemo(
    () => partitionExpensesByStatus(data.expenses, horizonStart),
    [data.expenses, horizonStart],
  );

  const chartPoints = useMemo(
    () =>
      forecastRows.map((row, index) => ({
        label: index === 0 ? formatDate(row.date) : row.date,
        value: row.runningBalance,
      })),
    [forecastRows],
  );

  const monthlyCategorySlices = useMemo(
    () => buildMonthlyCategorySlices(expenseEvents, horizonStart),
    [expenseEvents, horizonStart],
  );

  const addExpense = (input: Omit<Expense, 'id'>) => {
    onChange((prev) => ({
      ...prev,
      expenses: [...prev.expenses, { ...input, id: crypto.randomUUID() }],
    }));
  };

  const updateExpense = (id: string, input: Omit<Expense, 'id'>) => {
    onChange((prev) => ({
      ...prev,
      expenses: prev.expenses.map((expense) => (expense.id === id ? { ...input, id } : expense)),
    }));
    setEditingExpenseId(null);
  };

  const updateExpenseCategory = (id: string, category: Expense['category']) => {
    onChange((prev) => ({
      ...prev,
      expenses: prev.expenses.map((expense) => (expense.id === id ? { ...expense, category } : expense)),
    }));
  };

  const startEditingExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setEditingExpenseError('');
    setEditingExpenseDraft(createExpenseDraft(expense));
  };

  const cancelEditingExpense = () => {
    setEditingExpenseId(null);
    setEditingExpenseDraft(null);
    setEditingExpenseError('');
  };

  const saveEditingExpense = () => {
    if (!editingExpenseId || !editingExpenseDraft) {
      return;
    }
    const draftError = validateExpenseDraft(editingExpenseDraft);
    if (draftError) {
      setEditingExpenseError(draftError);
      return;
    }

    updateExpense(editingExpenseId, normalizeExpenseDraft(editingExpenseDraft));
    setEditingExpenseDraft(null);
    setEditingExpenseError('');
  };

  const deleteExpense = (id: string) => {
    onChange((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((expense) => expense.id !== id),
    }));
    if (editingExpenseId === id) {
      cancelEditingExpense();
    }
  };

  const amountLabel = (row: ForecastRow): string =>
    row.type === 'income' ? formatCurrency(row.amount) : `-${formatCurrency(row.amount)}`;
  const paycheckNetLabel = Number.isFinite(paycheckBreakdown.netPay)
    ? formatCurrency(paycheckBreakdown.netPay)
    : 'Invalid';
  const isCalculatedPaycheck = data.paycheckConfig.paycheckInputMode === 'calculate';

  return (
    <div className="page">
      <header className="page-header row-between">
        <div>
          <h1>Forecast</h1>
          <p>
            Horizon: {formatDate(toISODate(horizonStart))} to {formatDate(toISODate(horizonEnd))}
          </p>
          <p className="muted">Paycheck net used in forecast: {paycheckNetLabel}</p>
          {isCalculatedPaycheck && Number.isFinite(paycheckBreakdown.netPay) && (
            <p className="muted">
              Gross: {formatCurrency(paycheckBreakdown.grossPay)} • Total withheld/deducted:{' '}
              {formatCurrency(paycheckBreakdown.totalWithheldDeducted)}
            </p>
          )}
        </div>
        <Link to="/" className="button-link">
          Back to Setup
        </Link>
      </header>

      {!nextPayday && (
        <section className="panel warning">
          <h2>No payday found in horizon</h2>
          <p>No paycheck events were generated in the next 12 months. Verify next pay date and frequency.</p>
        </section>
      )}

      {metrics && (
        <section className="summary-grid">
          <article className="panel">
            <h3>Next Payday Date</h3>
            <p className="stat">{formatDate(metrics.nextPaydayDate)}</p>
          </article>
          <article className="panel">
            <h3>Balance on Next Payday</h3>
            <p className="stat">{formatCurrency(metrics.balanceOnNextPayday)}</p>
          </article>
          <article className="panel">
            <h3>Lowest Balance Before Next Payday</h3>
            <p className="stat">{formatCurrency(metrics.lowestBalanceBeforeNextPayday)}</p>
          </article>
          <article className="panel">
            <h3>Safe-to-Spend Until Next Payday</h3>
            <p className="stat">{formatCurrency(metrics.safeToSpendUntilNextPayday)}</p>
          </article>
        </section>
      )}

      <section className="panel">
        <div className="row-between">
          <h2>Monthly Spend Breakdown</h2>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowMonthlyBreakdown((prev) => !prev)}
            aria-expanded={showMonthlyBreakdown}
          >
            {showMonthlyBreakdown ? 'Hide charts' : 'Show charts'}
          </button>
        </div>
        {showMonthlyBreakdown ? (
          <div className="pie-grid">
            {monthlyCategorySlices.map((month) => (
              <CategoryPieChart key={month.key} title={month.label} slices={month.slices} />
            ))}
          </div>
        ) : (
          <p className="muted">Expand to view monthly pie charts by category.</p>
        )}
      </section>

      <section className="panel">
        <div className="row-between">
          <h2>Future Bank Statement</h2>
          <div className="row">
            <button
              type="button"
              className={filterMode === 'all' ? '' : 'secondary'}
              onClick={() => setFilterMode('all')}
            >
              All
            </button>
            <button
              type="button"
              className={filterMode === 'income' ? '' : 'secondary'}
              onClick={() => setFilterMode('income')}
            >
              Income
            </button>
            <button
              type="button"
              className={filterMode === 'expenses' ? '' : 'secondary'}
              onClick={() => setFilterMode('expenses')}
            >
              Expenses
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="forecast-table">
            <thead>
              <tr>
                <th className="forecast-col-date">Date</th>
                <th className="forecast-col-item">Item</th>
                {!isMobile && <th className="forecast-col-category">Category</th>}
                <th className="forecast-col-amount">Amount (+/-)</th>
                <th className="forecast-col-balance">Running Balance</th>
                {!isMobile && <th className="forecast-col-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={tableColumnCount} className="muted">
                    No forecast events for selected filter.
                  </td>
                </tr>
              )}
              {bandedRows.map(({ row, monthKey, monthLabel, monthSummary, monthSpent, spentTrendClass, spentTrendEmoji, isMonthStart, isLastPayment, isLastExpenseOfMonth, monthBandClass }) => (
                <Fragment key={row.id}>
                  {isMonthStart && (
                    <tr className={`month-summary ${monthBandClass}`.trim()}>
                      <td colSpan={tableColumnCount}>
                        {monthLabel}{' '}
                        • Opening Balance: {formatCurrency(monthSummary?.openingBalance ?? data.userSettings.startingBalance)} • Spent:{' '}
                        <span className={spentTrendClass}>
                          {formatCurrency(monthSpent)}
                          {spentTrendEmoji ? ` ${spentTrendEmoji}` : ''}
                        </span>{' '}
                        • Ending Balance:{' '}
                        {formatCurrency(monthSummary?.endingBalance ?? row.runningBalance)} • Open Money:{' '}
                        {formatCurrency(
                          (monthSummary?.endingBalance ?? row.runningBalance) -
                            (monthSummary?.openingBalance ?? data.userSettings.startingBalance),
                        )}
                      </td>
                    </tr>
                  )}
                  <tr
                    className={`${monthBandClass} ${isMonthStart ? 'month-start' : ''} ${isLastPayment ? 'last-payment' : ''} ${manualHighlightedEventIds.has(row.id) ? 'manual-event-highlight' : ''}`.trim()}
                  >
                    <td className="forecast-col-date">{formatDate(row.date)}</td>
                    <td className="forecast-col-item">{row.item}</td>
                    {!isMobile && <td className="forecast-col-category">{formatTitleLabel(row.category)}</td>}
                    <td className={`forecast-col-amount ${row.type === 'income' ? 'positive' : 'negative'}`}>{amountLabel(row)}</td>
                    <td className="forecast-col-balance">
                      <div className="balance-cell">
                        <span>{formatCurrency(row.runningBalance)}</span>
                        {isLastExpenseOfMonth && (
                          <span className="month-add-expense-wrap">
                            <button
                              type="button"
                              className="month-add-expense-btn"
                              title="Add expense"
                              aria-label={`Add expense near end of ${monthLabel}`}
                              onClick={() => setQuickAddMonthKey(monthKey)}
                            >
                              +
                            </button>
                            <span className="month-add-expense-label">need to add expense?</span>
                          </span>
                        )}
                      </div>
                    </td>
                    {!isMobile && (
                      <td className="menu-cell forecast-col-actions">
                        <div className="row-menu">
                          <button
                            type="button"
                            className="secondary row-menu-trigger"
                            aria-label="Event actions"
                            title="Event actions"
                            onClick={() => setOpenEventMenuRowId((prev) => (prev === row.id ? null : row.id))}
                          >
                            ⋯
                          </button>
                          {openEventMenuRowId === row.id && (
                            <div className="row-menu-list">
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => {
                                  setManualHighlightedEventIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(row.id)) {
                                      next.delete(row.id);
                                    } else {
                                      next.add(row.id);
                                    }
                                    return next;
                                  });
                                  setOpenEventMenuRowId(null);
                                }}
                              >
                                {manualHighlightedEventIds.has(row.id) ? 'Remove highlight' : 'Highlight event'}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Edit Expenses</h2>
        <ExpenseForm onSubmit={addExpense} submitLabel="Add Expense" />
        {editingExpenseError && <p className="error">{editingExpenseError}</p>}
        <ExpenseEditableTable
          expenses={expenseGroups.active}
          editingExpenseId={editingExpenseId}
          editingExpenseDraft={editingExpenseDraft}
          setEditingExpenseDraft={setEditingExpenseDraft}
          onStartEdit={startEditingExpense}
          onSaveEdit={saveEditingExpense}
          onCancelEdit={cancelEditingExpense}
          onDelete={deleteExpense}
          onUpdateCategory={updateExpenseCategory}
          emptyMessage="No active expenses."
          formatDueDate={formatDate}
        />

        <h3>Finished!</h3>
        <ExpenseEditableTable
          expenses={expenseGroups.finished}
          editingExpenseId={editingExpenseId}
          editingExpenseDraft={editingExpenseDraft}
          setEditingExpenseDraft={setEditingExpenseDraft}
          onStartEdit={startEditingExpense}
          onSaveEdit={saveEditingExpense}
          onCancelEdit={cancelEditingExpense}
          onDelete={deleteExpense}
          onUpdateCategory={updateExpenseCategory}
          emptyMessage="No finished expenses."
          formatDueDate={formatDate}
        />
      </section>

      <section className="panel">
        <h2>Running Balance Chart</h2>
        <LineChart points={chartPoints} />
      </section>

      {quickAddMonthKey && (
        <div className="modal-backdrop" role="presentation" onClick={() => setQuickAddMonthKey(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="row-between">
              <h3>Add Expense</h3>
              <button type="button" className="secondary" onClick={() => setQuickAddMonthKey(null)}>
                Close
              </button>
            </div>
            <p className="muted">
              Adding for month: {new Date(`${quickAddMonthKey}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
            <ExpenseForm
              onSubmit={(input) => {
                addExpense(input);
                setQuickAddMonthKey(null);
              }}
              submitLabel="Add Expense"
            />
          </div>
        </div>
      )}
    </div>
  );
}
