import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';
import type { AppConfig, BountyListItem } from '../lib/types';
import { fmtDate, prNumber, repoSlug } from '../lib/format';
import type { WalletState } from '../hooks/useWallet';

interface Ctx {
  config: AppConfig | null;
  cfgLoading: boolean;
  wallet: WalletState & { connect: () => Promise<void>; disconnect: () => void };
}

/**
 * Landing: editorial hero + a live contract-state composition.
 * The hero card renders real bounties read from the contract (via the API)
 * when they exist, and an explicit empty state otherwise.
 */
export function Home() {
  const { config } = useOutletContext<Ctx>();
  return (
    <div className="page fade-in">
      <div className="wrap">
        <div className="hero-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)', gap: 56, alignItems: 'start' }}>
          <div>
            <span className="eyebrow">On-chain acceptance for software bounties</span>
            <h1 className="display">Did the work actually satisfy the agreement?</h1>
            <p className="lede">
              BountyProof turns predefined GitHub acceptance criteria into a verifiable GenLayer
              decision. A neutral Intelligent Contract collects the pull request evidence,
              adjudicates each criterion under validator consensus, and records the final
              ACCEPTED, REJECTED or INCONCLUSIVE ruling on-chain.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
              <Link to="/create" className="btn btn-primary">
                Create a bounty
              </Link>
              <Link to="/bounties" className="btn btn-secondary">
                Explore bounties
              </Link>
            </div>
            <p style={{ marginTop: 18, fontSize: 12, color: 'var(--ink-faint)' }}>
              {config ? (
                <>
                  Live network: {config.network.name} · chain {config.network.chain_id}
                  {config.contract_address && (
                    <>
                      {' '}
                      ·{' '}
                      <a
                        href={`${config.explorer_base}/contract/${config.contract_address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono"
                        style={{ color: 'var(--ink-mute)' }}
                      >
                        contract {config.contract_address.slice(0, 10)}…
                      </a>
                    </>
                  )}
                </>
              ) : (
                'Connecting to the network…'
              )}
            </p>
          </div>

          <HeroCard />
        </div>

        <div className="section" id="problem">
          <h2 className="page-title">The uncomfortable middle of software bounties</h2>
          <div className="grid-2" style={{ marginTop: 24 }}>
            <div className="card card-pad">
              <h3 className="panel-title">What happens today</h3>
              <div style={{ display: 'grid', gap: 12, fontSize: 13.5, color: 'var(--ink-soft)' }}>
                <div>
                  <strong>Contributor:</strong> “I completed the requirements. The PR is up —
                  review it when you get to it.”
                </div>
                <div>
                  <strong>Sponsor:</strong> “This isn’t what we agreed. The persistence part
                  was never demonstrated.”
                </div>
                <div style={{ color: 'var(--ink-mute)' }}>
                  Weeks of back-and-forth, no shared record of what was promised, no neutral
                  record of what the evidence shows.
                </div>
              </div>
            </div>
            <div className="card card-pad" style={{ background: 'var(--bg-sunken)' }}>
              <h3 className="panel-title">What BountyProof adds</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: 'var(--ink-soft)', display: 'grid', gap: 10 }}>
                <li>A written acceptance agreement — explicit criteria, fixed deadline.</li>
                <li>GitHub evidence collected <em>on-chain</em>, identically, by every validator.</li>
                <li>Criterion-by-criterion adjudication — satisfied, not satisfied, or insufficient evidence.</li>
                <li>A final decision stored in the contract. Not an opinion. A record.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="section">
          <h2 className="page-title">How it works</h2>
          <div className="how-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 24 }}>
            {[
              {
                n: '01',
                t: 'Define',
                d: 'Publish a bounty with repository, task, deadline and individually editable acceptance criteria.',
                href: '/create',
              },
              {
                n: '02',
                t: 'Submit',
                d: 'A contributor submits the pull request URL. The agreement pins exactly what the evidence must show.',
                href: '/bounties',
              },
              {
                n: '03',
                t: 'Evaluate',
                d: 'The Intelligent Contract retrieves the PR evidence on-chain and adjudicates each criterion under validator consensus.',
                href: '/bounties',
              },
              {
                n: '04',
                t: 'Finalize',
                d: 'The ACCEPTED / REJECTED / INCONCLUSIVE ruling is recorded on-chain and readable by anyone.',
                href: '/bounties',
              },
            ].map((s) => (
              <Link key={s.n} to={s.href} className="card card-pad" style={{ transition: 'border-color 160ms ease' }}>
                <div className="mono" style={{ color: 'var(--accent-ink)', fontSize: 12 }}>{s.n}</div>
                <div style={{ fontWeight: 620, margin: '8px 0 6px' }}>{s.t}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-mute)' }}>{s.d}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .hero-grid, .how-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function HeroCard() {
  const [list, setList] = useState<BountyListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .bounties()
      .then((res) => {
        if (alive) {
          const real = res.items.filter((i) => i.bounty);
          setList(real.length ? real.slice(0, 1) : []);
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const bounty = list?.[0]?.bounty;
  const badgeKind =
    bounty && bounty.status === 'RESOLVED'
      ? bounty.decision === 'ACCEPTED'
        ? 'badge-ok'
        : bounty.decision === 'REJECTED'
          ? 'badge-danger'
          : 'badge-warn'
      : bounty
        ? 'badge-accent'
        : 'badge-neutral';

  return (
    <div className="card" style={{ boxShadow: 'var(--shadow-2)' }}>
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
          {bounty ? `BOUNTY #${String(bounty.id).padStart(3, '0')}` : 'BOUNTY PROOF'}
        </span>
        <span className={`badge ${badgeKind}`}>{bounty ? bounty.status : 'live state'}</span>
      </div>

      <div style={{ padding: '18px 20px' }}>
        {error ? (
          <div className="callout error" role="alert">
            {error}
          </div>
        ) : list === null ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="skeleton" style={{ height: 14, width: '60%' }} />
            <div className="skeleton" style={{ height: 12, width: '85%' }} />
            <div className="skeleton" style={{ height: 12, width: '45%' }} />
            <div className="skeleton" style={{ height: 34, width: '100%' }} />
          </div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>No agreements yet</div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-mute)', margin: '8px 0 14px' }}>
              This card renders live contract state. The first published bounty will appear here.
            </p>
            <Link to="/create" className="btn btn-secondary btn-sm">
              Create the first bounty
            </Link>
          </div>
        ) : (
          <div className="fade-in">
            <div style={{ fontSize: 15, fontWeight: 620 }}>{bounty!.title}</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 4 }}>
              {repoSlug(bounty!.repository_url)}
            </div>
            {bounty!.pr_url && (
              <div className="mono" style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 2 }}>
                PR {prNumber(bounty!.pr_url)} · deadline {fmtDate(bounty!.deadline_ts)}
              </div>
            )}
            <div style={{ borderTop: '1px solid var(--line)', margin: '14px 0', paddingTop: 12 }}>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '0.08em' }}>
                GENLAYER DECISION
              </div>
              {bounty!.status === 'RESOLVED' ? (
                <>
                  <div
                    className={`decision-word ${bounty!.decision === 'ACCEPTED' ? 'accepted' : bounty!.decision === 'REJECTED' ? 'rejected' : 'inconclusive'}`}
                    style={{ fontSize: 22, marginTop: 6 }}
                  >
                    {bounty!.decision}
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 6 }}>
                    {bounty!.satisfied} / {bounty!.total_criteria} criteria satisfied
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink-mute)', marginTop: 6 }}>
                  {bounty!.status === 'SUBMITTED' ? 'Awaiting evaluation' : 'Open for submission'}
                </div>
              )}
            </div>
            <Link
              to={`/bounties/${bounty!.id}`}
              style={{ fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 600 }}
            >
              View agreement →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
