import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import HomePage from '../app/page';
import { calculateDeal } from '../lib/engine/deal-engine';
import { calculateCashToClose } from '../lib/engine/finance';
import { defaultDealInput } from '../lib/models/deal';
import { currencyFormatter, percentFormatter } from '../lib/formatters';


const getStrategyButton = (label: string) => screen.getAllByRole('button', { name: label })[0];

describe('dashboard integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows a Commercial strategy tab and exposes strip-plaza underwriting inputs', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Commercial'));

    const rentInput = screen.getAllByLabelText('Base rent ($/sq ft/year)', { selector: 'input' })[0];
    await user.clear(rentInput);
    await user.type(rentInput, '30');

    expect(rentInput).toHaveValue(30);
  });

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
    const expected = currencyFormatter.format(
      calculateCashToClose(
        updatedModel.purchase.purchasePrice,
        0,
        updatedModel.purchase.downPaymentPercent,
        updatedModel.purchase.closingCostPercent,
        updatedModel.purchase.pointsPercent,
        updatedModel.purchase.financingType,
        updatedModel.purchase.helocAmount,
        updatedModel.purchase.helocClosingCosts
      )
    );

    expect(screen.getByTestId('kpi-cash-to-close')).toHaveTextContent(expected);
  });

  it('top KPI cards follow the active strategy tab', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Airbnb'));

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



  it('priority monthly cash flow toggle switches reserve mode for hold strategies', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Airbnb'));

    const airbnbResult = calculateDeal(defaultDealInput).airbnb;
    const includeValue = currencyFormatter.format(airbnbResult.monthlyCashFlow);
    const excludeValue = currencyFormatter.format(airbnbResult.monthlyCashFlowExcludingReserves ?? airbnbResult.monthlyCashFlow);

    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(includeValue);
    expect(screen.getByText('Monthly Cash Flow')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Exclude reserves' })[0]);

    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(excludeValue);
  });

  it('flip priority metric switches to net profit', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Flip'));

    const flipResult = calculateDeal(defaultDealInput).flip;

    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(currencyFormatter.format(flipResult.saleProceeds ?? 0));
    expect(screen.queryByRole('button', { name: 'Include reserves' })).not.toBeInTheDocument();
  });


  it('equity modeling lightbox opens from strategy board', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getAllByRole('button', { name: 'Equity modeling' })[0]);

    expect(screen.getByRole('dialog', { name: 'Equity Modeling Lightbox' })).toBeInTheDocument();
    expect(screen.getByText('Equity modeling by strategy')).toBeInTheDocument();
  });

  it('strategy work lightbox opens for active strategy and shows key rows', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('PadSplit'));
    await user.click(screen.getAllByRole('button', { name: 'Show work' })[0]);

    expect(screen.getByRole('dialog', { name: 'Strategy Work Lightbox' })).toBeInTheDocument();
    expect(screen.getByText('PadSplit calculations')).toBeInTheDocument();
    expect(screen.getByText('Line item')).toBeInTheDocument();
    expect(screen.getByText('Turnover / cleaning')).toBeInTheDocument();
    expect(screen.getByText('Tenant placement fees')).toBeInTheDocument();
  });

  it('save as flow persists a deal in the vault list', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getAllByRole('button', { name: 'Duplicate' })[0]);
    const dialogInput = screen.getByPlaceholderText('Deal name');
    await user.clear(dialogInput);
    await user.type(dialogInput, 'Austin BRRRR');
    await user.click(screen.getAllByRole('button', { name: 'Confirm' })[0]);

    expect(screen.getAllByRole('button', { name: /Austin BRRRR/i }).length).toBeGreaterThan(0);
  });


  it('strategy-specific ARV input is available in the strategy workbench', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Long-Term'));
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



  it('auto-fills deal name from listing link and renders a clickable source URL', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    const listingInput = screen.getByLabelText('Listing URL (Zillow, Redfin, etc.)');
    await user.clear(listingInput);
    await user.type(listingInput, 'https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/');

    expect(screen.getByLabelText('Deal name')).toHaveValue('123 Main St, Tampa');
    expect(screen.getByRole('link', { name: 'View listing link' })).toHaveAttribute(
      'href',
      'https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/'
    );
  });


  it('does not auto-rename for onehome links', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    const nameInput = screen.getByLabelText('Deal name');
    const originalName = (nameInput as HTMLInputElement).value;

    const listingInput = screen.getByLabelText('Listing URL (Zillow, Redfin, etc.)');
    await user.clear(listingInput);
    await user.type(listingInput, 'https://portal.onehome.com/en-US/share/2478045G14539');

    await new Promise((resolve) => {
      window.setTimeout(resolve, 700);
    });

    expect(screen.getByLabelText('Deal name')).toHaveValue(originalName);
  });

  it('does not auto-rename when listing url lacks an address slug', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    const nameInput = screen.getByLabelText('Deal name');
    const originalName = (nameInput as HTMLInputElement).value;

    const listingInput = screen.getByLabelText('Listing URL (Zillow, Redfin, etc.)');
    await user.clear(listingInput);
    await user.type(listingInput, 'https://www.redfin.com/FL/Tampa/overview');

    await new Promise((resolve) => {
      window.setTimeout(resolve, 700);
    });

    expect(screen.getByLabelText('Deal name')).toHaveValue(originalName);
  });

  it('new deal action resets common underwriting fields to defaults', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    const purchasePrice = screen.getByLabelText('Purchase price');
    const rehabBudget = screen.getByLabelText('Rehab budget');

    await user.clear(purchasePrice);
    await user.type(purchasePrice, '415000');
    await user.clear(rehabBudget);
    await user.type(rehabBudget, '95000');

    await user.click(screen.getAllByRole('button', { name: 'Create' })[0]);

    expect(screen.getByLabelText('Purchase price')).toHaveValue(defaultDealInput.purchase.purchasePrice);
    expect(screen.getByLabelText('Rehab budget')).toHaveValue(defaultDealInput.purchase.rehabBudget);
    expect(screen.getAllByText(/New Deal/i).length).toBeGreaterThan(0);
  });

  it('share link feedback auto-dismisses after a few seconds', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => undefined
      }
    });

    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getAllByRole('button', { name: 'Send link' })[0]);

    expect(screen.getByText('Share link copied to clipboard.')).toBeInTheDocument();

    await new Promise((resolve) => {
      window.setTimeout(resolve, 3400);
    });

    expect(screen.queryByText('Share link copied to clipboard.')).not.toBeInTheDocument();
  });

  it('print view link includes encoded scenario payload and selected strategy', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Airbnb'));

    const printLink = screen.getByRole('link', { name: 'Print to PDF' });
    const href = printLink.getAttribute('href') ?? '';

    expect(href.startsWith('/print?scenario=')).toBe(true);
    expect(href).toContain('&strategy=airbnb');
  });
});
