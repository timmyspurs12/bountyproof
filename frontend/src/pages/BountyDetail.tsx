import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { BountyDetail } from '../lib/types';
import { fmtDate, fmtTs, prNumber, repoSlug } from '../lib/format';
import { StatusBadge, statusKindFor } from '../components/StatusBadge';
import { decisionBadge } from '../components/DecisionPanel';
import { CriteriaList } from '../components/Criteria';
import { OnChainEvidence } from '../components/EvidencePanel';
import { Tech } from '../components/Tech';

const STAGES = ['AGREEMENT', 'SUBMISSION', 'EVIDENCE', 'GENLAYER', 'FINAL DECISION'];

export function BountyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<BountyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reload, setReload] = useState(0);

  const load = useCallback(() => {
    if (!id) return;
    api
      .bounty(id)
      .then((d) => {
        setData(d);
        setError(null);
        setNotFound(false);
      })
      .catch((e) => {
        if (e.status === 404) setNotFound(true);
        else setError(e.message);
      });
  }, [id]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 15000);
    return () => window.clearInterval(t);
  }, [load, reload]);

  if (notFound) {
    return (
      <div className="page fade-in">
        <div className="wrap" style={{ maxWidth: 720 }}>
          <div className="empty">
            <div className="empty-title">Bounty not found</div>
            <p className="empty-body">
              The contract does not hold a bounty with this id. It may not have been published
              yet, or the publish transaction did not reach consensus.
            </p>
            <Link to="/bounties" className="btn btn-secondary">
              Back to bounties
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const b = data?.bounty;

  return (
    <div className="page fade-in">
      <div className="wrap">
        {!data && !error && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="skeleton" style={{ height: 22, width: '40%' }} />
            <div className="skeleton" style={{ height: 14, width: '65%' }} />
            <div className="skeleton" style={{ height: 90 }} />
            <div className="skeleton" style={{ height: 260 }} />
          </div>
        )}

        {error && (
          <div className="callout error" role="alert" style={{ marginBottom: 16 }}>
            {error}{' '}
            <button className="btn btn-ghost btn-sm" onClick={() => setReload((n) => n + 1)}>
              Retry
            </button>
          </div>
        )}

        {b && data && (
          <>
            {/* header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                  BOUNTY #{String(b.id).padStart(3, '0')}
                </div>
                <h1 className="page-title" style={{ marginTop: 6 }}>{b.title}</h1>
                <p className="lede" style={{ marginBottom: 0 }}>
                  {b.description || 'No description provided.'}
                </p>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <StatusBadge kind={statusKindFor(b.status)}>{b.status}</StatusBadge>
                {b.status === 'RESOLVED' && decisionBadge(b.decision)}
              </div>
            </div>

            {/* signature pipeline: AGREEMENT → SUBMISSION → EVIDENCE → GENLAYER → FINAL DECISION */}
            <div className="pipeline" aria-label="Bounty pipeline">
              {STAGES.map((name, i) => {
                const state = stageState(b, i);
                return (
                  <div className={`stage ${state}`} key={name}>
                    <div className="bar" />
                    <div className="node" />
                    <div className="stage-name">{name}</div>
                    <div className="stage-state">{stageText(b, i)}</div>
                  </div>
                );
              })}
            </div>

            {/* repository + PR */}
            <div className="card card-pad" style={{ marginBottom: 20 }}>
              <div className="grid-2" style={{ gap: 20 }}>
                <div>
                  <h3 className="panel-title">Repository</h3>
                  <a
                    href={b.repository_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mono"
                    style={{ fontSize: 13, color: 'var(--accent-ink)' }}
                  >
                    {repoSlug(b.repository_url)}
                  </a>
                  {b.issue_url && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-mute)' }}>
                      Reference:{' '}
                      <a href={b.issue_url} target="_blank" rel="noreferrer" className="mono">
                        {b.issue_url.replace('https://github.com/', '')}
                      </a>
                    </div>
                  )}
                  <dl className="kv" style={{ marginTop: 14 }}>
                    <dt>Created</dt>
                    <dd className="mono">{fmtTs(b.created_ts)}</dd>
                    <dt>Deadline</dt>
                    <dd className="mono">{fmtDate(b.deadline_ts)}</dd>
                    <dt>Creator</dt>
                    <dd><Tech value={b.creator} display={b.creator.slice(0, 10) + '…'} /></dd>
                  </dl>
                </div>
                <div>
                  <h3 className="panel-title">Pull request</h3>
                  {b.pr_url ? (
                    <>
                      <a
                        href={b.pr_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--accent-ink)', fontWeight: 600, fontSize: 13.5 }}
                      >
                        {prNumber(b.pr_url)}
                        {b.evidence?.pr_title && <> — {b.evidence.pr_title}</>}
                      </a>
                      <dl className="kv" style={{ marginTop: 14 }}>
                        <dt>Claimant</dt>
                        <dd><Tech value={b.claimant} display={b.claimant.slice(0, 10) + '…'} /></dd>
                        <dt>Submitted</dt>
                        <dd className="mono">{fmtTs(b.submitted_ts)}</dd>
                        <dt>Deadline check</dt>
                        <dd>
                          {b.late_submission === 'true' ? (
                            <StatusBadge kind="warn">Submitted after deadline</StatusBadge>
                          ) : (
                            <StatusBadge kind="ok">Submitted before deadline</StatusBadge>
                          )}
                        </dd>
                      </dl>
                    </>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--ink-mute)' }}>
                      No submission yet.{' '}
                      <Link to={`/bounties/${b.id}/submit`} style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>
                        Submit a pull request →
                      </Link>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* three columns: criteria / evidence / decision (stacked on mobile: decision first) */}
            <div className="detail-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 20, alignItems: 'start' }}>
              <div className="detail-col-criteria" style={{ order: 2 }}>
                <div className="card card-pad">
                  <h3 className="panel-title">Acceptance criteria</h3>
                  <CriteriaList criteria={b.criteria} mode={b.status === 'RESOLVED' ? 'results' : 'agreement'} />
                </div>
              </div>

              <div className="detail-col-evidence" style={{ order: 3 }}>
                <div className="card card-pad">
                  <h3 className="panel-title">Evidence</h3>
                  <OnChainEvidence ev={b.evidence} prUrl={b.pr_url} />
                  {b.status === 'SUBMITTED' && (
                    <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 14 }}>
                      The on-chain snapshot appears once the evaluation transaction is accepted.
                      A live GitHub snapshot is shown on the submit and evaluate screens.
                    </p>
                  )}
                </div>
              </div>

              <div className="detail-col-decision" style={{ order: 1 }}>
                <DecisionCard b={b} onNavigate={navigate} explorerBase={data.explorer_base} txs={data.txs} createTx={data.create_tx} />
              </div>
            </div>
          </>
        )}
      </div>
      <style>{`
        @media (max-width: 1000px) {
          .detail-cols { grid-template-columns: 1fr !important; }
          .detail-col-decision { order: 1 !important; }
          .detail-col-criteria { order: 2 !important; }
          .detail-col-evidence { order: 3 !important; }
          .pipeline { flex-wrap: wrap; row-gap: 22px; }
          .pipeline .stage { flex: 1 1 30%; }
        }
      `}</style>
    </div>
  );
}

