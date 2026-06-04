import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PROVIDER_PRESETS } from '@/data/providerPresets';
import type { ProviderType } from '@/types/provider';

interface ProxyAndModelCardProps {
  proxyUrl: string;
  onProxyUrlChange: (v: string) => void;
  model: string;
  onModelChange: (m: string) => void;
  providerType: ProviderType;
  presetModels?: string;
  detectedModels?: string;
  onFetchModels?: () => void;
  isFetchingModels?: boolean;
}

export function ProxyAndModelCard({
  proxyUrl,
  onProxyUrlChange,
  model,
  onModelChange,
  providerType,
  presetModels,
  detectedModels,
  onFetchModels,
  isFetchingModels,
}: ProxyAndModelCardProps) {
  const { t } = useTranslation();
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [modelFilter, setModelFilter] = useState('');
  const presetList = (presetModels || PROVIDER_PRESETS[providerType]?.modelOptions.join(', ') || '')
    .split(/\s*,\s*/)
    .filter(Boolean);
  const detectedList = (detectedModels || '')
    .split(/\s*,\s*/)
    .filter(Boolean)
    .filter((m) => !presetList.includes(m)); // dedupe against presets

  const hasDetected = detectedList.length > 0;
  const normalizedFilter = modelFilter.trim().toLowerCase();
  const filteredPresetList = useMemo(
    () => filterModels(presetList, normalizedFilter),
    [presetList, normalizedFilter],
  );
  const filteredDetectedList = useMemo(
    () => filterModels(detectedList, normalizedFilter),
    [detectedList, normalizedFilter],
  );

  const selectModel = (value: string) => {
    onModelChange(value);
    setModelModalOpen(false);
  };

  return (
    <>
      <Card>
        <div className="flex flex-col md:flex-row md:items-end gap-4 md:gap-8">
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <label className="text-h2 font-bold text-fg" htmlFor="proxy-url">
              {t('proxyUrl')}
            </label>
            <Input
              id="proxy-url"
              value={proxyUrl}
              onChange={(e) => onProxyUrlChange(e.target.value)}
            />
          </div>

          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <label className="text-h2 font-bold text-fg" htmlFor="model-input">
              {t('selectModel')}
            </label>
            <div className="flex gap-1 min-w-0">
              <div className="flex-1 min-w-0">
                <Input
                  id="model-input"
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  placeholder={t('modelInputPlaceholder')}
                  className="w-full font-mono"
                />
              </div>
              <Button variant="secondary" size="sm" onClick={() => setModelModalOpen(true)} className="shrink-0">
                {t('chooseModel')}
              </Button>
              <Button variant="success" size="sm" onClick={onFetchModels} className="shrink-0" disabled={isFetchingModels}>
                {isFetchingModels ? t('detecting') : t('detectModels')}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Modal
        open={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        title={t('chooseModel')}
        className="max-w-[720px]"
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Input
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              placeholder={t('filterModels')}
              className="h-10"
              autoFocus
            />
            <Button
              variant="success"
              size="md"
              onClick={onFetchModels}
              className="shrink-0"
              disabled={isFetchingModels}
            >
              {isFetchingModels ? t('detecting') : t('detectModels')}
            </Button>
          </div>
          <div className="max-h-[58vh] overflow-y-auto rounded-card border border-border bg-surface p-2">
            <ModelGroup title={t('presetModel')}>
              {filteredPresetList.map((m) => (
                <ModelOption key={m} value={m} active={m === model} onSelect={selectModel} />
              ))}
              {filteredPresetList.length === 0 && (
                <p className="px-2 py-3 text-body text-fg-muted">{t('noModelsFound')}</p>
              )}
            </ModelGroup>

            {hasDetected && (
              <ModelGroup title={t('detectedModelsTitle')} className="mt-4">
                {filteredDetectedList.map((m) => (
                  <ModelOption key={m} value={m} active={m === model} onSelect={selectModel} />
                ))}
                {filteredDetectedList.length === 0 && (
                  <p className="px-2 py-3 text-body text-fg-muted">{t('noModelsFound')}</p>
                )}
              </ModelGroup>
            )}
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setModelModalOpen(false)}>
              {t('close')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function filterModels(models: string[], normalizedFilter: string) {
  if (!normalizedFilter) return models;
  return models.filter((m) => m.toLowerCase().includes(normalizedFilter));
}

interface ModelGroupProps {
  title: string;
  className?: string;
  children: ReactNode;
}

function ModelGroup({ title, className, children }: ModelGroupProps) {
  return (
    <section className={className}>
      <h3 className="px-2 pb-2 text-btn font-bold text-fg-muted">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-1">
        {children}
      </div>
    </section>
  );
}

interface ModelOptionProps {
  value: string;
  active: boolean;
  onSelect: (value: string) => void;
}

function ModelOption({ value, active, onSelect }: ModelOptionProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={[
        'w-full rounded-card border px-3 py-2 text-left text-body font-mono leading-snug transition-colors cursor-pointer',
        'whitespace-normal break-all',
        active
          ? 'border-primary bg-primary-soft text-primary'
          : 'border-transparent text-fg hover:border-border hover:bg-hover',
      ].join(' ')}
    >
      {value}
    </button>
  );
}
