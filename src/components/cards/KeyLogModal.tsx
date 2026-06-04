import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import type { KeyLog } from '@/types/log';

interface KeyLogModalProps {
  open: boolean;
  onClose: () => void;
  log: KeyLog | null;
}

export function KeyLogModal({ open, onClose, log }: KeyLogModalProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={t('logViewer.title')}>
      <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
        {!log || log.events.length === 0 ? (
          <p className="text-body text-fg-muted text-center py-8">
            {t('logViewer.noData')}
          </p>
        ) : (
          log.events.map((event, i) => (
            <div
              key={event.id || i}
              className="rounded-card border border-border bg-surface p-3 flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-btn font-bold text-fg-muted">
                  {t('logViewer.attempt')} {event.attempt ?? i + 1}
                </span>
                {event.duration !== undefined && (
                  <span className="text-body text-fg-muted">
                    {t('logViewer.duration')}: {event.duration}ms
                  </span>
                )}
                {event.statusCode !== undefined && (
                  <span className={`text-body font-bold ${event.statusCode >= 200 && event.statusCode < 300 ? 'text-success' : 'text-error'}`}>
                    {t('logViewer.errorStatus')}: {event.statusCode}
                  </span>
                )}
              </div>
              {event.message && (
                <div>
                  <span className="text-body text-fg-muted">{t('logViewer.message')}: </span>
                  <span className="text-body text-fg break-words">{event.message}</span>
                </div>
              )}
              {event.requestUrl && (
                <div>
                  <span className="text-body text-fg-muted">{t('logViewer.request')}: </span>
                  <span className="text-body text-fg font-mono text-xs break-all">{event.requestUrl}</span>
                </div>
              )}
              {event.responseBody ? (
                <pre className="text-body text-fg font-mono text-xs whitespace-pre-wrap break-all bg-canvas rounded p-2 max-h-[200px] overflow-y-auto">
                  {formatJson(event.responseBody)}
                </pre>
              ) : (
                <p className="text-body text-fg-muted bg-canvas rounded p-2">
                  {t('logViewer.noResponseBody')}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
