'use client';

import { Input, PercentInput, Select } from '@/components/dashboard/form-fields';
import type { AmortizationType, DealInputModel, ExpenseStrategyKey, FinancingType } from '@/lib/models/deal';

interface DealInputPanelProps {
  value: DealInputModel;
  onChange: (next: DealInputModel) => void;
}

const strategyLabels: Record<ExpenseStrategyKey, string> = {
  longTerm: 'LT',
  airbnb: 'STR',
  padSplit: 'PS',
  flip: 'Flip'
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function DealInputPanel({ value, onChange }: DealInputPanelProps) {
  const update = <T extends keyof DealInputModel, K extends keyof DealInputModel[T]>(section: T, field: K, nextValue: DealInputModel[T][K]) => {
    if (section === 'purchase' && field === 'purchasePrice') {
      const nextPurchasePrice = Number(nextValue) || 0;
      const shouldSyncArv = value.purchase.arv === value.purchase.purchasePrice;
      onChange({
        ...value,
        purchase: {
          ...value.purchase,
          purchasePrice: nextPurchasePrice,
          arv: shouldSyncArv ? nextPurchasePrice : value.purchase.arv
        }
      });
      return;
    }

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
    <section className="rounded-2xl border border-white/10 bg-panel p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Core Deal Inputs</h2>
        <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-muted">Supports decimal inputs</span>
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
            <Input label="Purchase price" type="number" value={value.purchase.purchasePrice} onChange={(v) => update('purchase', 'purchasePrice', Number(v))} />
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
              label={`Property tax override (auto ${currency.format(autoTaxAnnual)})`}
              type="number"
              value={value.purchase.propertyTaxAnnualOverride ?? ''}
              onChange={(v) => update('purchase', 'propertyTaxAnnualOverride', v === '' ? null : Number(v))}
            />
            <Input
              label={`Insurance override (auto ${currency.format(autoInsuranceAnnual)})`}
              type="number"
              value={value.purchase.insuranceAnnualOverride ?? ''}
              onChange={(v) => update('purchase', 'insuranceAnnualOverride', v === '' ? null : Number(v))}
            />
          </div>

          <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Advanced Financing</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="HELOC amount"
                type="number"
                value={value.purchase.helocAmount}
                onChange={(v) => update('purchase', 'helocAmount', Number(v))}
              />
              <PercentInput label="HELOC rate %" value={value.purchase.helocRate} onChange={(v) => update('purchase', 'helocRate', v)} />
              <Input label="HELOC term (years)" type="number" value={value.purchase.helocTermYears} onChange={(v) => update('purchase', 'helocTermYears', Number(v))} />
              <Select
                label="HELOC amortization"
                value={value.purchase.helocAmortizationType}
                onChange={(v) => update('purchase', 'helocAmortizationType', v as AmortizationType)}
                options={[
                  { label: 'Principal & Interest (PI)', value: 'PI' },
                  { label: 'Interest-Only (IO)', value: 'IO' }
                ]}
              />
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
                        <button
                          key={strategy}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            updateVariableExpense(index, {
                              appliesTo: { ...expense.appliesTo, [strategy]: !active }
                            })
                          }
                          className={`flex items-center justify-center rounded-md border px-2 py-1.5 text-xs transition ${
                            active
                              ? 'border-accent/70 bg-accent/20 text-accent'
                              : 'border-white/10 bg-white/[0.02] text-muted'
                          }`}
                        >
                          {strategyLabels[strategy]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

      </div>
    </section>
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
