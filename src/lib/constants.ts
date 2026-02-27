import { Category, ExpenseRepeat, PayFrequency } from '../types';

export const PAY_FREQUENCY_OPTIONS: PayFrequency[] = [
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
];

export const EXPENSE_REPEAT_OPTIONS: ExpenseRepeat[] = [
  'none',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
];

export const CATEGORY_OPTIONS: Category[] = [
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

export const PRETAX_DEDUCTION_OPTIONS: string[] = [
  'Health insurance',
  'Dental insurance',
  'Vision insurance',
  '401(k) traditional',
  '403(b) traditional',
  'HSA',
  'FSA',
  'Commuter benefits',
  'Life insurance',
  'Disability insurance',
  'Other',
];

export const POSTTAX_DEDUCTION_OPTIONS: string[] = [
  'Roth 401(k)',
  'Roth 403(b)',
  'After-tax insurance',
  'Union dues',
  'Garnishment',
  'Charitable contributions',
  'Parking',
  'Other',
];

export const TAX_WITHHELD_OPTIONS: string[] = [
  'Federal withholding',
  'State withholding',
  'Social Security',
  'Medicare',
  'Local tax',
  'Other',
];
