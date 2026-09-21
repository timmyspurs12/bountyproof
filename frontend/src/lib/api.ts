import type {
  AppConfig,
  BountiesResponse,
  BountyDetail,
  EvidencePreview,
  HealthStatus,
  TxLifecycle,
} from './types';

const BASE = '/api';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      (body as any)?.error?.message || (body as any)?.detail || res.statusText;
    const field = (body as any)?.error?.field;
    throw new ApiError(detail, res.status, field);
  }
  return body as T;
}

export class ApiError extends Error {
  status: number;
  field?: string;
  constructor(message: string, status: number, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export const api = {
  health: () => http<HealthStatus>('/health'),
  config: () => http<AppConfig>('/config'),
  bounties: () => http<BountiesResponse>('/bounties'),
  bounty: (id: number | string) => http<BountyDetail>(`/bounties/${id}`),
  findBounty: (creator: string, title: string, deadline_ts: number) =>
    http<{ bounty_id: number }>(
      `/bounties/find?creator=${encodeURIComponent(creator)}&title=${encodeURIComponent(
        title
      )}&deadline_ts=${deadline_ts}`
    ),
  evidence: (repository_url: string, pr_url: string) =>
    http<EvidencePreview>('/evidence/preview', {
      method: 'POST',
      body: JSON.stringify({ repository_url, pr_url }),
    }),
  validateBounty: (payload: Record<string, unknown>) =>
    http<{ valid: boolean } & Record<string, unknown>>('/bounties/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  indexBounty: (bounty_id: number, tx_hash: string, title: string) =>
    http<{ indexed: boolean }>('/index/bounty', {
      method: 'POST',
      body: JSON.stringify({ bounty_id, tx_hash, title }),
    }),
  indexTx: (bounty_id: number, tx_hash: string, kind: string) =>
    http<{ indexed: boolean }>('/index/tx', {
      method: 'POST',
      body: JSON.stringify({ bounty_id, tx_hash, kind }),
    }),
  tx: (hash: string) => http<TxLifecycle>(`/transactions/${hash}`),
  txWait: (hash: string, timeout_s = 90) =>
    http<TxLifecycle>(`/transactions/${hash}/wait?timeout_s=${timeout_s}`),
};
