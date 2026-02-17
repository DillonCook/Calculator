'use client';

import type { AmortizationType, DealInputModel, ExpenseStrategyKey, FinancingType } from '@/lib/models/deal';

interface DealInputPanelProps {
  value: DealInputModel;
  onChange: (next: DealInputModel) => void;
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-accent placeholder:text-muted focus:ring-2';

const strategyLabels: Record<ExpenseStrategyKey, string> = {
  longTerm: 'LT',
  airbnb: 'STR',
  padSplit: 'PadSplit',
  flip: 'Flip'
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function DealInputPanel({ value, onChange }: DealInputPanelProps) {
  const update = <T extends keyof DealInputModel, K extends keyof DealInputModel[T]>(section: T, field: K, nextValue: DealInputModel[T][K]) => {
    onChange({ ...value, [section]: { ...value[section], [field]: nextValue } });
  };

  const updateVariableExpense = (index: number, updates: Partial<DealInputModel['variableExpenses'][number]>) => {
    const nextExpenses = value.variableExpenses.map((entry, currentIndex) =>
      currentIndex === index ? { ...entry, ...updates } : entry
    );

    onChange({ ...value, variableExpenses: nextExpenses });
  };

  const autoTaxAnnual = value.purchase.purchasePrice * 0.017;
  const autoInsuranceAnnual = value.purchase.purchasePrice * 0.01;

  return (
    <section className="scrollbar-premium rounded-2xl border border-white/10 bg-panel p-5 shadow-soft xl:max-h-[calc(100vh-2.5rem)] xl:overflow-y-auto">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Deal Inputs</h2>
        <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-muted">Whole number % inputs</span>
      </div>

      <div className="space-y-3">
        <Section title="Core Inputs · Purchase & Financing" defaultOpen>
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
            <Input label="Purchase price" type="number" value={value.purchase.purchasePrice} onChange={(v) => update('purchase', 'purchasePrice', Number(v))} />
            <Input label="ARV" type="number" value={value.purchase.arv} onChange={(v) => update('purchase', 'arv', Number(v))} />
            <Input label="Rehab budget" type="number" value={value.purchase.rehabBudget} onChange={(v) => update('purchase', 'rehabBudget', Number(v))} />
            <PercentInput label="Down payment %" value={value.purchase.downPaymentPercent} onChange={(v) => update('purchase', 'downPaymentPercent', v)} />
            <PercentInput label="Closing costs %" value={value.purchase.closingCostPercent} onChange={(v) => update('purchase', 'closingCostPercent', v)} />
            <PercentInput label="Interest rate %" value={value.purchase.interestRate} onChange={(v) => update('purchase', 'interestRate', v)} />
            <PercentInput label="Points on loan %" value={value.purchase.pointsPercent} onChange={(v) => update('purchase', 'pointsPercent', v)} />
            <Input label="Loan term (years)" type="number" value={value.purchase.loanTermYears} onChange={(v) => update('purchase', 'loanTermYears', Number(v))} />
            <Input label="HOA monthly" type="number" value={value.purchase.hoaMonthly} onChange={(v) => update('purchase', 'hoaMonthly', Number(v))} />
            <Input label="PMI monthly" type="number" value={value.purchase.pmiMonthly} onChange={(v) => update('purchase', 'pmiMonthly', Number(v))} />
          </div>


          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              label={`Property taxes annual override (auto ${currency.format(autoTaxAnnual)})`}
              type="number"
              value={value.purchase.propertyTaxAnnualOverride ?? ''}
              onChange={(v) => update('purchase', 'propertyTaxAnnualOverride', v === '' ? null : Number(v))}
            />
            <Input
              label={`Insurance annual override (auto ${currency.format(autoInsuranceAnnual)})`}
              type="number"
              value={value.purchase.insuranceAnnualOverride ?? ''}
              onChange={(v) => update('purchase', 'insuranceAnnualOverride', v === '' ? null : Number(v))}
            />
          </div>

          <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Advanced Financing</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {value.purchase.financingType === 'loan' && (
                <Select
                  label="Amortization"
                  value={value.purchase.amortizationType}
                  onChange={(v) => update('purchase', 'amortizationType', v as AmortizationType)}
                  options={[
                    { label: 'Principal & Interest (PI)', value: 'PI' },
                    { label: 'Interest-Only (IO)', value: 'IO' }
                  ]}
                />
              )}
              <Input
                label="HELOC amount (supplemental)"
                type="number"
                value={value.purchase.helocAmount}
                onChange={(v) => update('purchase', 'helocAmount', Number(v))}
              />
              <PercentInput label="HELOC rate %" value={value.purchase.helocRate} onChange={(v) => update('purchase', 'helocRate', v)} />
              <Input
                label="HELOC closing costs"
                type="number"
                value={value.purchase.helocClosingCosts}
                onChange={(v) => update('purchase', 'helocClosingCosts', Number(v))}
              />
            </div>
          </div>

        </Section>

        <Section title="Core Inputs · Variable Expense Matrix" defaultOpen>
          <div className="mb-2 hidden grid-cols-[1.2fr_120px_1fr] gap-2 px-2 text-[11px] uppercase tracking-wider text-muted sm:grid">
            <span>Expense</span>
            <span>Amount / mo</span>
            <span>Applies to strategies</span>
          </div>

          <div className="space-y-2">
            {value.variableExpenses.map((expense, index) => (
              <div key={expense.key} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <div className="grid gap-2 sm:grid-cols-[1.2fr_120px_1fr] sm:items-center">
                  <p className="text-sm font-medium">{expense.label}</p>
                  <input
                    aria-label={`${expense.label} amount per month`}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm"
                    type="number"
                    value={expense.monthlyAmount}
                    onChange={(event) => updateVariableExpense(index, { monthlyAmount: Number(event.target.value) })}
                  />
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {(Object.keys(strategyLabels) as ExpenseStrategyKey[]).map((strategy) => {
                      const active = expense.appliesTo[strategy];
                      return (
                        <label
                          key={strategy}
                          className={`flex cursor-pointer items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs transition ${
                            active
                              ? 'border-accent/70 bg-accent/20 text-accent'
                              : 'border-white/10 bg-white/[0.02] text-muted'
                          }`}
                        >
                          <input
                            className="sr-only"
                            type="checkbox"
                            checked={active}
                            onChange={(event) =>
                              updateVariableExpense(index, {
                                appliesTo: { ...expense.appliesTo, [strategy]: event.target.checked }
                              })
                            }
                          />
                          <span>{strategyLabels[strategy]}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Strategy Modules" defaultOpen={false}>
          <div className="grid gap-3 lg:grid-cols-2">
            <StrategyCard title="Long-Term Rental">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Gross rent / mo" type="number" value={value.longTerm.grossRentMonthly} onChange={(v) => update('longTerm', 'grossRentMonthly', Number(v))} />
                <Input label="Other income / mo" type="number" value={value.longTerm.otherIncomeMonthly} onChange={(v) => update('longTerm', 'otherIncomeMonthly', Number(v))} />
                <PercentInput label="Vacancy %" value={value.longTerm.vacancyPercent} onChange={(v) => update('longTerm', 'vacancyPercent', v)} />
                <PercentInput label="Maintenance %" value={value.longTerm.maintenancePercent} onChange={(v) => update('longTerm', 'maintenancePercent', v)} />
                <PercentInput label="CapEx %" value={value.longTerm.capexPercent} onChange={(v) => update('longTerm', 'capexPercent', v)} />
                <Input label="Other LT expenses / mo" type="number" value={value.longTerm.ownerExpensesMonthly} onChange={(v) => update('longTerm', 'ownerExpensesMonthly', Number(v))} />
              </div>
            </StrategyCard>

            <StrategyCard title="Airbnb / STR">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="ADR" type="number" value={value.airbnb.adr} onChange={(v) => update('airbnb', 'adr', Number(v))} />
                <Input label="Cleaning fee charged" type="number" value={value.airbnb.cleaningFeeCharged} onChange={(v) => update('airbnb', 'cleaningFeeCharged', Number(v))} />
                <Input label="Avg nights per booking" type="number" value={value.airbnb.averageNightsPerBooking} onChange={(v) => update('airbnb', 'averageNightsPerBooking', Number(v))} />
                <PercentInput label="Occupancy %" value={value.airbnb.occupancyPercent} onChange={(v) => update('airbnb', 'occupancyPercent', v)} />
                <PercentInput label="Platform fee %" value={value.airbnb.platformFeePercent} onChange={(v) => update('airbnb', 'platformFeePercent', v)} />
                <Input label="Nights per month" type="number" value={value.airbnb.nightsPerMonth} onChange={(v) => update('airbnb', 'nightsPerMonth', Number(v))} />
                <Input label="Cleaner cost / turn" type="number" value={value.airbnb.cleanerCostPerTurn} onChange={(v) => update('airbnb', 'cleanerCostPerTurn', Number(v))} />
                <Input label="Other STR expenses / mo" type="number" value={value.airbnb.ownerExpensesMonthly} onChange={(v) => update('airbnb', 'ownerExpensesMonthly', Number(v))} />
              </div>
            </StrategyCard>

            <StrategyCard title="PadSplit">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Rentable rooms" type="number" value={value.padSplit.rentableRooms} onChange={(v) => update('padSplit', 'rentableRooms', Number(v))} />
                <Input label="Weekly rate / room" type="number" value={value.padSplit.avgWeeklyRatePerRoom} onChange={(v) => update('padSplit', 'avgWeeklyRatePerRoom', Number(v))} />
                <PercentInput label="Occupancy %" value={value.padSplit.occupancyPercent} onChange={(v) => update('padSplit', 'occupancyPercent', v)} />
                <PercentInput label="Platform fee %" value={value.padSplit.platformFeePercent} onChange={(v) => update('padSplit', 'platformFeePercent', v)} />
                <Input label="Turnover cost / mo" type="number" value={value.padSplit.turnoverCostMonthly} onChange={(v) => update('padSplit', 'turnoverCostMonthly', Number(v))} />
                <Input label="Furnishing (one-time)" type="number" value={value.padSplit.furnishingOneTime} onChange={(v) => update('padSplit', 'furnishingOneTime', Number(v))} />
              </div>
            </StrategyCard>

            <StrategyCard title="BRRRR">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="BRRRR hold months" type="number" value={value.brrrr.holdingMonths} onChange={(v) => update('brrrr', 'holdingMonths', Number(v))} />
                <PercentInput label="Refi target LTV %" value={value.brrrr.refinanceLtvPercent} onChange={(v) => update('brrrr', 'refinanceLtvPercent', v)} />
                <PercentInput label="Refi rate %" value={value.brrrr.refinanceRate} onChange={(v) => update('brrrr', 'refinanceRate', v)} />
                <PercentInput label="Refi closing %" value={value.brrrr.refinanceClosingCostPercent} onChange={(v) => update('brrrr', 'refinanceClosingCostPercent', v)} />
              </div>
            </StrategyCard>

            <StrategyCard title="Flip">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Flip hold months" type="number" value={value.flip.holdingMonths} onChange={(v) => update('flip', 'holdingMonths', Number(v))} />
                <PercentInput label="Agent commission %" value={value.flip.agentCommissionPercent} onChange={(v) => update('flip', 'agentCommissionPercent', v)} />
                <PercentInput label="Sell closing %" value={value.flip.sellClosingCostPercent} onChange={(v) => update('flip', 'sellClosingCostPercent', v)} />
                <Input label="Seller concessions" type="number" value={value.flip.sellerConcessions} onChange={(v) => update('flip', 'sellerConcessions', Number(v))} />
              </div>
            </StrategyCard>
          </div>
        </Section>
      </div>
    </section>
  );
}

function StrategyCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <h3 className="mb-2 text-sm font-medium text-white">{title}</h3>
      {children}
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3" open={defaultOpen}>
      <summary className="cursor-pointer list-none text-sm font-medium text-white">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text'
}: {
  label: string;
  value: number | string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <input className={inputClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function PercentInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const displayValue = Number.isFinite(value) ? Math.round(value * 100) : 0;

  return (
    <label className="space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        className={inputClass}
        type="number"
        step="1"
        value={displayValue}
        onChange={(event) => onChange((Number(event.target.value) || 0) / 100)}
      />
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
