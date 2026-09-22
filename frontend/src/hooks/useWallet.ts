import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { ensureChain, resetClient } from '../lib/genlayer';
import {
  connectWith,
  disconnectWallet,
  getActiveOption,
  getActiveProvider,
  hasInjectedWallet,
  primeWalletDiscovery,
  restoreSession,
} from '../lib/wallet';
import type { EIP1193Provider, WalletOption } from '../lib/wallet';
import type { AppConfig } from '../lib/types';

export interface WalletState {
  address: string | null;
  connecting: boolean;
  error: string | null;
  /** True when at least one browser-extension wallet is installed (WalletConnect works regardless). */
  supported: boolean;
  /** Name of the wallet that is currently connected (e.g. "MetaMask", "WalletConnect"). */
  walletName: string | null;
  /** Whether the wallet chooser dialog is open. */
  chooserOpen: boolean;
}

export interface WalletApi extends WalletState {
  /** Opens the wallet chooser (the "Connect wallet" action). */
  connect: () => Promise<void>;
  /** Connects with a specific option picked from the chooser. */
  connectWith: (option: WalletOption) => Promise<void>;
  closeChooser: () => void;
  disconnect: () => void;
}

export function useWallet(config: AppConfig | null): WalletApi {
  const [state, setState] = useState<WalletState>({
    address: null,
    connecting: false,
    error: null,
    supported: hasInjectedWallet(),
    walletName: null,
    chooserOpen: false,
  });
  const boundProvider = useRef<EIP1193Provider | null>(null);

  useEffect(() => {
    primeWalletDiscovery();
    // EIP-6963 announcements arrive asynchronously; re-check shortly after mount.
    const t = setTimeout(() => setState((s) => ({ ...s, supported: hasInjectedWallet() })), 200);
    return () => clearTimeout(t);
  }, []);

  /** Subscribe to account/chain events on whichever provider is active. */
  const bindEvents = useCallback(() => {
    const p = getActiveProvider();
    if (!p || p === boundProvider.current) return;
    boundProvider.current = p;
    const onAccounts = (accounts: string[]) => {
      resetClient();
      if (!accounts || accounts.length === 0) {
        void disconnectWallet();
        setState((s) => ({ ...s, address: null, walletName: null, error: null }));
      } else {
        setState((s) => ({ ...s, address: accounts[0], error: null }));
      }
    };
    const onChain = () => resetClient(); // keep the address, drop the cached client
    const onDisconnect = () => onAccounts([]);
    p.on?.('accountsChanged', onAccounts);
    p.on?.('chainChanged', onChain);
    p.on?.('disconnect', onDisconnect);
  }, []);

  // Silent reconnect on reload — never prompts; only restores a still-authorised session.
  useEffect(() => {
    if (!config) return;
    let alive = true;
    restoreSession(config).then((address) => {
      if (!alive || !address) return;
      bindEvents();
      setState((s) => ({ ...s, address, walletName: getActiveOption()?.name ?? null }));
    });
    return () => {
      alive = false;
    };
  }, [config, bindEvents]);

  const connect = useCallback(async () => {
    if (!config) throw new Error('Network configuration not loaded yet');
    setState((s) => ({ ...s, chooserOpen: true, error: null }));
  }, [config]);

  const connectWithOption = useCallback(
    async (option: WalletOption) => {
      if (!config) throw new Error('Network configuration not loaded yet');
      setState((s) => ({ ...s, connecting: true, error: null }));
      try {
        const address = await connectWith(option, config);
        bindEvents();
        await ensureChain(config);
        resetClient();
        setState((s) => ({
          ...s,
          address,
          connecting: false,
          error: null,
          walletName: option.name,
          chooserOpen: false,
        }));
      } catch (err: any) {
        const message = err?.message || String(err);
        setState((s) => ({ ...s, connecting: false, error: message }));
        throw err;
      }
    },
    [config, bindEvents]
  );

  const closeChooser = useCallback(() => {
    setState((s) => ({ ...s, chooserOpen: false, connecting: false }));
  }, []);

  const disconnect = useCallback(() => {
    resetClient();
    void disconnectWallet();
    boundProvider.current = null;
    setState((s) => ({ ...s, address: null, walletName: null, error: null }));
  }, []);

  return { ...state, connect, connectWith: connectWithOption, closeChooser, disconnect };
}

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .config()
      .then((cfg) => {
        if (alive) {
          setConfig(cfg);
          setError(null);
        }
      })
      .catch((err) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reload]);

  return { config, error, loading, reload: () => setReload((n) => n + 1) };
}
