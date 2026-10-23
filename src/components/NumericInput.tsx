import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Turns the stored value into display text. */
  format: (value: number | null) => string;
  /** Turns typed text into a stored value (null when empty / invalid). */
  parse: (text: string) => number | null;
  placeholder?: string;
  decimal?: boolean;
  ariaLabel: string;
  className?: string;
}

/**
 * Number field that keeps the raw text while typing (so "62." isn't reformatted
 * mid-entry) and resyncs from the stored value when not focused.
 */
export function NumericInput({ value, onChange, format, parse, placeholder, decimal, ariaLabel, className = '' }: Props) {
  const [text, setText] = useState(() => format(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      className={`input ${className}`}
      inputMode={decimal ? 'decimal' : 'numeric'}
      enterKeyHint="next"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(format(value));
      }}
      onChange={(e) => {
        const raw = decimal ? e.target.value.replace(',', '.') : e.target.value;
        if (!/^\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        onChange(parse(raw));
      }}
    />
  );
}