function stageState(b: BountyDetail['bounty'], i: number): string {
  switch (i) {
    case 0:
      return 'done'; // agreement exists
    case 1:
      return b.status === 'OPEN' ? 'pending' : 'done';
    case 2:
      return b.status === 'OPEN' ? 'pending' : b.status === 'SUBMITTED' ? 'current' : 'done';
    case 3:
      return b.status === 'SUBMITTED' ? 'current' : b.status === 'RESOLVED' ? 'done' : 'pending';
    case 4:
      return b.status === 'RESOLVED' ? 'done' : 'pending';
    default:
      return 'pending';
  }
}

function stageText(b: BountyDetail['bounty'], i: number): string {
  switch (i) {
    case 0:
      return `${b.total_criteria} criteria`;
    case 1:
      return b.status === 'OPEN' ? 'awaiting PR' : prNumber(b.pr_url) || 'submitted';
    case 2:
      return b.evidence?.head_sha ? `commit ${b.evidence.head_sha.slice(0, 8)}` : 'on-chain fetch';
    case 3:
      return b.status === 'RESOLVED' ? 'consensus reached' : b.status === 'SUBMITTED' ? 'ready to evaluate' : '—';
    case 4:
      return b.status === 'RESOLVED' ? b.decision : '—';
    default:
      return '';
  }
}

