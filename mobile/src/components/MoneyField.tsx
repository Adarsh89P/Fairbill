import React, { useEffect, useState } from 'react';
import { currencyFor, Minor, parseMoney, toDecimalString } from '../engine/money';
import { Field } from './ui';
import { T } from './ui';

/** Text field for an amount. Commits integer minor units, or null when cleared. */
export function MoneyField({ label, value, currency, onChange, hint, warn, allowNegative, placeholder, autoFocus }: {
  label: string; value: Minor | null; currency: string; onChange: (v: Minor | null) => void; hint?: string; warn?: boolean;
  allowNegative?: boolean; placeholder?: string; autoFocus?: boolean;
}) {
  const cur = currencyFor(currency);
  const [text, setText] = useState(value === null ? '' : toDecimalString(value, cur));
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    setText((t) => {
      const parsed = t.trim() === '' ? null : parseMoney(t, cur);
      return parsed === value ? t : value === null ? '' : toDecimalString(value, cur);
    });
  }, [value, cur]);

  const commit = (t: string) => {
    if (t.trim() === '') {
      setError(undefined);
      onChange(null);
      return;
    }
    const v = parseMoney(t, cur);
    if (v === null) {
      setError(`Enter an amount like 250${cur.minorDigits ? '.50' : ''}`);
      return;
    }
    if (v < 0 && !allowNegative) {
      setError('Amount cannot be negative');
      return;
    }
    setError(undefined);
    onChange(v);
  };

  return (
    <Field
      label={label}
      value={text}
      onChangeText={(t) => {
        setText(t);
        commit(t);
      }}
      keyboardType={allowNegative ? 'numbers-and-punctuation' : 'decimal-pad'}
      placeholder={placeholder ?? (cur.minorDigits ? '0.00' : '0')}
      inputMode="decimal"
      error={error}
      hint={hint}
      warn={warn}
      autoFocus={autoFocus}
      right={<T muted>{cur.code}</T>}
    />
  );
}
