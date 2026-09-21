import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { BountiesResponse } from '../lib/types';
import { fmtDate, prNumber, repoSlug, truncateAddress } from '../lib/format';
import { StatusBadge, statusKindFor } from '../components/StatusBadge';
import { decisionBadge } from '../components/DecisionPanel';

export function Bounties() {
  const navigate = useNavigate();
  const [data, setData] = useState<BountiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    api
      .bounties()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    const id = window.setInterval(() => {
      api
        .bounties()
        .then((d) => alive && setData(d))
        .catch(() => undefined);
    }, 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [reload]);

  return (
    <div className="page fade-in">
      <div className="wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title">Bounties</h1>
            <p className="lede" style={{ marginBottom: 0 }}>
              Software work awaiting or completed acceptance. Every row is backed by the
              Intelligent Contract’s state.
            </p>
          </div>
          <Link to="/create" className="btn btn-primary">
            Create bounty
          </Link>
        </div>

        {data && (
          <div className="metrics" role="group" aria-label="Bounty metrics">
            <div className="metric accent">
              <div className="metric-value">{data.metrics.active}</div>
              <div className="metric-label">Active</div>
            </div>
            <div className="metric warn">
              <div className="metric-value">{data.metrics.evaluating}</div>
              <div className="metric-label">Submitted</div>
            </div>
            <div className="metric ok">
              <div className="metric-value">{data.metrics.resolved}</div>
              <div className="metric-label">Resolved</div>
            </div>
            <div className="metric">
              <div className="metric-value" style={{ fontSize: 16, color: 'var(--ink-mute)' }}>
                {data.metrics.accepted} A · {data.metrics.rejected} R · {data.metrics.inconclusive} I
              </div>
              <div className="metric-label">Decisions</div>
            </div>
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

        {!data && !error && (
          <div className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
            <div className="skeleton" style={{ height: 16, width: '30%' }} />
            <div className="skeleton" style={{ height: 42 }} />
            <div className="skeleton" style={{ height: 42 }} />
            <div className="skeleton" style={{ height: 42 }} />
          </div>
        )}

        {data && data.items.length === 0 && (
          <div className="empty">
            <div className="empty-title">No agreements yet</div>
            <p className="empty-body">
              Create the first software bounty and define exactly what completion means —
              before any code is written.
            </p>
            <Link to="/create" className="btn btn-primary">
              Create bounty
            </Link>
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Bounty</th>
                  <th scope="col">Repository</th>
                  <th scope="col">Claimant</th>
                  <th scope="col">Status</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const b = item.bounty;
                  if (!b) {
                    if (item.stale_deployment) {
                      return (
                        <tr key={`stale-${item.bounty_id}`}>
                          <td colSpan={7} style={{ color: 'var(--ink-faint)', fontSize: 12.5 }}>
                            #{item.bounty_id}
                            {item.title ? ` — ${item.title}` : ''} · entry from a previous deployment, not on the current contract
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={`err-${item.bounty_id}`}>
                        <td colSpan={7} style={{ color: 'var(--danger)', fontSize: 12.5 }}>
                          #{item.bounty_id} — contract read failed: {item.contract_read_error}
                        </td>
                      </tr>
                    );
                  }
                  const updated = Math.max(b.created_ts, b.submitted_ts || 0, b.evaluated_ts || 0);
                  return (
                    <tr key={b.id} onClick={() => navigate(`/bounties/${b.id}`)} style={{ cursor: 'pointer' }}>
                      <td className="mono" style={{ color: 'var(--ink-mute)' }}>
                        #{String(b.id).padStart(3, '0')}
                      </td>
                      <td style={{ fontWeight: 600, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.title}
                      </td>
                      <td>
                        <a
                          href={b.repository_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mono"
                          style={{ fontSize: 12, color: 'var(--ink-mute)' }}
                        >
                          {repoSlug(b.repository_url)}
                        </a>
                      </td>
                      <td>
                        {b.claimant && b.claimant !== '0x0000000000000000000000000000000000000000' ? (
                          <span className="mono" style={{ fontSize: 12 }}>
                            {truncateAddress(b.claimant)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ink-faint)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge kind={statusKindFor(b.status)}>{b.status}</StatusBadge>
                      </td>
                      <td>
                        {b.status === 'RESOLVED' ? decisionBadge(b.decision) : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                      </td>
                      <td className="mono" style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
                        {fmtDate(updated)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
