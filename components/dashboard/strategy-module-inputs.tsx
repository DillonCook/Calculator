'use client';

import { Input, PercentInput, Select } from '@/components/dashboard/form-fields';
import type { DealInputModel, StrategyKey } from '@/lib/models/deal';

interface StrategyModuleInputsProps {
  active: StrategyKey;
  model: DealInputModel;
  onChange: (next: DealInputModel) => void;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  animateContent?: boolean;
}

export function StrategyModuleInputs({
  active,
  model,
  onChange,
  collapsible = false,
  collapsed = false,
  onToggleCollapsed,
  animateContent = true
}: StrategyModuleInputsProps) {
  const update = <T extends keyof DealInputModel, K extends keyof DealInputModel[T]>(section: T, field: K, nextValue: DealInputModel[T][K]) => {
    onChange({ ...model, [section]: { ...model[section], [field]: nextValue } });
  };
  const updateLongTermTurnaround = <K extends keyof DealInputModel['longTerm']['turnaround']>(
    field: K,
    nextValue: DealInputModel['longTerm']['turnaround'][K]
  ) => {
    onChange({
      ...model,
      longTerm: {
        ...model.longTerm,
        turnaround: {
          ...model.longTerm.turnaround,
          [field]: nextValue
        }
      }
    });
  };
  const commercialOccupancyPercent =
    model.commercial.grossLeasableAreaSqft > 0
      ? (Math.min(model.commercial.occupiedSqft, model.commercial.grossLeasableAreaSqft) / model.commercial.grossLeasableAreaSqft) * 100
      : 0;

  const renderContent = () => {
    if (active === 'purchase') {
      return (
        <div className="space-y-3">
          <div className="section-inner rounded-xl p-3 text-sm text-muted">
            <p>Underwrite retail and strip-plaza deals with leased sq ft and annual $/sq ft rents.</p>
            <p className="mt-1 text-xs text-slate-300">
              Physical occupancy by leased area: <span className="font-semibold text-slate-100">{commercialOccupancyPercent.toFixed(1)}%</span>
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Gross leasable area (sq ft)"
              tooltip="Total rentable square footage in the property, including currently vacant units or suites."
              type="number"
              value={model.commercial.grossLeasableAreaSqft}
              onChange={(v) => update('commercial', 'grossLeasableAreaSqft', Number(v))}
            />
            <Input
              label="Leased area (sq ft)"
              tooltip="Square footage currently leased. This drives physical occupancy and current rent collection."
              type="number"
              value={model.commercial.occupiedSqft}
              onChange={(v) => update('commercial', 'occupiedSqft', Number(v))}
            />
            <Input
              label="Base rent ($/sq ft/year)"
              tooltip="Average annual base rent charged per leased square foot, before reimbursements."
              type="number"
              value={model.commercial.averageBaseRentPerSqftYear}
              onChange={(v) => update('commercial', 'averageBaseRentPerSqftYear', Number(v))}
            />
            <Input
              label="NNN reimbursements ($/sq ft/year)"
              tooltip="Annual recoveries from tenants for taxes, insurance, and common area expenses."
              type="number"
              value={model.commercial.nnnRecoveryPerSqftYear}
              onChange={(v) => update('commercial', 'nnnRecoveryPerSqftYear', Number(v))}
            />
            <PercentInput
              label="Vacancy reserve %"
              tooltip="Economic vacancy assumption applied to occupied income to stay conservative."
              value={model.commercial.vacancyPercent}
              onChange={(v) => update('commercial', 'vacancyPercent', v)}
            />
            <PercentInput
              label="Credit loss reserve %"
              tooltip="Expected uncollectible rent from delinquencies, defaults, or tenant payment issues."
              value={model.commercial.creditLossPercent}
              onChange={(v) => update('commercial', 'creditLossPercent', v)}
            />
            <Input
              label="Non-recoverable OpEx ($/sq ft/year)"
              tooltip="Operating expenses per square foot that the owner cannot pass through to tenants."
              type="number"
              value={model.commercial.nonRecoverableExpensesPerSqftYear}
              onChange={(v) => update('commercial', 'nonRecoverableExpensesPerSqftYear', Number(v))}
            />
            <PercentInput
              label="Management fee %"
              tooltip="Property management cost as a percent of effective gross income."
              value={model.commercial.managementFeePercent}
              onChange={(v) => update('commercial', 'managementFeePercent', v)}
            />
            <Input
              label="TI reserve ($/sq ft/year)"
              tooltip="Annual reserve for tenant improvements and suite build-outs."
              type="number"
              value={model.commercial.tenantImprovementsReservePerSqftYear}
              onChange={(v) => update('commercial', 'tenantImprovementsReservePerSqftYear', Number(v))}
            />
            <Input
              label="Leasing reserve ($/sq ft/year)"
              tooltip="Annual reserve for leasing commissions on new and renewal leases."
              type="number"
              value={model.commercial.leasingCommissionsReservePerSqftYear}
              onChange={(v) => update('commercial', 'leasingCommissionsReservePerSqftYear', Number(v))}
            />
            <PercentInput
              label="Commercial rent growth %"
              tooltip="Year-over-year growth assumption for rent and recoverable revenue."
              value={model.commercial.annualRentGrowthPercent}
              onChange={(v) => update('commercial', 'annualRentGrowthPercent', v)}
            />
            <PercentInput
              label="Commercial expense growth %"
              tooltip="Year-over-year growth assumption for operating expenses."
              value={model.commercial.annualExpenseGrowthPercent}
              onChange={(v) => update('commercial', 'annualExpenseGrowthPercent', v)}
            />
          </div>
        </div>
      );
    }

    if (active === 'longTerm') {
      return (
        <div className="space-y-3">
          <div className="section-inner rounded-xl p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-100">Buying this deal to turn it around?</p>
                <p className="text-xs text-muted">Enable stabilized-year underwriting for any long-term rental repositioning plan.</p>
              </div>
              <button
                type="button"
                onClick={() => updateLongTermTurnaround('enabled', !model.longTerm.turnaround.enabled)}
                aria-pressed={model.longTerm.turnaround.enabled}
                className={`tap-feedback inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  model.longTerm.turnaround.enabled
                    ? 'btn-primary'
                    : 'section-action section-action-input text-slate-200'
                }`}
              >
                {model.longTerm.turnaround.enabled ? 'Turnaround On' : 'Turnaround Off'}
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Long-Term ARV" type="number" value={model.longTerm.arvOverride ?? ''} onChange={(v) => update('longTerm', 'arvOverride', v === '' ? null : Number(v))} />
            <Input
              label="Annual revenue (optional)"
              type="number"
              value={model.longTerm.annualRevenueOverride ?? ''}
              onChange={(v) => update('longTerm', 'annualRevenueOverride', v === '' ? null : Number(v))}
            />
            <Input label="Gross rent / mo" type="number" value={model.longTerm.grossRentMonthly} onChange={(v) => update('longTerm', 'grossRentMonthly', Number(v))} />
            <Input label="Other income / mo" type="number" value={model.longTerm.otherIncomeMonthly} onChange={(v) => update('longTerm', 'otherIncomeMonthly', Number(v))} />
            <PercentInput
              label="Tenant placement fee % (1st month rent)"
              value={model.longTerm.tenantPlacementFeePercent}
              onChange={(v) => update('longTerm', 'tenantPlacementFeePercent', v)}
            />
            <PercentInput label="Vacancy %" value={model.longTerm.vacancyPercent} onChange={(v) => update('longTerm', 'vacancyPercent', v)} />
            <PercentInput label="Management fee %" value={model.longTerm.managementFeePercent} onChange={(v) => update('longTerm', 'managementFeePercent', v)} />
            <PercentInput label="Maintenance %" value={model.longTerm.maintenancePercent} onChange={(v) => update('longTerm', 'maintenancePercent', v)} />
            <PercentInput label="CapEx %" value={model.longTerm.capexPercent} onChange={(v) => update('longTerm', 'capexPercent', v)} />
          </div>

          {model.longTerm.turnaround.enabled ? (
            <section className="section-inner rounded-xl p-3">
              <div className="mb-2">
                <p className="section-eyebrow-analysis text-xs uppercase tracking-wide">Stabilize Scenario (12-Month Underwrite)</p>
                <p className="text-xs text-muted">Estimate year-one turnaround performance and value creation after repositioning.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Stabilized gross monthly rent"
                  type="number"
                  value={model.longTerm.turnaround.stabilizedGrossRentMonthly}
                  onChange={(v) => updateLongTermTurnaround('stabilizedGrossRentMonthly', Number(v))}
                />
                <div className="section-inner-muted sm:col-span-2 rounded-lg p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-200">Additional Income (Monthly)</p>
                  <p className="mb-2 text-[11px] text-muted">Group ancillary unit and property income in one place.</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Input
                      label="Stabilized other income"
                      type="number"
                      value={model.longTerm.turnaround.stabilizedOtherIncomeMonthly}
                      onChange={(v) => updateLongTermTurnaround('stabilizedOtherIncomeMonthly', Number(v))}
                    />
                    <Input
                      label="Laundry income"
                      type="number"
                      value={model.longTerm.turnaround.laundryIncomeMonthly}
                      onChange={(v) => updateLongTermTurnaround('laundryIncomeMonthly', Number(v))}
                    />
                    <Input
                      label="Vending / misc income"
                      type="number"
                      value={model.longTerm.turnaround.vendingMiscIncomeMonthly}
                      onChange={(v) => updateLongTermTurnaround('vendingMiscIncomeMonthly', Number(v))}
                    />
                    <Input
                      label="Garage income"
                      type="number"
                      value={model.longTerm.turnaround.garageIncomeMonthly}
                      onChange={(v) => updateLongTermTurnaround('garageIncomeMonthly', Number(v))}
                    />
                    <Input
                      label="Parking income"
                      type="number"
                      value={model.longTerm.turnaround.parkingIncomeMonthly}
                      onChange={(v) => updateLongTermTurnaround('parkingIncomeMonthly', Number(v))}
                    />
                    <Input
                      label="Other ancillary income"
                      type="number"
                      value={model.longTerm.turnaround.additionalIncomeMonthly}
                      onChange={(v) => updateLongTermTurnaround('additionalIncomeMonthly', Number(v))}
                    />
                  </div>
                </div>
                <Input
                  label="Rehab budget for stabilization"
                  type="number"
                  value={model.longTerm.turnaround.rehabBudgetForStabilization}
                  onChange={(v) => updateLongTermTurnaround('rehabBudgetForStabilization', Number(v))}
                />
                <Input
                  label="Tax/insurance adjustment (annual)"
                  type="number"
                  value={model.longTerm.turnaround.annualTaxInsuranceAdjustment}
                  onChange={(v) => updateLongTermTurnaround('annualTaxInsuranceAdjustment', Number(v))}
                />
                <PercentInput
                  label="Stabilized vacancy %"
                  value={model.longTerm.turnaround.vacancyPercent}
                  onChange={(v) => updateLongTermTurnaround('vacancyPercent', v)}
                />
                <PercentInput
                  label="Stabilized maintenance %"
                  value={model.longTerm.turnaround.maintenancePercent}
                  onChange={(v) => updateLongTermTurnaround('maintenancePercent', v)}
                />
                <PercentInput
                  label="Stabilized CapEx %"
                  value={model.longTerm.turnaround.capexPercent}
                  onChange={(v) => updateLongTermTurnaround('capexPercent', v)}
                />
                <Input
                  label="Owner-paid expenses (monthly)"
                  type="number"
                  value={model.longTerm.turnaround.ownerPaidExpensesMonthly}
                  onChange={(v) => updateLongTermTurnaround('ownerPaidExpensesMonthly', Number(v))}
                />
                <PercentInput
                  label="PM fee % (stabilized)"
                  value={model.longTerm.turnaround.managementFeePercent}
                  onChange={(v) => updateLongTermTurnaround('managementFeePercent', v)}
                />
                <PercentInput
                  label="Exit/Refi cap rate %"
                  tooltip="Cap rate used to value stabilized NOI at refinance or sale. Lower cap rates imply higher value."
                  value={model.longTerm.turnaround.exitRefiCapRatePercent}
                  onChange={(v) => updateLongTermTurnaround('exitRefiCapRatePercent', v)}
                />
              </div>
            </section>
          ) : null}
        </div>
      );
    }

    if (active === 'airbnb') {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="STR ARV" type="number" value={model.airbnb.arvOverride ?? ''} onChange={(v) => update('airbnb', 'arvOverride', v === '' ? null : Number(v))} />
          <Input
            label="Annual revenue (optional)"
            type="number"
            value={model.airbnb.annualRevenueOverride ?? ''}
            onChange={(v) => update('airbnb', 'annualRevenueOverride', v === '' ? null : Number(v))}
          />
          <Input label="ADR" type="number" value={model.airbnb.adr} onChange={(v) => update('airbnb', 'adr', Number(v))} />
          <PercentInput label="Occupancy %" value={model.airbnb.occupancyPercent} onChange={(v) => update('airbnb', 'occupancyPercent', v)} />
          <Input label="Nights per month" type="number" value={model.airbnb.nightsPerMonth} onChange={(v) => update('airbnb', 'nightsPerMonth', Number(v))} />
          <Input label="Avg nights per booking" type="number" value={model.airbnb.averageNightsPerBooking} onChange={(v) => update('airbnb', 'averageNightsPerBooking', Number(v))} />
          <Input label="Cleaning fee charged" type="number" value={model.airbnb.cleaningFeeCharged} onChange={(v) => update('airbnb', 'cleaningFeeCharged', Number(v))} />
          <Input label="Cleaner cost / turn" type="number" value={model.airbnb.cleanerCostPerTurn} onChange={(v) => update('airbnb', 'cleanerCostPerTurn', Number(v))} />
          <PercentInput label="Platform fee %" value={model.airbnb.platformFeePercent} onChange={(v) => update('airbnb', 'platformFeePercent', v)} />
          <PercentInput label="Management fee %" value={model.airbnb.managementFeePercent} onChange={(v) => update('airbnb', 'managementFeePercent', v)} />
          <PercentInput label="Maintenance %" value={model.airbnb.maintenancePercent} onChange={(v) => update('airbnb', 'maintenancePercent', v)} />
          <PercentInput label="CapEx %" value={model.airbnb.capexPercent} onChange={(v) => update('airbnb', 'capexPercent', v)} />
          <Input label="STR furnishing (one-time)" type="number" value={model.airbnb.furnishingOneTime} onChange={(v) => update('airbnb', 'furnishingOneTime', Number(v))} />
        </div>
      );
    }

    if (active === 'padSplit') {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="PadSplit ARV" type="number" value={model.padSplit.arvOverride ?? ''} onChange={(v) => update('padSplit', 'arvOverride', v === '' ? null : Number(v))} />
          <Input
            label="Annual revenue (optional)"
            type="number"
            value={model.padSplit.annualRevenueOverride ?? ''}
            onChange={(v) => update('padSplit', 'annualRevenueOverride', v === '' ? null : Number(v))}
          />
          <Input label="Rentable rooms" type="number" value={model.padSplit.rentableRooms} onChange={(v) => update('padSplit', 'rentableRooms', Number(v))} />
          <Input label="Weekly rate / room" type="number" value={model.padSplit.avgWeeklyRatePerRoom} onChange={(v) => update('padSplit', 'avgWeeklyRatePerRoom', Number(v))} />
          <PercentInput label="Occupancy %" value={model.padSplit.occupancyPercent} onChange={(v) => update('padSplit', 'occupancyPercent', v)} />
          <Input label="Weeks per month" type="number" step="0.0001" value={model.padSplit.weeksPerMonth} onChange={(v) => update('padSplit', 'weeksPerMonth', Number(v))} />
          <Input label="Other income / mo" type="number" value={model.padSplit.otherIncomeMonthly} onChange={(v) => update('padSplit', 'otherIncomeMonthly', Number(v))} />
          <Input
            label="Turnover / cleaning per move-out"
            type="number"
            value={model.padSplit.turnoverCostPerMoveOut}
            onChange={(v) => update('padSplit', 'turnoverCostPerMoveOut', Number(v))}
          />
          <Input label="Move-outs per year" type="number" value={model.padSplit.moveOutsPerYear} onChange={(v) => update('padSplit', 'moveOutsPerYear', Number(v))} />
          <PercentInput label="Platform fee %" value={model.padSplit.platformFeePercent} onChange={(v) => update('padSplit', 'platformFeePercent', v)} />
          <PercentInput label="Management fee %" value={model.padSplit.managementFeePercent} onChange={(v) => update('padSplit', 'managementFeePercent', v)} />
          <PercentInput label="Maintenance reserve %" value={model.padSplit.maintenancePercent} onChange={(v) => update('padSplit', 'maintenancePercent', v)} />
          <PercentInput label="CapEx reserve %" value={model.padSplit.capexPercent} onChange={(v) => update('padSplit', 'capexPercent', v)} />
          <Input label="Furnishing (one-time)" type="number" value={model.padSplit.furnishingOneTime} onChange={(v) => update('padSplit', 'furnishingOneTime', Number(v))} />
        </div>
      );
    }

    if (active === 'brrrr') {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="BRRRR ARV" type="number" value={model.brrrr.arvOverride ?? ''} onChange={(v) => update('brrrr', 'arvOverride', v === '' ? null : Number(v))} />
          <Input label="BRRRR rehab override" type="number" value={model.brrrr.rehabOverride ?? ''} onChange={(v) => update('brrrr', 'rehabOverride', v === '' ? null : Number(v))} />
          <Input label="Hold months" type="number" value={model.brrrr.holdingMonths} onChange={(v) => update('brrrr', 'holdingMonths', Number(v))} />
          <Input
            label="Holding expenses / mo"
            type="number"
            value={model.brrrr.holdingExpensesMonthly}
            onChange={(v) => update('brrrr', 'holdingExpensesMonthly', Number(v))}
          />
          <PercentInput label="Refi target LTV %" value={model.brrrr.refinanceLtvPercent} onChange={(v) => update('brrrr', 'refinanceLtvPercent', v)} />
          <PercentInput label="Refi rate %" value={model.brrrr.refinanceRate} onChange={(v) => update('brrrr', 'refinanceRate', v)} />
          <PercentInput
            label="Refi closing %"
            value={model.brrrr.refinanceClosingCostPercent}
            onChange={(v) => update('brrrr', 'refinanceClosingCostPercent', v)}
          />
          <Select
            label="Post-refi ops model"
            value={model.brrrr.operatingStrategy}
            onChange={(v) => update('brrrr', 'operatingStrategy', v as DealInputModel['brrrr']['operatingStrategy'])}
            options={[
              { label: 'Long-Term', value: 'longTerm' },
              { label: 'Airbnb / STR', value: 'airbnb' },
              { label: 'PadSplit', value: 'padSplit' }
            ]}
          />
        </div>
      );
    }

    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Flip ARV" type="number" value={model.flip.arvOverride ?? ''} onChange={(v) => update('flip', 'arvOverride', v === '' ? null : Number(v))} />
        <Input label="Flip rehab override" type="number" value={model.flip.rehabOverride ?? ''} onChange={(v) => update('flip', 'rehabOverride', v === '' ? null : Number(v))} />
        <Input label="Flip hold months" type="number" value={model.flip.holdingMonths} onChange={(v) => update('flip', 'holdingMonths', Number(v))} />
        <PercentInput label="Agent commission %" value={model.flip.agentCommissionPercent} onChange={(v) => update('flip', 'agentCommissionPercent', v)} />
        <PercentInput label="Sell closing %" value={model.flip.sellClosingCostPercent} onChange={(v) => update('flip', 'sellClosingCostPercent', v)} />
        <Input label="Seller concessions" type="number" value={model.flip.sellerConcessions} onChange={(v) => update('flip', 'sellerConcessions', Number(v))} />
      </div>
    );
  };

  return (
    <section className="section-shell section-shell-input rounded-2xl p-3.5 shadow-soft sm:p-5">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="tap-feedback section-inner mb-2 flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left"
        >
          <h3 className="text-base font-semibold">Rents</h3>
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-white/15 bg-black/20 px-2 text-sm font-semibold text-slate-200 transition-transform duration-200">
            {collapsed ? '+' : '-'}
          </span>
        </button>
      ) : (
        <div className="mb-3">
          <h3 className="text-base font-semibold">Rents</h3>
        </div>
      )}

      <div className="panel-collapse" data-open={!collapsed}>
        <div className="panel-collapse-inner">
          <div key={animateContent ? active : 'strategy-inputs-static'} className={animateContent ? 'panel-swap' : ''}>
            {renderContent()}
          </div>
        </div>
      </div>
    </section>
  );
}

