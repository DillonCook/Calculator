'use client';

import { useEffect, useState } from 'react';
import { Input, PercentInput, Select } from '@/components/dashboard/form-fields';
import type { AmortizationType, DealInputModel, ExpenseStrategyKey, FinancingType } from '@/lib/models/deal';
import { currencyFormatter } from '@/lib/formatters';
import { extractDealNameFromListingUrl, isOneHomeUrl } from '@/lib/listing-link';

interface DealInputPanelProps {
  value: DealInputModel;
  onChange: (next: DealInputModel) => void;
  resolveListingDealName?: (url: string) => Promise<string | null>;
  defaultAdvancedOptionsOpen?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

const strategyLabels: Record<ExpenseStrategyKey, string> = {
  longTerm: 'LT',
  airbnb: 'STR',
  padSplit: 'PS',
  flip: 'Flip'
};

export function DealInputPanel({
  value,
  onChange,
  defaultAdvancedOptionsOpen = true,
  collapsible = false,
  collapsed = false,
  onToggleCollapsed
}: DealInputPanelProps) {

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

    if (section === 'purchase' && field === 'listingUrl') {
      const listingUrl = String(nextValue).trim();
      const extractedDealName = extractDealNameFromListingUrl(listingUrl);
      const shouldRename = !isOneHomeUrl(listingUrl) && Boolean(extractedDealName);
      onChange({
        ...value,
        purchase: {
          ...value.purchase,
          listingUrl,
          dealName: shouldRename ? extractedDealName ?? value.purchase.dealName : value.purchase.dealName
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
  const isOwnedMode = value.purchase.ownershipMode === 'owned';
  const isPanelCollapsed = collapsible && collapsed;

  return (
    <section className="rounded-2xl panel-surface p-3.5 shadow-soft sm:p-5">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="tap-feedback mb-2.5 flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left"
        >
          <h2 className="text-base font-semibold sm:text-lg">Core Purchase, Financing, & Expenses</h2>
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-white/15 bg-black/20 px-2 text-sm font-semibold text-slate-200 transition-transform duration-200">
            {collapsed ? '+' : '-'}
          </span>
        </button>
      ) : (
        <div className="mb-3 sm:mb-4">
          <h2 className="text-base font-semibold sm:text-lg">Core Purchase, Financing, & Expenses</h2>
        </div>
      )}

      <div className="panel-collapse" data-open={!isPanelCollapsed}>
        <div className="panel-collapse-inner">
          <button
            type="button"
            aria-pressed={isOwnedMode}
            onClick={() => update('purchase', 'ownershipMode', isOwnedMode ? 'purchase' : 'owned')}
            className={`tap-feedback mb-2.5 w-full rounded-lg border px-3 py-2 text-sm font-medium transition sm:mb-3 ${
              isOwnedMode ? 'border-accent/70 bg-accent/20 text-accent' : 'border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.06]'
            }`}
          >
            {isOwnedMode ? 'Switch to Purchase Mode' : 'I Already Own This Property'}
          </button>

          <div className="space-y-2.5 sm:space-y-3">
        <Section title="Acquisition and Financing" defaultOpen>
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            <Input label="Deal name" value={value.purchase.dealName} onChange={(v) => update('purchase', 'dealName', v)} />
            <div className="sm:col-span-2">
              <Input label="Listing URL (Zillow, Redfin, etc.)" value={value.purchase.listingUrl} onChange={(v) => update('purchase', 'listingUrl', v)} />
            </div>

            {!isOwnedMode && (
              <>
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
              </>
            )}

            {isOwnedMode && (
              <>
                <Input
                  label="Existing mortgage payment / month"
                  type="number"
                  value={value.purchase.existingMortgageMonthly}
                  onChange={(v) => update('purchase', 'existingMortgageMonthly', Number(v))}
                />
                <Input
                  label="Existing mortgage balance"
                  type="number"
                  value={value.purchase.existingMortgageBalance}
                  onChange={(v) => update('purchase', 'existingMortgageBalance', Number(v))}
                />
                <PercentInput
                  label="Existing mortgage rate %"
                  value={value.purchase.existingMortgageRate}
                  onChange={(v) => update('purchase', 'existingMortgageRate', v)}
                />
                <Input
                  label="Existing mortgage term left (years)"
                  type="number"
                  value={value.purchase.existingMortgageRemainingYears}
                  onChange={(v) => update('purchase', 'existingMortgageRemainingYears', Number(v))}
                />
                <Input
                  label="Property tax / month"
                  type="number"
                  value={value.purchase.existingTaxMonthly}
                  onChange={(v) => update('purchase', 'existingTaxMonthly', Number(v))}
                />
                <Input
                  label="Insurance / month"
                  type="number"
                  value={value.purchase.existingInsuranceMonthly}
                  onChange={(v) => update('purchase', 'existingInsuranceMonthly', Number(v))}
                />
              </>
            )}

            <Input label="HOA monthly" type="number" value={value.purchase.hoaMonthly} onChange={(v) => update('purchase', 'hoaMonthly', Number(v))} />
            <Input label="PMI monthly" type="number" value={value.purchase.pmiMonthly} onChange={(v) => update('purchase', 'pmiMonthly', Number(v))} />
          </div>

          {!isOwnedMode && (
            <div className="mt-2.5 grid gap-2 sm:mt-3 sm:grid-cols-2 sm:gap-3">
              <Input
                label={`Property tax override (auto ${currencyFormatter.format(autoTaxAnnual)})`}
                type="number"
                value={value.purchase.propertyTaxAnnualOverride ?? ''}
                onChange={(v) => update('purchase', 'propertyTaxAnnualOverride', v === '' ? null : Number(v))}
              />
              <Input
                label={`Insurance override (auto ${currencyFormatter.format(autoInsuranceAnnual)})`}
                type="number"
                value={value.purchase.insuranceAnnualOverride ?? ''}
                onChange={(v) => update('purchase', 'insuranceAnnualOverride', v === '' ? null : Number(v))}
              />
            </div>
          )}

          <div className="mt-2.5 sm:mt-3">
            <Section title="Advanced Options" defaultOpen={defaultAdvancedOptionsOpen}>
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
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
            </Section>
          </div>
        </Section>

        <Section title="Variable Expense Matrix" defaultOpen>
          <div className="mb-2 hidden grid-cols-[1.2fr_120px_1fr] gap-2 px-2 text-[11px] uppercase tracking-wider text-muted sm:grid">
            <span>Expense</span>
            <span>Amount / mo</span>
            <span>Applies to strategies</span>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            {value.variableExpenses.map((expense, index) => (
              <div key={expense.key} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 sm:p-2.5">
                <div className="grid gap-1.5 sm:grid-cols-[1.2fr_120px_1fr] sm:items-center sm:gap-2">
                  <p className="text-xs font-medium sm:text-sm">{expense.label}</p>
                  <input
                    aria-label={`${expense.label} amount per month`}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs sm:py-1.5 sm:text-sm"
                    type="number"
                    value={expense.monthlyAmount}
                    onChange={(event) => updateVariableExpense(index, { monthlyAmount: Number(event.target.value) })}
                  />
                  <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
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
                          className={`flex min-h-7 items-center justify-center rounded-md border px-1.5 py-1 text-[11px] transition sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs ${
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
        </div>
      </div>
    </section>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 sm:p-3">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="tap-feedback flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-left text-xs font-medium text-white sm:text-sm"
      >
        <span>{title}</span>
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-white/15 bg-black/20 px-1.5 text-xs font-semibold text-slate-200 transition-transform duration-200">
          {isOpen ? '-' : '+'}
        </span>
      </button>
      <div className="panel-collapse mt-2 sm:mt-3" data-open={isOpen}>
        <div className="panel-collapse-inner">{children}</div>
      </div>
    </section>
  );
}
