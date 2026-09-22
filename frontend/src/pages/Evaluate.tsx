import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import { writeContract } from '../lib/genlayer';
import type { AppConfig, BountyDetail } from '../lib/types';
import { prNumber, repoSlug, voteCounts } from '../lib/format';
import type { WalletApi } from '../hooks/useWallet';
import { useTxLifecycle } from '../components/Lifecycle';
import type { Step } from '../components/Lifecycle';
import { CriteriaList } from '../components/Criteria';
import { StatusBadge, verdictKindFor } from '../components/StatusBadge';
import { GitHubSnapshot } from '../components/EvidencePanel';
import type { EvidencePreview } from '../lib/types';

interface Ctx {
  config: AppConfig | null;
  cfgLoading: boolean;
  wallet: WalletApi;
}

const STAGE_NAMES = ['READING AGREEMENT', 'COLLECTING EVIDENCE', 'EVALUATING CRITERIA', 'GENLAYER CONSENSUS', 'FINALIZED'];

export function Evaluate() {
  const { id } = useParams<{ id: string }>();
  const { config, wallet } = useOutletContext<Ctx>();
  const navigate = useNavigate();

  const [bounty, setBounty] = useState<BountyDetail['bounty'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const { tx, polling } = useTxLifecycle(txHash);

  // live GitHub snapshot for the "collecting evidence" stage (display)
  const [evidence, setEvidence] = useState<EvidencePreview | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  // progressive reveal of real verdicts after finalization
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!id) return;
    api.bounty(id).then((d) => setBounty(d.bounty)).catch((e) => setError(e.message));
  }, [id]);

  const evaluated = bounty && bounty.status === 'RESOLVED';

  const accepted =
    tx && ['ACCEPTED', 'FINALIZED'].includes(tx.status_name.toUpperCase()) && tx.result_name === 'MAJORITY_AGREE';
  const failed =
    tx &&
    (['FAILED', 'UNDETERMINED'].includes(tx.status_name.toUpperCase()) ||
      (tx.result_name === 'NO_MAJORITY' && ['ACCEPTED', 'FINALIZED'].includes(tx.status_name.toUpperCase())));
  const pending = !!txHash && !accepted && !failed;

  const votes = tx ? voteCounts(tx.votes) : null;

  useEffect(() => {
    if (!bounty || bounty.status !== 'SUBMITTED') return;
    api
      .evidence(bounty.repository_url, bounty.pr_url)
      .then((p) => setEvidence(p))
      .catch((e) => setEvidenceError(e.message));
  }, [bounty]);

  // after the tx finalizes, re-read the contract and reveal criteria progressively
  useEffect(() => {
    if (!accepted || !id) return;
    api
      .bounty(id)
      .then((d) => setBounty(d.bounty))
      .catch(() => undefined);
    setRevealed(0);
    const t = window.setInterval(() => {
      setRevealed((r) => {
        if (r >= (bounty?.criteria.length || 0)) {
          window.clearInterval(t);
          return r;
        }
        return r + 1;
      });
    }, 350);
    return () => window.clearInterval(t);
  }, [accepted, id]);

  // auto-navigate once fully revealed
  const total = bounty?.criteria.length || 0;
  useEffect(() => {
    if (accepted && revealed >= total && total > 0) {
      const t = window.setTimeout(() => navigate(`/bounties/${id}`), 900);
      return () => window.clearTimeout(t);
    }
  }, [accepted, revealed, total, id, navigate]);

  const stage = useMemo(() => {
    if (!bounty) return 0;
    if (evaluated) return 5; // all steps done — read straight from contract state
    if (accepted && revealed > 0) return 5;
    if (accepted) return 4;
    if (txHash) return 3;
    if (starting) return 3;
    if (evidence || evidenceError) return 2;
    return 1;
  }, [bounty, evaluated, accepted, revealed, txHash, starting, evidence, evidenceError]);

  const stageState = (i: number): 'done' | 'active' | 'pending' | 'failed' => {
    if (failed && i === 3) return 'failed';
    if (i < stage) return 'done';
    if (i === stage) return 'active';
    return 'pending';
  };

  if (!bounty) {
    return (
      <div className="page fade-in">
        <div className="wrap" style={{ maxWidth: 760 }}>
          {error ? <div className="callout error" role="alert">{error}</div> : <div className="skeleton" style={{ height: 220 }} />}
        </div>
      </div>
    );
  }

  if (bounty.status === 'OPEN') {
    return (
      <div className="page fade-in">
        <div className="wrap" style={{ maxWidth: 760 }}>
          <div className="callout">
            This bounty has no submission yet. Submit a pull request first.
          </div>
          <Link to={`/bounties/${bounty.id}/submit`} className="btn btn-primary btn-sm" style={{ marginTop: 14 }}>
            Submit a pull request
          </Link>
        </div>
      </div>
    );
  }

  async function startEvaluation() {
    if (!config) return setError('Network configuration not loaded yet.');
    if (!wallet.address) return setError('Connect a wallet to sign the evaluation transaction.');
    if (evaluated) return;
    setStarting(true);
    setError(null);
    try {
      const hash = await writeContract(config, wallet.address, config.contract_address, {
        functionName: 'evaluate_claim',
        args: [Number(id)],
      });
      setTxHash(hash);
      await api.indexTx(Number(id), hash, 'evaluate').catch(() => undefined);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setStarting(false);
    }
  }

  const steps: Step[] = STAGE_NAMES.map((name, i) => {
    const st = stageState(i);
    const descs = [
      'The contract loads the agreement: repository, criteria and deadline.',
      'GitHub evidence is retrieved on-chain by every validator, identically.',
      'Each criterion is adjudicated against the evidence only.',
      'Validators compare adjudications and commit to a consensus outcome.',
      'The decision is stored in the contract and readable by anyone.',
    ];
    return { key: String(i), title: name, desc: descs[i], state: st, time: i === 4 && bounty?.evaluated_ts ? new Date(bounty.evaluated_ts * 1000).toISOString().slice(11, 19) : undefined };
  });

  return (
    <div className="page fade-in">
      <div className="wrap" style={{ maxWidth: 900 }}>
        <Link to={`/bounties/${bounty.id}`} style={{ fontSize: 12.5, color: 'var(--ink-mute)' }}>
          ← Bounty #{String(bounty.id).padStart(3, '0')}
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
          <div>
            <h1 className="page-title">Evaluate submission</h1>
            <p className="lede" style={{ marginBottom: 0 }}>
              {repoSlug(bounty.repository_url)} · PR {prNumber(bounty.pr_url)} · {bounty.total_criteria} criteria
            </p>
          </div>
          {!evaluated && !txHash && (
            <button className="btn btn-primary" onClick={startEvaluation} disabled={starting || !wallet.address}>
              {starting ? 'Waiting for wallet signature…' : 'Evaluate submission'}
            </button>
          )}
        </div>

        {!wallet.address && !evaluated && (
          <div className="callout" style={{ marginTop: 16 }}>
            <span>
              The evaluation transaction is signed by your wallet.{' '}
              <button className="btn btn-secondary btn-sm" onClick={wallet.connect} style={{ marginLeft: 8 }}>
                {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
              </button>
            </span>
          </div>
        )}

        {error && <div className="callout error" role="alert" style={{ marginTop: 16 }}>{error}</div>}

        {/* pipeline */}
        <div className="card card-pad" style={{ marginTop: 24 }}>
          <div style={{ display: 'grid', gap: 0 }}>
            {steps.map((s) => (
              <div className={`lc-row ${s.state}`} key={s.key} style={{ borderBottom: 'none' }}>
                <div className="lc-icon" aria-hidden="true">
                  {s.state === 'done' ? '✓' : s.state === 'failed' ? '✕' : s.state === 'active' ? <span className="spin" /> : null}
                </div>
                <div>
                  <div className="lc-title" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11.5 }}>
                    {s.title}
                    {s.state === 'active' && <span className="lc-state">in progress</span>}
                  </div>
                  <div className="lc-desc">{s.desc}</div>

                  {/* stage 2: live evidence snapshot */}
                  {s.key === '1' && (s.state === 'active' || s.state === 'done') && (
                    <div style={{ marginTop: 10 }}>
                      {evidenceError ? (
                        <div className="callout warn" role="alert">
                          Live GitHub snapshot unavailable: {evidenceError}. The contract
                          retrieves evidence independently on-chain.
                        </div>
                      ) : evidence ? (
                        <details style={{ fontSize: 12.5 }}>
                          <summary style={{ cursor: 'pointer', color: 'var(--ink-mute)' }}>
                            GitHub snapshot: PR {evidence.evidence.pr_number} · {evidence.evidence.pr_title}
                          </summary>
                          <div style={{ marginTop: 10 }}>
                            <GitHubSnapshot repo={evidence.repository} ev={evidence.evidence} />
                          </div>
                        </details>
                      ) : (
                        <p className="mono" style={{ fontSize: 11.5, color: 'var(--ink-faint)', margin: '8px 0 0' }}>
                          fetching api.github.com …
                        </p>
                      )}
                    </div>
                  )}

                  {/* stage 3: criteria adjudication */}
                  {s.key === '2' && (
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {bounty.criteria.map((c, i) => {
                          const isRevealed = (evaluated || (accepted && revealed > 0)) && i < revealed;
                          const pendingNow = (s.state === 'active' || (txHash && !accepted)) && !isRevealed;
                          return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, alignItems: 'baseline' }}>
                              <span style={{ color: 'var(--ink-soft)' }}>
                                <span className="mono" style={{ color: 'var(--ink-faint)', marginRight: 8 }}>
                                  {String(i + 1).padStart(2, '0')}
                                </span>
                                {c.text}
                              </span>
                              <span>
                                {isRevealed && c.verdict !== 'PENDING' ? (
                                  <StatusBadge kind={verdictKindFor(c.verdict)}>{c.verdict.replace('_', ' ')}</StatusBadge>
                                ) : pendingNow ? (
                                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                                    adjudicating…
                                  </span>
                                ) : (
                                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>queued</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* stage 4: consensus */}
                  {s.key === '3' && (s.state === 'active' || s.state === 'done' || s.state === 'failed') && (
                    <div style={{ marginTop: 10 }}>
                      {failed ? (
                        <div className="callout error" role="alert">
                          Consensus was not reached (result: {tx?.result_name || tx?.status_name}).
                          The decision was NOT recorded.
                        </div>
                      ) : votes && votes.total > 0 ? (
                        <p className="mono" style={{ fontSize: 12, color: 'var(--ink-mute)', margin: 0 }}>
                          validators: {votes.agree} agree · {votes.disagree} disagree · {votes.idle} idle
                        </p>
                      ) : (
                        <p className="mono" style={{ fontSize: 12, color: 'var(--ink-mute)', margin: 0 }}>
                          waiting for validator agreement …
                        </p>
                      )}
                    </div>
                  )}

                  {/* stage 5: finalized decision */}
                  {s.key === '4' && (s.state === 'active' || s.state === 'done') && evaluated && (
                    <div style={{ marginTop: 10 }} aria-live="polite">
                      <span className={`decision-word ${bounty.decision === 'ACCEPTED' ? 'accepted' : bounty.decision === 'REJECTED' ? 'rejected' : 'inconclusive'}`} style={{ fontSize: 20 }}>
                        {bounty.decision}
                      </span>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--ink-mute)', marginLeft: 10 }}>
                        {bounty.satisfied}/{bounty.total_criteria} criteria satisfied
                      </span>
                    </div>
                  )}
                </div>
                <div className="lc-time">{s.time || ''}</div>
              </div>
            ))}
          </div>

          {tx && (
            <div style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="tech">
                <span className="tech-label">tx</span>
                <span>{tx.hash.slice(0, 18)}…</span>
              </span>
              {config?.explorer_base && (
                <a className="btn btn-ghost btn-sm" href={`${config.explorer_base}/transaction/${tx.hash}`} target="_blank" rel="noreferrer">
                  View in explorer ↗
                </a>
              )}
            </div>
          )}
        </div>

        {failed && (
          <div className="callout error" role="alert" style={{ marginTop: 16 }}>
            <div>
              <strong>Evaluation failed.</strong> No decision was recorded. GenLayer testnets
              can lose a round when validators are slow (idle) or disagree — this is reported
              honestly rather than hidden. You can retry the evaluation; the submission is
              still intact.
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setTxHash(null)}>
                Retry evaluation
              </button>
              <Link to={`/bounties/${bounty.id}`} className="btn btn-ghost btn-sm">
                Back to bounty
              </Link>
            </div>
          </div>
        )}

        {(accepted || evaluated) && (
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <Link to={`/decisions/${bounty.id}`} className="btn btn-primary">
              View decision record
            </Link>
            <Link to={`/bounties/${bounty.id}`} className="btn btn-secondary">
              Back to bounty
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
