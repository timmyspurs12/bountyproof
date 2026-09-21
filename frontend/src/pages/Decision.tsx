import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { BountyDetail } from '../lib/types';
import { fmtTs, prNumber, repoSlug } from '../lib/format';
import { Tech } from '../components/Tech';
import { StatusBadge, verdictKindFor } from '../components/StatusBadge';
import { STATUS_LABELS } from '../lib/format';

/**
 * Decision record page: the cleanest screen in the product.
 * Everything rendered here is read from the Intelligent Contract.
 */
export function Decision() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<BountyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .bounty(id)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (e.status === 404) setNotFound(true);
        else setError(e.message);
      });
  }, [id]);

  if (notFound) {
    return (
      <div className="page fade-in">
        <div className="wrap" style={{ maxWidth: 760 }}>
          <div className="empty">
            <div className="empty-title">Decision not found</div>
            <p className="empty-body">No bounty with this id exists on the contract.</p>
            <Link to="/bounties" className="btn btn-secondary">Back to bounties</Link>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page fade-in">
        <div className="wrap" style={{ maxWidth: 760 }}>
          <div className="callout error" role="alert">{error}</div>
        </div>
      </div>
    );
  }

  const b = data?.bounty;
  if (!b || !data) {
    return (
      <div className="page fade-in">
        <div className="wrap" style={{ maxWidth: 760 }}>
          <div className="skeleton" style={{ height: 240 }} />
        </div>
      </div>
    );
  }

  if (b.status !== 'RESOLVED') {
    return (
      <div className="page fade-in">
        <div className="wrap" style={{ maxWidth: 760 }}>
          <div className="callout">
            This bounty has no finalized decision yet (status: {b.status}).
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <Link to={`/bounties/${b.id}`} className="btn btn-secondary btn-sm">Back to bounty</Link>
            {b.status === 'SUBMITTED' && (
              <Link to={`/bounties/${b.id}/evaluate`} className="btn btn-primary btn-sm">Evaluate submission</Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const word =
    b.decision === 'ACCEPTED'
      ? { text: 'ACCEPTED', cls: 'accepted', note: 'Every acceptance criterion was affirmatively demonstrated by the GitHub evidence.' }
      : b.decision === 'REJECTED'
        ? { text: 'REJECTED', cls: 'rejected', note: 'One or more acceptance criteria were affirmatively contradicted by the GitHub evidence.' }
        : b.decision === 'INCONCLUSIVE'
          ? { text: 'INCONCLUSIVE', cls: 'inconclusive', note: 'The available evidence could not reliably establish at least one criterion. Neither acceptance nor rejection is forced.' }
          : { text: b.decision, cls: 'none', note: '' };

  return (
    <div className="page fade-in">
      <div className="wrap" style={{ maxWidth: 760 }}>
        <Link to={`/bounties/${b.id}`} style={{ fontSize: 12.5, color: 'var(--ink-mute)' }}>
          ← Bounty #{String(b.id).padStart(3, '0')}
        </Link>

        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <span className="eyebrow">GenLayer decision</span>
          <h1 className={`decision-word ${word.cls}`} style={{ fontSize: 40, marginTop: 14 }} role="status">
            {word.text}
          </h1>
          <p className="mono" style={{ fontSize: 15, color: 'var(--ink-mute)', marginTop: 10 }}>
            {b.satisfied}{' / '}{b.total_criteria} criteria satisfied
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '52ch', margin: '14px auto 0', lineHeight: 1.55 }}>
            {word.note}
          </p>
        </div>

        <div className="card card-pad" style={{ marginTop: 32 }}>
          <h3 className="panel-title">Decision rationale — criterion by criterion</h3>
          {b.criteria.map((c, i) => (
            <div className="crit-item" key={i}>
              <div className="crit-idx">{String(i + 1).padStart(2, '0')}</div>
              <div className="crit-text">{c.text}</div>
              <div className="crit-meta">
                <StatusBadge kind={verdictKindFor(c.verdict)}>
                  {STATUS_LABELS[c.verdict] || c.verdict}
                </StatusBadge>
              </div>
              <div className="crit-reason">
                {c.reason ? (
                  <>
                    Evidence: {c.reason}
                    {b.evidence?.head_sha && (
                      <span style={{ color: 'var(--ink-faint)' }}>
                        {' '}· PR {prNumber(b.pr_url)}, commit{' '}
                        <span className="mono">{b.evidence.head_sha.slice(0, 10)}</span>
                      </span>
                    )}
                  </>
                ) : (
                  'No rationale recorded.'
                )}
              </div>
            </div>
          ))}
          <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 14, marginBottom: 0 }}>
            Verdicts and reasons were produced by the Intelligent Contract under validator
            consensus, using only the on-chain GitHub evidence snapshot. They are stored in the
            contract state.
          </p>
        </div>

        <div className="card card-pad" style={{ marginTop: 20 }}>
          <h3 className="panel-title">On-chain record</h3>
          <dl className="kv">
            <dt>Network</dt>
            <dd>GenLayer</dd>
            {data.contract_address && (
              <>
                <dt>Contract</dt>
                <dd>
                  <a
                    className="tech"
                    href={`${data.explorer_base}/contract/${data.contract_address}`}
                    target="_blank"
                    rel="noreferrer"
                    title={data.contract_address}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.contract_address}</span>
                    <span style={{ fontSize: 11 }}>↗</span>
                  </a>
                </dd>
              </>
            )}
          </dl>
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            {data.create_tx && <TxLine label="Create" hash={data.create_tx} explorer={data.explorer_base} />}
            {data.txs.map((t) =>
              t.kind !== 'create' ? <TxLine key={t.tx_hash} label={t.kind} hash={t.tx_hash} explorer={data.explorer_base} /> : null
            )}
          </div>
          <dl className="kv" style={{ marginTop: 14 }}>
            <dt>Finalized state</dt>
            <dd>
              <StatusBadge kind={b.decision === 'ACCEPTED' ? 'ok' : b.decision === 'REJECTED' ? 'danger' : 'warn'}>
                {b.decision}
              </StatusBadge>
            </dd>
            <dt>Timestamp</dt>
            <dd className="mono">{fmtTs(b.evaluated_ts)}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

function TxLine({ label, hash, explorer }: { label: string; hash: string; explorer: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink-mute)' }}>
        {label} transaction
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Tech value={hash} display={hash.slice(0, 16) + '…'} />
        <a className="btn btn-ghost btn-sm" href={`${explorer}/transaction/${hash}`} target="_blank" rel="noreferrer">
          View ↗
        </a>
      </div>
    </div>
  );
}
