/**
 * Wallet provider discovery + selection.
 *
 * Two families of providers are supported:
 *   1. Injected browser extensions, discovered via EIP-6963 so that every
 *      installed wallet (MetaMask, Rabby, Zerion, Coinbase, …) is listed
 *      individually instead of whichever one happens to own `window.ethereum`.
 *   2. WalletConnect v2 (QR / deep link) for mobile and non-extension wallets.
 *
 * Whatever the user picks becomes the "active provider"; all signing in
 * `genlayer.ts` goes through it. The choice is remembered so a page reload can
 * silently reconnect to the same wallet without prompting.
 */

import type { AppConfig } from './types';

export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<any>;
  on?(event: string, listener: (...args: any[]) => void): void;
  removeListener?(event: string, listener: (...args: any[]) => void): void;
  disconnect?(): Promise<void>;
}

export interface WalletOption {
  id: string; // 'wc' or the EIP-6963 rdns / 'injected'
  kind: 'injected' | 'walletconnect';
  name: string;
  icon?: string; // data URI (EIP-6963) — safe to render inline
  provider?: EIP1193Provider; // injected only; WC is created lazily
}

interface EIP6963ProviderDetail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: EIP1193Provider;
}

// WalletConnect Cloud project IDs are public identifiers (they ship in every
// dApp bundle and are restricted by allowed origins in the WC dashboard), so a
// baked-in default is fine; an env override is still honoured.
export const WALLETCONNECT_PROJECT_ID: string =
  (import.meta as any).env?.VITE_WALLETCONNECT_PROJECT_ID || '55537a3130626987d639156d100d67ac';

const STORAGE_KEY = 'bountyproof-wallet';

let activeProvider: EIP1193Provider | null = null;
let activeOption: WalletOption | null = null;
let wcProvider: any = null; // cached WalletConnect EthereumProvider instance

const discovered = new Map<string, EIP6963ProviderDetail>();
let listening = false;

function startDiscovery(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('eip6963:announceProvider', (event: any) => {
    const detail = event?.detail as EIP6963ProviderDetail | undefined;
    if (detail?.info?.rdns && detail.provider) discovered.set(detail.info.rdns, detail);
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

/** Kick off EIP-6963 discovery early (idempotent). */
export function primeWalletDiscovery(): void {
  startDiscovery();
}

/** Every wallet the user can pick from right now. */
export function listWalletOptions(): WalletOption[] {
  startDiscovery();
  const options: WalletOption[] = [];

  for (const d of discovered.values()) {
    options.push({
      id: d.info.rdns,
      kind: 'injected',
      name: d.info.name,
      icon: d.info.icon,
      provider: d.provider,
    });
  }

  // Legacy fallback: wallets that only set window.ethereum and don't announce
  // via EIP-6963. Only shown when discovery found nothing, to avoid duplicates.
  if (options.length === 0 && typeof window !== 'undefined' && window.ethereum) {
    const eth = window.ethereum;
    const multi: any[] = Array.isArray(eth.providers) ? eth.providers : [eth];
    multi.forEach((p, i) => {
      options.push({
        id: multi.length > 1 ? `injected-${i}` : 'injected',
        kind: 'injected',
        name: guessInjectedName(p),
        provider: p,
      });
    });
  }

  options.sort((a, b) => a.name.localeCompare(b.name));
  options.push({ id: 'wc', kind: 'walletconnect', name: 'WalletConnect' });
  return options;
}

function guessInjectedName(p: any): string {
  if (p?.isRabby) return 'Rabby';
  if (p?.isZerion) return 'Zerion';
  if (p?.isCoinbaseWallet) return 'Coinbase Wallet';
  if (p?.isBraveWallet) return 'Brave Wallet';
  if (p?.isTrust) return 'Trust Wallet';
  if (p?.isMetaMask) return 'MetaMask';
  return 'Browser wallet';
}

export function hasAnyWallet(): boolean {
  // WalletConnect is always available, so a picker is always meaningful.
  return true;
}

export function hasInjectedWallet(): boolean {
  startDiscovery();
  return discovered.size > 0 || (typeof window !== 'undefined' && !!window.ethereum);
}

export function getActiveProvider(): EIP1193Provider | null {
  return activeProvider;
}

export function getActiveOption(): WalletOption | null {
  return activeOption;
}

function remember(option: WalletOption | null): void {
  try {
    if (!option) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: option.id, kind: option.kind }));
  } catch {
    /* storage may be unavailable (private mode) — reconnect just won't be automatic */
  }
}

