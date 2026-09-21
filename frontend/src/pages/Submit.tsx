import { useEffect, useState } from 'react';
import { Link, useParams, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import { writeContract } from '../lib/genlayer';
import type { AppConfig, BountyDetail, EvidencePreview } from '../lib/types';
import { prNumber, repoSlug } from '../lib/format';
import type { WalletState } from '../hooks/useWallet';
import { GitHubSnapshot } from '../components/EvidencePanel';
import { useTxLifecycle } from '../components/Lifecycle';
import type { Step } from '../components/Lifecycle';

interface Ctx {
  config: AppConfig | null;
  cfgLoading: boolean;
  wallet: WalletState & { connect: () => Promise<void>; disconnect: () => void };
}

export function Submit() {
  const { id } = useParams<{ id: string }>();
  const { config, wallet } = useOutletContext<Ctx>();
  const [bounty, setBounty] = useState<BountyDetail['bounty'] | null>(null);
  const [prUrl, setPrUrl] = useState('');
  const [preview, setPreview] = useState<EvidencePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const { tx, polling } = useTxLifecycle(txHash);

  useEffect(() => {
    if (!id) return;
    api.bounty(id).then((d) => setBounty(d.bounty)).catch((e) => setError(e.message));
  }, [id]);

  if (!bounty) {
    return (
      <div className="page fade-in">
        <div className="wrap" style={{ maxWidth: 720 }}>
          {error ? (
            <div className="callout error" role="alert">{error}</div>
          ) : (
            <div className="skeleton" style={{ height: 200 }} />
          )}
        </div>
      </div>
    );
  }

  if (bounty.status !== 'OPEN') {
    return (
      <div className="page fade-in">
        <div className="wrap" style={{ maxWidth: 720 }}>
          <div className="callout">
            This bounty is already {bounty.status.toLowerCase()}. Submissions can only be made
            while a bounty is open.
          </div>
          <Link to={`/bounties/${bounty.id}`} className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>
            Back to bounty
          </Link>
        </div>
      </div>
    );
  }

  const repoSlugValue = repoSlug(bounty.repository_url);

  async function checkEvidence() {
    setPreviewError(null);
    setPreviewLoading(true);
    setPreview(null);
    try {
      const p = await api.evidence(bounty!.repository_url, prUrl.trim());
      setPreview(p);
    } catch (e: any) {
      setPreviewError(e.message);
    } finally {
      setPreviewLoading(false);
    }
  }

  const prNumberOk = (() => {
    const m = prUrl.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
    return m ? Number(m[1]) : null;
  })();

  const prRepoOk = (() => {
    const m = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull/);
    if (!m) return false;
    return `${m[1]}/${m[2]}`.toLowerCase() === repoSlugValue.toLowerCase();
  })();

  async function submit() {
    if (!config) return setError('Network configuration not loaded yet.');
    if (!wallet.address) return setError('Connect a wallet to sign the submission transaction.');
    if (!prNumberOk || !prRepoOk)
      return setError('PR URL must be a pull request of the bounty repository.');
    setSubmitting(true);
    setError(null);
    try {
      const hash = await writeContract(config, wallet.address, config.contract_address, {
        functionName: 'submit_claim',
        args: [Number(id), prUrl.trim()],
      });
      setTxHash(hash);
      await api.indexTx(Number(id), hash, 'submit').catch(() => undefined);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const accepted =
    tx && ['ACCEPTED', 'FINALIZED'].includes(tx.status_name.toUpperCase()) && tx.result_name === 'MAJORITY_AGREE';
  const failed =
    tx &&
    (['FAILED', 'UNDETERMINED'].includes(tx.status_name.toUpperCase()) ||
      (tx.result_name === 'NO_MAJORITY' && ['ACCEPTED', 'FINALIZED'].includes(tx.status_name.toUpperCase())));

  const steps: Step[] = [
    {
      key: 'sign',
      title: 'Wallet signature',
      desc: 'Your wallet signs submit_claim with the PR URL.',
      state: txHash ? 'done' : 'pending',
    },
    {
      key: 'consensus',
      title: 'GenLayer consensus',
      desc: 'Validators confirm the submission state.',
      state: failed ? 'failed' : accepted ? 'done' : polling ? 'active' : 'pending',
    },
    {
      key: 'recorded',
      title: 'Submission recorded',
      desc: 'The contract pins claimant, PR and submission time.',
      state: accepted ? 'done' : failed ? 'failed' : 'pending',
    },
  ];

  return (
    <div className="page fade-in">
      <div className="wrap" style={{ maxWidth: 900 }}>
        <Link to={`/bounties/${bounty.id}`} style={{ fontSize: 12.5, color: 'var(--ink-mute)' }}>
          ← Bounty #{String(bounty.id).padStart(3, '0')}
        </Link>
        <h1 className="page-title" style={{ marginTop: 12 }}>Submit a submission</h1>
        <p className="lede">
          Point the agreement at your pull request. The contract records who submitted, when,
          and against which repository — the evidence itself is collected on-chain at
          evaluation time.
        </p>

        <div className="grid-2" style={{ marginTop: 28, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
          <div className="card card-pad">
            <div className="field">
              <label htmlFor="pr-url">Pull request URL</label>
              <input
                id="pr-url"
                className="input mono"
                value={prUrl}
                onChange={(e) => {
                  setPrUrl(e.target.value);
                  setPreview(null);
                  setPreviewError(null);
                }}
                placeholder={`https://github.com/${repoSlugValue}/pull/123`}
                disabled={!!txHash}
              />
              {prUrl && prRepoOk && !prNumberOk && (
                <div className="error">PR number must be a number.</div>
              )}
              {prUrl && !prRepoOk && (
                <div className="error">PR must belong to {repoSlugValue}.</div>
              )}
              <div className="hint">
                Must be a pull request of <span className="mono">{repoSlugValue}</span>.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                onClick={checkEvidence}
                disabled={!prNumberOk || !prRepoOk || previewLoading || !!txHash}
              >
                {previewLoading ? 'Fetching…' : 'Fetch GitHub evidence'}
              </button>
              <button
                className="btn btn-primary"
                onClick={submit}
                disabled={submitting || !!txHash || (!prNumberOk || !prRepoOk) || !wallet.address}
              >
                {submitting ? 'Waiting for wallet signature…' : 'Submit claim'}
              </button>
            </div>

            {!wallet.address && (
              <div className="callout" style={{ marginTop: 14 }}>
                <span>
                  Connect your wallet to sign the submission.{' '}
                  <button className="btn btn-secondary btn-sm" onClick={wallet.connect} style={{ marginLeft: 8 }}>
                    {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
                  </button>
                </span>
              </div>
            )}

            {error && (
              <div className="callout error" role="alert" style={{ marginTop: 14 }}>
                {error}
              </div>
            )}

            {txHash && (
              <div style={{ marginTop: 18 }}>
                <div className="card">
                  <div className="lifecycle">
                    {steps.map((s) => (
                      <div className={`lc-row ${s.state}`} key={s.key}>
                        <div className="lc-icon" aria-hidden="true">
                          {s.state === 'done' ? '✓' : s.state === 'failed' ? '✕' : s.state === 'active' ? (
                            <span className="spin" />
                          ) : null}
                        </div>
                        <div>
                          <div className="lc-title">{s.title}</div>
                          <div className="lc-desc">{s.desc}</div>
                        </div>
                      </div>
                    ))}
                    {tx && (
                      <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                        <span className="tech">
                          <span className="tech-label">tx</span>
                          <span>{tx.hash.slice(0, 18)}…</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {failed && (
                  <div className="callout error" style={{ marginTop: 12 }} role="alert">
                    The submission did not reach validator consensus. It was not recorded —
                    you can retry.
                  </div>
                )}
                {accepted && (
                  <div className="callout ok" style={{ marginTop: 12 }} role="status">
                    Submission recorded on-chain.{' '}
                    <Link to={`/bounties/${bounty.id}/evaluate`} style={{ fontWeight: 700 }}>
                      Continue to evaluation →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card card-pad">
            <h3 className="panel-title">GitHub evidence preview</h3>
            {preview ? (
              <GitHubSnapshot repo={preview.repository} ev={preview.evidence} />
            ) : previewError ? (
              <div className="callout error" role="alert">{previewError}</div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--ink-mute)' }}>
                Enter a PR URL and fetch its evidence. This preview is a server-side snapshot
                for your review — the authoritative evidence is collected by the contract at
                evaluation time.
              </p>
            )}
            {prNumberOk && (
              <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 12 }}>
                Repository: <span className="mono">{repoSlugValue}</span> · PR #{prNumberOk}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
