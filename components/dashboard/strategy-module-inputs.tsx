'use client';

import { Input, PercentInput, Select } from '@/components/dashboard/form-fields';
import type { DealInputModel, StrategyKey } from '@/lib/models/deal';

interface StrategyModuleInputsProps {
  active: StrategyKey;
  model: DealInputModel;
  onChange: (next: DealInputModel) => void;
}

export function StrategyModuleInputs({ active, model, onChange }: StrategyModuleInputsProps) {
  const update = <T extends keyof DealInputModel, K extends keyof DealInputModel[T]>(section: T, field: K, nextValue: DealInputModel[T][K]) => {
    onChange({ ...model, [section]: { ...model[section], [field]: nextValue } });
  };

  const renderContent = () => {
    if (active === 'purchase') {
      return (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-muted">
          Shared purchase assumptions live in Core Deal Inputs. Each strategy tab now has its own ARV so you can underwrite different exit plans quickly.
        </p>
      );
    }

    if (active === 'longTerm') {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Long-Term ARV" type="number" value={model.longTerm.arvOverride ?? ''} onChange={(v) => update('longTerm', 'arvOverride', v === '' ? null : Number(v))} />
          <Input label="Gross rent / mo" type="number" value={model.longTerm.grossRentMonthly} onChange={(v) => update('longTerm', 'grossRentMonthly', Number(v))} />
          <Input label="Other income / mo" type="number" value={model.longTerm.otherIncomeMonthly} onChange={(v) => update('longTerm', 'otherIncomeMonthly', Number(v))} />
          <PercentInput label="Vacancy %" value={model.longTerm.vacancyPercent} onChange={(v) => update('longTerm', 'vacancyPercent', v)} />
          <PercentInput label="Management fee %" value={model.longTerm.managementFeePercent} onChange={(v) => update('longTerm', 'managementFeePercent', v)} />
          <PercentInput label="Maintenance %" value={model.longTerm.maintenancePercent} onChange={(v) => update('longTerm', 'maintenancePercent', v)} />
          <PercentInput label="CapEx %" value={model.longTerm.capexPercent} onChange={(v) => update('longTerm', 'capexPercent', v)} />
        </div>
      );
    }

    if (active === 'airbnb') {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="STR ARV" type="number" value={model.airbnb.arvOverride ?? ''} onChange={(v) => update('airbnb', 'arvOverride', v === '' ? null : Number(v))} />
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
        <Input
          label="Holding expenses / mo"
          type="number"
          value={model.flip.holdingExpensesMonthly}
          onChange={(v) => update('flip', 'holdingExpensesMonthly', Number(v))}
        />
        <PercentInput label="Agent commission %" value={model.flip.agentCommissionPercent} onChange={(v) => update('flip', 'agentCommissionPercent', v)} />
        <PercentInput label="Sell closing %" value={model.flip.sellClosingCostPercent} onChange={(v) => update('flip', 'sellClosingCostPercent', v)} />
        <Input label="Seller concessions" type="number" value={model.flip.sellerConcessions} onChange={(v) => update('flip', 'sellerConcessions', Number(v))} />
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Strategy Inputs</h3>
        <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-muted">Updates results instantly</span>
      </div>


      {renderContent()}
    </section>
  );
}
