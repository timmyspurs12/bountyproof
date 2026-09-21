import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { AppConfig } from '../lib/types';
import type { WalletState } from '../hooks/useWallet';
import { useTxLifecycle } from '../components/Lifecycle';
import type { Step } from '../components/Lifecycle';

interface Ctx {
  config: AppConfig | null;
  cfgLoading: boolean;
  wallet: WalletState & { connect: () => Promise<void>; disconnect: () => void };
}

/**
 * Post-publish screen: shows the real transaction lifecycle of the create_bounty
 * transaction and, once it is accepted with validator majority, resolves the new
 * bounty id from the contract and navigates to its page.
 */
export function NewBounty() {
  const { config, wallet } = useOutletContext<Ctx>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const txHash = params.get('tx');
  const title = params.get('title') || '';
  const deadline = Number(params.get('deadline') || 0);

  const { tx, error, polling } = useTxLifecycle(txHash);

  const [resolved, setResolved] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const accepted =
    tx &&
    ['ACCEPTED', 'FINALIZED'].includes(tx.status_name.toUpperCase()) &&
    tx.result_name === 'MAJORITY_AGREE';
  const failed =
    tx &&
    (['FAILED', 'UNDETERMINED'].includes(tx.status_name.toUpperCase()) ||
      (tx.result_name === 'NO_MAJORITY' &&
        ['ACCEPTED', 'FINALIZED'].includes(tx.status_name.toUpperCase())));

  useEffect(() => {
    if (!accepted || resolved || !wallet.address || !config) return;
    const addr = wallet.address;
    setResolved(true);
    (async () => {
      try {
        const { bounty_id } = await api.findBounty(addr, title, deadline);
        if (!bounty_id) throw new Error('Bounty not found on contract after accepted transaction');
        await api.indexBounty(bounty_id, tx!.hash, title).catch(() => undefined);
        navigate(`/bounties/${bounty_id}`, { replace: true });
      } catch (e: any) {
        setResolveError(e.message);
        setResolved(false);
      }
    })();
  }, [accepted, resolved, wallet.address, config, title, deadline, navigate, tx]);

  const steps: Step[] = useMemo(() => {
    const s: Step[] = [];
    s.push({
      key: 'sign',
      title: 'Wallet signature',
      desc: 'Your wallet signed the create_bounty transaction.',
      state: txHash ? 'done' : 'active',
    });
    s.push({
      key: 'submit',
      title: 'Transaction submitted',
      desc: txHash ? `Submitted to ${config?.network.name || 'GenLayer'}.` : 'Waiting for submission…',
      state: txHash ? 'done' : 'pending',
    });
    s.push({
      key: 'consensus',
      title: 'GenLayer consensus',
      desc: 'Validators re-execute the transaction and vote on the new contract state.',
      state: failed
        ? 'failed'
        : accepted
          ? 'done'
          : polling
            ? 'active'
            : 'pending',
      time: tx?.created_at ? new Date(tx.created_at).toISOString().slice(11, 19) : undefined,
    });
    s.push({
      key: 'state',
      title: 'Bounty state recorded',
      desc: accepted
        ? 'The agreement is stored in the Intelligent Contract.'
        : 'The agreement becomes part of the contract state.',
      state: accepted ? 'done' : failed ? 'failed' : 'pending',
    });
    return s;
  }, [tx, txHash, polling, accepted, failed, config]);

  return (
    <div className="page fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="wrap" style={{ padding: 0 }}>
        <span className="eyebrow">Publishing</span>
        <h1 className="page-title" style={{ fontSize: 22, marginTop: 12 }}>
          {title || 'New bounty'}
        </h1>
        <p className="lede">
          The publish transaction is moving through GenLayer consensus. This screen shows the
          actual transaction state — nothing here is simulated.
        </p>

        <div style={{ marginTop: 24 }}>
          <div className="card">
            <div className="lifecycle">
              {steps.map((st) => (
                <div className={`lc-row ${st.state}`} key={st.key}>
                  <div className="lc-icon" aria-hidden="true">
                    {st.state === 'done' ? '✓' : st.state === 'failed' ? '✕' : st.state === 'active' ? (
                      <span className="spin" />
                    ) : null}
                  </div>
                  <div>
                    <div className="lc-title">
                      {st.title}
                      {st.state === 'active' && <span className="lc-state">in progress</span>}
                    </div>
                    <div className="lc-desc">{st.desc}</div>
                  </div>
                  <div className="lc-time">{st.time || ''}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="callout error" role="alert" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}

        {failed && (
          <div className="callout error" role="alert" style={{ marginTop: 16 }}>
            <div>
              <strong>Evaluation failed.</strong> The transaction did not reach validator
              consensus (result: {tx?.result_name || tx?.status_name}). The agreement was NOT
              recorded. This can happen when validators are slow or disagree; retry the publish
              from the create screen.
            </div>
            <div style={{ marginTop: 10 }}>
              <Link to="/create" className="btn btn-secondary btn-sm">
                Back to create
              </Link>
            </div>
          </div>
        )}

        {resolveError && (
          <div className="callout error" role="alert" style={{ marginTop: 16 }}>
            {resolveError}{' '}
            <Link to="/bounties" className="btn btn-ghost btn-sm">
              Go to bounties
            </Link>
          </div>
        )}

        {!tx && !error && (
          <p style={{ marginTop: 16, fontSize: 12.5, color: 'var(--ink-mute)' }}>
            Waiting for the first lifecycle update…
          </p>
        )}
      </div>
    </div>
  );
}
