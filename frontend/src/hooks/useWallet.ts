import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  ensureChain,
  hasWalletProvider,
  resetClient,
  requestAccounts,
} from '../lib/genlayer';
import type { AppConfig } from '../lib/types';

export interface WalletState {
  address: string | null;
  connecting: boolean;
  error: string | null;
  supported: boolean;
}

export function useWallet(config: AppConfig | null) {
  const [state, setState] = useState<WalletState>({
    address: null,
    connecting: false,
    error: null,
    supported: hasWalletProvider(),
  });

  useEffect(() => {
    const onAccounts = (accounts: string[]) => {
      setState((s) => ({ ...s, address: accounts[0] || null, error: null }));
    };
    const onChain = () => {
      // Wallet switched networks; keep the address but drop the cached client.
      resetClient();
    };
    const eth = (window as any).ethereum;
    if (eth?.on) {
      eth.on('accountsChanged', onAccounts);
      eth.on('chainChanged', onChain);
    }
    return () => {
      if (eth?.removeListener) {
        eth.removeListener('accountsChanged', onAccounts);
        eth.removeListener('chainChanged', onChain);
      }
    };
  }, []);

  const connect = useCallback(async () => {
    if (!config) throw new Error('Network configuration not loaded yet');
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const address = await requestAccounts();
      await ensureChain(config);
      setState({ address, connecting: false, error: null, supported: true });
    } catch (err: any) {
      setState((s) => ({
        ...s,
        connecting: false,
        error: err?.message || String(err),
      }));
      throw err;
    }
  }, [config]);

  const disconnect = useCallback(() => {
    resetClient();
    setState((s) => ({ ...s, address: null, error: null }));
  }, []);

  return { ...state, connect, disconnect };
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
