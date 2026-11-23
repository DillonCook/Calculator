import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DealQuickStart } from '@/components/dashboard/deal-quick-start';
import { defaultDealInput } from '@/lib/models/deal';

it.each(['longTerm', 'airbnb', 'flip'] as const)('offers the existing fictional rental sample from a blank tagged %s property form without submitting it', async initialStrategy => {
  const user = userEvent.setup();
  const onStart = vi.fn();
  const onSample = vi.fn();
  const base = structuredClone(defaultDealInput);
  const before = structuredClone(base);
  render(<DealQuickStart base={base} initialStrategy={initialStrategy} onStart={onStart} onSample={onSample} onAdvanced={vi.fn()}/>);
  expect(screen.getByRole('heading', {name:'Start with the property.'})).toBeVisible();
  expect(screen.getByText('Explore a fictional rental example instead of these inputs.')).toBeVisible();
  const sample = screen.getByRole('button', {name:'Try a sample property'});
  expect(sample).toHaveAttribute('type', 'button');
  expect(screen.getByLabelText('Purchase price')).toBeInvalid();
  await user.click(sample);
  expect(onSample).toHaveBeenCalledTimes(1);
  expect(onStart).not.toHaveBeenCalled();
  expect(base).toEqual(before);
});

it('keeps the manual property and cost workflow intact while offering a keyboard sample alternative', async () => {
  const user = userEvent.setup();
  const onStart = vi.fn();
  const onSample = vi.fn();
  render(<DealQuickStart base={structuredClone(defaultDealInput)} onStart={onStart} onSample={onSample} onAdvanced={vi.fn()}/>);
  await user.click(screen.getByRole('button', {name:/^Rent out a home/}));
  const sample = screen.getByRole('button', {name:'Try a sample property'});
  sample.focus();
  await user.keyboard('{Enter}');
  expect(onSample).toHaveBeenCalledTimes(1);
  expect(onStart).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Purchase price'), '300000');
  await user.type(screen.getByLabelText('Expected monthly rent'), '3000');
  await user.click(screen.getByRole('button', {name:'Next: costs'}));
  expect(screen.queryByRole('button', {name:'Try a sample property'})).not.toBeInTheDocument();
  expect(screen.getByText(/The result is provisional/)).toBeVisible();
  expect(onSample).toHaveBeenCalledTimes(1);
  expect(onStart).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', {name:'Back'}));
  expect(screen.getByLabelText('Purchase price')).toHaveValue(300000);
  expect(screen.getByLabelText('Expected monthly rent')).toHaveValue(3000);
  expect(screen.getByRole('button', {name:'Try a sample property'})).toBeVisible();
});
