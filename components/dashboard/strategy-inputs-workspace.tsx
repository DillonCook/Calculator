'use client';

import { StrategyModuleInputs } from '@/components/dashboard/strategy-module-inputs';
import type { DealInputModel, StrategyKey } from '@/lib/models/deal';

interface StrategyInputsWorkspaceProps {
  activeStrategy: StrategyKey;
  model: DealInputModel;
  onChange: (next: DealInputModel) => void;
  embedded?: boolean;
  showHeading?: boolean;
}

export function StrategyInputsWorkspace({ activeStrategy, model, onChange, embedded = false, showHeading = true }: StrategyInputsWorkspaceProps) {
  const content = (
    <div className={embedded ? 'pr-1 [overflow-anchor:none]' : 'scrollbar-premium max-h-[min(58rem,calc(100vh-14rem))] overflow-y-auto px-4 py-4 sm:px-5'}>
      <StrategyModuleInputs
        active={activeStrategy}
        model={model}
        onChange={onChange}
        animateContent={false}
        variant={embedded ? 'embedded' : 'panel'}
        showHeading={showHeading}
      />
    </div>
  );

  if (embedded) {
    return (
      <section aria-label="Strategy workspace" className="[overflow-anchor:none]">
        {content}
      </section>
    );
  }

  return (
    <section
      aria-label="Strategy workspace"
      className="section-shell section-shell-input overflow-hidden rounded-[1.7rem] shadow-soft [overflow-anchor:none]"
    >
      {content}
    </section>
  );
}
