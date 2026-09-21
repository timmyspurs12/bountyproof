import type { BountyView } from '../lib/types';
import { fmtTs } from '../lib/format';
import { Tech } from './Tech';
import { StatusBadge, statusKindFor } from './StatusBadge';

const DECISION_COPY: Record<string, { word: string; tone: string; note: string }> = {
  ACCEPTED: {
    word: 'ACCEPTED',
    tone: 'accepted',
    note: 'All acceptance criteria were satisfied by the GitHub evidence.',
  },
  REJECTED: {
    word: 'REJECTED',
    tone: 'rejected',
    note: 'One or more acceptance criteria were not satisfied by the GitHub evidence.',
  },
  INCONCLUSIVE: {
    word: 'INCONCLUSIVE',
    tone: 'inconclusive',
    note: 'Available evidence was insufficient to establish at least one criterion.',
  },
};

/** Decision panel — the authoritative contract record only. */
export function DecisionPanel({ bounty }: { bounty: BountyView }) {
  const resolved = bounty.status === 'RESOLVED';
  const d = DECISION_COPY[bounty.decision];

  if (!resolved || bounty.decision === 'NONE') {
    return (
      <div className="card card-pad">
        <h3 className="panel-title">GenLayer decision</h3>
        {bounty.status === 'OPEN' ? (
          <p style={{ fontSize: 13, color: 'var(--ink-mute)' }}>
            Awaiting submission. Once a pull request is submitted, the submission can be
            evaluated against the acceptance criteria.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              <StatusBadge kind="warn">Submitted</StatusBadge>{' '}
              <span style={{ color: 'var(--ink-mute)' }}>
                Evidence has not been evaluated yet.
              </span>
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="card card-pad fade-in" aria-live="polite">
      <h3 className="panel-title">GenLayer decision</h3>
      <p className={`decision-word ${d.tone}`} role="status">
        {d.word}
      </p>
      <p className="decision-score">
        {bounty.satisfied} / {bounty.total_criteria} criteria satisfied
        {bounty.not_satisfied > 0 && <> · {bounty.not_satisfied} not satisfied</>}
        {bounty.insufficient > 0 && <> · {bounty.insufficient} insufficient</>}
      </p>
      <p style={{ fontSize: 12.5, color: 'var(--ink-mute)', marginTop: 8 }}>{d.note}</p>
      <dl className="kv" style={{ marginTop: 16 }}>
        <dt>Finalized</dt>
        <dd className="mono">{fmtTs(bounty.evaluated_ts)}</dd>
        {bounty.evidence?.head_sha && (
          <>
            <dt>Evidence commit</dt>
            <dd>
              <Tech value={bounty.evidence.head_sha} display={bounty.evidence.head_sha.slice(0, 12)} />
            </dd>
          </>
        )}
      </dl>
      <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 14 }}>
        Recorded by the Intelligent Contract under validator consensus. This panel renders
        contract state only — it is not an AI response.
      </p>
    </div>
  );
}

export function decisionBadge(value: string) {
  if (value === 'NONE') return <StatusBadge kind="neutral">—</StatusBadge>;
  return <StatusBadge kind={statusKindFor(value)}>{value}</StatusBadge>;
}
