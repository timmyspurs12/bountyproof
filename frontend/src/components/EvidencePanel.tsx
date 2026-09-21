import type { EvidenceView, GitHubEvidence } from '../lib/types';
import { fmtTs, prNumber, repoSlug } from '../lib/format';
import { StatusBadge } from './StatusBadge';
import { Tech } from './Tech';

/** On-chain evidence snapshot (from the contract record). */
export function OnChainEvidence({ ev, prUrl }: { ev: EvidenceView | null | undefined; prUrl: string }) {
  if (!ev || (!ev.pr_title && !ev.head_sha)) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
        No evidence snapshot yet. Evidence is collected on-chain when the submission is
        evaluated.
      </p>
    );
  }
  return (
    <dl className="kv" style={{ margin: 0 }}>
      <dt>Pull request</dt>
      <dd>
        <a href={prUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-ink)' }}>
          {repoSlug(ev ? (ev as any).repository || prUrl : prUrl)} {prNumber(prUrl)}
        </a>
        {ev.pr_title && <span style={{ color: 'var(--ink-faint)' }}> — {ev.pr_title}</span>}
      </dd>
      <dt>PR state</dt>
      <dd>
        <StatusBadge kind={ev.pr_state === 'open' ? 'accent' : 'ok'}>{ev.pr_state || '—'}</StatusBadge>
      </dd>
      <dt>Repository</dt>
      <dd className="mono">{(ev as any).repository || repoSlug(prUrl)}</dd>
      <dt>Commit</dt>
      <dd>
        {ev.head_sha ? <Tech value={ev.head_sha} display={ev.head_sha.slice(0, 12)} title={ev.head_sha} /> : '—'}
      </dd>
      <dt>Base branch</dt>
      <dd className="mono">{ev.base_ref || '—'}</dd>
      <dt>Commits</dt>
      <dd>{ev.commit_count || '—'}</dd>
      <dt>Changed files</dt>
      <dd>{ev.changed_files || '—'}</dd>
      <dt>Additions / deletions</dt>
      <dd className="mono">+{ev.additions || 0} / −{ev.deletions || 0}</dd>
      <dt>Author</dt>
      <dd className="mono">{ev.pr_author || '—'}</dd>
      <dt>Created</dt>
      <dd className="mono">{fmtTs(ev.pr_created_at)}</dd>
      <dt>Merged</dt>
      <dd className="mono">{ev.pr_merged_at ? fmtTs(ev.pr_merged_at) : 'not merged'}</dd>
      {ev.commit_messages && (
        <>
          <dt>Commit subjects</dt>
          <dd style={{ whiteSpace: 'pre-wrap' }}>{ev.commit_messages}</dd>
        </>
      )}
    </dl>
  );
}

/** Server-side GitHub snapshot (display/pre-flight only). */
export function GitHubSnapshot({
  repo,
  ev,
}: {
  repo: GitHubEvidence['pr_title'] extends never ? never : any;
  ev: GitHubEvidence;
}) {
  return (
    <dl className="kv" style={{ margin: 0 }}>
      <dt>Repository</dt>
      <dd>
        <a href={repo?.html_url || ev.repository} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-ink)' }}>
          {ev.repository.replace('https://github.com/', '')}
        </a>
        {repo?.description && (
          <div style={{ color: 'var(--ink-faint)', fontSize: 12 }}>{repo.description}</div>
        )}
      </dd>
      <dt>Pull request</dt>
      <dd>
        <a href={ev.html_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-ink)' }}>
          {prNumber(ev.pr_url)}
        </a>{' '}
        — {ev.pr_title}
      </dd>
      <dt>State</dt>
      <dd>
        <StatusBadge kind={ev.pr_state === 'open' ? 'accent' : 'ok'}>{ev.pr_state}</StatusBadge>
      </dd>
      <dt>Author</dt>
      <dd className="mono">{ev.pr_author}</dd>
      <dt>Commit</dt>
      <dd>
        <Tech value={ev.head_sha} display={ev.head_sha.slice(0, 12)} title={ev.head_sha} />
      </dd>
      <dt>Base branch</dt>
      <dd className="mono">{ev.base_ref}</dd>
      <dt>Commits / files</dt>
      <dd className="mono">{ev.commit_count} commits · {ev.changed_files} files</dd>
      <dt>Additions / deletions</dt>
      <dd className="mono">+{ev.additions} / −{ev.deletions}</dd>
      <dt>Created</dt>
      <dd className="mono">{fmtTs(ev.pr_created_at)}</dd>
      <dt>Merged</dt>
      <dd className="mono">{ev.pr_merged_at ? fmtTs(ev.pr_merged_at) : 'not merged'}</dd>
      {ev.body_excerpt && (
        <>
          <dt>PR description</dt>
          <dd style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--sans)' }}>{ev.body_excerpt}</dd>
        </>
      )}
      {ev.commit_messages && (
        <>
          <dt>Commit subjects</dt>
          <dd style={{ whiteSpace: 'pre-wrap' }}>{ev.commit_messages}</dd>
        </>
      )}
    </dl>
  );
}
