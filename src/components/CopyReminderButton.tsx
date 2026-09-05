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

  return (
    <button className="btn btn-ghost btn-small" onClick={handleCopy} type="button">
      {copied ? 'Copied!' : 'Copy Reminder'}
    </button>
  );
}