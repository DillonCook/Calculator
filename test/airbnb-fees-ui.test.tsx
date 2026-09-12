import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StrategyModuleInputs } from '@/components/dashboard/strategy-module-inputs';
import { defaultDealInput } from '@/lib/models/deal';

describe('Airbnb fee assumptions', () => {
  it.each(['panel', 'embedded'] as const)('explains fee and annual-total bases in the %s form', async (variant) => {
    render(<StrategyModuleInputs active="airbnb" model={defaultDealInput} onChange={vi.fn()} variant={variant} />);
    fireEvent.click(screen.getByRole('button', { name: 'More info about Platform fee %' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('room revenue plus cleaning fees');
    expect(await screen.findByRole('dialog')).toHaveTextContent('host-only or split-fee');
    expect(await screen.findByRole('dialog')).toHaveTextContent('guest service fee');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'More info about Annual revenue (optional)' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('including cleaning fees');
    expect(await screen.findByRole('dialog')).toHaveTextContent('not added again');
    expect(await screen.findByRole('dialog')).toHaveTextContent('Occupancy and stay length still determine cleaner costs');
  });
});
