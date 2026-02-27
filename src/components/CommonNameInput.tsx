interface CommonNameInputProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function CommonNameInput({
  value,
  options,
  onChange,
  placeholder = 'Other (type name)',
}: CommonNameInputProps) {
  const showCustomInput = value === '' || !options.includes(value);
  const selectedValue = showCustomInput ? 'Other' : value;

  return (
    <div className="stack">
      <select
        value={selectedValue}
        onChange={(event) => {
          const selected = event.target.value;
          if (selected === 'Other') {
            onChange('');
            return;
          }
          onChange(selected);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {showCustomInput && <input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />}
    </div>
  );
}
