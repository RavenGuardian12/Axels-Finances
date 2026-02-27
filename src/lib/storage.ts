import {
  AppData,
  AppDataV1,
  CloudSyncConfig,
  DeductionLine,
  Expense,
  PaycheckConfig,
  TaxWithheldLine,
  UserSettings,
} from '../types';

const STORAGE_KEY = 'cashflow_forecast_v1';
const BACKUP_KEY = 'cashflow_forecast_backups_v1';
const CLOUD_SYNC_CONFIG_KEY = 'cashflow_cloud_sync_config_v1';
const MAX_BACKUPS = 20;
const VALID_EXPENSE_CATEGORIES: Expense['category'][] = [
  'rent',
  'utilities',
  'debt',
  'phone bill',
  'car note',
  'house note',
  'subscriptions',
  'food',
  'transport',
  'health',
  'entertainment',
  'other',
];

export const DEFAULT_SETTINGS: UserSettings = {
  startingBalance: 0,
  minimumBuffer: 200,
};

export const DEFAULT_PAYCHECK: PaycheckConfig = {
  paycheckInputMode: 'net',
  grossInputMode: 'direct',
  netPayAmount: null,
  grossPayAmount: null,
  hourlyRate: null,
  hoursPerWeek: null,
  pretaxDeductions: [],
  taxesWithheld: [],
  posttaxDeductions: [],
  loanRepaymentAmount: 0,
  payFrequency: 'biweekly',
  nextPayDate: '',
  monthlyBonusAmount: 0,
};

export const DEFAULT_EXPENSES: Expense[] = [];

