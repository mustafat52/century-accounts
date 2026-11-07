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

  // Emoji button: a bell, turning into a tick for a moment after copying.
  return (
    <button
      className="btn btn-ghost btn-small"
      onClick={handleCopy}
      type="button"
      title={copied ? 'Copied!' : 'Copy payment reminder'}
      aria-label={copied ? 'Copied' : 'Copy payment reminder message'}
      style={{ fontSize: 16, lineHeight: 1, padding: '7px 0', width: '100%' }}
    >
      {copied ? '✅' : '🔔'}
    </button>
  );
}