import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DealQuickStart } from '@/components/dashboard/deal-quick-start';
import { defaultDealInput } from '@/lib/models/deal';

it('does not reinterpret monthly rent as a resale estimate and retains the rental draft', async () => {
  const user = userEvent.setup();
  render(<DealQuickStart base={structuredClone(defaultDealInput)} onStart={vi.fn()} onSample={vi.fn()} onAdvanced={vi.fn()}/>);
  await user.click(screen.getByRole('button', { name: /^Rent out a home/ }));
  await user.type(screen.getByLabelText('Purchase price'), '300000');
  await user.type(screen.getByLabelText('Property nickname'), 'Synthetic draft');
  await user.type(screen.getByLabelText('Expected monthly rent'), '3200.50');
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.click(screen.getByRole('button', { name: /^Renovate and sell/ }));
  expect(screen.getByLabelText('Expected resale value')).toHaveValue(null);
  expect(screen.getByLabelText('Purchase price')).toHaveValue(300000);
  expect(screen.getByLabelText('Property nickname')).toHaveValue('Synthetic draft');
  await user.type(screen.getByLabelText('Expected resale value'), '390000');
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.click(screen.getByRole('button', { name: /^Rent out a home/ }));
  expect(screen.getByLabelText('Expected monthly rent')).toHaveValue(3200.5);
});

it.each([
  ['longTerm', /^Rent out a home/, 'Expected monthly rent', 3200.5],
  ['airbnb', /^Vacation rental/, 'Expected monthly booking revenue', 4800.75],
  ['flip', /^Renovate and sell/, 'Expected resale value', 390000],
] as const)('submits only the %s estimate after revisiting every goal', async (strategy, goal, field, amount) => {
  const user = userEvent.setup();
  const base = structuredClone(defaultDealInput);
  const before = structuredClone(base);
  const onStart = vi.fn();
  render(<DealQuickStart base={base} onStart={onStart} onSample={vi.fn()} onAdvanced={vi.fn()}/>);
  for (const [label, input, value] of [
    [/^Rent out a home/, 'Expected monthly rent', '3200.50'],
    [/^Renovate and sell/, 'Expected resale value', '390000'],
    [/^Vacation rental/, 'Expected monthly booking revenue', '4800.75'],
  ] as const) {
    await user.click(screen.getByRole('button', {name:label}));
    expect(screen.getByLabelText(input)).toHaveValue(null);
    await user.type(screen.getByLabelText(input), value);
    await user.click(screen.getByRole('button', {name:'Back'}));
  }
  await user.click(screen.getByRole('button', {name:goal}));
  expect(screen.getByLabelText(field)).toHaveValue(amount);
  await user.type(screen.getByLabelText('Purchase price'), '300000');
  await user.click(screen.getByRole('button', {name:'Next: costs'}));
  await user.type(screen.getByLabelText('Annual property tax'), '2134.56');
  await user.type(screen.getByLabelText('Annual insurance'), '1789.50');
  await user.clear(screen.getByLabelText('Other operating costs / month'));
  await user.type(screen.getByLabelText('Other operating costs / month'), '150.25');
  await user.clear(screen.getByLabelText('Upfront rehab budget'));
  await user.type(screen.getByLabelText('Upfront rehab budget'), '12780.90');
  await user.click(screen.getByRole('button', {name:'See my provisional result'}));
  expect(onStart).toHaveBeenCalledTimes(1);
  const [model, selected] = onStart.mock.calls[0];
  expect(selected).toBe(strategy);
  expect(model.purchase).toMatchObject({purchasePrice:300000,propertyTaxAnnualOverride:2134.56,insuranceAnnualOverride:1789.5,rehabBudget:12780.9});
  if (strategy==='longTerm') expect(model.longTerm).toMatchObject({grossRentMonthly:amount,ownerExpensesMonthly:150.25});
  if (strategy==='airbnb') expect(model.airbnb).toMatchObject({annualRevenueOverride:57609,ownerExpensesMonthly:150.25});
  if (strategy==='flip') {
    expect(model.flip).toMatchObject({arvOverride:amount,rehabOverride:12780.9});
    expect(model.purchase.arv).toBe(amount);
  }
  expect(base).toEqual(before);
});

it('retains an explicitly cleared estimate without clearing a different strategy', async () => {
  const user = userEvent.setup();
  render(<DealQuickStart base={structuredClone(defaultDealInput)} onStart={vi.fn()} onSample={vi.fn()} onAdvanced={vi.fn()}/>);
  await user.click(screen.getByRole('button', {name:/^Rent out a home/}));
  await user.type(screen.getByLabelText('Expected monthly rent'), '3000');
  await user.click(screen.getByRole('button', {name:'Back'}));
  await user.click(screen.getByRole('button', {name:/^Vacation rental/}));
  await user.type(screen.getByLabelText('Expected monthly booking revenue'), '4500');
  await user.clear(screen.getByLabelText('Expected monthly booking revenue'));
  await user.click(screen.getByRole('button', {name:'Back'}));
  await user.click(screen.getByRole('button', {name:/^Rent out a home/}));
  expect(screen.getByLabelText('Expected monthly rent')).toHaveValue(3000);
  await user.click(screen.getByRole('button', {name:'Back'}));
  await user.click(screen.getByRole('button', {name:/^Vacation rental/}));
  expect(screen.getByLabelText('Expected monthly booking revenue')).toHaveValue(null);
});
