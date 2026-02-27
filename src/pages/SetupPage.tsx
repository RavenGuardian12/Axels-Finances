import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CurrencyInput from '../components/CurrencyInput';
import CloudSyncSection from '../components/setup/CloudSyncSection';
import DeductionRowsEditor from '../components/DeductionRowsEditor';
import ExpensesSection from '../components/setup/ExpensesSection';
import TaxRowsEditor from '../components/TaxRowsEditor';
import {
  pullCloudStateFromCloud,
  pushAppDataToCloudWithMeta,
  validateCloudSyncConfig,
} from '../lib/cloudSync';
import {
  PAY_FREQUENCY_OPTIONS,
  POSTTAX_DEDUCTION_OPTIONS,
  PRETAX_DEDUCTION_OPTIONS,
  TAX_WITHHELD_OPTIONS,
} from '../lib/constants';
import { ExpenseDraft, createExpenseDraft, normalizeExpenseDraft, validateExpenseDraft } from '../lib/expenseEditing';
import { computeGrossPayFromHourly, computeNetPayBreakdown } from '../lib/forecast';
import { formatCurrency } from '../lib/format';
import { partitionExpensesByStatus } from '../lib/expenseStatus';
import {
  clearAppData,
  getDefaultAppData,
  getLatestBackupSavedAt,
  loadCloudSyncConfig,
  loadLatestBackup,
  sanitizeAppData,
  saveCloudSyncConfig,
} from '../lib/storage';
import { AppData, CloudSyncConfig, DeductionLine, Expense, PayFrequency, PaycheckConfig, TaxWithheldLine } from '../types';

interface SetupPageProps {
  data: AppData;
  onChange: Dispatch<SetStateAction<AppData>>;
  lastCloudLoadAt: string | null;
  onCloudLoadAtChange: (updatedAt: string | null) => void;
}

function hasInvalidDeductionRows(rows: DeductionLine[]): boolean {
  return rows.some((row) => {
    if (!Number.isFinite(row.value) || row.value < 0) {
      return true;
    }
    if (row.type === 'percentOfGross' && row.value > 100) {
      return true;
    }
    return false;
  });
}

function hasInvalidTaxRows(rows: TaxWithheldLine[]): boolean {
  return rows.some(
    (row) =>
      !Number.isFinite(row.value) ||
      row.value < 0 ||
      (row.type === 'percentOfGross' && row.value > 100),
  );
}

interface ValidatePaycheckParams {
  paycheckConfig: PaycheckConfig;
  computedGrossFromHourly: number;
  computedNetPayIsValid: boolean;
}

function validatePaycheckConfig({
  paycheckConfig,
  computedGrossFromHourly,
  computedNetPayIsValid,
}: ValidatePaycheckParams): string | null {
  if (!Number.isFinite(paycheckConfig.monthlyBonusAmount ?? 0) || (paycheckConfig.monthlyBonusAmount ?? 0) < 0) {
    return 'Monthly bonus must be 0 or greater.';
  }

  if (paycheckConfig.paycheckInputMode === 'net') {
    if (!Number.isFinite(paycheckConfig.netPayAmount) || (paycheckConfig.netPayAmount ?? 0) <= 0) {
      return 'Net pay amount is required and must be greater than 0.';
    }
    return null;
  }

  if (paycheckConfig.grossInputMode === 'direct') {
    if (!Number.isFinite(paycheckConfig.grossPayAmount) || (paycheckConfig.grossPayAmount ?? 0) <= 0) {
      return 'Gross pay amount is required and must be greater than 0.';
    }
  } else {
    if (!Number.isFinite(paycheckConfig.hourlyRate) || (paycheckConfig.hourlyRate ?? 0) <= 0) {
      return 'Hourly rate must be greater than 0.';
    }
    if (!Number.isFinite(paycheckConfig.hoursPerWeek) || (paycheckConfig.hoursPerWeek ?? 0) <= 0) {
      return 'Hours worked weekly must be greater than 0.';
    }
    if (!Number.isFinite(computedGrossFromHourly) || computedGrossFromHourly <= 0) {
      return 'Estimated gross pay is invalid. Check hourly rate and weekly hours.';
    }
  }

  if (hasInvalidDeductionRows(paycheckConfig.pretaxDeductions)) {
    return 'Pre-tax deductions must be non-negative and percentages must be between 0 and 100.';
  }

  if (hasInvalidDeductionRows(paycheckConfig.posttaxDeductions)) {
    return 'Post-tax deductions must be non-negative and percentages must be between 0 and 100.';
  }

  if (hasInvalidTaxRows(paycheckConfig.taxesWithheld)) {
    return 'Taxes withheld values must be non-negative and percentages must be between 0 and 100.';
  }

  if (!Number.isFinite(paycheckConfig.loanRepaymentAmount) || paycheckConfig.loanRepaymentAmount < 0) {
    return '401(k) loan repayment must be 0 or greater.';
  }

  if (!computedNetPayIsValid) {
    return 'Computed net pay is invalid. Check gross pay and deduction values.';
  }

  return null;
}

