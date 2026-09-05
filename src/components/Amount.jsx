import React from 'react';
import { fm } from '../lib/format.js';

export default function Amount({ value, kind = 'out', hidden = false, fmt = fm, style }) {
  if (hidden) {
    return <span className={`m amount amount-${kind}`} style={style}>••••</span>;
  }

  let sign = '';
  let displayValue = value;

  if (kind === 'out') {
    sign = '−'; // U+2212 minus sign
    displayValue = Math.abs(value);
  } else if (kind === 'in') {
    sign = '+';
    displayValue = Math.abs(value);
  }

  const formatted = fmt(displayValue);
  const text = sign ? sign + formatted : formatted;

  return <span className={`m amount amount-${kind}`} style={style}>{text}</span>;
}
