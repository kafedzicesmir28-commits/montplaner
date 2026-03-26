'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import styles from './montatsplaner.module.css';
import type { MetricField, MonthKey } from './plannerTypes';
import { clampMonthlyTotal, daysInMonth, monthIndexFromKey, round1 } from './plannerTypes';

type NumericProps = {
  kind: 'numeric';
  year: number;
  monthKey: MonthKey;
  value: number;
  metric: MetricField;
  onCommit: (total: number) => void;
};

type TextProps = {
  kind: 'text';
  value: string;
  onCommit: (text: string) => void;
};

type Props = NumericProps | TextProps;

function parseNumericInput(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '' || t === '.') return 0;
  const n = Number(t);
  if (Number.isNaN(n)) return null;
  return n;
}

const NumericEditableCell = memo(function NumericEditableCell({
  year,
  monthKey,
  value,
  metric,
  onCommit,
}: Omit<NumericProps, 'kind'>) {
  const mi = monthIndexFromKey(monthKey);
  const dim = daysInMonth(year, mi);
  const [local, setLocal] = useState(() => round1(value).toFixed(1));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setLocal(round1(value).toFixed(1));
    }
  }, [value, focused]);

  const commit = useCallback(() => {
    const parsed = parseNumericInput(local);
    if (parsed === null) {
      setLocal(round1(value).toFixed(1));
      return;
    }
    const clamped = clampMonthlyTotal(parsed, dim);
    onCommit(clamped);
    setLocal(round1(clamped).toFixed(1));
  }, [local, dim, onCommit, value]);

  return (
    <td className={`${styles.cell} ${styles.dataCell}`}>
      <input
        className={styles.cellInput}
        type="text"
        inputMode="decimal"
        aria-label={`${metric}`}
        value={local}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '' || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
            setLocal(v);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
      />
    </td>
  );
});

const TextEditableCell = memo(function TextEditableCell({
  value,
  onCommit,
}: Omit<TextProps, 'kind'>) {
  const [local, setLocal] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setLocal(value);
  }, [value, focused]);

  return (
    <td className={`${styles.cell} ${styles.dataCell} ${styles.bemerkungCell}`}>
      <input
        className={`${styles.cellInput} ${styles.cellInputText}`}
        type="text"
        aria-label="Bemerkung"
        value={local}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onCommit(local);
        }}
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </td>
  );
});

export const EditableCell = memo(function EditableCell(props: Props) {
  if (props.kind === 'numeric') {
    const { kind: _k, ...rest } = props;
    return <NumericEditableCell {...rest} />;
  }
  const { kind: _k, ...rest } = props;
  return <TextEditableCell {...rest} />;
});
