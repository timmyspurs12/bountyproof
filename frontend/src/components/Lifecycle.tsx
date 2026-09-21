import { useEffect, useRef, useState } from 'react';
import type { TxLifecycle } from '../lib/types';
import { truncateHash, voteCounts } from '../lib/format';
import { Tech } from './Tech';

export interface Step {
  key: string;
  title: string;
  desc: string;
  state: 'pending' | 'active' | 'done' | 'failed';
  time?: string;
}

/**
 * Transaction lifecycle: every real state from wallet signature to consensus
 * finalization. Nothing here is simulated; the steps reflect the receipt we
 * actually received, and an unknown state renders as-is.
 */
export function Lifecycle({
  steps,
  tx,
  explorerBase,
}: {
  steps: Step[];
  tx: TxLifecycle | null;
  explorerBase?: string;
}) {
  const [showVotes, setShowVotes] = useState(false);
  const votes = tx ? voteCounts(tx.votes) : null;
  const hasVotes = votes && votes.total > 0;

  return (
    <div className="card">
      <div className="lifecycle">
        {steps.map((s) => (
          <div className={`lc-row ${s.state}`} key={s.key} aria-label={`${s.title}: ${s.state}`}>
            <div className="lc-icon" aria-hidden="true">
              {s.state === 'done' ? '✓' : s.state === 'failed' ? '✕' : s.state === 'active' ? (
                <span className="spin" />
              ) : null}
            </div>
            <div>
              <div className="lc-title">
                {s.title}
                {s.state === 'active' && <span className="lc-state">in progress</span>}
                {s.state === 'failed' && <span className="lc-state" style={{ color: 'var(--danger)' }}>failed</span>}
              </div>
              <div className="lc-desc">{s.desc}</div>
            </div>
            <div className="lc-time">{s.time || ''}</div>
          </div>
        ))}

        {hasVotes && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowVotes((v) => !v)}
              aria-expanded={showVotes}
            >
              Validator consensus
              <span className="mono" style={{ color: 'var(--ink-mute)' }}>
                {votes.agree} agree · {votes.disagree} disagree · {votes.idle} idle
              </span>
            </button>
            {showVotes && tx && (
              <div style={{ marginTop: 10, display: 'grid', gap: 6 }} className="fade-in">
                {Object.entries(tx.votes).map(([validator, vote]) => (
                  <div
                    key={validator}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}
                  >
                    <span className="mono" style={{ color: 'var(--ink-mute)' }}>
                      {truncateHash(validator, 6)}
                    </span>
                    <span
                      className="mono"
                      style={{
                        color:
                          vote === 'agree' ? 'var(--ok)' : vote === 'disagree' ? 'var(--danger)' : 'var(--ink-faint)',
                      }}
                    >
                      {vote}
                    </span>
                  </div>
                ))}
                <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', margin: '6px 0 0' }}>
                  Actual validator votes from the transaction receipt. Idle validators did not
                  vote within the round window.
                </p>
              </div>
            )}
          </div>
        )}

        {tx && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Tech label="tx" value={tx.hash} display={truncateHash(tx.hash, 10)} />
            {explorerBase && tx.hash && (
              <a
                className="btn btn-ghost btn-sm"
                href={`${explorerBase}/transaction/${tx.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View in explorer ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Poll a tx lifecycle via the backend until it leaves pending. */
export function useTxLifecycle(hash: string | null) {
  const [tx, setTx] = useState<TxLifecycle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const timer = useRef<number | null>(null);

  const fetchOnce = async (h: string) => {
    try {
      const r = await fetch(`/api/transactions/${h}`);
      const t = await r.json();
      if (r.ok) {
        setTx(t);
        setError(null);
      }
    } catch (e: any) {
      setError(e?.message || 'RPC unavailable');
    }
  };

  useEffect(() => {
    if (!hash) return;
    setPolling(true);
    setTx(null);
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/transactions/${hash}/wait?timeout_s=45`);
        if (cancelled) return;
        const body = await res.json();
        if (res.ok) {
          setTx(body);
          if (
            ['ACCEPTED', 'FINALIZED', 'FAILED', 'UNDETERMINED'].includes(
              String(body.status_name || '').toUpperCase()
            )
          ) {
            setPolling(false);
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      if (!cancelled) {
        timer.current = window.setTimeout(poll, 2000);
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
      setPolling(false);
    };
  }, [hash]);

  return { tx, error, polling, refresh: () => hash && fetchOnce(hash) };
}
