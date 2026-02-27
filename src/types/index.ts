export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
export type ExpenseRepeat = 'none' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type Category =
  | 'rent'
  | 'utilities'
  | 'debt'
  | 'phone bill'
  | 'car note'
  | 'house note'
  | 'subscriptions'
  | 'food'
  | 'transport'
  | 'health'
  | 'entertainment'
  | 'other';

export type PaycheckInputMode = 'net' | 'calculate';
export type DeductionType = 'fixed' | 'percentOfGross';
export type GrossInputMode = 'direct' | 'hourly';

export interface DeductionLine {
  id: string;
  name: string;
  type: DeductionType;
  value: number;
}

export interface TaxWithheldLine {
  id: string;
  name: string;
  type: DeductionType;
  value: number;
}

export interface UserSettings {
  startingBalance: number;
  minimumBuffer: number;
}

export interface PaycheckConfig {
  paycheckInputMode: PaycheckInputMode;
  grossInputMode: GrossInputMode;
  netPayAmount: number | null;
  grossPayAmount: number | null;
  hourlyRate: number | null;
  hoursPerWeek: number | null;
  pretaxDeductions: DeductionLine[];
  taxesWithheld: TaxWithheldLine[];
  posttaxDeductions: DeductionLine[];
  loanRepaymentAmount: number;
  payFrequency: PayFrequency;
  nextPayDate: string;
  monthlyBonusAmount?: number;
}

export interface Expense {
  id: string;
  name: string;
  amount: number;
  firstDueDate: string;
  variableDatesEnabled?: boolean;
  variableDueDates?: string[];
  repeatCount?: number;
  highlightLastEvent?: boolean;
  repeat: ExpenseRepeat;
  category: Category;
  notes?: string;
}

export interface ForecastEvent {
  id: string;
  date: string;
  type: 'income' | 'expense';
  item: string;
  category: Category | 'income';
  amount: number;
  sourceId?: string;
}

export interface ForecastRow extends ForecastEvent {
  runningBalance: number;
}

export interface PaydayMetrics {
  nextPaydayDate: string;
  balanceOnNextPayday: number;
  lowestBalanceBeforeNextPayday: number;
  safeToSpendUntilNextPayday: number;
}

export interface NetPayBreakdown {
  grossPay: number;
  pretaxTotal: number;
  taxesTotal: number;
  posttaxTotal: number;
  loanRepaymentAmount: number;
  totalWithheldDeducted: number;
  netPay: number;
}

export interface AppData {
  schemaVersion: 2;
  userSettings: UserSettings;
  paycheckConfig: PaycheckConfig;
  expenses: Expense[];
}

export interface AppDataV1 {
  version: 1;
  userSettings: UserSettings;
  paycheckConfig: {
    netPayAmount: number;
    payFrequency: PayFrequency;
    nextPayDate: string;
    monthlyBonusAmount?: number;
  };
  expenses: Expense[];
}

export interface CloudSyncConfig {
  url: string;
  anonKey: string;
  syncKey: string;
  autoSaveEnabled: boolean;
}
