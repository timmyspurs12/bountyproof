import { useState } from 'react';

interface TechProps {
  label?: string;
  value: string;
  display?: string;
  title?: string;
}

/** Monospace technical identifier with copy button. */
export function Tech({ label, value, display, title }: TechProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <span className="tech" title={title || value}>
      {label && <span className="tech-label">{label}</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{display || value}</span>
      <button
        className={`copy-btn${copied ? ' copied' : ''}`}
        onClick={copy}
        aria-label={`Copy ${label || 'value'}`}
        title="Copy"
      >
        {copied ? '✓' : '⧉'}
      </button>
    </span>
  );
}
