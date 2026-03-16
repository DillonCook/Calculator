'use client';

import { Input, PercentInput } from '@/components/dashboard/form-fields';
import type { MasterAssumptions } from '@/lib/models/deal';

interface AssumptionsPanelProps {
  assumptions: MasterAssumptions;
  onChange: (updates: Partial<MasterAssumptions>) => void;
  showTargetIrrInput?: boolean;
  variant?: 'panel' | 'embedded';
}

export function AssumptionsPanel({
  assumptions,
  onChange,
  showTargetIrrInput = false,
  variant = 'panel'
}: AssumptionsPanelProps) {
  const isEmbedded = variant === 'embedded';

  return (
    <section className={isEmbedded ? 'space-y-3' : 'rounded-2xl panel-surface p-3 shadow-soft sm:p-4'}>
      <div className={isEmbedded ? 'space-y-1' : 'mb-3'}>
        <p className={`uppercase tracking-[0.16em] ${isEmbedded ? 'text-[11px] text-muted' : 'text-xs text-accent'}`}>Exit assumptions</p>
        <h3 className={`${isEmbedded ? 'text-base' : 'mt-1 text-lg'} font-semibold text-slate-100`}>IRR and timeline inputs</h3>
        <p className="text-sm text-muted">
          {isEmbedded
            ? 'These settings feed the IRR stream and projected exit math for the active strategy.'
            : 'Set hold period and exit assumptions here so Results stays focused on outputs.'}
        </p>
      </div>

      <div className={`grid gap-3 ${isEmbedded ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2'}`}>
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
        <PercentInput
          label="NOI growth %"
          value={assumptions.noiGrowthPercent}
          onChange={(value) => onChange({ noiGrowthPercent: Math.max(value, 0) })}
          tooltip="Annual growth assumption applied to income and operating expenses in the IRR timeline."
        />
        <PercentInput
          label="Appreciation %"
          value={assumptions.annualAppreciationPercent}
          onChange={(value) => onChange({ annualAppreciationPercent: Math.max(value, 0) })}
          tooltip="Annual property-value growth used to model exit price."
        />
        <PercentInput
          label="Selling cost %"
          value={assumptions.sellingCostPercent}
          onChange={(value) => onChange({ sellingCostPercent: Math.max(value, 0) })}
          tooltip="Transaction cost deducted from the modeled sale price at exit."
        />
        {showTargetIrrInput ? (
          <PercentInput
            label="Target IRR %"
            value={assumptions.targetIrrPercent}
            onChange={(value) => onChange({ targetIrrPercent: Math.max(value, 0) })}
            tooltip="Used by the cash-deal workout to estimate the purchase price needed to hit your target IRR."
          />
        ) : null}
      </div>
    </section>
  );
}
