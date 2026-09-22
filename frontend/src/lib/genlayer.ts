import { chains, createClient } from 'genlayer-js';
import type { AppConfig } from './types';
import { getActiveProvider, hasInjectedWallet } from './wallet';
import type { EIP1193Provider } from './wallet';

declare global {
  interface Window {
    ethereum?: any;
  }
}

let cachedClient: any = null;
let cachedAddress: string | null = null;

/** True when a browser-extension wallet is present (WalletConnect is always available). */
export function hasWalletProvider(): boolean {
  return hasInjectedWallet();
}

/** The provider the user picked in the wallet chooser; throws if none is connected. */
function provider(): EIP1193Provider {
  const p = getActiveProvider();
  if (!p) throw new Error('No wallet connected. Use "Connect wallet" and pick a wallet first.');
  return p;
}

function hexChainId(id: number): string {
  return '0x' + id.toString(16);
}

/** Add the GenLayer network to the wallet if missing, then switch to it. */
export async function ensureChain(cfg: AppConfig): Promise<void> {
  const eth = provider();
  const target = hexChainId(cfg.network.chain_id);
  const current = await eth
    .request({ method: 'eth_chainId' })
    .catch(() => null);
  if (current === target) return;

  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: target }],
    });
    return;
  } catch (err: any) {
    // 4902 = chain not added yet
    if (err?.code !== 4902 && !/Unrecognized chain|not added/i.test(String(err?.message || err))) {
      throw new Error(
        `Could not switch to the GenLayer network: ${err?.message || String(err)}. ` +
          'Add the network manually (Settings → Networks) if the wallet blocks the prompt.'
      );
    }
  }

  await eth.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: target,
        chainName: cfg.network.name,
        rpcUrls: [cfg.network.rpc_url],
        nativeCurrency: {
          name: 'GEN Token',
          symbol: cfg.network.currency || 'GEN',
          decimals: 18,
        },
        blockExplorerUrls: [cfg.explorer_base],
      },
    ],
  });
}

/**
 * Build the genlayer-js client bound to the connected wallet address.
 * Signing happens in the user's wallet (window.ethereum); reads are served by the
 * backend so the UI never trusts locally fabricated state.
 *
 * Uses the SDK's chain presets (they carry the consensus contract configs the
 * transaction encoder requires) and overrides the RPC URL from the backend config,
 * which stays the source of truth for network metadata.
 */
export function getClient(cfg: AppConfig, address: string) {
  const presets: Record<string, any> = {
    studionet: chains.studionet,
    testnetBradbury: chains.testnetBradbury,
    localnet: chains.localnet,
  };
  const byName = presets[cfg.network.name];
  const byId: Record<number, any> = {
    61999: chains.studionet,
    4221: chains.testnetBradbury,
    61127: chains.localnet,
  };
  let chain: any = byName || byId[cfg.network.chain_id] || presets.studionet;
  if (cfg.network.rpc_url) {
    chain = { ...chain, rpcUrls: { default: { http: [cfg.network.rpc_url] } } };
  }
  // `provider` routes eth_requestAccounts / eth_sendTransaction / personal_sign to the
  // wallet the user chose (extension or WalletConnect) instead of window.ethereum.
  cachedClient = createClient({ chain, account: address as any, provider: provider() as any });
  cachedAddress = address;
  return cachedClient;
}

export function currentAddress(): string | null {
  return cachedAddress;
}

export interface WriteArgs {
  functionName: string;
  args?: unknown[];
}

/** Sign + submit a write transaction via the user's wallet. Returns the tx hash. */
export async function writeContract(
  cfg: AppConfig,
  address: string,
  contract: string,
  write: WriteArgs
): Promise<string> {
  const client = getClient(cfg, address);
  const hash: string = await client.writeContract({
    address: contract,
    functionName: write.functionName,
    args: write.args ?? [],
  });
  return hash;
}

export function resetClient(): void {
  cachedClient = null;
  cachedAddress = null;
}
