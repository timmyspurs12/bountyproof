export interface NetworkConfig {
  name: string;
  chain_id: number;
  rpc_url: string;
  currency: string;
}

export interface AppConfig {
  network: NetworkConfig;
  contract_address: string;
  deploy_tx: string;
  deployed_at: string;
  explorer_base: string;
}

export interface HealthStatus {
  status: string;
  network: string;
  contract_address: string;
  contract_configured: boolean;
  rpc_ok: boolean;
  rpc_error?: string;
}

export interface CriterionView {
  text: string;
  verdict: string; // PENDING | SATISFIED | NOT_SATISFIED | INSUFFICIENT_EVIDENCE
  reason: string;
}

export interface EvidenceView {
  pr_title: string;
  pr_state: string;
  pr_author: string;
  pr_created_at: string;
  pr_merged_at: string;
  head_sha: string;
  base_ref: string;
  commit_count: string;
  changed_files: string;
  additions: string;
  deletions: string;
  body_excerpt: string;
  commit_messages: string;
}

export interface BountyView {
  id: string;
  creator: string;
  title: string;
  repository_url: string;
  issue_url: string;
  description: string;
  deadline_ts: number;
  created_ts: number;
  status: string; // OPEN | SUBMITTED | RESOLVED
  claimant: string;
  pr_url: string;
  submitted_ts: number;
  late_submission: string;
  decision: string; // NONE | ACCEPTED | REJECTED | INCONCLUSIVE
  evaluated_ts: number;
  criteria: CriterionView[];
  satisfied: number;
  not_satisfied: number;
  insufficient: number;
  total_criteria: number;
  evidence: EvidenceView;
}

export interface TxRecord {
  tx_hash: string;
  bounty_id: number;
  kind: string;
  created_at: string;
}

export interface BountyListItem {
  bounty?: BountyView;
  bounty_id?: number;
  create_tx?: string;
  contract?: string;
  title?: string;
  created_at?: string;
  contract_read_error?: string;
  stale_deployment?: boolean;
  note?: string;
  txs?: TxRecord[];
}

export interface BountiesResponse {
  items: BountyListItem[];
  metrics: {
    active: number;
    evaluating: number;
    resolved: number;
    accepted: number;
    rejected: number;
    inconclusive: number;
  };
  contract_ok: boolean;
}

export interface BountyDetail {
  source: string;
  bounty: BountyView;
  create_tx: string | null;
  txs: TxRecord[];
  explorer_base: string;
  contract_address: string;
}

export interface GitHubRepo {
  full_name: string;
  description: string;
  default_branch: string;
  stargazers_count: number;
  html_url: string;
}

export interface GitHubEvidence {
  repository: string;
  pr_number: string;
  pr_title: string;
  pr_state: string;
  pr_merged: boolean;
  pr_author: string;
  pr_created_at: string;
  pr_merged_at: string;
  head_sha: string;
  base_ref: string;
  commit_count: string;
  changed_files: string;
  additions: string;
  deletions: string;
  body_excerpt: string;
  commit_messages: string;
  pr_url: string;
  html_url: string;
}

export interface EvidencePreview {
  source: string;
  retrieved_at: number;
  note: string;
  repository: GitHubRepo;
  evidence: GitHubEvidence;
}

export interface TxVote {
  [validator: string]: string; // agree | disagree | idle
}

export interface TxLifecycle {
  hash: string;
  status: string;
  status_name: string;
  result_name: string;
  from_address: string;
  to_address: string;
  contract_address: string | null;
  created_at: string;
  num_of_rounds: number | null;
  votes: TxVote;
}

export type LifecyclePhase =
  | 'IDLE'
  | 'CONNECTING'
  | 'SIGNING'
  | 'SUBMITTED'
  | 'PENDING'
  | 'EVALUATING'
  | 'FINALIZING'
  | 'FINALIZED'
  | 'FAILED';