export function getDefaultAppData(): AppData {
  return {
    schemaVersion: 2,
    userSettings: DEFAULT_SETTINGS,
    paycheckConfig: DEFAULT_PAYCHECK,
    expenses: DEFAULT_EXPENSES,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeSettings(input: Partial<UserSettings> | undefined): UserSettings {
  return {
    startingBalance: isFiniteNumber(input?.startingBalance) ? input.startingBalance : 0,
    minimumBuffer: isFiniteNumber(input?.minimumBuffer) ? input.minimumBuffer : 200,
  };
}

function sanitizeDeductionLines(input: unknown): DeductionLine[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((raw) => {
      const line = raw as Partial<DeductionLine>;
      if (
        typeof line.id !== 'string' ||
        typeof line.name !== 'string' ||
        (line.type !== 'fixed' && line.type !== 'percentOfGross') ||
        !isFiniteNumber(line.value) ||
        line.value < 0
      ) {
        return null;
      }

      return {
        id: line.id,
        name: line.name,
        type: line.type,
        value: line.value,
      };
    })
    .filter((line): line is DeductionLine => line !== null);
}

function sanitizeTaxesWithheld(input: unknown): TaxWithheldLine[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((raw) => {
      const line = raw as Partial<TaxWithheldLine>;
      const legacyAmount = (raw as { amount?: unknown }).amount;
      const normalizedType =
        line.type === 'fixed' || line.type === 'percentOfGross' ? line.type : 'fixed';
      const normalizedValue = isFiniteNumber(line.value)
        ? line.value
        : isFiniteNumber(legacyAmount)
          ? legacyAmount
          : Number.NaN;
      if (
        typeof line.id !== 'string' ||
        typeof line.name !== 'string' ||
        !isFiniteNumber(normalizedValue) ||
        normalizedValue < 0
      ) {
        return null;
      }

      return {
        id: line.id,
        name: line.name,
        type: normalizedType,
        value: normalizedValue,
      };
    })
    .filter((line): line is TaxWithheldLine => line !== null);
}

function sanitizePaycheck(input: Partial<PaycheckConfig> | undefined): PaycheckConfig {
  return {
    paycheckInputMode: input?.paycheckInputMode === 'calculate' ? 'calculate' : 'net',
    grossInputMode: input?.grossInputMode === 'hourly' ? 'hourly' : 'direct',
    netPayAmount: isFiniteNumber(input?.netPayAmount) ? input.netPayAmount : null,
    grossPayAmount: isFiniteNumber(input?.grossPayAmount) ? input.grossPayAmount : null,
    hourlyRate: isFiniteNumber(input?.hourlyRate) ? input.hourlyRate : null,
    hoursPerWeek: isFiniteNumber(input?.hoursPerWeek) ? input.hoursPerWeek : null,
    pretaxDeductions: sanitizeDeductionLines(input?.pretaxDeductions),
    taxesWithheld: sanitizeTaxesWithheld(input?.taxesWithheld),
    posttaxDeductions: sanitizeDeductionLines(input?.posttaxDeductions),
    loanRepaymentAmount: isFiniteNumber(input?.loanRepaymentAmount)
      ? Math.max(0, input.loanRepaymentAmount)
      : 0,
    payFrequency:
      input?.payFrequency === 'weekly' ||
      input?.payFrequency === 'biweekly' ||
      input?.payFrequency === 'semimonthly' ||
      input?.payFrequency === 'monthly'
        ? input.payFrequency
        : 'biweekly',
    nextPayDate: typeof input?.nextPayDate === 'string' ? input.nextPayDate : '',
    monthlyBonusAmount: isFiniteNumber(input?.monthlyBonusAmount) ? Math.max(0, input.monthlyBonusAmount) : 0,
  };
}

function sanitizeExpenses(input: unknown): Expense[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const expenses: Expense[] = [];

  input.forEach((expense) => {
    const e = expense as Partial<Expense>;
    const rawRepeatCount = (expense as { repeatCount?: unknown }).repeatCount;
    const repeatCount =
      isFiniteNumber(rawRepeatCount) && rawRepeatCount > 0 ? Math.floor(rawRepeatCount) : undefined;
    const rawVariableDueDates = (expense as { variableDueDates?: unknown }).variableDueDates;
    const variableDueDates = Array.isArray(rawVariableDueDates)
      ? rawVariableDueDates.filter((date): date is string => typeof date === 'string' && date.length > 0)
      : [];
    const variableDatesEnabled = Boolean((expense as { variableDatesEnabled?: unknown }).variableDatesEnabled);
    const rawCategory = (expense as { category?: unknown }).category;
    const normalizedCategoryInput =
      typeof rawCategory === 'string'
        ? rawCategory.trim().toLowerCase()
        : typeof e.category === 'string'
          ? e.category.trim().toLowerCase()
          : 'other';
    const normalizedCategory = normalizedCategoryInput === 'care note' ? 'car note' : normalizedCategoryInput;
    const category = VALID_EXPENSE_CATEGORIES.includes(normalizedCategory as Expense['category'])
      ? (normalizedCategory as Expense['category'])
      : 'other';
    const normalizedRepeat =
      e.repeat === 'none' ||
      e.repeat === 'weekly' ||
      e.repeat === 'biweekly' ||
      e.repeat === 'monthly' ||
      e.repeat === 'yearly'
        ? e.repeat
        : 'none';
    const rawLegacyDueDate = (expense as { dueDate?: unknown }).dueDate;
    const legacyDueDate = typeof rawLegacyDueDate === 'string' && rawLegacyDueDate.length > 0 ? rawLegacyDueDate : '';
    const firstDueDate =
      typeof e.firstDueDate === 'string' && e.firstDueDate.length > 0
        ? e.firstDueDate
        : legacyDueDate
          ? legacyDueDate
          : variableDatesEnabled && variableDueDates.length > 0
            ? [...variableDueDates].sort((a, b) => a.localeCompare(b))[0]
            : '';
    if (
      typeof e.id !== 'string' ||
      typeof e.name !== 'string' ||
      !isFiniteNumber(e.amount) ||
      !firstDueDate
    ) {
      return;
    }

    const rawHighlightLastEvent = (expense as { highlightLastEvent?: unknown }).highlightLastEvent;
    expenses.push({
      id: e.id,
      name: e.name,
      amount: e.amount,
      firstDueDate,
      variableDatesEnabled,
      variableDueDates: variableDatesEnabled ? variableDueDates : [],
      repeatCount,
      highlightLastEvent: rawHighlightLastEvent === false ? false : true,
      repeat: normalizedRepeat,
      category,
      notes: typeof e.notes === 'string' ? e.notes : '',
    });
  });

  return expenses;
}

function migrateV1ToV2(oldData: AppDataV1): AppData {
  return {
    schemaVersion: 2,
    userSettings: sanitizeSettings(oldData.userSettings),
    paycheckConfig: sanitizePaycheck({
      paycheckInputMode: 'net',
      grossInputMode: 'direct',
      netPayAmount: oldData.paycheckConfig?.netPayAmount ?? null,
      grossPayAmount: null,
      hourlyRate: null,
      hoursPerWeek: null,
      pretaxDeductions: [],
      taxesWithheld: [],
      posttaxDeductions: [],
      loanRepaymentAmount: 0,
      payFrequency: oldData.paycheckConfig?.payFrequency,
      nextPayDate: oldData.paycheckConfig?.nextPayDate,
      monthlyBonusAmount: oldData.paycheckConfig?.monthlyBonusAmount,
    }),
    expenses: sanitizeExpenses(oldData.expenses),
  };
}

export function sanitizeAppData(input: Partial<AppData>): AppData {
  return {
    schemaVersion: 2,
    userSettings: sanitizeSettings(input.userSettings),
    paycheckConfig: sanitizePaycheck(input.paycheckConfig),
    expenses: sanitizeExpenses(input.expenses),
  };
}

interface BackupEntry {
  savedAt: string;
  payload: AppData;
}

function loadBackups(): BackupEntry[] {
  const raw = localStorage.getItem(BACKUP_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        const entry = item as Partial<BackupEntry>;
        if (typeof entry.savedAt !== 'string' || !entry.payload || (entry.payload as AppData).schemaVersion !== 2) {
          return null;
        }
        return {
          savedAt: entry.savedAt,
          payload: sanitizeAppData(entry.payload),
        };
      })
      .filter((entry): entry is BackupEntry => entry !== null);
  } catch {
    return [];
  }
}

