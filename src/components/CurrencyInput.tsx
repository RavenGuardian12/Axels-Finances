import { InputHTMLAttributes, useEffect, useState } from 'react';
import { formatCurrency, parseCurrencyInput } from '../lib/format';

interface CurrencyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null;
  onValueChange: (value: number | null) => void;
  showEmptyWhenZero?: boolean;
}

function toEditableValue(value: number | null, showEmptyWhenZero: boolean): string {
  if (value === null || !Number.isFinite(value) || (showEmptyWhenZero && value === 0)) {
    return '';
  }
  return String(value);
}

function toDisplayValue(value: number | null, showEmptyWhenZero: boolean): string {
  if (value === null || !Number.isFinite(value) || (showEmptyWhenZero && value === 0)) {
    return '';
  }
  return formatCurrency(value);
}

export default function CurrencyInput({
  value,
  onValueChange,
  showEmptyWhenZero = false,
  ...props
}: CurrencyInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [text, setText] = useState(toDisplayValue(value, showEmptyWhenZero));

  useEffect(() => {
    if (!isFocused) {
      setText(toDisplayValue(value, showEmptyWhenZero));
    }
  }, [value, isFocused, showEmptyWhenZero]);

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={() => {
        setIsFocused(true);
        setText(toEditableValue(value, showEmptyWhenZero));
      }}
      onChange={(event) => {
        const nextText = event.target.value;
        setText(nextText);

        if (!nextText.trim()) {
          onValueChange(null);
          return;
        }

        const parsed = parseCurrencyInput(nextText);
        if (Number.isFinite(parsed)) {
          onValueChange(parsed);
        }
      }}
      onBlur={() => {
        setIsFocused(false);
        if (!text.trim()) {
          onValueChange(null);
          setText('');
          return;
        }
        setText(toDisplayValue(value, showEmptyWhenZero));
      }}
    />
  );
}
