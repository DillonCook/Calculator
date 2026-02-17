import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import HomePage from '../app/page';
import { calculateDeal } from '../lib/engine/deal-engine';
import { defaultDealInput } from '../lib/models/deal';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

describe('dashboard integration', () => {
  it('editing purchase price updates master cash-to-close KPI', async () => {
    render(<HomePage />);

    const input = screen.getByLabelText('Purchase price');
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '300000');

    const updatedModel = {
      ...defaultDealInput,
      purchase: { ...defaultDealInput.purchase, purchasePrice: 300000 }
    };
    const expected = currency.format(calculateDeal(updatedModel).masterSummary.cashToClose);

    expect(screen.getByTestId('kpi-cash-to-close')).toHaveTextContent(expected);
  });

  it('scenario save and load flow persists data to local storage', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const scenarioSelect = screen.getByLabelText('Scenario Select');
    const options = Array.from(scenarioSelect.querySelectorAll('option')).map((option) => option.textContent);

    expect(options.some((option) => option?.includes('Tampa Duplex - Sample Deal'))).toBe(true);
  });

  it('print view link includes encoded scenario payload', () => {
    render(<HomePage />);

    const printLink = screen.getByRole('link', { name: 'Print View' });
    const href = printLink.getAttribute('href') ?? '';

    expect(href.startsWith('/print?scenario=')).toBe(true);
    expect(href.length).toBeGreaterThan('/print?scenario='.length);
  });
});