export function loadAppData(): AppData {
  const fallback = getDefaultAppData();

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppData> & Partial<AppDataV1>;

    if (parsed.schemaVersion === 2) {
      return sanitizeAppData(parsed);
    }

    if (parsed.version === 1 && parsed.paycheckConfig && parsed.userSettings) {
      return migrateV1ToV2(parsed as AppDataV1);
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export function saveAppData(data: AppData): void {
  const sanitized = sanitizeAppData(data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));

  const backups = loadBackups();
  const latest = backups[backups.length - 1];
  const latestSerialized = latest ? JSON.stringify(latest.payload) : null;
  const nextSerialized = JSON.stringify(sanitized);
  if (latestSerialized === nextSerialized) {
    return;
  }

  const nextBackups = [
    ...backups,
    {
      savedAt: new Date().toISOString(),
      payload: sanitized,
    },
  ].slice(-MAX_BACKUPS);

  localStorage.setItem(BACKUP_KEY, JSON.stringify(nextBackups));
}

export function getLatestBackupSavedAt(): string | null {
  const backups = loadBackups();
  return backups.length ? backups[backups.length - 1].savedAt : null;
}

export function loadLatestBackup(): AppData | null {
  const backups = loadBackups();
  if (!backups.length) {
    return null;
  }
  return backups[backups.length - 1].payload;
}

export function clearAppData(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(BACKUP_KEY);
}

export function loadCloudSyncConfig(): CloudSyncConfig {
  const fallback: CloudSyncConfig = {
    url: '',
    anonKey: '',
    syncKey: '',
    autoSaveEnabled: false,
  };

  const raw = localStorage.getItem(CLOUD_SYNC_CONFIG_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CloudSyncConfig>;
    return {
      url: typeof parsed.url === 'string' ? parsed.url : '',
      anonKey: typeof parsed.anonKey === 'string' ? parsed.anonKey : '',
      syncKey: typeof parsed.syncKey === 'string' ? parsed.syncKey : '',
      autoSaveEnabled: Boolean(parsed.autoSaveEnabled),
    };
  } catch {
    return fallback;
  }
}

export function saveCloudSyncConfig(config: CloudSyncConfig): void {
  localStorage.setItem(
    CLOUD_SYNC_CONFIG_KEY,
    JSON.stringify({
        url: config.url,
        anonKey: config.anonKey,
        syncKey: config.syncKey,
        autoSaveEnabled: Boolean(config.autoSaveEnabled),
    }),
  );
}