export default function SetupPage({ data, onChange, lastCloudLoadAt, onCloudLoadAtChange }: SetupPageProps) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingExpenseDraft, setEditingExpenseDraft] = useState<ExpenseDraft | null>(null);
  const [editingExpenseError, setEditingExpenseError] = useState('');
  const [cloudSyncStatus, setCloudSyncStatus] = useState('');
  const [cloudSyncBusy, setCloudSyncBusy] = useState(false);
  const [hideAnonKey, setHideAnonKey] = useState(false);
  const autoLoadAttemptKeyRef = useRef('');
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [cloudConfig, setCloudConfig] = useState<CloudSyncConfig>(() => {
    const saved = loadCloudSyncConfig();
    return {
      url: saved.url || (import.meta.env.VITE_SUPABASE_URL ?? ''),
      anonKey:
        saved.anonKey ||
        (import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_uUbF_JHdo44x33HGFRj7Cg_X5UhOMEB'),
      syncKey: saved.syncKey,
      autoSaveEnabled: saved.autoSaveEnabled ?? false,
    };
  });

  const paycheckBreakdown = useMemo(
    () => computeNetPayBreakdown(data.paycheckConfig),
    [data.paycheckConfig],
  );
  const computedGrossFromHourly = useMemo(
    () =>
      computeGrossPayFromHourly(
        data.paycheckConfig.payFrequency,
        data.paycheckConfig.hourlyRate,
        data.paycheckConfig.hoursPerWeek,
      ),
    [data.paycheckConfig.payFrequency, data.paycheckConfig.hourlyRate, data.paycheckConfig.hoursPerWeek],
  );

  const computedNetPayIsValid = Number.isFinite(paycheckBreakdown.netPay);
  const disableForecastNavigation =
    data.paycheckConfig.paycheckInputMode === 'calculate' && !computedNetPayIsValid;
  const expenseGroups = useMemo(
    () => partitionExpensesByStatus(data.expenses, new Date()),
    [data.expenses],
  );

  const updateData = (updater: (prev: AppData) => AppData) => {
    onChange(updater);
  };

  const updateCloudConfig = (updater: (prev: CloudSyncConfig) => CloudSyncConfig) => {
    setCloudConfig((prev) => {
      const next = updater(prev);
      saveCloudSyncConfig(next);
      return next;
    });
  };

  const handleSaveAndViewForecast = () => {
    const { userSettings, paycheckConfig } = data;

    if (!Number.isFinite(userSettings.startingBalance) || userSettings.startingBalance < 0) {
      setError('Starting balance must be 0 or greater.');
      return;
    }
    if (!Number.isFinite(userSettings.minimumBuffer) || userSettings.minimumBuffer < 0) {
      setError('Minimum buffer must be 0 or greater.');
      return;
    }
    if (!paycheckConfig.nextPayDate) {
      setError('Next pay date is required.');
      return;
    }

    const paycheckError = validatePaycheckConfig({
      paycheckConfig,
      computedGrossFromHourly,
      computedNetPayIsValid,
    });
    if (paycheckError) {
      setError(paycheckError);
      return;
    }

    setError('');
    navigate('/forecast');
  };

  const addExpense = (input: Omit<Expense, 'id'>) => {
    updateData((prev) => ({
      ...prev,
      expenses: [
        ...prev.expenses,
        {
          ...input,
          id: crypto.randomUUID(),
        },
      ],
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

  const updateExpense = (id: string, input: Omit<Expense, 'id'>) => {
    updateData((prev) => ({
      ...prev,
      expenses: prev.expenses.map((expense) => (expense.id === id ? { ...input, id } : expense)),
    }));
    setEditingExpenseId(null);
  };

  const updateExpenseCategory = (id: string, category: Expense['category']) => {
    updateData((prev) => ({
      ...prev,
      expenses: prev.expenses.map((expense) => (expense.id === id ? { ...expense, category } : expense)),
    }));
  };

  const deleteExpense = (id: string) => {
    updateData((prev) => ({ ...prev, expenses: prev.expenses.filter((expense) => expense.id !== id) }));
    if (editingExpenseId === id) {
      cancelEditingExpense();
    }
  };

  const restoreLatestBackup = () => {
    const latestBackup = loadLatestBackup();
    if (!latestBackup) {
      window.alert('No backup available yet.');
      return;
    }
    const confirmed = window.confirm('Restore the latest backup? This will replace current screen data.');
    if (!confirmed) {
      return;
    }
    onChange(latestBackup);
    setError('');
  };

  const latestBackupSavedAt = useMemo(() => getLatestBackupSavedAt(), [data]);

  const resetData = () => {
    const confirmed = window.confirm('Clear all saved setup and expenses? This cannot be undone.');
    if (!confirmed) {
      return;
    }
    clearAppData();
    onChange(getDefaultAppData());
    setError('');
    setEditingExpenseError('');
    setCloudSyncStatus('');
  };

  const saveToCloud = async () => {
    const configError = validateCloudSyncConfig(cloudConfig);
    if (configError) {
      setCloudSyncStatus(configError);
      return;
    }

    setCloudSyncBusy(true);
    setCloudSyncStatus('Saving to cloud...');
    try {
      const saveResult = await pushAppDataToCloudWithMeta(cloudConfig, data);
      onCloudLoadAtChange(saveResult.updatedAt ?? new Date().toISOString());
      setCloudSyncStatus(`Saved to cloud (${data.expenses.length} expenses).`);
    } catch (cloudError) {
      const message = cloudError instanceof Error ? cloudError.message : 'Cloud save failed.';
      setCloudSyncStatus(`Cloud save failed: ${message}`);
    } finally {
      setCloudSyncBusy(false);
    }
  };

  const loadFromCloud = useCallback(async () => {
    const configError = validateCloudSyncConfig(cloudConfig);
    if (configError) {
      setCloudSyncStatus(configError);
      return;
    }

    setCloudSyncBusy(true);
    setCloudSyncStatus('Loading from cloud...');
    try {
      const cloudState = await pullCloudStateFromCloud(cloudConfig);
      if (!cloudState.data) {
        setCloudSyncStatus('No cloud data found for this sync key.');
        return;
      }
      const rawCount = Array.isArray(cloudState.data.expenses) ? cloudState.data.expenses.length : 0;
      const sanitized = sanitizeAppData(cloudState.data);
      onChange(sanitized);
      onCloudLoadAtChange(cloudState.updatedAt);
      setCloudSyncStatus(
        `Loaded cloud data (${sanitized.expenses.length} expenses${rawCount !== sanitized.expenses.length ? `; ${rawCount} before cleanup` : ''}).`,
      );
    } catch (cloudError) {
      const message = cloudError instanceof Error ? cloudError.message : 'Cloud load failed.';
      setCloudSyncStatus(`Cloud load failed: ${message}`);
    } finally {
      setCloudSyncBusy(false);
    }
  }, [cloudConfig, onChange, onCloudLoadAtChange]);

  useEffect(() => {
    if (!cloudConfig.autoSaveEnabled) {
      autoLoadAttemptKeyRef.current = '';
      return;
    }

    const configError = validateCloudSyncConfig(cloudConfig);
    if (configError) {
      return;
    }

    const configSignature = `${cloudConfig.url.trim()}|${cloudConfig.anonKey.trim()}|${cloudConfig.syncKey.trim()}`;
    if (!configSignature || autoLoadAttemptKeyRef.current === configSignature) {
      return;
    }

    autoLoadAttemptKeyRef.current = configSignature;
    void loadFromCloud();
  }, [cloudConfig, loadFromCloud]);

  const pasteAnonKey = async () => {
    if (!navigator.clipboard?.readText) {
      const manual = window.prompt('Paste Supabase anon key');
      if (manual !== null) {
        updateCloudConfig((prev) => ({
          ...prev,
          anonKey: manual,
        }));
        setCloudSyncStatus('Anon key updated.');
      } else {
        setCloudSyncStatus('Clipboard paste is not supported in this browser.');
      }
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      updateCloudConfig((prev) => ({
        ...prev,
        anonKey: text,
      }));
      setCloudSyncStatus('Anon key pasted.');
    } catch {
      const manual = window.prompt('Clipboard blocked. Paste Supabase anon key manually');
      if (manual !== null) {
        updateCloudConfig((prev) => ({
          ...prev,
          anonKey: manual,
        }));
        setCloudSyncStatus('Anon key updated.');
        return;
      }
      setCloudSyncStatus('Clipboard access blocked. Allow clipboard permissions and try again.');
    }
  };

  const manualAnonKey = () => {
    const nextValue = window.prompt('Paste Supabase anon key', cloudConfig.anonKey);
    if (nextValue === null) {
      return;
    }
    updateCloudConfig((prev) => ({
      ...prev,
      anonKey: nextValue,
    }));
    setCloudSyncStatus('Anon key updated.');
  };

  const onAnonKeyPaste = (value: string) => {
    updateCloudConfig((prev) => ({
      ...prev,
      anonKey: value,
    }));
    setCloudSyncStatus('Anon key pasted.');
  };

  const exportDataToFile = () => {
    try {
      const payload = sanitizeAppData(data);
      const serialized = JSON.stringify(payload, null, 2);
      const blob = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cashflow-backup-${stamp}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setCloudSyncStatus(`Exported data (${payload.expenses.length} expenses).`);
    } catch {
      setCloudSyncStatus('Export failed.');
    }
  };

  const importDataFromFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<AppData>;
      const sanitized = sanitizeAppData(parsed);
      onChange(sanitized);
      setError('');
      setEditingExpenseError('');
      setCloudSyncStatus(`Imported data (${sanitized.expenses.length} expenses).`);
    } catch {
      setCloudSyncStatus('Import failed: invalid JSON file.');
    } finally {
      if (importFileInputRef.current) {
        importFileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Cashflow Forecasting</h1>
        <p>Set your baseline so we can project your running balance and safe-to-spend window.</p>
      </header>

      <div className="grid-two">
        <section className="panel form-grid span-two">
          <h2>Setup</h2>
          {error && <p className="error">{error}</p>}

          <label>
            Starting Balance (USD)
            <CurrencyInput
              value={data.userSettings.startingBalance}
              onValueChange={(value) =>
                updateData((prev) => ({
                  ...prev,
                  userSettings: { ...prev.userSettings, startingBalance: value ?? 0 },
                }))
              }
              showEmptyWhenZero
              required
            />
          </label>

          <label>
            Minimum Buffer (USD)
            <CurrencyInput
              value={data.userSettings.minimumBuffer}
              onValueChange={(value) =>
                updateData((prev) => ({
                  ...prev,
                  userSettings: { ...prev.userSettings, minimumBuffer: value ?? 0 },
                }))
              }
            />
          </label>
          <h3>Paycheck Setup</h3>

          <label>
            Paycheck Input Mode
            <select
              value={data.paycheckConfig.paycheckInputMode}
              onChange={(event) =>
                updateData((prev) => ({
                  ...prev,
                  paycheckConfig: {
                    ...prev.paycheckConfig,
                    paycheckInputMode: event.target.value as 'net' | 'calculate',
                  },
                }))
              }
            >
              <option value="net">I know my net pay (recommended)</option>
              <option value="calculate">Calculate my net pay from gross + withholdings</option>
            </select>
          </label>

          {data.paycheckConfig.paycheckInputMode === 'net' && (
            <label>
              Net Pay Amount (USD)
              <CurrencyInput
                value={data.paycheckConfig.netPayAmount}
                onValueChange={(value) =>
                  updateData((prev) => ({
                    ...prev,
                    paycheckConfig: { ...prev.paycheckConfig, netPayAmount: value },
                  }))
                }
                showEmptyWhenZero
                required
              />
            </label>
          )}

          {data.paycheckConfig.paycheckInputMode === 'calculate' && (
            <>
              <label>
                Gross Pay Input
                <select
                  value={data.paycheckConfig.grossInputMode}
                  onChange={(event) =>
                    updateData((prev) => ({
                      ...prev,
                      paycheckConfig: {
                        ...prev.paycheckConfig,
                        grossInputMode: event.target.value as 'direct' | 'hourly',
                      },
                    }))
                  }
                >
                  <option value="direct">Enter gross pay directly</option>
                  <option value="hourly">Calculate gross from hourly pay</option>
                </select>
              </label>

              {data.paycheckConfig.grossInputMode === 'direct' && (
                <label>
                  Gross Pay Amount (USD)
                  <CurrencyInput
                    value={data.paycheckConfig.grossPayAmount}
                    onValueChange={(value) =>
                      updateData((prev) => ({
                        ...prev,
                        paycheckConfig: { ...prev.paycheckConfig, grossPayAmount: value },
                      }))
                    }
                    showEmptyWhenZero
                    required
                  />
                </label>
              )}

              {data.paycheckConfig.grossInputMode === 'hourly' && (
                <>
                  <label>
                    Hourly Rate (USD)
                    <CurrencyInput
                      value={data.paycheckConfig.hourlyRate}
                      onValueChange={(value) =>
                        updateData((prev) => ({
                          ...prev,
                          paycheckConfig: { ...prev.paycheckConfig, hourlyRate: value },
                        }))
                      }
                      showEmptyWhenZero
                    />
                  </label>

                  <label>
                    Hours Worked Weekly
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={data.paycheckConfig.hoursPerWeek ?? ''}
                      onChange={(event) =>
                        updateData((prev) => ({
                          ...prev,
                          paycheckConfig: {
                            ...prev.paycheckConfig,
                            hoursPerWeek: event.target.value ? Number(event.target.value) : null,
                          },
                        }))
                      }
                    />
                  </label>

                  <label>
                    Estimated Gross Per Paycheck
                    <input
                      readOnly
                      value={
                        Number.isFinite(computedGrossFromHourly)
                          ? formatCurrency(computedGrossFromHourly)
                          : 'Invalid'
                      }
                    />
                  </label>
                </>
              )}

              <DeductionRowsEditor
                title="Pre-tax Deductions"
                rows={data.paycheckConfig.pretaxDeductions}
                onChange={(rows) =>
                  updateData((prev) => ({
                    ...prev,
                    paycheckConfig: { ...prev.paycheckConfig, pretaxDeductions: rows },
                  }))
                }
                exampleText="Examples: Health insurance, 401(k) traditional, HSA/FSA"
                commonNameOptions={PRETAX_DEDUCTION_OPTIONS}
                allowReorder
              />

              <TaxRowsEditor
                rows={data.paycheckConfig.taxesWithheld}
                onChange={(rows) =>
                  updateData((prev) => ({
                    ...prev,
                    paycheckConfig: { ...prev.paycheckConfig, taxesWithheld: rows },
                  }))
                }
                commonNameOptions={TAX_WITHHELD_OPTIONS}
                requiredNames={['Federal withholding', 'Social Security', 'Medicare']}
              />

              <DeductionRowsEditor
                title="Post-tax Deductions"
                rows={data.paycheckConfig.posttaxDeductions}
                onChange={(rows) =>
                  updateData((prev) => ({
                    ...prev,
                    paycheckConfig: { ...prev.paycheckConfig, posttaxDeductions: rows },
                  }))
                }
                exampleText="Examples: Roth 401(k), after-tax insurance, garnishments"
                commonNameOptions={POSTTAX_DEDUCTION_OPTIONS}
              />

              <label>
                401(k) Loan Repayment (USD)
                <CurrencyInput
                  value={data.paycheckConfig.loanRepaymentAmount}
                  onValueChange={(value) =>
                    updateData((prev) => ({
                      ...prev,
                      paycheckConfig: {
                        ...prev.paycheckConfig,
                        loanRepaymentAmount: value ?? 0,
                      },
                    }))
                  }
                />
              </label>

              <label>
                Computed Net Pay (Read-only)
                <input readOnly value={computedNetPayIsValid ? formatCurrency(paycheckBreakdown.netPay) : 'Invalid'} />
              </label>
              {computedNetPayIsValid && paycheckBreakdown.netPay < 0 && (
                <p className="error">Warning: computed net pay is below $0.00.</p>
              )}
              <p className="muted">
                For accuracy, enter tax WITHHOLDINGS as dollar amounts from your paystub.
              </p>
            </>
          )}

          <label>
            Pay Frequency
            <select
              value={data.paycheckConfig.payFrequency}
              onChange={(event) =>
                updateData((prev) => ({
                  ...prev,
                  paycheckConfig: {
                    ...prev.paycheckConfig,
                    payFrequency: event.target.value as PayFrequency,
                  },
                }))
              }
            >
              {PAY_FREQUENCY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Next Pay Date
            <input
              type="date"
              value={data.paycheckConfig.nextPayDate}
              onChange={(event) =>
                updateData((prev) => ({
                  ...prev,
                  paycheckConfig: { ...prev.paycheckConfig, nextPayDate: event.target.value },
                }))
              }
              required
            />
          </label>

          <label>
            Monthly Bonus (USD)
            <CurrencyInput
              value={data.paycheckConfig.monthlyBonusAmount ?? 0}
              onValueChange={(value) =>
                updateData((prev) => ({
                  ...prev,
                  paycheckConfig: {
                    ...prev.paycheckConfig,
                    monthlyBonusAmount: value ?? 0,
                  },
                }))
              }
              showEmptyWhenZero
            />
          </label>
          <p className="muted">Bonus posts on your last paycheck date each month.</p>
        </section>
        <ExpensesSection
          expenseGroups={expenseGroups}
          editingExpenseError={editingExpenseError}
          editingExpenseId={editingExpenseId}
          editingExpenseDraft={editingExpenseDraft}
          setEditingExpenseDraft={setEditingExpenseDraft}
          onAddExpense={addExpense}
          onStartEdit={startEditingExpense}
          onSaveEdit={saveEditingExpense}
          onCancelEdit={cancelEditingExpense}
          onDelete={deleteExpense}
          onUpdateCategory={updateExpenseCategory}
        />

        <div className="row span-two">
          <button
            type="button"
            onClick={handleSaveAndViewForecast}
            disabled={disableForecastNavigation}
            title={
              disableForecastNavigation
                ? 'Fix gross pay/deductions so computed net pay is valid before viewing forecast.'
                : undefined
            }
          >
            Save &amp; View Forecast
          </button>
          <button type="button" className="danger" onClick={resetData}>
            Reset Data
          </button>
          <button type="button" className="secondary" onClick={restoreLatestBackup}>
            Restore Last Backup
          </button>
          {latestBackupSavedAt && (
            <p className="muted">Last backup: {new Date(latestBackupSavedAt).toLocaleString()}</p>
          )}
        </div>
        <section className="panel span-two">
          <div className="row-between">
            <h2>Data Transfer</h2>
            <span className="muted">JSON backup</span>
          </div>
          <p className="muted">Export from one browser/device, then import on another.</p>
          <div className="row">
            <button type="button" className="secondary" onClick={exportDataToFile}>
              Export Data
            </button>
            <button type="button" className="secondary" onClick={() => importFileInputRef.current?.click()}>
              Import Data
            </button>
            <input
              ref={importFileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void importDataFromFile(file);
                }
              }}
            />
          </div>
        </section>
        <CloudSyncSection
          cloudConfig={cloudConfig}
          lastCloudLoadAt={lastCloudLoadAt}
          hideAnonKey={hideAnonKey}
          cloudSyncBusy={cloudSyncBusy}
          cloudSyncStatus={cloudSyncStatus}
          onToggleHideAnonKey={() => setHideAnonKey((prev) => !prev)}
          onUpdateCloudConfig={updateCloudConfig}
          onPasteAnonKey={() => void pasteAnonKey()}
          onManualAnonKey={manualAnonKey}
          onAnonKeyPaste={onAnonKeyPaste}
          onSaveToCloud={saveToCloud}
          onLoadFromCloud={loadFromCloud}
        />
      </div>
    </div>
  );
}
