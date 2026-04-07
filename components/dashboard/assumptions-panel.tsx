'use client';

import { Input, PercentInput } from '@/components/dashboard/form-fields';
import type { MasterAssumptions } from '@/lib/models/deal';

interface AssumptionsPanelProps {
  assumptions: MasterAssumptions;
  onChange: (updates: Partial<MasterAssumptions>) => void;
  showTargetIrrInput?: boolean;
  variant?: 'panel' | 'embedded';
  hideHeader?: boolean;
}

export function AssumptionsPanel({
  assumptions,
  onChange,
  showTargetIrrInput = false,
  variant = 'panel',
  hideHeader = false
}: AssumptionsPanelProps) {
  const isEmbedded = variant === 'embedded';
  const eyebrow = isEmbedded ? 'IRR assumptions' : 'Exit assumptions';
  const heading = isEmbedded ? 'Hold and exit settings' : 'IRR and timeline inputs';
  const fieldShellClass = isEmbedded ? 'section-inner rounded-xl p-2.5' : '';

  return (
    <section className={isEmbedded ? 'space-y-3' : 'section-shell section-shell-projection rounded-2xl p-3 shadow-soft sm:p-4'}>
      {!hideHeader ? (
        <div className={isEmbedded ? 'space-y-1' : 'mb-3'}>
          <p className={`uppercase tracking-[0.16em] ${isEmbedded ? 'text-[11px] text-muted' : 'section-eyebrow-projection text-xs'}`}>{eyebrow}</p>
          <h3 className={`${isEmbedded ? 'text-base' : 'mt-1 text-lg'} font-semibold text-slate-100`}>{heading}</h3>
          <p className="text-sm text-muted">
            {isEmbedded
              ? 'These assumptions control the active strategy timeline and projected exit inside this stream.'
              : 'Set hold period and exit assumptions here so Results stays focused on outputs.'}
          </p>
        </div>
      ) : null}

      <div className={`grid gap-2.5 ${isEmbedded ? 'grid-cols-1 sm:grid-cols-2' : 'sm:grid-cols-2'}`}>
        <div className={fieldShellClass}>
          <Input
            label="Hold years"
            type="number"
            step="1"
            value={assumptions.holdYears}
            onChange={(value) => {
              const nextValue = Number(value);
              onChange({ holdYears: Number.isFinite(nextValue) ? Math.max(nextValue, 1) : 1 });
            }}
            tooltip="How long you expect to hold the property before the modeled sale."
          />
        </div>
        <div className={fieldShellClass}>
          <PercentInput
            label="NOI growth %"
            value={assumptions.noiGrowthPercent}
            onChange={(value) => onChange({ noiGrowthPercent: Math.max(value, 0) })}
            tooltip="Annual growth assumption applied to income and operating expenses in the IRR timeline."
          />
        </div>
        <div className={fieldShellClass}>
          <PercentInput
            label="Appreciation %"
            value={assumptions.annualAppreciationPercent}
            onChange={(value) => onChange({ annualAppreciationPercent: Math.max(value, 0) })}
            tooltip="Annual property-value growth used to model exit price."
          />
        </div>
        <div className={fieldShellClass}>
          <PercentInput
            label="Selling cost %"
            value={assumptions.sellingCostPercent}
            onChange={(value) => onChange({ sellingCostPercent: Math.max(value, 0) })}
            tooltip="Transaction cost deducted from the modeled sale price at exit."
          />
        </div>
        {showTargetIrrInput ? (
          <div className={`${fieldShellClass} ${isEmbedded ? 'sm:col-span-2' : ''}`.trim()}>
            <PercentInput
              label="Target IRR %"
              value={assumptions.targetIrrPercent}
              onChange={(value) => onChange({ targetIrrPercent: Math.max(value, 0) })}
              tooltip="Used by the cash-deal workout to estimate the purchase price needed to hit your target IRR."
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
