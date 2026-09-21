import type { CriterionView } from '../lib/types';
import { STATUS_LABELS } from '../lib/format';
import { StatusBadge, verdictKindFor } from './StatusBadge';

/** Acceptance criteria list — plain (agreement view) or adjudicated (results view). */
export function CriteriaList({
  criteria,
  mode,
}: {
  criteria: CriterionView[];
  mode: 'agreement' | 'results';
}) {
  if (criteria.length === 0) {
    return <p className="lede" style={{ fontSize: 13 }}>No criteria defined.</p>;
  }
  return (
    <div>
      {criteria.map((c, i) => (
        <div className="crit-item" key={i}>
          <div className="crit-idx">{String(i + 1).padStart(2, '0')}</div>
          <div className="crit-text">{c.text}</div>
          {mode === 'results' && c.verdict !== 'PENDING' && (
            <div className="crit-meta">
              <StatusBadge kind={verdictKindFor(c.verdict)}>{STATUS_LABELS[c.verdict] || c.verdict}</StatusBadge>
            </div>
          )}
          {mode === 'results' && c.reason && (
            <div className="crit-reason">{c.reason}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Compact agreement preview used in the create flow. */
export function CriteriaPreview({ texts }: { texts: string[] }) {
  if (texts.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
        Add at least one criterion to define what "done" means.
      </p>
    );
  }
  return (
    <div>
      {texts.map((t, i) => (
        <div className="crit-item" key={i}>
          <div className="crit-idx">{String(i + 1).padStart(2, '0')}</div>
          <div className="crit-text">{t || <em style={{ color: 'var(--ink-faint)' }}>…</em>}</div>
        </div>
      ))}
    </div>
  );
}
