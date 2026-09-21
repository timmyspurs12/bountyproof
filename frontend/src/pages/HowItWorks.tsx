import { Link, useOutletContext } from 'react-router-dom';
import type { AppConfig } from '../lib/types';
import type { WalletState } from '../hooks/useWallet';

interface Ctx {
  config: AppConfig | null;
  cfgLoading: boolean;
  wallet: WalletState & { connect: () => Promise<void>; disconnect: () => void };
}

export function HowItWorks() {
  const { config } = useOutletContext<Ctx>();
  const steps = [
    {
      n: '01',
      title: 'Define the agreement',
      body: (
        <>
          A bounty creator publishes a repository, a task description, a deadline and a numbered
          list of acceptance criteria. Each criterion is a discrete, verifiable condition — not a
          vibe. The agreement is recorded in the Intelligent Contract when the publish
          transaction is accepted.
        </>
      ),
      api: 'create_bounty(title, repository, description, criteria[], deadline)',
    },
    {
      n: '02',
      title: 'Submit the pull request',
      body: (
        <>
          The contributor submits the URL of their pull request against the bounty repository.
          The contract pins the submission: who claimed it, when, and against which agreement.
          Late submissions are flagged as a fact, so “submitted before the deadline” can be
          adjudicated from evidence rather than memory.
        </>
      ),
      api: 'submit_claim(bounty_id, pr_url)',
    },
    {
      n: '03',
      title: 'On-chain evidence + adjudication',
      body: (
        <>
          When evaluation is triggered, the Intelligent Contract itself retrieves the GitHub
          pull request payload and commit subjects — every validator fetches the same evidence
          independently under strict equality. An LLM then adjudicates each criterion against
          that evidence only, under validator consensus with a structural validator. No
          client-supplied verdict is ever trusted.
        </>
      ),
      api: 'evaluate_claim(bounty_id) → SATISFIED / NOT_SATISFIED / INSUFFICIENT_EVIDENCE per criterion',
    },
    {
      n: '04',
      title: 'Finalized decision',
      body: (
        <>
          The decision is deterministic from the per-criterion verdicts: any NOT_SATISFIED makes
          the bounty REJECTED; all SATISFIED makes it ACCEPTED; otherwise INCONCLUSIVE — because
          a missing piece of evidence is neither success nor failure. The ruling, the
          per-criterion reasons and the evidence snapshot are stored in the contract and can be
          read by anyone at any time.
        </>
      ),
      api: 'get_bounty(id) / get_decision(id) — contract state only',
    },
  ];

  return (
    <div className="page fade-in">
      <div className="wrap" style={{ maxWidth: 820 }}>
        <span className="eyebrow">How it works</span>
        <h1 className="display" style={{ fontSize: 32 }}>
          Agreement → evidence → GenLayer → decision
        </h1>
        <p className="lede">
          BountyProof is a trust layer for software bounties. It does not review code; it
          adjudicates whether a predefined agreement was fulfilled, using only evidence the
          network can verify.
        </p>

        <div style={{ display: 'grid', gap: 20, marginTop: 40 }}>
          {steps.map((s) => (
            <div className="card card-pad" key={s.n}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div className="mono" style={{ color: 'var(--accent-ink)', fontSize: 13, paddingTop: 2 }}>
                  {s.n}
                </div>
                <div>
                  <h2 style={{ margin: '2px 0 8px', fontSize: 16, fontWeight: 620 }}>{s.title}</h2>
                  <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.55 }}>{s.body}</p>
                  <p className="mono" style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--ink-faint)', background: 'var(--bg-sunken)', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px', display: 'inline-block' }}>
                    {s.api}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card card-pad" style={{ marginTop: 24, background: 'var(--bg-sunken)' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 620 }}>Why GenLayer</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.55 }}>
            A bounty decision needs judgment over unstructured evidence, and that judgment must
            be neutral and reproducible. GenLayer runs the adjudication inside Intelligent
            Contracts: validators re-execute the same evaluation, compare results under the
            Equivalence Principle, and only a consensus outcome is recorded. The result is a
            decision with a transaction history — not a chatbot’s reply.
            {config && (
              <span className="mono" style={{ display: 'block', marginTop: 10, fontSize: 11.5, color: 'var(--ink-mute)' }}>
                Network: {config.network.name} · chain {config.network.chain_id}
                {config.contract_address && <> · contract {config.contract_address}</>}
              </span>
            )}
          </p>
        </div>

        <div style={{ marginTop: 28, display: 'flex', gap: 12 }}>
          <Link to="/bounties" className="btn btn-primary">
            Explore bounties
          </Link>
          <Link to="/create" className="btn btn-secondary">
            Create a bounty
          </Link>
        </div>
      </div>
    </div>
  );
}
