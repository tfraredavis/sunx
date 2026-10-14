import { useEffect, useRef, useState } from 'react';
import { clamp } from '../lib/calc.js';

/**
 * A number that sits inside a sentence and can be edited in place.
 * Commits on blur or Enter; Escape reverts. Values are clamped to [min, max].
 */
export default function InlineNumber({
  value,
  onCommit,
  min = 0,
  max = Infinity,
  decimals = 0,
  fixed = false, // true → always show `decimals` places (e.g. 7.20)
  prefix = '',
  suffix = '',
  label,
}) {
  const display = Number.isFinite(value)
    ? fixed
      ? value.toFixed(decimals)
      : String(Number(value.toFixed(decimals)))
    : '';
  const [draft, setDraft] = useState(display);
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(display);
  }, [display, editing]);

  function commit() {
    setEditing(false);
    const n = parseFloat(String(draft).replace(/[^0-9.\-]/g, ''));
    if (!Number.isFinite(n)) {
      setDraft(display);
      return;
    }
    const factor = Math.pow(10, decimals);
    const next = clamp(Math.round(n * factor) / factor, min, max);
    setDraft(fixed ? next.toFixed(decimals) : String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <span className="inline-num">
      {prefix}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={draft}
        style={{ width: `${Math.max(1, String(draft).length) + 0.6}ch` }}
        onFocus={(e) => {
          setEditing(true);
          e.target.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') ref.current.blur();
          if (e.key === 'Escape') {
            setDraft(display);
            setEditing(false);
            setTimeout(() => ref.current?.blur());
          }
        }}
      />
      {suffix}
    </span>
  );
}
