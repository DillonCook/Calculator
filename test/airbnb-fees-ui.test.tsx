import userEvent from '@testing-library/user-event';
import { Input } from '@/components/dashboard/form-fields';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StrategyModuleInputs } from '@/components/dashboard/strategy-module-inputs';
import { defaultDealInput } from '@/lib/models/deal';

describe('Input help activation', () => {
  it('preserves keyboard focus help through Enter and Space and dismisses with Escape', async () => {
    const user = userEvent.setup();
    render(<Input label="Tax rate" value={1} onChange={vi.fn()} tooltip="Confirm the post-purchase tax bill." />);
    const trigger = screen.getByRole('button', {name:'More info about Tax rate'});
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(await screen.findByRole('dialog')).toHaveTextContent('Confirm the post-purchase tax bill.');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.keyboard(' ');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('textbox', {name:'Tax rate'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps hovered help readable on activation and still closes after pointer departure', async () => {
    const user = userEvent.setup();
    render(<Input label="Tax rate" value={1} onChange={vi.fn()} tooltip="Confirm the post-purchase tax bill." />);
    const trigger = screen.getByRole('button', {name:'More info about Tax rate'});
    await user.hover(trigger);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.unhover(trigger);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('keeps help visible after the first full pointer click without editing the input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input label="Purchase price" value={300000} onChange={onChange} type="number" tooltip="The amount paid for the property." />);
    await user.click(screen.getByRole('button', {name:'More info about Purchase price'}));
    expect(await screen.findByRole('dialog')).toHaveTextContent('The amount paid for the property.');
    expect(screen.getByRole('spinbutton', {name:'Purchase price'})).toHaveValue(300000);
    expect(onChange).not.toHaveBeenCalled();
  });
});

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
