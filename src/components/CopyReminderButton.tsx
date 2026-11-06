import { useState } from 'react';
import type { Quotation } from '../types';
import { buildReminderMessage } from '../utils/reminderMessage';

interface CopyReminderButtonProps {
  quotation: Quotation;
  customerName: string;
}

export default function CopyReminderButton({ quotation, customerName }: CopyReminderButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const message = buildReminderMessage(quotation, customerName);

    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // Fallback for browsers/contexts without Clipboard API access.
      const textarea = document.createElement('textarea');
      textarea.value = message;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Icon-only: a clipboard that turns into a tick for a moment after copying.
  return (
    <button
      className="btn btn-ghost btn-small"
      onClick={handleCopy}
      type="button"
      title={copied ? 'Copied!' : 'Copy payment reminder'}
      aria-label={copied ? 'Copied' : 'Copy payment reminder message'}
      style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}