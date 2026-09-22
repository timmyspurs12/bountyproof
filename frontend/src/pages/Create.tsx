import { useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { writeContract } from '../lib/genlayer';
import type { AppConfig } from '../lib/types';
import { fmtDate, repoSlug } from '../lib/format';
import type { WalletApi } from '../hooks/useWallet';
import { CriteriaPreview } from '../components/Criteria';

interface Ctx {
  config: AppConfig | null;
  cfgLoading: boolean;
  wallet: WalletApi;
}

function defaultDeadline(): number {
  return Math.floor(Date.now() / 1000) + 30 * 86400;
}

function deadlineInputValue(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function deadlineFromInput(value: string): number {
  const d = new Date(value + 'T12:00:00Z');
  return Math.floor(d.getTime() / 1000);
}

export function Create() {
  const { config, wallet } = useOutletContext<Ctx>();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [repository_url, setRepositoryUrl] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState<string[]>(['']);
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [issue_url, setIssueUrl] = useState('');

  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const cleanCriteria = useMemo(
    () => criteria.map((c) => c.trim()).filter(Boolean),
    [criteria]
  );

  const repoOk = useMemo(() => {
    if (!repository_url) return null;
    return /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository_url.trim());
  }, [repository_url]);

  const deadlineOk = deadline > Math.floor(Date.now() / 1000);

  async function preflight() {
    setServerError(null);
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (!repository_url.trim()) errs.repository_url = 'Repository URL is required';
    if (repoOk === false)
      errs.repository_url = 'Must look like https://github.com/owner/repo';
    if (cleanCriteria.length === 0) errs.criteria = 'Add at least one acceptance criterion';
    if (!deadlineOk) errs.deadline = 'Deadline must be in the future';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return false;
    try {
      await api.validateBounty({
        title,
        repository_url,
        description,
        criteria: cleanCriteria,
        deadline_ts: deadline,
        issue_url,
      });
      return true;
    } catch (e: any) {
      if (e instanceof ApiError && e.field) {
        setFieldErrors({ [e.field]: e.message });
        return false;
      }
      setServerError(e.message);
      return false;
    }
  }

  async function publish() {
    if (!config) {
      setServerError('Network configuration not loaded yet.');
      return;
    }
    if (!wallet.address) {
      setSubmitError('Connect a wallet first — the publish transaction is signed by your wallet.');
      return;
    }
    const ok = await preflight();
    if (!ok) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const hash = await writeContract(config, wallet.address, config.contract_address, {
        functionName: 'create_bounty',
        args: [
          title.trim(),
          repository_url.trim(),
          description.trim(),
          cleanCriteria,
          deadline,
          issue_url.trim(),
        ],
      });
      try {
        const bid = await api.validateBounty({
          title,
          repository_url,
          description,
          criteria: cleanCriteria,
          deadline_ts: deadline,
          issue_url,
        });
        void bid;
      } catch {
        /* preflight result not needed for navigation */
      }
      navigate(`/bounties/new?tx=${hash}&title=${encodeURIComponent(title.trim())}&deadline=${deadline}`);
    } catch (e: any) {
      setSubmitError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const ready =
    title.trim().length >= 5 &&
    repoOk === true &&
    cleanCriteria.length > 0 &&
    deadlineOk;

  return (
    <div className="page fade-in">
      <div className="wrap">
        <h1 className="page-title">Create a bounty</h1>
        <p className="lede">
          Define exactly what completion means. The agreement is recorded on-chain when your
          publish transaction is accepted.
        </p>

        <div className="grid-2" style={{ marginTop: 32, gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)' }}>
          {/* LEFT: definition */}
          <div className="card card-pad">
            <div className="field">
              <label htmlFor="b-title">Bounty title</label>
              <input
                id="b-title"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Persistent dark mode for the dashboard"
                maxLength={120}
              />
              {fieldErrors.title && <div className="error">{fieldErrors.title}</div>}
              <div className="hint">5–120 characters.</div>
            </div>

            <div className="field">
              <label htmlFor="b-repo">Repository URL</label>
              <input
                id="b-repo"
                className="input mono"
                value={repository_url}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
              />
              {fieldErrors.repository_url && <div className="error">{fieldErrors.repository_url}</div>}
              {repository_url && repoOk && (
                <div className="hint" style={{ color: 'var(--ok)' }}>
                  {repoSlug(repository_url)}
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="b-desc">Task description</label>
              <textarea
                id="b-desc"
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What should the contributor build? Keep it factual — the criteria below carry the testable requirements."
                maxLength={4000}
              />
              <div className="hint">Optional, up to 4,000 characters.</div>
            </div>

            <div className="field">
              <label>Acceptance criteria</label>
              <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
                Each criterion is a discrete condition the GitHub evidence must support. 1–12
                criteria, 5–300 characters each.
              </p>
              {criteria.map((c, i) => (
                <div className="criterion-row" key={i}>
                  <div className="criterion-index">{String(i + 1).padStart(2, '0')}</div>
                  <input
                    className="input"
                    value={c}
                    aria-label={`Criterion ${i + 1}`}
                    onChange={(e) =>
                      setCriteria((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))
                    }
                    placeholder={
                      i === 0
                        ? 'e.g. Dark mode is accessible from Settings.'
                        : 'e.g. Preference persists after browser refresh.'
                    }
                    maxLength={300}
                  />
                  <button
                    className="criterion-remove"
                    aria-label={`Remove criterion ${i + 1}`}
                    disabled={criteria.length <= 1}
                    onClick={() => setCriteria((arr) => arr.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setCriteria((arr) => (arr.length < 12 ? [...arr, ''] : arr))}
                disabled={criteria.length >= 12}
              >
                + Add criterion
              </button>
              {fieldErrors.criteria && <div className="error">{fieldErrors.criteria}</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="field">
                <label htmlFor="b-deadline">Deadline</label>
                <input
                  id="b-deadline"
                  type="date"
                  className="input"
                  value={deadlineInputValue(deadline)}
                  onChange={(e) => setDeadline(deadlineFromInput(e.target.value))}
                />
                {fieldErrors.deadline && <div className="error">{fieldErrors.deadline}</div>}
              </div>
              <div className="field">
                <label htmlFor="b-issue">Reference / issue URL</label>
                <input
                  id="b-issue"
                  className="input mono"
                  value={issue_url}
                  onChange={(e) => setIssueUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo/issues/42"
                />
                <div className="hint">Optional.</div>
              </div>
            </div>

            {serverError && (
              <div className="callout error" role="alert" style={{ marginBottom: 16 }}>
                {serverError}
              </div>
            )}
            {submitError && (
              <div className="callout error" role="alert" style={{ marginBottom: 16 }}>
                {submitError}
              </div>
            )}

            {!wallet.address && (
              <div className="callout" style={{ marginBottom: 16 }}>
                <span>
                  A wallet is needed to sign the publish transaction — a browser extension or any
                  mobile wallet via WalletConnect.{' '}
                  <button className="btn btn-secondary btn-sm" onClick={wallet.connect} style={{ marginLeft: 8 }}>
                    {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
                  </button>
                </span>
              </div>
            )}

            <button className="btn btn-primary" onClick={publish} disabled={submitting || !wallet.address}>
              {submitting ? 'Waiting for wallet signature…' : 'Publish bounty'}
            </button>
          </div>

          {/* RIGHT: live agreement preview */}
          <div>
            <div className="card card-pad" style={{ position: 'sticky', top: 72 }}>
              <h3 className="panel-title">Acceptance agreement</h3>
              <dl className="kv" style={{ marginBottom: 16 }}>
                <dt>Repository</dt>
                <dd className="mono">{repository_url ? repoSlug(repository_url) : '—'}</dd>
                <dt>Criteria</dt>
                <dd>{cleanCriteria.length} defined</dd>
                <dt>Deadline</dt>
                <dd className="mono">{fmtDate(deadline)}</dd>
                <dt>Creator</dt>
                <dd className="mono">{wallet.address ? wallet.address.slice(0, 10) + '…' : '— (wallet not connected)'}</dd>
                <dt>Status</dt>
                <dd>
                  {ready ? (
                    <span className="badge badge-ok">
                      <span className="bdot" /> Ready to publish
                    </span>
                  ) : (
                    <span className="badge badge-neutral">
                      <span className="bdot" /> Completing agreement
                    </span>
                  )}
                </dd>
              </dl>
              <div className="divider" />
              <h3 className="panel-title">Criteria preview</h3>
              <CriteriaPreview texts={criteria.map((c) => c.trim())} />
            </div>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