function DecisionCard({
  b,
  onNavigate,
  explorerBase,
  txs,
  createTx,
}: {
  b: BountyDetail['bounty'];
  onNavigate: (p: string) => void;
  explorerBase: string;
  txs: { tx_hash: string; kind: string }[];
  createTx: string | null;
}) {
  if (b.status === 'OPEN') {
    return (
      <div className="card card-pad">
        <h3 className="panel-title">GenLayer decision</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-mute)' }}>
          Awaiting submission. The decision appears only after a submission is evaluated.
        </p>
        <Link to={`/bounties/${b.id}/submit`} className="btn btn-primary" style={{ marginTop: 14 }}>
          Submit submission
        </Link>
      </div>
    );
  }

  if (b.status === 'SUBMITTED') {
    return (
      <div className="card card-pad">
        <h3 className="panel-title">GenLayer decision</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          Submission received. The decision is produced when the evaluation transaction runs —
          evidence is fetched on-chain and each criterion is adjudicated under validator
          consensus.
        </p>
        <button
          className="btn btn-primary"
          style={{ marginTop: 14 }}
          onClick={() => onNavigate(`/bounties/${b.id}/evaluate`)}
        >
          Evaluate submission
        </button>
      </div>
    );
  }

  const d =
    b.decision === 'ACCEPTED'
      ? { word: 'ACCEPTED', cls: 'accepted', note: 'All criteria satisfied by the evidence.' }
      : b.decision === 'REJECTED'
        ? { word: 'REJECTED', cls: 'rejected', note: 'One or more criteria were not satisfied by the evidence.' }
        : b.decision === 'INCONCLUSIVE'
          ? { word: 'INCONCLUSIVE', cls: 'inconclusive', note: 'Evidence was insufficient for at least one criterion.' }
          : { word: b.decision, cls: 'none', note: '' };

  return (
    <div className="card card-pad fade-in">
      <h3 className="panel-title">GenLayer decision</h3>
      <p className={`decision-word ${d.cls}`} style={{ fontSize: 24 }} role="status">
        {d.word}
      </p>
      <p className="decision-score">
        {b.satisfied} / {b.total_criteria} criteria satisfied
      </p>
      <p style={{ fontSize: 12.5, color: 'var(--ink-mute)', marginTop: 8 }}>{d.note}</p>
      <dl className="kv" style={{ marginTop: 14 }}>
        <dt>Finalized</dt>
        <dd className="mono">{fmtTs(b.evaluated_ts)}</dd>
      </dl>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <Link to={`/decisions/${b.id}`} className="btn btn-primary btn-sm">
          View decision record
        </Link>
      </div>

      {/* on-chain record */}
      <div className="divider" />
      <h3 className="panel-title">On-chain record</h3>
      <dl className="kv">
        {createTx && (
          <>
            <dt>Create tx</dt>
            <dd>
              <Tech value={createTx} display={createTx.slice(0, 14) + '…'} />
            </dd>
          </>
        )}
        {txs.map((t) => (
          <FragmentRow key={t.tx_hash} kind={t.kind} hash={t.tx_hash} explorerBase={explorerBase} />
        ))}
      </dl>
    </div>
  );
}

function FragmentRow({ kind, hash, explorerBase }: { kind: string; hash: string; explorerBase: string }) {
  if (kind === 'create') return null;
  return (
    <>
      <dt>{kind} tx</dt>
      <dd>
        <a
          href={`${explorerBase}/transaction/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="tech"
          style={{ textDecoration: 'none' }}
          title={hash}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{hash.slice(0, 14)}…</span>
          <span style={{ fontSize: 11 }}>↗</span>
        </a>
      </dd>
    </>
  );
}
