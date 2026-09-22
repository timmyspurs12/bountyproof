import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { listWalletOptions } from '../lib/wallet';
import type { WalletOption } from '../lib/wallet';
import type { WalletApi } from '../hooks/useWallet';

/**
 * Wallet selection dialog. Lists every installed extension wallet individually
 * (EIP-6963) plus WalletConnect for mobile / non-extension wallets.
 */
export function WalletChooser({ wallet }: { wallet: WalletApi }) {
  const [options, setOptions] = useState<WalletOption[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Refresh the list while open — extensions announce themselves asynchronously.
  useEffect(() => {
    if (!wallet.chooserOpen) return;
    setLocalError(null);
    setPending(null);
    setOptions(listWalletOptions());
    const t = setTimeout(() => setOptions(listWalletOptions()), 250);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') wallet.closeChooser();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [wallet.chooserOpen, wallet.closeChooser]);

  const injected = useMemo(() => options.filter((o) => o.kind === 'injected'), [options]);
  const wc = useMemo(() => options.find((o) => o.kind === 'walletconnect'), [options]);

  if (!wallet.chooserOpen) return null;

  const pick = async (o: WalletOption) => {
    setPending(o.id);
    setLocalError(null);
    try {
      await wallet.connectWith(o);
    } catch (err: any) {
      setLocalError(friendly(err));
    } finally {
      setPending(null);
    }
  };

  // Portal to <body>: the header is sticky with a backdrop-filter, which would
  // otherwise become the containing block for position:fixed and clip the dialog.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={wallet.closeChooser} role="presentation">
      <div
        className="modal wallet-chooser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-chooser-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="wallet-chooser-title">Connect a wallet</h2>
          <button className="icon-btn" onClick={wallet.closeChooser} aria-label="Close" title="Close">
            <CloseIcon />
          </button>
        </div>
        <p className="modal-sub">
          Your wallet signs the on-chain transactions (publish, submit, evaluate). BountyProof never
          holds keys.
        </p>

        <div className="wallet-group">
          <div className="wallet-group-label">Browser extensions</div>
          {injected.length === 0 ? (
            <div className="wallet-empty">
              No extension wallet detected in this browser. Use WalletConnect below, or install
              MetaMask / Rabby and reload.
            </div>
          ) : (
            injected.map((o) => (
              <WalletRow key={o.id} option={o} busy={pending === o.id} disabled={!!pending} onPick={pick} />
            ))
          )}
        </div>

        {wc && (
          <div className="wallet-group">
            <div className="wallet-group-label">Mobile &amp; other wallets</div>
            <WalletRow
              option={wc}
              busy={pending === wc.id}
              disabled={!!pending}
              onPick={pick}
              hint="Scan a QR code with any WalletConnect-compatible wallet"
            />
          </div>
        )}

        {localError && (
          <div className="wallet-error" role="alert">
            {localError}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function WalletRow({
  option,
  busy,
  disabled,
  onPick,
  hint,
}: {
  option: WalletOption;
  busy: boolean;
  disabled: boolean;
  onPick: (o: WalletOption) => void;
  hint?: string;
}) {
  return (
    <button className="wallet-row" onClick={() => onPick(option)} disabled={disabled}>
      <span className="wallet-row-icon">
        {option.icon ? <img src={option.icon} alt="" /> : option.kind === 'walletconnect' ? <WcIcon /> : <GenericIcon />}
      </span>
      <span className="wallet-row-text">
        <span className="wallet-row-name">{option.name}</span>
        {hint && <span className="wallet-row-hint">{hint}</span>}
      </span>
      <span className="wallet-row-state">{busy ? 'Waiting for approval…' : ''}</span>
    </button>
  );
}

function friendly(err: any): string {
  const msg: string = err?.message || String(err);
  if (err?.code === 4001 || /rejected|denied|cancel/i.test(msg)) return 'Connection request was rejected in the wallet.';
  if (/Connection request reset/i.test(msg)) return 'WalletConnect was closed before a wallet approved. Pick a wallet again when ready.';
  if (/Proposal expired|expired/i.test(msg)) return 'The WalletConnect session request expired. Try again.';
  return msg;
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function GenericIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M16 15h2" />
    </svg>
  );
}

function WcIcon() {
  // Simplified WalletConnect "bridge" mark drawn inline (no external asset needed).
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <path
        d="M8.2 12.4c4.3-4.2 11.3-4.2 15.6 0l.5.5c.2.2.2.6 0 .8l-1.8 1.7c-.1.1-.3.1-.4 0l-.7-.7c-3-2.9-7.9-2.9-10.9 0l-.8.7c-.1.1-.3.1-.4 0L7.6 13.7c-.2-.2-.2-.6 0-.8l.6-.5Zm19.3 3.6 1.6 1.5c.2.2.2.6 0 .8l-7.1 7c-.2.2-.6.2-.8 0l-5.1-4.9c-.1-.1-.2-.1-.2 0l-5.1 4.9c-.2.2-.6.2-.8 0l-7.1-7c-.2-.2-.2-.6 0-.8l1.6-1.5c.2-.2.6-.2.8 0l5.1 4.9c.1.1.2.1.2 0l5.1-4.9c.2-.2.6-.2.8 0l5.1 4.9c.1.1.2.1.2 0l5.1-4.9c.2-.2.6-.2.8 0Z"
        fill="#3b99fc"
      />
    </svg>
  );
}
