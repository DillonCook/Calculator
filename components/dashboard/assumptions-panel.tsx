'use client';

import { Input, PercentInput } from '@/components/dashboard/form-fields';
import type { MasterAssumptions } from '@/lib/models/deal';

interface AssumptionsPanelProps {
  assumptions: MasterAssumptions;
  onChange: (updates: Partial<MasterAssumptions>) => void;
  showTargetIrrInput?: boolean;
}

export function AssumptionsPanel({
  assumptions,
  onChange,
  showTargetIrrInput = false
}: AssumptionsPanelProps) {
  return (
    <section className="rounded-2xl panel-surface p-3 shadow-soft sm:p-4">
      <div className="mb-3">
        <p className="text-xs uppercase tracking-[0.16em] text-accent">Exit assumptions</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-100">IRR and timeline inputs</h3>
        <p className="mt-1 text-sm text-muted">
          Set hold period and exit assumptions here so Results stays focused on outputs.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
