export function truncateAddress(addr: string, chars = 4): string {
  if (!addr) return '';
  if (addr.length <= chars * 2 + 4) return addr;
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

export function truncateHash(hash: string, chars = 8): string {
  if (!hash) return '';
  if (hash.length <= chars * 2 + 4) return hash;
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}

export function fmtTs(ts: number | string | undefined | null): string {
  if (!ts) return '—';
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return new Date(n * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export function fmtDate(ts: number | string | undefined | null): string {
  if (!ts) return '—';
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return new Date(n * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function timeAgo(ts: number): string {
  if (!ts) return '';
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function repoSlug(repositoryUrl: string): string {
  const m = repositoryUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  return m ? `${m[1]}/${m[2]}` : repositoryUrl;
}

export function prNumber(prUrl: string): string {
  const m = prUrl.match(/pull\/(\d+)/);
  return m ? `#${m[1]}` : '';
}

export function voteCounts(votes: Record<string, string> = {}): {
  agree: number;
  disagree: number;
  idle: number;
  total: number;
} {
  let agree = 0;
  let disagree = 0;
  let idle = 0;
  for (const v of Object.values(votes)) {
    if (v === 'agree') agree += 1;
    else if (v === 'disagree') disagree += 1;
    else idle += 1;
  }
  return { agree, disagree, idle, total: agree + disagree + idle };
}

export const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  SUBMITTED: 'Submitted',
  RESOLVED: 'Resolved',
  NONE: '—',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  INCONCLUSIVE: 'Inconclusive',
  PENDING: 'Pending',
  SATISFIED: 'Satisfied',
  NOT_SATISFIED: 'Not satisfied',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
};
