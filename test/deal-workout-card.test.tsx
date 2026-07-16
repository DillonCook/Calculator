import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DealWorkoutCard } from '@/components/dashboard/deal-workout-card';
import { defaultDealInput, type DealInputModel } from '@/lib/models/deal';

const constrainedLoanDeal: DealInputModel = {
  ...defaultDealInput,
  purchase: {
    ...defaultDealInput.purchase,
    purchasePrice: 320000,
    arv: 320000,
    downPaymentPercent: 0.1,
    interestRate: 0.075
  },
  longTerm: {
    ...defaultDealInput.longTerm,
    grossRentMonthly: 2600,
    ownerExpensesMonthly: 120
  }
};

describe('DealWorkoutCard', () => {
  it('keeps the recommended terms while removing redundant helper copy', () => {
    render(
      <DealWorkoutCard
        model={constrainedLoanDeal}
        strategy="longTerm"
        targetIrrPercent={0.12}
        onApply={vi.fn()}
      />
    );

    expect(screen.getByText('Make the deal work')).toBeInTheDocument();
    expect(screen.queryByText('Auto-adjust terms for this strategy')).not.toBeInTheDocument();
    expect(screen.queryByText(/Raise down payment to/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Drop purchase price by/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Set 40% down and cut price/)).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Use 47.1% down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use $223,000 price' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use $295,600 + 40.0% down' })).toBeInTheDocument();
  });
});