export function rememberedWallet(): { id: string; kind: WalletOption['kind'] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Lazily build (and cache) the WalletConnect provider for the configured chain. */
async function walletConnectProvider(cfg: AppConfig): Promise<any> {
  if (wcProvider) return wcProvider;
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
  const chainId = cfg.network.chain_id;
  wcProvider = await EthereumProvider.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    optionalChains: [chainId],
    rpcMap: { [chainId]: cfg.network.rpc_url },
    showQrModal: true,
    metadata: {
      name: 'BountyProof',
      description: 'Evidence-based acceptance for software bounties on GenLayer',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://bountyproof.vercel.app',
      icons: [],
    },
    qrModalOptions: {
      themeMode:
        typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
          ? 'dark'
          : 'light',
    },
  });
  return wcProvider;
}

/**
 * Connect to the chosen wallet. Returns the selected account address.
 * Throws with the wallet's own error message on rejection.
 */
export async function connectWith(option: WalletOption, cfg: AppConfig): Promise<string> {
  let provider: EIP1193Provider;
  let accounts: string[];

  if (option.kind === 'walletconnect') {
    const wc = await walletConnectProvider(cfg);
    if (wc.session && wc.accounts?.length) {
      accounts = wc.accounts;
    } else {
      await wc.connect(); // opens the QR modal; resolves once a wallet approves
      accounts = await wc.request({ method: 'eth_accounts' });
    }
    provider = wc;
  } else {
    if (!option.provider) throw new Error(`${option.name} is not available in this browser.`);
    provider = option.provider;
    accounts = await provider.request({ method: 'eth_requestAccounts' });
  }

  if (!accounts || accounts.length === 0) throw new Error('Wallet returned no accounts.');
  activeProvider = provider;
  activeOption = option;
  remember(option);
  return accounts[0];
}

/**
 * Silently restore the previous session without prompting (page reload).
 * Returns the address or null if nothing could be restored.
 */
export async function restoreSession(cfg: AppConfig): Promise<string | null> {
  const saved = rememberedWallet();
  if (!saved) return null;

  try {
    if (saved.kind === 'walletconnect') {
      const wc = await walletConnectProvider(cfg);
      if (!wc.session || !wc.accounts?.length) return null;
      activeProvider = wc;
      activeOption = { id: 'wc', kind: 'walletconnect', name: 'WalletConnect' };
      return wc.accounts[0];
    }

    // Injected: wait briefly for EIP-6963 announcements (they are async).
    startDiscovery();
    await new Promise((r) => setTimeout(r, 150));
    const option = listWalletOptions().find((o) => o.id === saved.id && o.kind === 'injected');
    if (!option?.provider) return null;
    // eth_accounts never prompts; empty means the site is no longer authorised.
    const accounts: string[] = await option.provider.request({ method: 'eth_accounts' });
    if (!accounts?.length) return null;
    activeProvider = option.provider;
    activeOption = option;
    return accounts[0];
  } catch {
    return null;
  }
}

export async function disconnectWallet(): Promise<void> {
  const p: any = activeProvider;
  activeProvider = null;
  activeOption = null;
  remember(null);
  if (p && activeOptionIsWC(p)) {
    try {
      await p.disconnect();
    } catch {
      /* session already gone */
    }
  }
}

function activeOptionIsWC(p: any): boolean {
  return p === wcProvider && !!wcProvider;
}
