import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DecisionBrief } from '@/components/dashboard/decision-brief';
import { defaultDealInput } from '@/lib/models/deal';
import { calculateDeal } from '@/lib/engine/deal-engine';
import { ExperienceSwitch, useExperienceMode } from '@/components/dashboard/experience-mode';
import userEvent from '@testing-library/user-event';

it('keeps compact material notices visible and routine explanations on demand', () => {
  const model=structuredClone(defaultDealInput);
  model.analysis={kind:'sample'};
  model.longTerm.grossRentMonthly=3000;
  model.longTerm.tenantPlacementFeePercent=0.5;
  const before=structuredClone(model);
  render(<DecisionBrief compact model={model} strategy="longTerm" output={calculateDeal(model).longTerm}/>);
  const notices=within(screen.getByRole('region',{name:'Analysis notices'}));
  expect(notices.getByText(/^Fictional sample ·/)).toBeVisible();
  expect(notices.getByText(/^Fictional sample ·/)).toHaveTextContent(/Before income tax/);
  expect(notices.getByText(/Tax: estimated/)).toBeVisible();
  expect(notices.getByText('Placement fee is not included in returns. Add leasing costs to your expense plan.')).toBeVisible();
  expect(screen.getByText('Where the monthly money goes')).not.toBeVisible();
  expect(model).toEqual(before);
});

it('keeps the last applied financial adjustment visible in Pro Mode',()=>{
  const model=structuredClone(defaultDealInput);
  model.analysis={lastWorkout:{purchasePrice:250000,downPaymentPercent:0.2}};
  render(<DecisionBrief compact model={model} strategy="longTerm" output={calculateDeal(model).longTerm} onChange={vi.fn()}/>);
  expect(screen.getByText(/^Last adjustment:/)).toBeVisible();
  expect(screen.getByRole('button',{name:'Undo last workout change'})).toBeVisible();
});

it('does not hide invalid financing behind optional details', () => {
  const model=structuredClone(defaultDealInput);model.purchase.loanTermYears=0;
  render(<DecisionBrief compact model={model} strategy="longTerm" output={calculateDeal(model).longTerm}/>);
  expect(screen.getByRole('alert')).toHaveTextContent(/purchase loan term/);
});

describe('browser preference only',()=>{
  function Preference(){const {mode,selectMode}=useExperienceMode();return <ExperienceSwitch mode={mode} onChange={selectMode}/>;}
  it('still switches when preference storage throws',async()=>{
    const get=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new DOMException('Denied');});
    const set=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Denied');});
    try {
      render(<Preference/>);
      await userEvent.click(screen.getByRole('button',{name:'Pro Mode'}));
      expect(screen.getByRole('button',{name:'Pro Mode'})).toHaveAttribute('aria-pressed','true');
      await userEvent.click(screen.getByRole('button',{name:'Guided'}));
      expect(screen.getByRole('button',{name:'Guided'})).toHaveAttribute('aria-pressed','true');
    }finally{get.mockRestore();set.mockRestore();}
  });
});
