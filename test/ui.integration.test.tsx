import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import HomePage from '../app/page';
import { calculateDeal } from '../lib/engine/deal-engine';
import { defaultDealInput } from '../lib/models/deal';
import { currencyFormatter, percentFormatter } from '../lib/formatters';

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
    const expected = currencyFormatter.format(calculateDeal(updatedModel).purchase.totalCashNeeded);

    expect(screen.getByTestId('kpi-cash-to-close')).toHaveTextContent(expected);
  });

  it('top KPI cards follow the active strategy tab', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Airbnb' }));

    const airbnbResult = calculateDeal(defaultDealInput).airbnb;

    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(currencyFormatter.format(airbnbResult.monthlyCashFlow));
    expect(screen.getByTestId('kpi-cash-on-cash')).toHaveTextContent(
      percentFormatter.format(airbnbResult.cashOnCashReturn)
    );
    expect(screen.getByTestId('kpi-cap-rate')).toHaveTextContent(
      percentFormatter.format(airbnbResult.capRate)
    );

    expect(screen.getByTestId('kpi-total-cash-invested')).toHaveTextContent(currencyFormatter.format(airbnbResult.totalCashNeeded));
    expect(screen.getByLabelText('Cash to Close strategy context')).toHaveTextContent('Airbnb');
    expect(screen.getByRole('button', { name: 'Cash to Close definitions' })).toBeInTheDocument();
  });


  it('flip priority metric switches to net profit', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getAllByRole('button', { name: 'Flip' })[0]);

    const flipResult = calculateDeal(defaultDealInput).flip;

    expect(screen.getByText('Net Profit')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(currencyFormatter.format(flipResult.saleProceeds ?? 0));
  });


  it('equity modeling lightbox opens from strategy board', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Equity modeling' }));

    expect(screen.getByRole('dialog', { name: 'Equity Modeling Lightbox' })).toBeInTheDocument();
    expect(screen.getByText('Equity modeling by strategy')).toBeInTheDocument();
  });

  it('strategy work lightbox opens for active strategy and shows key rows', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'PadSplit' }));
    await user.click(screen.getByRole('button', { name: 'Show work' }));

    expect(screen.getByRole('dialog', { name: 'Strategy Work Lightbox' })).toBeInTheDocument();
    expect(screen.getByText('PadSplit calculations')).toBeInTheDocument();
    expect(screen.getByText('Line item')).toBeInTheDocument();
    expect(screen.getByText('Turnover / cleaning')).toBeInTheDocument();
    expect(screen.getByText('Tenant placement fees')).toBeInTheDocument();
  });

  it('scenario save and load flow persists data to local storage', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const scenarioSelect = screen.getByLabelText('Scenario Select');
    const options = Array.from(scenarioSelect.querySelectorAll('option')).map((option) => option.textContent);

    expect(options.some((option) => option?.includes('Tampa Duplex - Sample Deal'))).toBe(true);
  });


  it('strategy-specific ARV input is available in the strategy workbench', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Long-Term' }));
    const strategyArv = screen.getByLabelText('Long-Term ARV');

    await user.clear(strategyArv);
    await user.type(strategyArv, '365000');

    expect(strategyArv).toHaveValue(365000);
  });

  it('allows decimal precision for percent and numeric text fields without rounding', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    const downPayment = screen.getByLabelText('Down payment %');
    await user.clear(downPayment);
    await user.type(downPayment, '5.55');
    expect(downPayment).toHaveValue(5.55);

    const purchasePrice = screen.getByLabelText('Purchase price');
    await user.clear(purchasePrice);
    await user.type(purchasePrice, '300000.37');
    expect(purchasePrice).toHaveValue(300000.37);
  });

  it('print view link includes encoded scenario payload', () => {
    render(<HomePage />);

    const printLink = screen.getByRole('link', { name: 'Print View' });
    const href = printLink.getAttribute('href') ?? '';

    expect(href.startsWith('/print?scenario=')).toBe(true);
    expect(href.length).toBeGreaterThan('/print?scenario='.length);
  });
});
