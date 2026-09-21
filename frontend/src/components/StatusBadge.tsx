import type { ReactNode } from 'react';

function tone(kind: string): string {
  switch (kind) {
    case 'ok':
      return 'badge-ok';
    case 'warn':
      return 'badge-warn';
    case 'danger':
      return 'badge-danger';
    case 'accent':
      return 'badge-accent';
    default:
      return 'badge-neutral';
  }
}

/**
 * Status badge. Never relies on color alone: every state carries text,
 * and a dot glyph marks state for assistive clarity.
 */
export function StatusBadge({
  kind,
  children,
  mono,
  title,
}: {
  kind: 'neutral' | 'ok' | 'warn' | 'danger' | 'accent';
  children: ReactNode;
  mono?: boolean;
  title?: string;
}) {
  return (
    <span className={`badge ${tone(kind)}${mono ? ' badge-mono' : ''}`} title={title}>
      <span className="bdot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function statusKindFor(value: string): 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' {
  switch (value) {
    case 'OPEN':
      return 'accent';
    case 'SUBMITTED':
      return 'warn';
    case 'RESOLVED':
      return 'ok';
    case 'ACCEPTED':
      return 'ok';
    case 'REJECTED':
      return 'danger';
    case 'INCONCLUSIVE':
      return 'warn';
    case 'NONE':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function verdictKindFor(
  verdict: string
): 'neutral' | 'ok' | 'warn' | 'danger' {
  switch (verdict) {
    case 'SATISFIED':
      return 'ok';
    case 'NOT_SATISFIED':
      return 'danger';
    case 'INSUFFICIENT_EVIDENCE':
      return 'warn';
    default:
      return 'neutral';
  }
}
