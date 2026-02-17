'use client';

import type { AmortizationType, DealInputModel, FinancingType } from '@/lib/models/deal';

interface DealInputPanelProps {
  value: DealInputModel;
  onChange: (next: DealInputModel) => void;
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-accent placeholder:text-muted focus:ring-2';

export function DealInputPanel({ value, onChange }: DealInputPanelProps) {
  const update = <T extends keyof DealInputModel, K extends keyof DealInputModel[T]>(section: T, field: K, nextValue: DealInputModel[T][K]) => {
    onChange({ ...value, [section]: { ...value[section], [field]: nextValue } });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Deal Inputs</h2>
        <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-muted">Minimal typing</span>
      </div>

      <div className="space-y-3">
        <Section title="Purchase">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Deal name" value={value.purchase.dealName} onChange={(v) => update('purchase', 'dealName', v)} />
            <Select
              label="Financing"
              value={value.purchase.financingType}
              onChange={(v) => update('purchase', 'financingType', v as FinancingType)}
              options={[
                { label: 'Loan', value: 'loan' },
                { label: 'Cash', value: 'cash' }
              ]}
            />
            <Select
              label="Amortization"
              value={value.purchase.amortizationType}
              onChange={(v) => update('purchase', 'amortizationType', v as AmortizationType)}
              options={[
                { label: 'P&I', value: 'principalInterest' },
                { label: 'Interest-only', value: 'interestOnly' }
              ]}
            />
            <Input label="Purchase price" type="number" value={value.purchase.purchasePrice} onChange={(v) => update('purchase', 'purchasePrice', Number(v))} />
            <Input label="ARV" type="number" value={value.purchase.arv} onChange={(v) => update('purchase', 'arv', Number(v))} />
            <Input label="Rehab budget" type="number" value={value.purchase.rehabBudget} onChange={(v) => update('purchase', 'rehabBudget', Number(v))} />
            <Input label="Down payment (decimal)" type="number" step="0.01" value={value.purchase.downPaymentPercent} onChange={(v) => update('purchase', 'downPaymentPercent', Number(v))} />
            <Input label="Interest rate" type="number" step="0.001" value={value.purchase.interestRate} onChange={(v) => update('purchase', 'interestRate', Number(v))} />
            <Input label="Loan term (years)" type="number" value={value.purchase.loanTermYears} onChange={(v) => update('purchase', 'loanTermYears', Number(v))} />
            <Input label="HOA / mo" type="number" value={value.purchase.hoaMonthly} onChange={(v) => update('purchase', 'hoaMonthly', Number(v))} />
            <Toggle label="Include PMI (0.55% annualized)" checked={value.purchase.includePmi} onChange={(checked) => update('purchase', 'includePmi', checked)} />
          </div>
        </Section>

        <Section title="Long-Term Rental">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Gross rent / mo" type="number" value={value.longTerm.grossRentMonthly} onChange={(v) => update('longTerm', 'grossRentMonthly', Number(v))} />
            <Input label="Other income / mo" type="number" value={value.longTerm.otherIncomeMonthly} onChange={(v) => update('longTerm', 'otherIncomeMonthly', Number(v))} />
            <Input label="Vacancy % (decimal)" type="number" step="0.01" value={value.longTerm.vacancyPercent} onChange={(v) => update('longTerm', 'vacancyPercent', Number(v))} />
            <Input label="Management fee %" type="number" step="0.01" value={value.longTerm.managementFeePercent} onChange={(v) => update('longTerm', 'managementFeePercent', Number(v))} />
            <Input label="Expenses / mo" type="number" value={value.longTerm.ownerExpensesMonthly} onChange={(v) => update('longTerm', 'ownerExpensesMonthly', Number(v))} />
          </div>
        </Section>

        <Section title="Airbnb / STR">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="ADR" type="number" value={value.airbnb.adr} onChange={(v) => update('airbnb', 'adr', Number(v))} />
            <Input label="Occupancy % (decimal)" type="number" step="0.01" value={value.airbnb.occupancyPercent} onChange={(v) => update('airbnb', 'occupancyPercent', Number(v))} />
            <Input label="Platform fee %" type="number" step="0.01" value={value.airbnb.platformFeePercent} onChange={(v) => update('airbnb', 'platformFeePercent', Number(v))} />
            <Input label="Management fee %" type="number" step="0.01" value={value.airbnb.managementFeePercent} onChange={(v) => update('airbnb', 'managementFeePercent', Number(v))} />
            <Input label="Expenses / mo" type="number" value={value.airbnb.ownerExpensesMonthly} onChange={(v) => update('airbnb', 'ownerExpensesMonthly', Number(v))} />
          </div>
        </Section>

        <Section title="PadSplit">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Rentable rooms" type="number" value={value.padSplit.rentableRooms} onChange={(v) => update('padSplit', 'rentableRooms', Number(v))} />
            <Input label="Weekly rate / room" type="number" value={value.padSplit.avgWeeklyRatePerRoom} onChange={(v) => update('padSplit', 'avgWeeklyRatePerRoom', Number(v))} />
            <Input label="Occupancy %" type="number" step="0.01" value={value.padSplit.occupancyPercent} onChange={(v) => update('padSplit', 'occupancyPercent', Number(v))} />
            <Input label="Management fee %" type="number" step="0.01" value={value.padSplit.managementFeePercent} onChange={(v) => update('padSplit', 'managementFeePercent', Number(v))} />
            <Input label="Furnishing (one-time)" type="number" value={value.padSplit.furnishingOneTime} onChange={(v) => update('padSplit', 'furnishingOneTime', Number(v))} />
          </div>
        </Section>

        <Section title="BRRRR + Flip">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="BRRRR hold months" type="number" value={value.brrrr.holdingMonths} onChange={(v) => update('brrrr', 'holdingMonths', Number(v))} />
            <Input label="Refi target LTV %" type="number" step="0.01" value={value.brrrr.refinanceLtvPercent} onChange={(v) => update('brrrr', 'refinanceLtvPercent', Number(v))} />
            <Input label="Flip hold months" type="number" value={value.flip.holdingMonths} onChange={(v) => update('flip', 'holdingMonths', Number(v))} />
            <Input label="Agent commission %" type="number" step="0.01" value={value.flip.agentCommissionPercent} onChange={(v) => update('flip', 'agentCommissionPercent', Number(v))} />
          </div>
        </Section>

        <Section title="Master Assumptions">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Hold years" type="number" value={value.assumptions.holdYears} onChange={(v) => update('assumptions', 'holdYears', Number(v))} />
            <Input label="NOI growth %" type="number" step="0.001" value={value.assumptions.noiGrowthPercent} onChange={(v) => update('assumptions', 'noiGrowthPercent', Number(v))} />
            <Input label="Appreciation %" type="number" step="0.001" value={value.assumptions.annualAppreciationPercent} onChange={(v) => update('assumptions', 'annualAppreciationPercent', Number(v))} />
            <Input label="Selling cost %" type="number" step="0.001" value={value.assumptions.sellingCostPercent} onChange={(v) => update('assumptions', 'sellingCostPercent', Number(v))} />
          </div>
        </Section>
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3" open>
      <summary className="cursor-pointer list-none text-sm font-medium text-white">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  step
}: {
  label: string;
  value: number | string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <input className={inputClass} type={type} step={step} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-panel">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-accent" />
    </label>
  );
}
