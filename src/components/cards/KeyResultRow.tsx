import { useState } from 'react';
import { Eye, EyeOff, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { maskKey } from '@/lib/keyProcessor';

export type KeyStatus = 'valid' | 'invalid' | 'rate-limited' | 'paid' | 'pending' | 'retrying' | 'cancelled';

export interface KeyResult {
  id: string;
  key: string;
  status: KeyStatus;
  statusCode?: number;
  error?: string;
  balance?: string;
}

interface KeyResultRowProps {
  data: KeyResult;
  onStatusClick?: (keyId: string) => void;
}

export function KeyResultRow({ data, onStatusClick }: KeyResultRowProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusToBadge: Record<KeyStatus, { tone: 'success' | 'error' | 'warning' | 'info'; label: string }> = {
    valid: { tone: 'success', label: t('statusValid') },
    invalid: { tone: 'error', label: t('statusInvalid') },
    'rate-limited': { tone: 'warning', label: t('statusRateLimited') },
    paid: { tone: 'info', label: t('paidKeys') },
    pending: { tone: 'info', label: '' },
    retrying: { tone: 'warning', label: t('statusRetrying') },
    cancelled: { tone: 'error', label: t('close') },
  };

  const badge = statusToBadge[data.status];
  const canOpenDetails = Boolean(
    onStatusClick
    && ['invalid', 'rate-limited', 'cancelled'].includes(data.status),
  );
  const errorLabel = data.error
    ? t(data.error, { defaultValue: t(`errorMessages.${data.error}`, { defaultValue: data.error }) })
    : '';

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* empty */ }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 py-2 rounded-card border border-border bg-surface">
      {canOpenDetails ? (
        <button
          type="button"
          onClick={() => onStatusClick?.(data.key)}
          className="shrink-0 cursor-pointer"
          title={t('viewErrorDetails')}
          aria-label={t('viewErrorDetails')}
        >
          <Badge tone={badge.tone}>
            {badge.label}
          </Badge>
        </button>
      ) : (
        <Badge tone={badge.tone} className="shrink-0">
          {badge.label}
        </Badge>
      )}

      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-1 min-w-0 px-2 py-1 rounded-card border border-border bg-surface">
            <span className="block text-body text-fg font-mono truncate">
              {revealed ? data.key : maskKey(data.key)}
            </span>
          </div>
          <button
            type="button"
            aria-label={revealed ? '隐藏' : '显示'}
            onClick={() => setRevealed((v) => !v)}
            className="text-fg hover:opacity-70 cursor-pointer shrink-0"
          >
            {revealed ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
          <button
            type="button"
            aria-label="复制"
            onClick={onCopy}
            className={cn(
              'cursor-pointer shrink-0 transition-colors',
              copied ? 'text-success' : 'text-fg hover:opacity-70',
            )}
          >
            <Copy size={20} />
          </button>
        </div>

        <div className="flex items-center gap-4 text-body text-fg-muted">
          {data.statusCode !== undefined && (
            <button
              type="button"
              onClick={() => onStatusClick?.(data.key)}
              className="hover:text-fg hover:underline cursor-pointer"
              title={t('viewErrorDetails')}
            >
              ({data.statusCode})
            </button>
          )}
          {errorLabel && (
            <button
              type="button"
              onClick={() => onStatusClick?.(data.key)}
              className="min-w-0 truncate hover:text-fg hover:underline cursor-pointer"
              title={t('viewErrorDetails')}
            >
              {errorLabel}
            </button>
          )}
          {data.balance && <span>{t('balance.title')}：{data.balance}</span>}
        </div>
      </div>
    </div>
  );
}
