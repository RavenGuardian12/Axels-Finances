import { TaxWithheldLine } from '../types';
import CommonNameInput from './CommonNameInput';
import CurrencyInput from './CurrencyInput';

interface TaxRowsEditorProps {
  rows: TaxWithheldLine[];
  onChange: (rows: TaxWithheldLine[]) => void;
  commonNameOptions?: string[];
  requiredNames?: string[];
}

function makeRow(): TaxWithheldLine {
  return {
    id: crypto.randomUUID(),
    name: '',
    type: 'fixed',
    value: 0,
  };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function requiredId(name: string): string {
  return `required-${slug(name)}`;
}

export default function TaxRowsEditor({
  rows,
  onChange,
  commonNameOptions,
  requiredNames = [],
}: TaxRowsEditorProps) {
  const upsertRequiredRow = (name: string, updater: (current: TaxWithheldLine) => TaxWithheldLine) => {
    const rowId = requiredId(name);
    const existing = rows.find((row) => row.id === rowId);
    if (existing) {
      onChange(rows.map((row) => (row.id === rowId ? updater(row) : row)));
      return;
    }

    const initial: TaxWithheldLine = {
      id: rowId,
      name,
      type: 'fixed',
      value: 0,
    };

    onChange([
      ...rows,
      updater(initial),
    ]);
  };

  const requiredRows = requiredNames.map((name) => {
    const id = requiredId(name);
    const existing = rows.find((row) => row.id === id);
    return (
      existing ?? {
        id,
        name,
        type: 'fixed',
        value: 0,
      }
    );
  });

  const requiredIdSet = new Set(requiredNames.map((name) => requiredId(name)));
  const optionalRows = rows.filter((row) => !requiredIdSet.has(row.id));

  const updateRow = (id: string, updater: (row: TaxWithheldLine) => TaxWithheldLine) => {
    onChange(rows.map((row) => (row.id === id ? updater(row) : row)));
  };

  return (
    <div className="panel">
      <div className="row-between">
        <h3>Taxes Withheld</h3>
        <button type="button" className="secondary" onClick={() => onChange([...rows, makeRow()])}>
          Add Row
        </button>
      </div>
      <p className="muted">
        Enter tax withholdings per paycheck as fixed amounts or percentages of gross.
      </p>
      {requiredRows.map((row) => (
        <div key={row.id} className="repeatable-row repeatable-row-required">
          <input value={row.name} readOnly />
          <select
            value={row.type}
            onChange={(event) =>
              upsertRequiredRow(row.name, (current) => ({
                ...current,
                type: event.target.value as 'fixed' | 'percentOfGross',
              }))
            }
          >
            <option value="fixed">fixed</option>
            <option value="percentOfGross">% of gross</option>
          </select>
          {row.type === 'fixed' && (
            <CurrencyInput
              value={row.value}
              onValueChange={(value) =>
                upsertRequiredRow(row.name, (current) => ({
                  ...current,
                  value: value ?? 0,
                }))
              }
              showEmptyWhenZero
              placeholder="Amount"
            />
          )}
          {row.type === 'percentOfGross' && (
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={row.value}
              onChange={(event) =>
                upsertRequiredRow(row.name, (current) => ({
                  ...current,
                  value: Number(event.target.value) || 0,
                }))
              }
              placeholder="% of gross"
            />
          )}
        </div>
      ))}

      {optionalRows.length === 0 && requiredRows.length === 0 && <p className="muted">No rows yet.</p>}
      {optionalRows.map((row) => (
        <div key={row.id} className="repeatable-row">
          {!commonNameOptions && (
            <input
              placeholder="Name"
              value={row.name}
              onChange={(event) => updateRow(row.id, (current) => ({ ...current, name: event.target.value }))}
            />
          )}
          {commonNameOptions && (
            <CommonNameInput
              value={row.name}
              options={commonNameOptions}
              onChange={(value) => updateRow(row.id, (current) => ({ ...current, name: value }))}
            />
          )}
          <select
            value={row.type}
            onChange={(event) =>
              updateRow(row.id, (current) => ({
                ...current,
                type: event.target.value as 'fixed' | 'percentOfGross',
              }))
            }
          >
            <option value="fixed">fixed</option>
            <option value="percentOfGross">% of gross</option>
          </select>
          {row.type === 'fixed' && (
            <CurrencyInput
              value={row.value}
              onValueChange={(value) =>
                updateRow(row.id, (current) => ({
                  ...current,
                  value: value ?? 0,
                }))
              }
              showEmptyWhenZero
              placeholder="Amount"
            />
          )}
          {row.type === 'percentOfGross' && (
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={row.value}
              onChange={(event) =>
                updateRow(row.id, (current) => ({
                  ...current,
                  value: Number(event.target.value) || 0,
                }))
              }
              placeholder="% of gross"
            />
          )}
          <div className="repeatable-row-actions">
            <button type="button" className="danger" onClick={() => onChange(rows.filter((r) => r.id !== row.id))}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
