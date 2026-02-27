import { DeductionLine, DeductionType } from '../types';
import CommonNameInput from './CommonNameInput';
import CurrencyInput from './CurrencyInput';

interface DeductionRowsEditorProps {
  title: string;
  rows: DeductionLine[];
  onChange: (rows: DeductionLine[]) => void;
  exampleText: string;
  commonNameOptions?: string[];
  allowReorder?: boolean;
}

function makeRow(): DeductionLine {
  return {
    id: crypto.randomUUID(),
    name: '',
    type: 'fixed',
    value: 0,
  };
}

export default function DeductionRowsEditor({
  title,
  rows,
  onChange,
  exampleText,
  commonNameOptions,
  allowReorder = false,
}: DeductionRowsEditorProps) {
  const updateRow = (id: string, updater: (row: DeductionLine) => DeductionLine) => {
    onChange(rows.map((row) => (row.id === id ? updater(row) : row)));
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= rows.length) {
      return;
    }
    const nextRows = [...rows];
    const [current] = nextRows.splice(index, 1);
    nextRows.splice(nextIndex, 0, current);
    onChange(nextRows);
  };

  return (
    <div className="panel">
      <div className="row-between">
        <h3>{title}</h3>
        <button type="button" className="secondary" onClick={() => onChange([...rows, makeRow()])}>
          Add Row
        </button>
      </div>
      <p className="muted">{exampleText}</p>
      {rows.length === 0 && <p className="muted">No rows yet.</p>}
      {rows.map((row, index) => (
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
                type: event.target.value as DeductionType,
              }))
            }
          >
            <option value="fixed">fixed</option>
            <option value="percentOfGross">percentOfGross</option>
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
            {allowReorder && (
              <>
                <button
                  type="button"
                  className="secondary icon-btn"
                  onClick={() => moveRow(index, -1)}
                  disabled={index === 0}
                  aria-label="Move row up"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="secondary icon-btn"
                  onClick={() => moveRow(index, 1)}
                  disabled={index === rows.length - 1}
                  aria-label="Move row down"
                  title="Move down"
                >
                  ↓
                </button>
              </>
            )}
            <button type="button" className="danger" onClick={() => onChange(rows.filter((r) => r.id !== row.id))}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
