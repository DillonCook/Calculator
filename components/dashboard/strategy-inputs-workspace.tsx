'use client';

import { StrategyModuleInputs } from '@/components/dashboard/strategy-module-inputs';
import type { DealInputModel, StrategyKey } from '@/lib/models/deal';

interface StrategyInputsWorkspaceProps {
  activeStrategy: StrategyKey;
  model: DealInputModel;
  onChange: (next: DealInputModel) => void;
}

export function StrategyInputsWorkspace({ activeStrategy, model, onChange }: StrategyInputsWorkspaceProps) {
  return (
    <section
      aria-label="Strategy inputs workspace"
      className="overflow-hidden rounded-[1.7rem] border border-white/10 bg-[linear-gradient(155deg,rgba(18,31,49,0.98),rgba(8,15,27,0.98))] shadow-soft [overflow-anchor:none]"
    >
      <div className="scrollbar-premium max-h-[min(58rem,calc(100vh-14rem))] overflow-y-auto px-4 py-4 sm:px-5">
        <StrategyModuleInputs active={activeStrategy} model={model} onChange={onChange} animateContent={false} />
      </div>
    </section>
  );
}
