import { Fragment, type ReactNode } from 'react';

/** nl2br(): line breaks become <br>. React escapes the text itself. */
export function Nl2br({ text }: { text: string }): ReactNode {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  return lines.map((l, i) => (
    <Fragment key={i}>{l}{i < lines.length - 1 ? <br /> : null}</Fragment>
  ));
}

export const intParam = (v: unknown): number => {
  const n = typeof v === 'string' && /^[+-]?\d+$/.test(v.trim()) ? parseInt(v, 10) : 0;
  return n > 0 ? n : 0;
};

export const numberFormat = (n: number) => n.toLocaleString('en-US');
