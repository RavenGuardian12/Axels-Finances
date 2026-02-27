# Cashflow Forecasting App (v1)

Local-only React + TypeScript web app to forecast running bank balance from paycheck and expense events.

## Tech

- React 18
- TypeScript
- Vite
- localStorage persistence with schema migration

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## Deploy for Any Browser

To open this app from any computer/browser, deploy it and use the public URL.

### Option A: Netlify (fastest)

1. Run:

```bash
npm run build
```

2. Open `https://app.netlify.com/drop`
3. Drag the `dist` folder into the page
4. Use the generated URL on any browser

### Option B: Vercel

1. Push this project to GitHub
2. In Vercel, import the repo
3. Deploy (project already includes `vercel.json`)
4. Use the generated URL on any browser

Note: this app is a single-page app and includes `netlify.toml` + `vercel.json` so routing works after refresh.

## Features implemented

- Exactly 2 screens:
  - `Setup`
  - `Forecast`
- Setup captures:
  - `startingBalance`, `minimumBuffer`
  - paycheck config (`payFrequency`, `nextPayDate`)
  - paycheck input mode:
    - net mode (`netPayAmount`)
    - calculate mode (`grossPayAmount` or `hourlyRate + hoursPerWeek`, pre-tax deductions, taxes withheld, post-tax deductions, loan repayment)
  - optional monthly bonus (`monthlyBonusAmount`)
  - expense CRUD (`name`, `amount`, `firstDueDate`, `repeat`, `category`, `notes`)
- Forecast includes:
  - summary cards
  - paycheck net summary line (plus gross/withheld detail for calculator mode)
  - future bank statement table (filter: all/income/expenses)
  - running-balance line chart
  - expense CRUD directly on forecast page with instant recompute
- Persistence:
  - schema versioned localStorage (`schemaVersion: 2`)
  - migration from legacy `version: 1` data
  - optional cloud sync (Supabase REST) via Setup page
- Reset:
  - setup page reset button with confirmation

## Optional cloud sync (free tier)

You can sync data across computers using Supabase.

1. Create a Supabase project (free tier).
2. Create table:

```sql
create table if not exists app_states (
  sync_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
```

If Row Level Security is enabled (default), add policies for anon access:

```sql
alter table app_states enable row level security;

create policy "anon can read app_states"
on app_states for select
to anon
using (true);

create policy "anon can upsert app_states"
on app_states for insert
to anon
with check (true);

create policy "anon can update app_states"
on app_states for update
to anon
using (true)
with check (true);
```

3. In the app Setup page, fill:
   - Supabase URL
   - Supabase Anon Key
   - Sync Key (your private identifier)
4. Use `Save to Cloud` and `Load from Cloud`.

Optional env vars to prefill URL/key:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Core logic functions

- `computeNetPay(paycheckConfig)`
- `generateIncomeEvents(config, horizonStart, horizonEnd)`
- `generateExpenseEvents(expenses, horizonStart, horizonEnd)`
- `generateBonusEvents(config, incomeEvents)`
- `buildForecast(events, startingBalance)`
- `computeNextPaydayMetrics(forecastRows, nextPaydayDate, minimumBuffer)`

## Notes on behavior

- Horizon is fixed from today through the next 12 months.
- Income uses net pay from mode:
  - direct net amount in net mode
  - computed net from gross minus deductions/withholdings in calculator mode
- Same-day ordering is income before expenses.
- Monthly bonus events are generated on the last paycheck date of each month.
- Repeating expenses that started before today are projected forward to their next occurrences within horizon.
