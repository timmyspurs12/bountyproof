import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { truncateAddress } from '../lib/format';
import type { AppConfig } from '../lib/types';
import { useConfig, useWallet } from '../hooks/useWallet';
import type { WalletState } from '../hooks/useWallet';
import { useTheme } from '../hooks/useTheme';

/** BountyProof geometric mark: a check whose stem is a document edge,
 *  closed by a finalizing bar. No shields, chains or coins. */
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="mark">
      <rect x="1.5" y="1.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 10.2 L8.8 13 L14 6.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NetworkPill({ config }: { config: AppConfig | null }) {
  const [health, setHealth] = useState<{ rpc_ok: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      api
        .health()
        .then((h) => alive && setHealth(h))
        .catch(() => alive && setHealth({ rpc_ok: false }));
    tick();
    const id = window.setInterval(tick, 30000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  if (!config) return null;
  return (
    <span className="net-pill" title={`GenLayer RPC ${config.network.rpc_url}`}>
      <span className={`dot ${health ? (health.rpc_ok ? 'online' : 'offline') : ''}`} aria-hidden="true" />
      <span>{config.network.name.replace('Genlayer ', '')}</span>
      <span className="chain-id">#{config.network.chain_id}</span>
    </span>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.4v1.5M8 13.1v1.5M1.4 8h1.5M13.1 8h1.5M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M13.4 9.7A5.7 5.7 0 0 1 6.3 2.6 5.8 5.8 0 1 0 13.4 9.7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function WalletButton({ wallet }: { wallet: WalletState & { connect: () => Promise<void>; disconnect: () => void } }) {
  if (wallet.address) {
    return (
      <button
        className="wallet-btn connected"
        onClick={wallet.disconnect}
        title="Connected. Click to disconnect."
      >
        <span className="addr">{truncateAddress(wallet.address)}</span>
      </button>
    );
  }
  return (
    <button className="wallet-btn" onClick={wallet.connect} disabled={wallet.connecting} title="Connect a wallet to sign transactions">
      {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
    </button>
  );
}

export function Layout() {
  const { config, loading: cfgLoading, error: cfgError } = useConfig();
  const wallet = useWallet(config);
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <Link to="/" className="brand" aria-label="BountyProof home">
            <Mark />
            <span>
              BOUNTY<span style={{ color: 'var(--accent-ink)' }}>PROOF</span>
            </span>
          </Link>
          <nav className="main-nav" aria-label="Primary">
            <NavLink to="/bounties" className={({ isActive }) => (isActive ? 'active' : '')}>
              Bounties
            </NavLink>
            <NavLink to="/create" className={({ isActive }) => (isActive ? 'active' : '')}>
              Create
            </NavLink>
            <NavLink to="/how-it-works" className={({ isActive }) => (isActive ? 'active' : '')}>
              How it works
            </NavLink>
          </nav>
          <div className="header-right">
            <ThemeToggle />
            <NetworkPill config={config} />
            <WalletButton wallet={wallet} />
            <button
              className="wallet-btn menu-toggle"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              ☰
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="mobile-nav" aria-label="Mobile">
            <Link to="/bounties">Bounties</Link>
            <Link to="/create">Create</Link>
            <Link to="/how-it-works">How it works</Link>
          </nav>
        )}
      </header>

      {wallet.error && (
        <div className="wrap" style={{ paddingTop: 12 }}>
          <div className="callout error" role="alert">
            <span>Wallet: {wallet.error}</span>
          </div>
        </div>
      )}
      {cfgError && (
        <div className="wrap" style={{ paddingTop: 12 }}>
          <div className="callout error" role="alert">
            <span>Backend unreachable: {cfgError}. The API must be running and reachable at /api.</span>
          </div>
        </div>
      )}

      <main>
        <Outlet context={{ config, cfgLoading, wallet }} />
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <span>
            BountyProof — evidence-based acceptance for software bounties. Decisions are recorded
            by a GenLayer Intelligent Contract.
          </span>
          {config && (
            <span className="mono" style={{ fontSize: 11 }}>
              {config.network.name} · chain {config.network.chain_id}
              {config.contract_address && <> · contract {truncateAddress(config.contract_address, 5)}</>}
            </span>
          )}
        </div>
      </footer>
    </>
  );
}
